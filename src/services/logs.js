import { query } from '../db/pool.js'
import { getPanelSettings } from './panelSettings.js'

function normalizeDetails(details) {
  try {
    return JSON.stringify(details || {})
  } catch {
    return JSON.stringify({ error: 'details_serialize_failed' })
  }
}

export async function sendDiscordLog(message) {
  const settings = await getPanelSettings()
  const channelId = settings.discordLogChannelId
  const botToken = settings.discordBotToken
  const enabled = settings.discordLogsEnabled

  if (!enabled || !channelId || !botToken) {
    return false
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: message.slice(0, 1900)
    })
  })

  return response.ok
}

export async function sendDiscordFile(fileContent, filename, caption) {
  const settings = await getPanelSettings()
  const channelId = settings.discordLogChannelId
  const botToken = settings.discordBotToken
  const enabled = settings.discordLogsEnabled

  if (!enabled || !channelId || !botToken) return false

  const form = new FormData()
  form.append('payload_json', JSON.stringify({ content: caption ? caption.slice(0, 1900) : '' }))
  form.append('files[0]', new Blob([fileContent], { type: 'text/plain' }), filename)

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}` },
    body: form
  })

  return response.ok
}

export async function writeAdminLog({ req, action, target = '', details = {}, discordMessage }) {
  await query(
    `INSERT INTO ti_audit_logs (actor_src, actor_name, actor_identifier, action, target, details, created_at)
     VALUES (0, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [
      req?.user?.name || 'system',
      req?.user?.identifier || 'system',
      action,
      String(target || ''),
      normalizeDetails(details)
    ]
  )

  if (discordMessage) {
    try {
      await sendDiscordLog(discordMessage)
    } catch (error) {
      console.error('[web-panel] discord log failed', error)
    }
  }
}
