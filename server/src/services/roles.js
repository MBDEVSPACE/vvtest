import { query } from '../db/pool.js'

export async function getUserRoleAndPermissions(identifier, options = {}) {
  const lookupIdentifiers = [
    String(identifier || '').trim(),
    ...((options.discordRoleIds || []).map((roleId) => `discord_role:${String(roleId).trim()}`))
  ].filter(Boolean)

  if (!lookupIdentifiers.length) {
    return {
      role: { name: 'user', is_super: 0 },
      permissions: []
    }
  }

  const placeholders = lookupIdentifiers.map(() => '?').join(', ')
  const roleRows = await query(
    `SELECT r.id, r.name, r.label, r.weight, r.is_super
     FROM ti_admin_user_roles ur
     JOIN ti_admin_roles r ON r.id = ur.role_id
     WHERE ur.identifier IN (${placeholders})
     ORDER BY r.weight DESC
     LIMIT 1`,
    lookupIdentifiers
  )

  if (!roleRows[0]) {
    return {
      role: { name: 'user', is_super: 0 },
      permissions: []
    }
  }

  const role = roleRows[0]
  const permRows = await query('SELECT permission FROM ti_admin_permissions WHERE role_id = ?', [role.id])

  return {
    role,
    permissions: permRows.map((row) => row.permission)
  }
}

export function hasPermission(user, node) {
  if (!user) return false
  if (user.permissions?.includes('*')) return true
  if (user.permissions?.includes(node)) return true
  const parts = String(node).split('.')
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const wildcard = `${parts.slice(0, index).join('.')}.*`
    if (user.permissions?.includes(wildcard)) return true
  }

  return false
}
