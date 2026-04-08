import { getUserRoleAndPermissions } from '../services/roles.js'

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  return next()
}

export async function bindUser(req, _res, next) {
  const sessionUser = req.session?.user || null

  if (!sessionUser?.identifier) {
    req.user = null
    return next()
  }

  try {
    const auth = await getUserRoleAndPermissions(sessionUser.identifier, {
      discordRoleIds: sessionUser.discordRoleIds || []
    })
    const refreshedUser = {
      ...sessionUser,
      role: auth.role,
      permissions: auth.permissions
    }

    req.session.user = refreshedUser
    req.user = refreshedUser
  } catch (error) {
    console.error('[web-panel] failed to refresh session user', error)
    req.user = sessionUser
  }

  return next()
}
