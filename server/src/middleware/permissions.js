import { hasPermission } from '../services/roles.js'

export function requirePermission(node) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    if (!hasPermission(req.user, node)) {
      return res.status(403).json({ error: 'forbidden', permission: node })
    }

    return next()
  }
}
