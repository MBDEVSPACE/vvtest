import { query } from '../db/pool.js'

const DEFAULT_SETTINGS = {
  panel_title: 'Titan Admin Panel',
  panel_subtitle: 'Live ban control and server administration',
  panel_logo_url: '',
  hero_logo_url: '',
  color_scheme: 'teal',
  discord_logs_enabled: '0',
  discord_log_channel_id: '',
  discord_bot_token: '',
  discord_guild_id: '',
  discord_banned_roles: ''
}

export async function getPanelSettings() {
  const rows = await query(
    `SELECT setting_key, setting_value
     FROM ti_web_panel_settings
     WHERE setting_key IN ('panel_title', 'panel_subtitle', 'panel_logo_url', 'hero_logo_url', 'color_scheme', 'discord_logs_enabled', 'discord_log_channel_id', 'discord_bot_token', 'discord_guild_id', 'discord_banned_roles')`
  )

  const mapped = rows.reduce((accumulator, row) => {
    accumulator[row.setting_key] = row.setting_value || ''
    return accumulator
  }, {})

  return {
    title: mapped.panel_title || DEFAULT_SETTINGS.panel_title,
    subtitle: mapped.panel_subtitle || DEFAULT_SETTINGS.panel_subtitle,
    logoUrl: mapped.panel_logo_url || DEFAULT_SETTINGS.panel_logo_url,
    heroLogoUrl: mapped.hero_logo_url || DEFAULT_SETTINGS.hero_logo_url,
    colorScheme: mapped.color_scheme || DEFAULT_SETTINGS.color_scheme,
    discordLogsEnabled: String(mapped.discord_logs_enabled || DEFAULT_SETTINGS.discord_logs_enabled) === '1',
    discordLogChannelId: mapped.discord_log_channel_id || DEFAULT_SETTINGS.discord_log_channel_id,
    discordBotToken: mapped.discord_bot_token || '',
    discordGuildId: mapped.discord_guild_id || '',
    discordBannedRoles: (() => {
      try { return JSON.parse(mapped.discord_banned_roles || '[]') } catch { return [] }
    })()
  }
}

export async function savePanelSettings(input) {
  const current = await getPanelSettings()
  const values = [
    ['panel_title', String(input.title || DEFAULT_SETTINGS.panel_title).trim().slice(0, 80)],
    ['panel_subtitle', String(input.subtitle || DEFAULT_SETTINGS.panel_subtitle).trim().slice(0, 160)],
    ['panel_logo_url', String(input.logoUrl || '').trim().slice(0, 1024)],
    ['hero_logo_url', String(input.heroLogoUrl || '').trim().slice(0, 1024)],
    ['color_scheme', String(input.colorScheme || DEFAULT_SETTINGS.color_scheme).trim().slice(0, 32)],
    ['discord_logs_enabled', typeof input.discordLogsEnabled === 'boolean' ? (input.discordLogsEnabled ? '1' : '0') : (current.discordLogsEnabled ? '1' : '0')],
    ['discord_log_channel_id', input.discordLogChannelId === undefined ? current.discordLogChannelId : String(input.discordLogChannelId || '').trim().slice(0, 64)],
    ['discord_bot_token', input.discordBotToken === undefined ? (current.discordBotToken || '') : String(input.discordBotToken || '').trim().slice(0, 256)],
    ['discord_guild_id', input.discordGuildId === undefined ? (current.discordGuildId || '') : String(input.discordGuildId || '').trim().slice(0, 32)],
    ['discord_banned_roles', input.discordBannedRoles === undefined ? JSON.stringify(current.discordBannedRoles || []) : (() => {
      const raw = input.discordBannedRoles
      if (Array.isArray(raw)) return JSON.stringify(raw.map(String).filter(Boolean))
      try { const parsed = JSON.parse(raw); return JSON.stringify(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []) } catch { return '[]' }
    })()]
  ]

  for (const [key, value] of values) {
    await query(
      `INSERT INTO ti_web_panel_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, value]
    )
  }

  return getPanelSettings()
}
