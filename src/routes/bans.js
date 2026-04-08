import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { formatBanRow, getBanCapabilities } from '../services/bans.js'
import { hasPermission } from '../services/roles.js'
import { writeAdminLog } from '../services/logs.js'

const router = Router()

// Fire-and-forget: notify the FiveM resource to run EnforceNow() so any
// newly banned player who is already online gets kicked without waiting for
// the 30 s polling loop.
async function notifyFivemEnforce() {
  const fivemUrl = (process.env.FIVEM_SERVER_URL || '').trim()
  if (!fivemUrl) return
  try {
    await fetch(`${fivemUrl}/ti_admin/enforce-ban`, {
      method: 'POST',
      headers: { 'x-ti-secret': process.env.TI_SHARED_SECRET || '' },
      signal: AbortSignal.timeout(4000)
    })
  } catch {
    // best-effort — FiveM may be restarting or unreachable
  }
}

function buildFilters(req, options = {}) {
  const q = String(req.query.q || '').trim()
  const status = String(req.query.status || '').trim()
  const sort = String(req.query.sort || 'priority')
  const page = Math.max(1, Number(req.query.page || 1))
  const limit = Math.min(100, Math.max(10, Number(req.query.limit || 50)))
  const offset = (page - 1) * limit
  const where = []
  const params = []

  if (options.ownedOnly) {
    where.push(
      `EXISTS (
         SELECT 1
         FROM ti_ban_identifiers own_bi
         WHERE own_bi.ban_id = b.id
           AND own_bi.identifier = ?
       )`
    )
    params.push(options.ownedOnly)
  }

  if (q) {
    const pattern = `%${q}%`
    where.push(`(
      b.player_name LIKE ? OR
      b.reason LIKE ? OR
      b.created_by_name LIKE ? OR
      EXISTS (
        SELECT 1
        FROM ti_ban_identifiers search_bi
        WHERE search_bi.ban_id = b.id
          AND search_bi.identifier LIKE ?
      )
    )`)
    params.push(pattern, pattern, pattern, pattern)
  }

  if (status === 'active') {
    where.push('b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > UTC_TIMESTAMP())')
  } else if (status === 'expired') {
    where.push('b.revoked_at IS NULL AND b.expires_at IS NOT NULL AND b.expires_at <= UTC_TIMESTAMP()')
  } else if (status === 'revoked') {
    where.push('b.revoked_at IS NOT NULL')
  }

  let orderBy = 'b.id DESC'
  if (sort === 'id_asc') {
    orderBy = 'b.id ASC'
  } else if (sort === 'priority') {
    orderBy = `is_connected DESC,
               last_connection_attempt_at DESC,
               CASE
                 WHEN b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > UTC_TIMESTAMP()) THEN 0
                 WHEN b.revoked_at IS NULL THEN 1
                 ELSE 2
               END ASC,
               b.id DESC`
  }

  return {
    params,
    page,
    limit,
    offset,
    orderBy,
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : ''
  }
}

function buildBanQuery({ whereSql, orderBy, limit, offset }) {
  return `
    SELECT b.id, b.player_name, b.reason, b.evidence, b.created_by_name, b.created_by_identifier,
           b.revoked_by_name, b.revoked_by_identifier, b.revoke_note, b.created_at, b.expires_at,
           b.revoked_at, b.updated_at,
           GROUP_CONCAT(DISTINCT bi.identifier ORDER BY bi.identifier SEPARATOR ',') AS identifiers,
           MAX(CASE WHEN bi.identifier = ? THEN 1 ELSE 0 END) AS owned_by_user,
           COALESCE(appeals.appeal_count, 0) AS appeal_count,
           COALESCE(appeals.open_appeal_count, 0) AS open_appeal_count,
           appeals.latest_appeal_status,
           COALESCE(live.is_connected, 0) AS is_connected,
           live.connected_at,
           live.last_seen_at,
           COALESCE(blocked.connection_state, live.connection_state) AS connection_state,
           blocked.last_connection_attempt_at
    FROM ti_bans b
    LEFT JOIN ti_ban_identifiers bi ON bi.ban_id = b.id
    LEFT JOIN (
      SELECT ban_id,
             COUNT(*) AS appeal_count,
             SUM(CASE WHEN status IN ('open', 'in_review') THEN 1 ELSE 0 END) AS open_appeal_count,
             SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY created_at DESC SEPARATOR ','), ',', 1) AS latest_appeal_status
      FROM ti_appeals
      GROUP BY ban_id
    ) appeals ON appeals.ban_id = b.id
    LEFT JOIN (
      SELECT lbi.ban_id,
             1 AS is_connected,
             'connected' AS connection_state,
             MAX(lps.connected_at) AS connected_at,
             MAX(lps.last_seen_at) AS last_seen_at
      FROM ti_ban_identifiers lbi
      JOIN ti_live_player_session_identifiers lsi ON lsi.identifier = lbi.identifier
      JOIN ti_live_player_sessions lps ON lps.id = lsi.session_id
      WHERE lps.disconnected_at IS NULL
      GROUP BY lbi.ban_id
    ) live ON live.ban_id = b.id
    LEFT JOIN (
      SELECT ban_id,
             MAX(last_connection_attempt_at) AS last_connection_attempt_at,
             SUBSTRING_INDEX(GROUP_CONCAT(connection_state ORDER BY updated_at DESC SEPARATOR ','), ',', 1) AS connection_state
      FROM ti_ban_presence
      GROUP BY ban_id
    ) blocked ON blocked.ban_id = b.id
    ${whereSql}
    GROUP BY b.id
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `
}

router.get('/', async (req, res) => {
  const userIdentifier = req.user?.identifier || ''
  const canViewAll = hasPermission(req.user, 'ti.ban.view')
  const isGuest = !req.user
  const filters = buildFilters(req, canViewAll || isGuest ? {} : { ownedOnly: userIdentifier })

  const rows = await query(
    buildBanQuery(filters),
    [userIdentifier, ...filters.params]
  )

  const formattedRows = rows.map((row) => formatBanRow(row, req.user))
  const stats = formattedRows.reduce((accumulator, row) => {
    accumulator.total += 1
    if (row.status === 'active') accumulator.active += 1
    if (row.status === 'expired') accumulator.expired += 1
    if (row.status === 'revoked') accumulator.revoked += 1
    if (row.latest_appeal_status === 'open' || row.latest_appeal_status === 'in_review') accumulator.awaitingAppeals += 1
    if (row.is_connected || row.last_connection_attempt_at) accumulator.flagged += 1
    return accumulator
  }, {
    total: 0,
    active: 0,
    expired: 0,
    revoked: 0,
    awaitingAppeals: 0,
    flagged: 0
  })

  res.json({
    rows: formattedRows,
    page: filters.page,
    limit: filters.limit,
    stats,
    view: canViewAll ? 'staff' : isGuest ? 'public' : 'self',
    capabilities: getBanCapabilities(req.user, {})
  })
})

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id)
  const userIdentifier = req.user?.identifier || ''
  const rows = await query(
    `
      SELECT b.id, b.player_name, b.reason, b.evidence, b.created_by_name, b.created_by_identifier,
             b.revoked_by_name, b.revoked_by_identifier, b.revoke_note, b.created_at, b.expires_at,
             b.revoked_at, b.updated_at,
             GROUP_CONCAT(DISTINCT bi.identifier ORDER BY bi.identifier SEPARATOR ',') AS identifiers,
             MAX(CASE WHEN bi.identifier = ? THEN 1 ELSE 0 END) AS owned_by_user,
             COALESCE(appeals.appeal_count, 0) AS appeal_count,
             COALESCE(appeals.open_appeal_count, 0) AS open_appeal_count,
             appeals.latest_appeal_status,
             COALESCE(live.is_connected, 0) AS is_connected,
             live.connected_at,
             live.last_seen_at,
             COALESCE(blocked.connection_state, live.connection_state) AS connection_state,
             blocked.last_connection_attempt_at
      FROM ti_bans b
      LEFT JOIN ti_ban_identifiers bi ON bi.ban_id = b.id
      LEFT JOIN (
        SELECT ban_id,
               COUNT(*) AS appeal_count,
               SUM(CASE WHEN status IN ('open', 'in_review') THEN 1 ELSE 0 END) AS open_appeal_count,
               SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY created_at DESC SEPARATOR ','), ',', 1) AS latest_appeal_status
        FROM ti_appeals
        GROUP BY ban_id
      ) appeals ON appeals.ban_id = b.id
      LEFT JOIN (
        SELECT lbi.ban_id,
               1 AS is_connected,
               'connected' AS connection_state,
               MAX(lps.connected_at) AS connected_at,
               MAX(lps.last_seen_at) AS last_seen_at
        FROM ti_ban_identifiers lbi
        JOIN ti_live_player_session_identifiers lsi ON lsi.identifier = lbi.identifier
        JOIN ti_live_player_sessions lps ON lps.id = lsi.session_id
        WHERE lps.disconnected_at IS NULL
        GROUP BY lbi.ban_id
      ) live ON live.ban_id = b.id
      LEFT JOIN (
        SELECT ban_id,
               MAX(last_connection_attempt_at) AS last_connection_attempt_at,
               SUBSTRING_INDEX(GROUP_CONCAT(connection_state ORDER BY updated_at DESC SEPARATOR ','), ',', 1) AS connection_state
        FROM ti_ban_presence
        GROUP BY ban_id
      ) blocked ON blocked.ban_id = b.id
      WHERE b.id = ?
      GROUP BY b.id
      LIMIT 1
    `,
    [userIdentifier, id]
  )

  if (!rows[0]) {
    return res.status(404).json({ error: 'ban_not_found' })
  }

  const ban = formatBanRow(rows[0], req.user)
  if (req.user && !hasPermission(req.user, 'ti.ban.view') && !ban.owned_by_user) {
    return res.status(403).json({ error: 'forbidden' })
  }

  return res.json(ban)
})

router.post('/manual', requireAuth, requirePermission('ti.ban.create'), async (req, res) => {
  const playerName = String(req.body.player_name || '').trim().slice(0, 80)
  const reason = String(req.body.reason || '').trim().slice(0, 256)
  const expiresAt = req.body.expires_at || null
  const evidence = req.body.evidence || null
  const identifiers = Array.isArray(req.body.identifiers)
    ? req.body.identifiers.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 20)
    : []

  if (!playerName || !reason || !identifiers.length) {
    return res.status(400).json({
      error: 'invalid_payload',
      detail: !playerName ? 'player_name required' : !reason ? 'reason required' : 'at least one identifier required'
    })
  }

  const result = await query(
    `INSERT INTO ti_bans (
      player_name, reason, evidence, created_by_name, created_by_identifier,
      expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [playerName, reason, JSON.stringify(evidence), req.user.name, req.user.identifier, expiresAt]
  )

  const banId = result.insertId
  const valuesSql = identifiers.map(() => '(?, ?)').join(', ')
  await query(
    `INSERT INTO ti_ban_identifiers (ban_id, identifier) VALUES ${valuesSql}`,
    identifiers.flatMap((identifier) => [banId, identifier])
  )

  await writeAdminLog({
    req,
    action: 'web_ban_create_manual',
    target: String(banId),
    details: { playerName, reason, expiresAt, identifiers },
    discordMessage: `[Admin Panel] ${req.user.name} manually created ban #${banId} for ${playerName}`
  })

  notifyFivemEnforce()
  res.json({ ok: true, id: banId })
})

router.put('/:id', requireAuth, requirePermission('ti.ban.edit'), async (req, res) => {
  const id = Number(req.params.id)
  const reason = String(req.body.reason || '').trim().slice(0, 256)
  const evidence = req.body.evidence || null
  const expiresAt = req.body.expires_at || null

  if (!reason) {
    return res.status(400).json({ error: 'reason_required' })
  }

  const result = await query(
    `UPDATE ti_bans
     SET reason = ?, evidence = ?, expires_at = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ?`,
    [reason, JSON.stringify(evidence), expiresAt, id]
  )

  if (result.affectedRows < 1) {
    return res.status(404).json({ error: 'ban_not_found' })
  }

  await writeAdminLog({
    req,
    action: 'web_ban_edit',
    target: String(id),
    details: { reason, expiresAt },
    discordMessage: `[Admin Panel] ${req.user.name} edited ban #${id}`
  })

  res.json({ ok: true })
})

router.post('/:id/unban', requireAuth, requirePermission('ti.ban.unban'), async (req, res) => {
  const id = Number(req.params.id)
  const note = String(req.body.note || '').trim().slice(0, 256)

  const result = await query(
    `UPDATE ti_bans
     SET revoked_at = UTC_TIMESTAMP(), revoked_by_name = ?, revoked_by_identifier = ?, revoke_note = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND revoked_at IS NULL`,
    [req.user.name, req.user.identifier, note, id]
  )

  if (result.affectedRows < 1) {
    return res.status(404).json({ error: 'ban_not_found_or_inactive' })
  }

  await writeAdminLog({
    req,
    action: 'web_ban_unban',
    target: String(id),
    details: { note },
    discordMessage: `[Admin Panel] ${req.user.name} revoked ban #${id}`
  })

  res.json({ ok: true })
})

router.post('/offline', requireAuth, requirePermission('ti.ban.create'), async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().slice(0, 120)
  const reason = String(req.body.reason || '').trim().slice(0, 256)
  const expiresAt = req.body.expires_at ? String(req.body.expires_at).trim() : null
  let playerName = String(req.body.player_name || '').trim().slice(0, 80) || null

  if (!identifier || !reason) {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const sessionRows = await query(
    `SELECT lps.player_name, lps.id AS session_id
     FROM ti_live_player_session_identifiers lsi
     JOIN ti_live_player_sessions lps ON lps.id = lsi.session_id
     WHERE lsi.identifier = ?
     ORDER BY lps.id DESC LIMIT 1`,
    [identifier]
  )

  let allIdentifiers = [identifier]
  if (sessionRows[0]) {
    playerName = playerName || sessionRows[0].player_name
    const idRows = await query(
      'SELECT identifier FROM ti_live_player_session_identifiers WHERE session_id = ?',
      [sessionRows[0].session_id]
    )
    allIdentifiers = [...new Set([identifier, ...idRows.map((r) => r.identifier)])]
  }
  playerName = playerName || `Unknown (${identifier})`

  const banResult = await query(
    `INSERT INTO ti_bans (player_name, reason, evidence, created_by_name, created_by_identifier,
      expires_at, created_at, updated_at)
     VALUES (?, ?, '[]', ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [playerName, reason, req.user.name, req.user.identifier, expiresAt]
  )
  const banId = banResult.insertId

  for (const id of allIdentifiers) {
    await query('INSERT INTO ti_ban_identifiers (ban_id, identifier) VALUES (?, ?)', [banId, id])
  }

  await writeAdminLog({
    req,
    action: 'offline_ban_create',
    target: identifier,
    details: { banId, reason, identifierCount: allIdentifiers.length },
    discordMessage: `[Offline Ban] **${req.user.name}** banned \`${playerName}\` (\`${identifier}\`) — ${reason}`
  })

  notifyFivemEnforce()
  res.json({ ok: true, id: banId })
})

export default router
