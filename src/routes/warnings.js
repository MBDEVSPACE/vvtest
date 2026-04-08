import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'
import { writeAdminLog } from '../services/logs.js'

const router = Router()

router.get('/', requireAuth, requirePermission('ti.admin.warn'), async (req, res) => {
  const q = String(req.query.q || '').trim()
  const page = Math.max(1, Number(req.query.page || 1))
  const limit = Math.min(100, Math.max(10, Number(req.query.limit || 50)))
  const offset = (page - 1) * limit

  let rows, totalRows
  if (q) {
    const pattern = `%${q}%`
    ;[rows, totalRows] = await Promise.all([
      query(
        `SELECT id, target_identifier, target_name, warned_by_identifier, warned_by_name, message, created_at
         FROM ti_warnings
         WHERE target_name LIKE ? OR target_identifier LIKE ? OR message LIKE ? OR warned_by_name LIKE ?
         ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
        [pattern, pattern, pattern, pattern]
      ),
      query(
        `SELECT COUNT(*) AS cnt FROM ti_warnings
         WHERE target_name LIKE ? OR target_identifier LIKE ? OR message LIKE ? OR warned_by_name LIKE ?`,
        [pattern, pattern, pattern, pattern]
      )
    ])
  } else {
    ;[rows, totalRows] = await Promise.all([
      query(
        `SELECT id, target_identifier, target_name, warned_by_identifier, warned_by_name, message, created_at
         FROM ti_warnings ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`
      ),
      query('SELECT COUNT(*) AS cnt FROM ti_warnings')
    ])
  }

  res.json({ rows, total: Number(totalRows[0]?.cnt || 0), page, limit })
})

router.delete('/:id', requireAuth, requirePermission('ti.admin.warn'), async (req, res) => {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'invalid_id' })

  const existing = await query(
    'SELECT id, target_name, target_identifier FROM ti_warnings WHERE id = ? LIMIT 1',
    [id]
  )
  if (!existing[0]) return res.status(404).json({ error: 'not_found' })

  await query('DELETE FROM ti_warnings WHERE id = ?', [id])

  await writeAdminLog({
    req,
    action: 'web_warning_delete',
    target: existing[0].target_identifier,
    details: { warningId: id, targetName: existing[0].target_name },
    discordMessage: `[Warnings] **${req.user.name}** deleted warning #${id} for ${existing[0].target_name}`
  })

  res.json({ ok: true })
})

export default router
