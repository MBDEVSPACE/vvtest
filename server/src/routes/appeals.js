import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { sendDiscordLog, writeAdminLog } from '../services/logs.js'
import { sendDiscordDM } from '../services/discord.js'

const router = Router()

router.get('/', requireAuth, requirePermission('ti.appeals.view'), async (_req, res) => {
  const rows = await query(
    `SELECT a.id, a.ban_id, a.appellant_identifier, a.appellant_name, a.message, a.admin_response,
            a.status, a.created_at, a.updated_at, b.reason AS ban_reason, b.player_name
     FROM ti_appeals a
     JOIN ti_bans b ON b.id = a.ban_id
     ORDER BY a.id DESC
     LIMIT 500`
  )

  res.json({ rows })
})

router.get('/mine', requireAuth, async (req, res) => {
  const rows = await query(
    `SELECT a.id, a.ban_id, a.message, a.admin_response, a.status, a.created_at, a.updated_at
     FROM ti_appeals a
     WHERE a.appellant_identifier = ?
     ORDER BY a.id DESC`,
    [req.user.identifier]
  )

  res.json({ rows })
})

router.post('/', requireAuth, async (req, res) => {
  const banId = Number(req.body.ban_id)
  const message = String(req.body.message || '').trim().slice(0, 5000)

  if (!banId || !message) {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const ownership = await query(
    `SELECT 1
     FROM ti_ban_identifiers
     WHERE ban_id = ? AND identifier = ?
     LIMIT 1`,
    [banId, req.user.identifier]
  )

  if (!ownership[0]) {
    return res.status(403).json({ error: 'ban_ownership_required' })
  }

  const result = await query(
    `INSERT INTO ti_appeals (ban_id, appellant_identifier, appellant_name, message, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
    [banId, req.user.identifier, req.user.name, message]
  )

  await query(
    `INSERT INTO ti_appeal_messages (appeal_id, actor_identifier, actor_name, actor_role, message, created_at)
     VALUES (?, ?, ?, 'player', ?, UTC_TIMESTAMP())`,
    [result.insertId, req.user.identifier, req.user.name, message]
  )

  const appealId = result.insertId
  const panelUrl = process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/appeals` : 'the admin panel'
  sendDiscordLog(
    `[Appeal Submitted] **${req.user.name}** submitted appeal **#${appealId}** for ban **#${banId}** — review at ${panelUrl}`
  ).catch(() => {})

  res.json({ ok: true, id: appealId })
})

router.post('/:id/status', requireAuth, requirePermission('ti.appeals.manage'), async (req, res) => {
  const id = Number(req.params.id)
  const newStatus = String(req.body.status || '').trim()
  const note = String(req.body.note || '').trim().slice(0, 256)
  const adminResponse = String(req.body.admin_response || '').trim().slice(0, 5000)

  if (!['open', 'in_review', 'accepted', 'denied', 'closed'].includes(newStatus)) {
    return res.status(400).json({ error: 'invalid_status' })
  }

  const existing = await query(
    'SELECT id, ban_id, status, appellant_identifier, appellant_name FROM ti_appeals WHERE id = ? LIMIT 1',
    [id]
  )
  if (!existing[0]) {
    return res.status(404).json({ error: 'appeal_not_found' })
  }

  await query(
    `UPDATE ti_appeals
     SET status = ?, admin_response = ?, updated_at = UTC_TIMESTAMP(),
         resolved_at = CASE WHEN ? IN ('accepted','denied','closed') THEN UTC_TIMESTAMP() ELSE resolved_at END,
         resolved_by_identifier = CASE WHEN ? IN ('accepted','denied','closed') THEN ? ELSE resolved_by_identifier END,
         resolved_by_name = CASE WHEN ? IN ('accepted','denied','closed') THEN ? ELSE resolved_by_name END
     WHERE id = ?`,
    [newStatus, adminResponse || null, newStatus, newStatus, req.user.identifier, newStatus, req.user.name, id]
  )

  await query(
    `INSERT INTO ti_appeal_status_history
      (appeal_id, old_status, new_status, changed_by_identifier, changed_by_name, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [id, existing[0].status, newStatus, req.user.identifier, req.user.name, note]
  )

  await query(
    `INSERT INTO ti_appeal_messages (appeal_id, actor_identifier, actor_name, actor_role, message, created_at)
     VALUES (?, ?, ?, 'admin', ?, UTC_TIMESTAMP())`,
    [id, req.user.identifier, req.user.name, adminResponse || `Status changed to ${newStatus}`]
  )

  if (['accepted', 'denied', 'closed'].includes(newStatus)) {
    const appellantId = existing[0].appellant_identifier || ''
    const appellantName = existing[0].appellant_name || 'unknown'
    const icon = newStatus === 'accepted' ? '\u2705' : newStatus === 'denied' ? '\u274C' : '\uD83D\uDD12'
    const banId = existing[0].ban_id

    // Auto-revoke the ban when the appeal is accepted
    if (newStatus === 'accepted') {
      const revokeNote = note || `Appeal #${id} accepted by ${req.user.name}`
      const revokeResult = await query(
        `UPDATE ti_bans
         SET revoked_at = UTC_TIMESTAMP(), revoked_by_name = ?, revoked_by_identifier = ?,
             revoke_note = ?, updated_at = UTC_TIMESTAMP()
         WHERE id = ? AND revoked_at IS NULL`,
        [req.user.name, req.user.identifier, revokeNote, banId]
      )
      if (revokeResult.affectedRows > 0) {
        await writeAdminLog({
          req,
          action: 'appeal_accepted_ban_revoked',
          target: String(banId),
          details: { appealId: id, revokeNote },
          discordMessage: `[Appeal Accepted] **${req.user.name}** accepted appeal **#${id}** and revoked ban **#${banId}** for **${appellantName}**`
        })
      }
    }

    sendDiscordLog(
      `[Appeal ${newStatus.toUpperCase()}] **${req.user.name}** ${newStatus} appeal **#${id}** from **${appellantName}**`
    ).catch(() => {})

    if (appellantId.startsWith('discord:')) {
      const discordUserId = appellantId.slice(8)
      const statusLabel = newStatus === 'accepted' ? 'Accepted' : newStatus === 'denied' ? 'Denied' : 'Closed'
      const icon = newStatus === 'accepted' ? '✅' : newStatus === 'denied' ? '❌' : '🔒'
      const dmEmbed = {
        title:       `${icon} Appeal #${id} — ${statusLabel}`,
        color:       newStatus === 'accepted' ? 3066993 : newStatus === 'denied' ? 15158332 : 9833894,
        description: newStatus === 'accepted'
          ? 'Your ban appeal has been **accepted**. You may rejoin the server.'
          : newStatus === 'denied'
            ? `Your ban appeal has been **denied**.${adminResponse ? `\n\nStaff note: ${adminResponse.slice(0, 500)}` : ''}`
            : 'Your ban appeal has been closed by staff.',
        fields:   [{ name: 'Appeal ID', value: `#${id}`, inline: true }, { name: 'Handled By', value: req.user.name, inline: true }],
        footer:   { text: 'TI Admin Panel' },
        timestamp: new Date().toISOString(),
      }
      sendDiscordDM(discordUserId, dmEmbed).catch(() => {})
    }
  }

  res.json({ ok: true })
})

router.get('/:id/messages', requireAuth, async (req, res) => {
  const id = Number(req.params.id)

  const appeal = await query('SELECT * FROM ti_appeals WHERE id = ? LIMIT 1', [id])
  if (!appeal[0]) {
    return res.status(404).json({ error: 'appeal_not_found' })
  }

  const isOwner = appeal[0].appellant_identifier === req.user.identifier
  const isStaff = (req.user.permissions || []).includes('*') || (req.user.permissions || []).includes('ti.appeals.view') || (req.user.permissions || []).includes('ti.appeals.*')

  if (!isOwner && !isStaff) {
    return res.status(403).json({ error: 'forbidden' })
  }

  const rows = await query('SELECT * FROM ti_appeal_messages WHERE appeal_id = ? ORDER BY id ASC', [id])
  res.json({ rows })
})

export default router
