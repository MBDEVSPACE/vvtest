import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { AVAILABLE_PERMISSIONS } from '../services/permissionNodes.js'
import { getPanelSettings, savePanelSettings } from '../services/panelSettings.js'
import { writeAdminLog } from '../services/logs.js'

const IDENTIFIER_TYPES = [
  { value: 'discord', label: 'Discord User' },
  { value: 'discord_role', label: 'Discord Role' },
  { value: 'steam', label: 'Steam' },
  { value: 'license', label: 'License' },
  { value: 'license2', label: 'License 2' }
]

const router = Router()

async function getAccessPayload(req) {
  const assignmentQuery = String(req.query.q || '').trim()
  const assignmentLimit = Math.min(250, Math.max(25, Number(req.query.limit || 100)))
  const assignmentParams = []
  let assignmentWhere = ''

  if (assignmentQuery) {
    const pattern = `%${assignmentQuery}%`
    assignmentWhere = 'WHERE ur.identifier LIKE ? OR r.name LIKE ? OR r.label LIKE ?'
    assignmentParams.push(pattern, pattern, pattern)
  }

  const [roles, assignments] = await Promise.all([
    query(
      `SELECT r.id, r.name, r.label, r.weight, r.is_super, r.color,
              COALESCE(GROUP_CONCAT(DISTINCT p.permission ORDER BY p.permission SEPARATOR ','), '') AS permissions
       FROM ti_admin_roles r
       LEFT JOIN ti_admin_permissions p ON p.role_id = r.id
       GROUP BY r.id
       ORDER BY r.weight ASC, r.id ASC`
    ),
    query(
      `SELECT ur.identifier AS id, ur.identifier, ur.created_at, r.id AS role_id, r.name AS role_name, r.label AS role_label
       FROM ti_admin_user_roles ur
       JOIN ti_admin_roles r ON r.id = ur.role_id
       ${assignmentWhere}
       ORDER BY ur.created_at DESC
       LIMIT ${assignmentLimit}`,
      assignmentParams
    )
  ])

  return {
    roles: roles.map((role) => ({
      ...role,
      is_super: Number(role.is_super || 0) === 1,
      color: role.color || '#9db0be',
      permissions: String(role.permissions || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    })),
    assignments,
    availablePermissions: AVAILABLE_PERMISSIONS,
    permissionCatalog: AVAILABLE_PERMISSIONS,
    identifierTypes: IDENTIFIER_TYPES
  }
}

router.get('/branding', async (_req, res) => {
  res.json(await getPanelSettings())
})

router.put('/branding', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const canChangeDiscordChannel = Number(req.user?.role?.is_super || 0) === 1
  const settings = await savePanelSettings({
    title: req.body.title,
    subtitle: req.body.subtitle,
    logoUrl: req.body.logoUrl,
    heroLogoUrl: req.body.heroLogoUrl,
    colorScheme: req.body.colorScheme,
    discordLogsEnabled: req.body.discordLogsEnabled,
    discordLogChannelId: canChangeDiscordChannel ? req.body.discordLogChannelId : undefined,
    discordBotToken: canChangeDiscordChannel ? req.body.discordBotToken : undefined,
    discordGuildId: canChangeDiscordChannel ? req.body.discordGuildId : undefined,
    discordBannedRoles: canChangeDiscordChannel ? req.body.discordBannedRoles : undefined,
    discordReportWebhook: canChangeDiscordChannel ? req.body.discordReportWebhook : undefined,
    discordAuditWebhook: canChangeDiscordChannel ? req.body.discordAuditWebhook : undefined,
    discordSecurityWebhook: canChangeDiscordChannel ? req.body.discordSecurityWebhook : undefined
  })

  await writeAdminLog({
    req,
    action: 'web_branding_update',
    target: 'panel_branding',
    details: {
      title: settings.title,
      subtitle: settings.subtitle,
      colorScheme: settings.colorScheme,
      discordLogsEnabled: settings.discordLogsEnabled,
      discordLogChannelChanged: canChangeDiscordChannel
    },
    discordMessage: `[Admin Panel] ${req.user.name} updated branding settings`
  })

  res.json({ ok: true, settings })
})

router.get('/access', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  res.json(await getAccessPayload(req))
})

router.get('/permissions', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  res.json(await getAccessPayload(req))
})

async function writeRolePermissions(roleId, permissions) {
  await query('DELETE FROM ti_admin_permissions WHERE role_id = ?', [roleId])

  if (permissions.length) {
    const valuesSql = permissions.map(() => '(?, ?)').join(', ')
    const params = permissions.flatMap((permission) => [roleId, permission])
    await query(`INSERT INTO ti_admin_permissions (role_id, permission) VALUES ${valuesSql}`, params)
  }
}

router.put('/roles/:roleId/permissions', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const roleId = Number(req.params.roleId)
  const permissions = Array.isArray(req.body.permissions)
    ? req.body.permissions.map((value) => String(value || '').trim()).filter(Boolean)
    : []

  const role = await query('SELECT id, name FROM ti_admin_roles WHERE id = ? LIMIT 1', [roleId])
  if (!role[0]) {
    return res.status(404).json({ error: 'role_not_found' })
  }

  await writeRolePermissions(roleId, permissions)

  await writeAdminLog({
    req,
    action: 'web_permissions_update',
    target: String(roleId),
    details: { permissions },
    discordMessage: `[Admin Panel] ${req.user.name} updated permissions for role #${roleId}`
  })

  res.json({ ok: true })
})

router.put('/roles/:roleId', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const roleId = Number(req.params.roleId)
  const name = String(req.body.name || '').trim().toLowerCase().slice(0, 64)
  const label = String(req.body.label || '').trim().slice(0, 64)
  const weight = Number(req.body.weight || 0)
  const isSuper = req.body.is_super ? 1 : 0
  const color = /^#[0-9a-fA-F]{3,8}$/.test(req.body.color || '') ? req.body.color : null
  const permissions = Array.isArray(req.body.permissions)
    ? req.body.permissions.map((value) => String(value || '').trim()).filter(Boolean)
    : []

  const roleRows = await query('SELECT id, name FROM ti_admin_roles WHERE id = ? LIMIT 1', [roleId])
  if (!roleRows[0]) {
    return res.status(404).json({ error: 'role_not_found' })
  }

  await query(
    `UPDATE ti_admin_roles
     SET name = ?, label = ?, weight = ?, is_super = ?${color !== null ? ', color = ?' : ''}
     WHERE id = ?`,
    color !== null
      ? [name || roleRows[0].name, label || roleRows[0].name, weight, isSuper, color, roleId]
      : [name || roleRows[0].name, label || roleRows[0].name, weight, isSuper, roleId]
  )

  await writeRolePermissions(roleId, permissions)

  await writeAdminLog({
    req,
    action: 'web_role_update',
    target: String(roleId),
    details: { name, label, weight, isSuper, color, permissions },
    discordMessage: `[Admin Panel] ${req.user.name} updated role #${roleId}`
  })

  res.json({ ok: true })
})

router.post('/roles', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase().slice(0, 64)
  const label = String(req.body.label || '').trim().slice(0, 64)
  const weight = Number(req.body.weight || 0)
  const isSuper = req.body.is_super ? 1 : 0
  const color = /^#[0-9a-fA-F]{3,8}$/.test(req.body.color || '') ? req.body.color : '#9db0be'
  const permissions = Array.isArray(req.body.permissions)
    ? req.body.permissions.map((value) => String(value || '').trim()).filter(Boolean)
    : []

  if (!name || !label) {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const result = await query(
    `INSERT INTO ti_admin_roles (name, label, weight, is_super, color)
     VALUES (?, ?, ?, ?, ?)`,
    [name, label, weight, isSuper, color]
  )

  await writeRolePermissions(result.insertId, permissions)

  await writeAdminLog({
    req,
    action: 'web_role_create',
    target: String(result.insertId),
    details: { name, label, weight, isSuper, color, permissions },
    discordMessage: `[Admin Panel] ${req.user.name} created role ${label}`
  })

  res.json({ ok: true, id: result.insertId })
})

function normalizeIdentifier(identifierType, identifierValue) {
  const type = String(identifierType || '').trim()
  const value = String(identifierValue || '').trim()

  if (!type || !value) {
    return ''
  }

  return `${type}:${value}`.slice(0, 120)
}

async function upsertAssignment(identifierType, identifierValue, roleId, req, res) {
  const cleanIdentifier = normalizeIdentifier(identifierType, identifierValue)

  if (!cleanIdentifier || !roleId) {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const role = await query('SELECT id, name FROM ti_admin_roles WHERE id = ? LIMIT 1', [roleId])
  if (!role[0]) {
    return res.status(404).json({ error: 'role_not_found' })
  }

  await query(
    `INSERT INTO ti_admin_user_roles (identifier, role_id, created_at)
     VALUES (?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
    [cleanIdentifier, roleId]
  )

  await writeAdminLog({
    req,
    action: 'web_role_assignment',
    target: cleanIdentifier,
    details: { roleId },
    discordMessage: `[Admin Panel] ${req.user.name} assigned ${cleanIdentifier} to role #${roleId}`
  })

  return res.json({ ok: true })
}

router.put('/assignments/:identifier', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const [identifierType = '', ...rest] = String(req.params.identifier || '').trim().split(':')
  const identifierValue = rest.join(':')
  const roleId = Number(req.body.role_id)

  return upsertAssignment(identifierType, identifierValue, roleId, req, res)
})

router.post('/assignments', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const identifierType = req.body.identifier_type
  const identifierValue = req.body.identifier_value
  const roleId = Number(req.body.role_id)

  return upsertAssignment(identifierType, identifierValue, roleId, req, res)
})

router.delete('/assignments/:identifier', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const identifier = String(req.params.identifier || '').trim().slice(0, 120)

  await query('DELETE FROM ti_admin_user_roles WHERE identifier = ?', [identifier])

  await writeAdminLog({
    req,
    action: 'web_role_assignment_remove',
    target: identifier,
    details: {},
    discordMessage: `[Admin Panel] ${req.user.name} removed assignment ${identifier}`
  })

  res.json({ ok: true })
})

// GET /api/admin/online-players
// Returns currently connected players from the live session table, with their identifiers.
// Used by the manual ban form to pre-fill player details.
// Sessions are considered stale (server crash) if last_seen_at is older than 3 minutes,
// since the ti_admin resource updates last_seen_at every 60 seconds while the server is up.
router.get('/online-players', requireAuth, requirePermission('ti.ban.view'), async (_req, res) => {
  // Try with coords first; fall back to no-coords query if ti_player_locs isn't migrated yet.
  async function fetchPlayers(withCoords) {
    if (withCoords) {
      return query(`
        SELECT lps.player_src, lps.player_name, lps.primary_identifier,
               GROUP_CONCAT(lsi.identifier ORDER BY lsi.identifier SEPARATOR ',') AS identifiers,
               pl.coord_x, pl.coord_y, pl.coord_z
        FROM ti_live_player_sessions lps
        LEFT JOIN ti_live_player_session_identifiers lsi ON lsi.session_id = lps.id
        LEFT JOIN ti_player_locs pl ON pl.player_src = lps.player_src
        WHERE lps.disconnected_at IS NULL
          AND lps.last_seen_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 MINUTE)
        GROUP BY lps.id, pl.coord_x, pl.coord_y, pl.coord_z
        ORDER BY lps.player_name ASC
      `)
    }
    return query(`
      SELECT lps.player_src, lps.player_name, lps.primary_identifier,
             GROUP_CONCAT(lsi.identifier ORDER BY lsi.identifier SEPARATOR ',') AS identifiers
      FROM ti_live_player_sessions lps
      LEFT JOIN ti_live_player_session_identifiers lsi ON lsi.session_id = lps.id
      WHERE lps.disconnected_at IS NULL
        AND lps.last_seen_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 MINUTE)
      GROUP BY lps.id
      ORDER BY lps.player_name ASC
    `)
  }

  function mapRows(rows) {
    return rows.map((row) => {
      const idList = String(row.identifiers || '').split(',').filter(Boolean)
      if (!idList.length && row.primary_identifier) idList.push(row.primary_identifier)
      return {
        src: row.player_src,
        name: row.player_name,
        identifier: row.primary_identifier,
        identifiers: idList,
        coords: (row.coord_x != null) ? { x: row.coord_x, y: row.coord_y, z: row.coord_z } : null
      }
    })
  }

  try {
    let rows
    try {
      rows = await fetchPlayers(true)
    } catch (coordErr) {
      // ti_player_locs table not yet migrated — serve without coords
      const m = String(coordErr?.message || '').toLowerCase()
      if (m.includes("doesn't exist") || m.includes('no such table')) {
        rows = await fetchPlayers(false)
      } else {
        throw coordErr
      }
    }
    res.json({ players: mapRows(rows) })
  } catch (err) {
    console.error('[web-panel] online-players query failed', err)
    const msg = String(err?.message || '').toLowerCase()
    if (msg.includes("doesn't exist") || msg.includes('no such table')) {
      return res.status(503).json({
        error: 'schema_missing',
        detail: 'The ti_live_player_sessions table does not exist. Run schema.sql on your database.'
      })
    }
    if (msg.includes('econnrefused') || msg.includes('access denied') || msg.includes('connect')) {
      return res.status(503).json({
        error: 'db_unavailable',
        detail: 'Cannot connect to MySQL. Check the MYSQL_* variables in server/.env.'
      })
    }
    return res.status(500).json({ error: 'internal_error', detail: err?.message })
  }
})

// GET /api/admin/stats/staff?period=all|30d|7d
// Aggregated action counts + playtime per staff member from audit log + sessions.
router.get('/stats/staff', requireAuth, requirePermission('ti.audit.view'), async (req, res) => {
  const period = String(req.query.period || 'all').toLowerCase()
  const periodWhereAl =
    period === '7d'  ? 'AND al.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)' :
    period === '30d' ? 'AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)' :
    ''
  const periodWhereSessions =
    period === '7d'  ? 'AND s.connected_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)' :
    period === '30d' ? 'AND s.connected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)' :
    ''

  // Sessions are capped at 8 h each to approximate AFK-free playtime
  const rows = await query(`
    SELECT
      al.actor_name,
      al.actor_identifier,
      COUNT(*) AS total_actions,
      SUM(CASE WHEN al.action IN ('ban_create','tiban_command','ban_create_offline','offline_ban_create','web_ban_create') THEN 1 ELSE 0 END) AS bans_issued,
      SUM(CASE WHEN al.action IN ('ban_unban','web_ban_unban') THEN 1 ELSE 0 END) AS unbans,
      SUM(CASE WHEN al.action = 'kick' THEN 1 ELSE 0 END) AS kicks,
      SUM(CASE WHEN al.action = 'warn' THEN 1 ELSE 0 END) AS warns,
      SUM(CASE WHEN al.action = 'screenshot' THEN 1 ELSE 0 END) AS screenshots,
      SUM(CASE WHEN al.action = 'report_create' THEN 1 ELSE 0 END) AS reports_submitted,
      SUM(CASE WHEN al.action IN ('report_status','report_claim','report_note') THEN 1 ELSE 0 END) AS reports_handled,
      SUM(CASE WHEN al.action LIKE 'report_%' THEN 1 ELSE 0 END) AS report_actions,
      SUM(CASE WHEN al.action IN ('offline_ban_create','ban_create_offline') THEN 1 ELSE 0 END) AS offline_bans,
      SUM(CASE WHEN al.action = 'mute' THEN 1 ELSE 0 END) AS mutes,
      SUM(CASE WHEN al.action = 'report_claim' THEN 1 ELSE 0 END) AS reports_claimed,
      SUM(CASE WHEN al.action = 'report_status'
               AND JSON_UNQUOTE(JSON_EXTRACT(al.details, '$.status')) = 'closed'
               THEN 1 ELSE 0 END) AS reports_closed,
      MIN(al.created_at) AS first_action_at,
      MAX(al.created_at) AS last_action_at,
      (
        SELECT COALESCE(SUM(LEAST(
          TIMESTAMPDIFF(SECOND, s.connected_at, COALESCE(s.disconnected_at, UTC_TIMESTAMP())),
          28800
        )), 0)
        FROM ti_live_player_sessions s
        WHERE s.primary_identifier = al.actor_identifier
        ${periodWhereSessions}
      ) AS playtime_seconds,
      (SELECT COUNT(*) FROM ti_bans b WHERE b.created_by_identifier = al.actor_identifier AND b.revoked_at IS NOT NULL) AS bans_revoked_total,
      (SELECT COUNT(*) FROM ti_bans b WHERE b.created_by_identifier = al.actor_identifier) AS bans_total
    FROM ti_audit_logs al
    WHERE al.actor_identifier NOT IN ('system', '')
    ${periodWhereAl}
    GROUP BY al.actor_identifier, al.actor_name
    ORDER BY total_actions DESC
    LIMIT 100
  `)
  res.json({ rows, period })
})

// GET /api/admin/stats/reports
// Overall report statistics: overview totals, by-type breakdown, top closers (7d + 30d).
router.get('/stats/reports', requireAuth, requirePermission('ti.audit.view'), async (req, res) => {
  const [overviewRows, byType, topClosers7d, topClosers30d] = await Promise.all([
    query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('open','claimed','in_progress') THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_total,
        SUM(CASE WHEN status = 'closed' AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)  THEN 1 ELSE 0 END) AS closed_today,
        SUM(CASE WHEN status = 'closed' AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)  THEN 1 ELSE 0 END) AS closed_7d,
        SUM(CASE WHEN status = 'closed' AND updated_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS closed_30d,
        ROUND(AVG(CASE WHEN status = 'closed' THEN TIMESTAMPDIFF(MINUTE, created_at, updated_at) ELSE NULL END) / 60, 1) AS avg_resolution_hours
      FROM ti_reports
    `),
    query(`
      SELECT report_type,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
        SUM(CASE WHEN status IN ('open','claimed','in_progress') THEN 1 ELSE 0 END) AS open_count
      FROM ti_reports
      GROUP BY report_type
      ORDER BY total DESC
    `),
    query(`
      SELECT al.actor_name, al.actor_identifier,
        SUM(CASE WHEN al.action = 'report_claim' THEN 1 ELSE 0 END) AS claimed,
        SUM(CASE WHEN al.action = 'report_status'
             AND JSON_UNQUOTE(JSON_EXTRACT(al.details, '$.status')) = 'closed'
             THEN 1 ELSE 0 END) AS closed
      FROM ti_audit_logs al
      WHERE al.actor_identifier NOT IN ('system','')
        AND al.action IN ('report_claim','report_status')
        AND al.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY al.actor_identifier, al.actor_name
      HAVING (claimed > 0 OR closed > 0)
      ORDER BY closed DESC, claimed DESC
      LIMIT 10
    `),
    query(`
      SELECT al.actor_name, al.actor_identifier,
        SUM(CASE WHEN al.action = 'report_claim' THEN 1 ELSE 0 END) AS claimed,
        SUM(CASE WHEN al.action = 'report_status'
             AND JSON_UNQUOTE(JSON_EXTRACT(al.details, '$.status')) = 'closed'
             THEN 1 ELSE 0 END) AS closed
      FROM ti_audit_logs al
      WHERE al.actor_identifier NOT IN ('system','')
        AND al.action IN ('report_claim','report_status')
        AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY al.actor_identifier, al.actor_name
      HAVING (claimed > 0 OR closed > 0)
      ORDER BY closed DESC, claimed DESC
      LIMIT 10
    `)
  ])

  res.json({
    overview: overviewRows[0] || {},
    byType,
    topClosers: { '7d': topClosers7d, '30d': topClosers30d }
  })
})

// ─── Shared helper: proxy a request to the FiveM game server ─────────────────
async function callFivem(path, method = 'POST', body = null, timeoutMs = 6000) {
  const fivemUrl = (process.env.FIVEM_SERVER_URL || '').trim()
  if (!fivemUrl) throw new Error('FIVEM_SERVER_URL not configured')
  const opts = {
    method,
    headers: { 'x-ti-secret': process.env.TI_SHARED_SECRET || '' },
    signal: AbortSignal.timeout(timeoutMs)
  }
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const r = await fetch(`${fivemUrl}/ti_admin${path}`, opts)
  if (!r.ok) {
    const text = await r.text().catch(() => '')
    throw new Error(`FiveM returned ${r.status}: ${text}`)
  }
  return r.json()
}

function isSuperAdmin(req) {
  return Number(req.user?.role?.is_super || 0) === 1
}

// ─── Admin Tags ───────────────────────────────────────────────────────────────

const VALID_ROLES = new Set(['user', 'helper', 'moderator', 'admin', 'superadmin'])

// GET /api/admin/tags
router.get('/tags', requireAuth, requirePermission('ti.admin.manage_permissions'), async (_req, res) => {
  const rows = await query(
    'SELECT id, label, color, icon, min_role, sort_order FROM ti_admin_tags ORDER BY sort_order ASC, id ASC'
  )
  res.json({ tags: rows })
})

// POST /api/admin/tags
router.post('/tags', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const label     = String(req.body.label     || '').trim().slice(0, 64)
  const color     = String(req.body.color     || '#41c995').trim().slice(0, 32)
  const icon      = String(req.body.icon      || 'fa-solid fa-shield').trim().slice(0, 64)
  const min_role  = String(req.body.min_role  || 'helper').trim()
  const sort_order = Number(req.body.sort_order ?? 0)

  if (!label)                      return res.status(400).json({ error: 'label_required' })
  if (!VALID_ROLES.has(min_role))  return res.status(400).json({ error: 'invalid_role' })
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'invalid_color' })

  const result = await query(
    'INSERT INTO ti_admin_tags (label, color, icon, min_role, sort_order) VALUES (?, ?, ?, ?, ?)',
    [label, color, icon, min_role, sort_order]
  )
  await writeAdminLog({ req, action: 'tag_create', target: label, details: { color, min_role } })
  res.json({ ok: true, id: result.insertId })
})

// PUT /api/admin/tags/:id
router.put('/tags/:id', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })

  const label      = String(req.body.label     || '').trim().slice(0, 64)
  const color      = String(req.body.color     || '#41c995').trim().slice(0, 32)
  const icon       = String(req.body.icon      || 'fa-solid fa-shield').trim().slice(0, 64)
  const min_role   = String(req.body.min_role  || 'helper').trim()
  const sort_order = Number(req.body.sort_order ?? 0)

  if (!label)                      return res.status(400).json({ error: 'label_required' })
  if (!VALID_ROLES.has(min_role))  return res.status(400).json({ error: 'invalid_role' })
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'invalid_color' })

  await query(
    'UPDATE ti_admin_tags SET label = ?, color = ?, icon = ?, min_role = ?, sort_order = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
    [label, color, icon, min_role, sort_order, id]
  )
  await writeAdminLog({ req, action: 'tag_update', target: String(id), details: { label, color, min_role } })
  res.json({ ok: true })
})

// DELETE /api/admin/tags/:id
router.delete('/tags/:id', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })
  await query('DELETE FROM ti_admin_tags WHERE id = ?', [id])
  await writeAdminLog({ req, action: 'tag_delete', target: String(id), details: {} })
  res.json({ ok: true })
})

// ─── Console & Resource Management (superadmin only) ─────────────────────────

// POST /api/admin/console/exec
router.post('/console/exec', requireAuth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'superadmin_required' })

  const cmd = String(req.body.cmd || '').trim().slice(0, 256)
  if (!cmd) return res.status(400).json({ error: 'empty_command' })

  try {
    const data = await callFivem('/console-exec', 'POST', { cmd })
    await writeAdminLog({ req, action: 'web_console_exec', target: 'server', details: { cmd } })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// GET /api/admin/resources
router.get('/resources', requireAuth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'superadmin_required' })

  try {
    const data = await callFivem('/resources', 'GET')
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// POST /api/admin/resources/:name/control
router.post('/resources/:name/control', requireAuth, async (req, res) => {
  if (!isSuperAdmin(req)) return res.status(403).json({ error: 'superadmin_required' })

  const name   = String(req.params.name || '').trim()
  const action = String(req.body.action  || '').trim()

  if (!name || !/^[\w\-\.[\]]+$/.test(name))                           return res.status(400).json({ error: 'invalid_resource_name' })
  if (!['start', 'stop', 'restart', 'ensure'].includes(action)) return res.status(400).json({ error: 'invalid_action' })

  try {
    const data = await callFivem('/resource-control', 'POST', { action, name })
    await writeAdminLog({ req, action: 'web_resource_control', target: name, details: { action } })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// ─── Player action routes ─────────────────────────────────────────────────────

// POST /api/admin/player/kick
router.post('/player/kick', requireAuth, requirePermission('ti.ban.create'), async (req, res) => {
  const src    = Number(req.body.src)
  const reason = String(req.body.reason || 'Kicked by admin').trim().slice(0, 256)
  if (!src) return res.status(400).json({ error: 'invalid_src' })
  try {
    await callFivem('/player-kick', 'POST', { src, reason })
    await writeAdminLog({ req, action: 'web_kick', target: String(src), details: { reason },
      discordEmbed: { title: 'Player Kicked', color: 16744448,
        fields: [{ name: 'Admin', value: req.user.name, inline: true }, { name: 'Player ID', value: String(src), inline: true }, { name: 'Reason', value: reason }] }
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// POST /api/admin/player/set-job
router.post('/player/set-job', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const src    = Number(req.body.src)
  const job    = String(req.body.job || '').trim().slice(0, 64)
  const grade  = Math.max(0, Math.min(20, Number(req.body.grade) || 0))
  const isGang = req.body.isGang === true
  if (!src || !job) return res.status(400).json({ error: 'invalid_payload' })
  try {
    await callFivem('/player-set-job', 'POST', { src, job, grade, isGang })
    await writeAdminLog({ req, action: 'web_set_job', target: String(src), details: { job, grade, isGang },
      discordEmbed: { title: isGang ? 'Gang Set' : 'Job Set', color: 10181046,
        fields: [{ name: 'Admin', value: req.user.name, inline: true }, { name: 'Player ID', value: String(src), inline: true }, { name: isGang ? 'Gang' : 'Job', value: `${job} (grade ${grade})`, inline: true }] }
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// POST /api/admin/player-action
// Runs a targeted in-game admin action (spectate / goto / bring / sendBack / gotoBack)
// on behalf of the signed-in panel user who must also be in-game.
router.post('/player-action', requireAuth, requirePermission('ti.map.view'), async (req, res) => {
  const ALLOWED = ['spectate', 'goto', 'bring', 'sendBack', 'gotoBack']
  const action    = String(req.body.action    || '').trim()
  const targetSrc = req.body.targetSrc != null ? Number(req.body.targetSrc) : null
  if (!ALLOWED.includes(action)) return res.status(400).json({ error: 'invalid_action' })
  try {
    const data = await callFivem('/player-action', 'POST', {
      adminIdentifier: req.user.identifier,
      action,
      targetSrc,
    }, 5000)
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// GET /api/admin/map-snapshot
// Returns live player positions with roles directly from the FiveM server.
// Bypasses the DB entirely — no need for ti_player_locs migration.
router.get('/map-snapshot', requireAuth, requirePermission('ti.map.view'), async (_req, res) => {
  try {
    const players = await callFivem('/map-snapshot', 'GET', null, 4000)
    // Normalise to { src, name, role, coords: {x,y,z}, ... }
    const mapped = (Array.isArray(players) ? players : []).map((p) => ({
      src:     p.src,
      name:    p.name,
      role:    p.role || 'user',
      inVeh:   p.inVeh  || false,
      isDead:  p.isDead || false,
      ping:    p.ping   || 0,
      job:     p.job    || '',
      onDuty:  p.onDuty || false,
      coords:  { x: p.x || 0, y: p.y || 0, z: p.z || 0 },
    }))
    res.json({ players: mapped })
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// POST /api/admin/broadcast
router.post('/broadcast', requireAuth, requirePermission('ti.admin.manage_permissions'), async (req, res) => {
  const message = String(req.body.message || '').trim().slice(0, 512)
  const color   = String(req.body.color || 'info').slice(0, 16)
  const icon    = String(req.body.icon  || 'fa-solid fa-bullhorn').slice(0, 96)
  if (!message) return res.status(400).json({ error: 'message_required' })
  try {
    await callFivem('/broadcast', 'POST', { message, color, icon })
    await writeAdminLog({ req, action: 'web_broadcast', target: 'all', details: { message, color, icon },
      discordEmbed: { title: 'Server Announcement', color: 3447003,
        fields: [{ name: 'Admin', value: req.user.name, inline: true }, { name: 'Color', value: color, inline: true }, { name: 'Message', value: message }] }
    })
    res.json({ ok: true })
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// GET /api/admin/all-players?search=&limit=100
// Returns recently-seen players (online + offline) from session history.
// Online flag is derived from last_seen_at freshness.
router.get('/all-players', requireAuth, requirePermission('ti.ban.view'), async (req, res) => {
  const search = String(req.query.search || '').trim().slice(0, 80)
  const limit  = Math.min(parseInt(req.query.limit) || 100, 200)
  try {
    const searchClause = search ? `AND (lps.player_name LIKE ? OR lps.primary_identifier LIKE ?)` : ''
    const searchArgs   = search ? [`%${search}%`, `%${search}%`] : []
    const rows = await query(
      `SELECT lps.player_src, lps.player_name, lps.primary_identifier,
              GROUP_CONCAT(lsi.identifier ORDER BY lsi.identifier SEPARATOR ',') AS identifiers,
              lps.last_seen_at, lps.disconnected_at,
              (lps.disconnected_at IS NULL AND lps.last_seen_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 MINUTE)) AS is_online
       FROM ti_live_player_sessions lps
       LEFT JOIN ti_live_player_session_identifiers lsi ON lsi.session_id = lps.id
       WHERE 1=1 ${searchClause}
       GROUP BY lps.id
       ORDER BY lps.last_seen_at DESC
       LIMIT ?`,
      [...searchArgs, limit]
    )
    const players = rows.map((row) => {
      const idList = String(row.identifiers || '').split(',').filter(Boolean)
      if (!idList.length && row.primary_identifier) idList.push(row.primary_identifier)
      return {
        src:          row.is_online ? row.player_src : null,
        name:         row.player_name,
        identifier:   row.primary_identifier,
        identifiers:  idList,
        is_online:    Boolean(row.is_online),
        last_seen_at: row.last_seen_at,
        coords:       null,
      }
    })
    res.json({ players })
  } catch (err) {
    console.error('[web-panel] all-players query failed', err)
    res.status(500).json({ error: 'internal_error', detail: err?.message })
  }
})

// POST /api/admin/player/screenshot
router.post('/player/screenshot', requireAuth, requirePermission('ti.ban.create'), async (req, res) => {
  const src     = Number(req.body.src)
  const context = String(req.body.context || 'web_panel').slice(0, 64)
  if (!src) return res.status(400).json({ error: 'invalid_src' })
  try {
    const data = await callFivem('/player-screenshot', 'POST', { src, context }, 12000)
    await writeAdminLog({ req, action: 'web_screenshot', target: String(src), details: { context, imageUrl: data.imageUrl } })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// POST /api/admin/player/screenshot-poll
router.post('/player/screenshot-poll', requireAuth, requirePermission('ti.ban.create'), async (req, res) => {
  const token = String(req.body.token || '').trim()
  if (!token) return res.status(400).json({ error: 'token_required' })
  try {
    const data = await callFivem('/screenshot-poll', 'POST', { token }, 4000)
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// GET /api/admin/player/:src/inventory
router.get('/player/:src/inventory', requireAuth, requirePermission('ti.ban.create'), async (req, res) => {
  const src = Number(req.params.src)
  if (!src) return res.status(400).json({ error: 'invalid_src' })
  try {
    const data = await callFivem('/player-inventory', 'POST', { src })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// GET /api/admin/player/:identifier/vehicles
router.get('/player/:identifier/vehicles', requireAuth, requirePermission('ti.ban.create'), async (req, res) => {
  const identifier = String(req.params.identifier || '').trim().slice(0, 120)
  if (!identifier) return res.status(400).json({ error: 'invalid_identifier' })
  try {
    const data = await callFivem('/player-vehicles', 'POST', { identifier })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'fivem_unreachable', detail: err.message })
  }
})

// GET /api/admin/player/:identifier/warns
router.get('/player/:identifier/warns', requireAuth, requirePermission('ti.admin.warn'), async (req, res) => {
  const identifier = String(req.params.identifier || '').trim().slice(0, 120)
  if (!identifier) return res.status(400).json({ error: 'invalid_identifier' })
  try {
    const rows = await query(
      `SELECT id, warned_by_name, message, created_at
       FROM ti_warnings WHERE target_identifier = ?
       ORDER BY created_at DESC LIMIT 50`,
      [identifier]
    )
    res.json({ rows })
  } catch (err) {
    res.status(500).json({ error: 'db_error', detail: err.message })
  }
})

// GET /api/admin/player/:identifier/reports
router.get('/player/:identifier/reports', requireAuth, requirePermission('ti.audit.view'), async (req, res) => {
  const identifier = String(req.params.identifier || '').trim().slice(0, 120)
  if (!identifier) return res.status(400).json({ error: 'invalid_identifier' })
  try {
    const rows = await query(
      `SELECT id, report_type, reporter_name, reported_name, message, status, claimed_by_name, created_at
       FROM ti_reports
       WHERE reporter_identifier = ? OR reported_identifier = ?
       ORDER BY created_at DESC LIMIT 50`,
      [identifier, identifier]
    )
    res.json({ rows })
  } catch (err) {
    res.status(500).json({ error: 'db_error', detail: err.message })
  }
})

export default router
