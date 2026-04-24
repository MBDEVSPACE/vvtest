import { query } from '../db/pool.js'
import { getPanelSettings } from './panelSettings.js'

function normalizeDetails(details) {
  try {
    return JSON.stringify(details || {})
  } catch {
    return JSON.stringify({ error: 'details_serialize_failed' })
  }
}

// Action → Discord embed color map
const ACTION_COLORS = {
  ban:        15158332,  // red
  ban_create: 15158332,
  web_ban_create: 15158332,
  ban_unban:  3066993,   // green
  web_ban_unban: 3066993,
  web_kick:   16744448,  // orange
  kick:       16744448,
  warn:       15787023,  // yellow
  web_broadcast: 3447003, // blue
  appeal:     3447003,
  web_role_create: 10181046,  // purple
  web_role_update: 10181046,
  web_permissions_update: 10181046,
  web_set_job: 10181046,
  web_screenshot: 54527,   // cyan
  screenshot:  54527,
  default:     9833894,   // grey
}

function actionColor(action) {
  if (!action) return ACTION_COLORS.default
  const key = Object.keys(ACTION_COLORS).find(k => action.startsWith(k))
  return key ? ACTION_COLORS[key] : ACTION_COLORS.default
}

// Build a rich Discord embed from an action + context
function buildEmbed(action, actorName, targetName, details, title) {
  const fields = [
    { name: 'Admin', value: String(actorName || 'system'), inline: true },
    { name: 'Target', value: String(targetName || 'n/a'), inline: true },
  ]

  if (details && typeof details === 'object') {
    for (const [k, v] of Object.entries(details)) {
      if (v !== undefined && v !== null && v !== '') {
        fields.push({ name: k, value: String(v).slice(0, 256), inline: true })
      }
    }
  }

  return {
    title:     title || String(action || 'Admin Action').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color:     actionColor(action),
    fields:    fields.slice(0, 10),
    footer:    { text: 'TI Admin Panel' },
    timestamp: new Date().toISOString(),
  }
}

// Post a Discord embed (or plain text fallback) to the log channel via bot token
export async function sendDiscordEmbed(embed, webhookUrl) {
  const settings = await getPanelSettings()
  const enabled  = settings.discordLogsEnabled

  // Support sending to an explicit webhook URL (used by appeals, reports)
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    })
    return response.ok
  }

  const channelId = settings.discordLogChannelId
  const botToken  = settings.discordBotToken
  if (!enabled || !channelId || !botToken) return false

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  })
  return response.ok
}

// Legacy plain-text log — now wraps as a simple embed
export async function sendDiscordLog(message) {
  return sendDiscordEmbed({
    description: String(message).slice(0, 4096),
    color:       ACTION_COLORS.default,
    footer:      { text: 'TI Admin Panel' },
    timestamp:   new Date().toISOString(),
  })
}

export async function sendDiscordFile(fileContent, filename, caption) {
  const settings = await getPanelSettings()
  const channelId = settings.discordLogChannelId
  const botToken  = settings.discordBotToken
  const enabled   = settings.discordLogsEnabled

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

// writeAdminLog — accepts both discordMessage (string) and discordEmbed (object)
export async function writeAdminLog({ req, action, target = '', details = {}, discordMessage, discordEmbed }) {
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

  const embed = discordEmbed || (discordMessage
    ? buildEmbed(action, req?.user?.name, target, details, discordMessage.slice(0, 80))
    : buildEmbed(action, req?.user?.name, target, details))

  try {
    await sendDiscordEmbed(embed)
  } catch (error) {
    console.error('[web-panel] discord embed failed', error)
  }
}

