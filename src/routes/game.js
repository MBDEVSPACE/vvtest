import { Router } from 'express'
import { sendDiscordLog, sendDiscordFile } from '../services/logs.js'
import { getPanelSettings } from '../services/panelSettings.js'

const router = Router()

// POST /api/ingest/game-log
// Called by ti_admin server after every audit action.
// Protected by the shared secret set in Config.WebPanel.SharedSecret (ti_admin) and TI_SHARED_SECRET (.env here).
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

  const safeActor = String(actorName || 'unknown').slice(0, 80)
  const safeTarget = String(target || 'n/a').slice(0, 80)
  const safeAction = String(action).slice(0, 64)

  const detailStr = details && typeof details === 'object'
    ? Object.entries(details).map(([k, v]) => `${k}=${v}`).join(' ').slice(0, 200)
    : ''

  const discordMessage = detailStr
    ? `[In-Game] **${safeActor}** \`${safeAction}\` → \`${safeTarget}\` (${detailStr})`
    : `[In-Game] **${safeActor}** \`${safeAction}\` → \`${safeTarget}\``

  try {
    if (safeAction === 'admin_chat_export') {
      const transcript = typeof details?.transcript === 'string' ? details.transcript : ''
      if (transcript) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const caption = `📋 **Admin Chat Transcript** cleared by **${safeActor}** at ${new Date().toUTCString()}`
        await sendDiscordFile(transcript, `admin-chat-${stamp}.txt`, caption)
      }
    } else {
      await sendDiscordLog(discordMessage)
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
