import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api/client'

const AuthContext = createContext(null)

function hasPermission(user, node) {
  const permissions = user?.permissions || []

  if (permissions.includes('*') || permissions.includes(node)) {
    return true
  }

  const parts = String(node).split('.')
  for (let index = parts.length - 1; index > 0; index -= 1) {
    if (permissions.includes(`${parts.slice(0, index).join('.')}.*`)) {
      return true
    }
  }

  return false
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [capabilities, setCapabilities] = useState(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const { data } = await api.get('/auth/me')
      setUser(data.user)
      setCapabilities(data.capabilities || {
        canViewBans: hasPermission(data.user, 'ti.ban.view'),
        canCreateBans: hasPermission(data.user, 'ti.ban.create'),
        canViewAudit: hasPermission(data.user, 'ti.audit.view'),
        canManagePermissions: hasPermission(data.user, 'ti.admin.manage_permissions'),
        canViewAppeals: hasPermission(data.user, 'ti.appeals.view'),
        canManageAppeals: hasPermission(data.user, 'ti.appeals.manage'),
        canViewWarnings: hasPermission(data.user, 'ti.admin.warn'),
        canViewIdentifiers: hasPermission(data.user, 'ti.admin.view_identifiers'),
        canViewMap: hasPermission(data.user, 'ti.map.view'),
        canManageTags: hasPermission(data.user, 'ti.tags.manage') || hasPermission(data.user, 'ti.admin.manage_permissions'),
        canUseWebConsole: hasPermission(data.user, 'ti.web.console_exec'),
        canViewResources: hasPermission(data.user, 'ti.web.resources.view'),
        canControlResources: hasPermission(data.user, 'ti.web.resources.control'),
        canBroadcast: hasPermission(data.user, 'ti.admin.announce') || hasPermission(data.user, 'ti.admin.manage_permissions'),
        isSuperAdmin: Boolean(data.user?.role?.is_super)
      })
    } catch {
      setUser(null)
      setCapabilities(null)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await api.post('/auth/logout')
    await refresh()
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <AuthContext.Provider value={{ user, capabilities, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
