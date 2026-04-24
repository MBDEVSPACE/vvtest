import { getPanelSettings } from './panelSettings.js'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

export async function getDiscordGuildMemberRoleIds(userId) {
  if (!userId) return []
  const settings = await getPanelSettings()
  const guildId = settings.discordGuildId
  const botToken = settings.discordBotToken

  if (!guildId || !botToken) {
    return []
  }

  const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
    headers: {
      Authorization: `Bot ${botToken}`
    }
  })

  if (response.status === 404) {
    return []
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`discord_guild_member_fetch_failed:${response.status}:${body}`)
  }

  const data = await response.json()
  return Array.isArray(data.roles) ? data.roles.map((value) => String(value)) : []
}

export async function sendDiscordDM(userId, messageOrEmbed) {
  const settings = await getPanelSettings()
  const botToken = settings.discordBotToken
  if (!botToken || !userId) return false

  const channelRes = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: String(userId) })
  })
  if (!channelRes.ok) return false

  const channel = await channelRes.json()

  // Support plain string or embed object
  const payload = typeof messageOrEmbed === 'string'
    ? { content: String(messageOrEmbed).slice(0, 1900) }
    : { embeds: [messageOrEmbed] }

  const msgRes = await fetch(`${DISCORD_API_BASE}/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return msgRes.ok
}
