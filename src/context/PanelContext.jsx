import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api/client'

const PanelContext = createContext(null)

const DEFAULT_BRANDING = {
  title: 'Titan Admin Panel',
  subtitle: 'Live ban control and server administration',
  logoUrl: '',
  heroLogoUrl: '',
  colorScheme: 'teal',
  discordLogsEnabled: false,
  discordLogChannelId: '',
  discordBotToken: '',
  discordGuildId: '',
  discordBannedRoles: []
}

export function PanelProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING)

  async function refreshBranding() {
    try {
      const { data } = await api.get('/api/admin/branding')
      setBranding({
        title: data.title || DEFAULT_BRANDING.title,
        subtitle: data.subtitle || DEFAULT_BRANDING.subtitle,
        logoUrl: data.logoUrl || '',
        heroLogoUrl: data.heroLogoUrl || '',
        colorScheme: data.colorScheme || DEFAULT_BRANDING.colorScheme,
        discordLogsEnabled: Boolean(data.discordLogsEnabled),
        discordLogChannelId: data.discordLogChannelId || '',
        discordBotToken: data.discordBotToken || '',
        discordGuildId: data.discordGuildId || '',
        discordBannedRoles: Array.isArray(data.discordBannedRoles) ? data.discordBannedRoles : []
      })
    } catch {
      setBranding(DEFAULT_BRANDING)
    }
  }

  useEffect(() => {
    refreshBranding()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', branding.colorScheme || 'teal')
  }, [branding.colorScheme])

  return (
    <PanelContext.Provider value={{ branding, refreshBranding }}>
      {children}
    </PanelContext.Provider>
  )
}

export function usePanel() {
  return useContext(PanelContext)
}
