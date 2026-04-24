import { Router } from 'express'
import { sendDiscordLog, sendDiscordEmbed, sendDiscordFile } from '../services/logs.js'
import { getPanelSettings } from '../services/panelSettings.js'

const router = Router()

// Action → embed color
const ACTION_COLORS = {
  ban_create: 15158332, ban_unban: 3066993, kick: 16744448,
  warn: 15787023, screenshot: 54527, report: 3447003,
  mute: 15787023, default: 9833894
}
function embedColor(action) {
  const key = Object.keys(ACTION_COLORS).find(k => action.startsWith(k))
  return key ? ACTION_COLORS[key] : ACTION_COLORS.default
}

// POST /api/ingest/game-log
router.post('/game-log', async (req, res) => {
  const expectedSecret = process.env.TI_SHARED_SECRET || ''
  const incoming = String(req.headers['x-ti-secret'] || '').trim()

  if (!expectedSecret || !incoming || incoming !== expectedSecret) {
    return res.status(403).json({ error: 'forbidden' })
  }

  const { action, actorName, target, details } = req.body || {}

  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'invalid_payload' })
  }

  const safeActor  = String(actorName || 'unknown').slice(0, 80)
  const safeTarget = String(target || 'n/a').slice(0, 80)
  const safeAction = String(action).slice(0, 64)

  try {
    if (safeAction === 'admin_chat_export') {
      const transcript = typeof details?.transcript === 'string' ? details.transcript : ''
      if (transcript) {
        const stamp   = new Date().toISOString().replace(/[:.]/g, '-')
        const caption = `📋 **Admin Chat Transcript** cleared by **${safeActor}** at ${new Date().toUTCString()}`
        await sendDiscordFile(transcript, `admin-chat-${stamp}.txt`, caption)
      }
    } else {
      // Build rich embed from in-game action
      const fields = [
        { name: 'Admin', value: safeActor, inline: true },
        { name: 'Target', value: safeTarget, inline: true },
      ]
      if (details && typeof details === 'object') {
        for (const [k, v] of Object.entries(details)) {
          if (v !== undefined && v !== null && String(v) !== '') {
            fields.push({ name: k, value: String(v).slice(0, 256), inline: true })
          }
        }
      }
      await sendDiscordEmbed({
        title:     `[In-Game] ${safeAction.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
        color:     embedColor(safeAction),
        fields:    fields.slice(0, 10),
        footer:    { text: 'TI Admin · In-Game' },
        timestamp: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[web-panel] game-log discord failed', err)
  }

  res.json({ ok: true })
})

// GET /api/ingest/discord-config
// Called by ti_admin server at startup to fetch Discord bot credentials from the DB.
router.get('/discord-config', async (req, res) => {
  const expectedSecret = process.env.TI_SHARED_SECRET || ''
  const incoming = String(req.headers['x-ti-secret'] || '').trim()

  if (!expectedSecret || !incoming || incoming !== expectedSecret) {
    return res.status(403).json({ error: 'forbidden' })
  }

  try {
    const settings = await getPanelSettings()
    res.json({
      botToken: settings.discordBotToken || '',
      guildId: settings.discordGuildId || '',
      bannedRoles: Array.isArray(settings.discordBannedRoles) ? settings.discordBannedRoles : []
    })
  } catch (err) {
    console.error('[web-panel] discord-config fetch failed', err)
    res.status(500).json({ error: 'internal_error' })
  }
})

export default router
