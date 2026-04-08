import { Router } from 'express'
import { query } from '../db/pool.js'
import { requireAuth } from '../middleware/auth.js'
import { requirePermission } from '../middleware/permissions.js'

const router = Router()

router.get('/', requireAuth, requirePermission('ti.audit.view'), async (req, res) => {
  const q = String(req.query.q || '').trim()
  const limit = Math.min(500, Math.max(25, Number(req.query.limit || 100)))

  let rows
  if (q) {
    const pattern = `%${q}%`
    rows = await query(
      `SELECT id, actor_name, actor_identifier, action, target, details, created_at
       FROM ti_audit_logs
       WHERE action LIKE ? OR actor_name LIKE ? OR actor_identifier LIKE ? OR target LIKE ?
       ORDER BY id DESC
       LIMIT ${limit}`,
      [pattern, pattern, pattern, pattern]
    )
  } else {
    rows = await query(
      `SELECT id, actor_name, actor_identifier, action, target, details, created_at
       FROM ti_audit_logs
       ORDER BY id DESC
       LIMIT ${limit}`
    )
  }

  res.json({ rows })
})

export default router
