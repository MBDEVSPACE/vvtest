import { Router } from 'express'
import passport from 'passport'
import { Strategy as DiscordStrategy } from 'passport-discord'
import { Strategy as SteamStrategy } from 'passport-steam'
import { getUserRoleAndPermissions, hasPermission } from '../services/roles.js'
import { getDiscordGuildMemberRoleIds } from '../services/discord.js'

const router = Router()

function upsertUserFromProfile(provider, profile) {
  if (provider === 'discord') {
    return {
      provider,
      providerId: profile.id,
      identifier: `discord:${profile.id}`,
      name: profile.username || `discord:${profile.id}`
    }
  }

  // passport-steam provides profile.id as decimal SteamID64.
  // FiveM stores steam identifiers in hex (e.g. steam:11000015623b5d1).
  // Convert here so the identifier matches what ti_admin seeds into the DB.
  const steamHex = BigInt(profile.id).toString(16)
  return {
    provider,
    providerId: profile.id,
    identifier: `steam:${steamHex}`,
    name: profile.displayName || `steam:${profile.id}`
  }
}

export function configureAuth(app) {
  passport.serializeUser((user, done) => done(null, user))
  passport.deserializeUser((user, done) => done(null, user))

  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_CALLBACK_URL) {
    passport.use(new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.DISCORD_CALLBACK_URL,
        scope: ['identify']
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const user = upsertUserFromProfile('discord', profile)
          const discordRoleIds = await getDiscordGuildMemberRoleIds(profile.id)
          const auth = await getUserRoleAndPermissions(user.identifier, { discordRoleIds })
          done(null, { ...user, discordRoleIds, role: auth.role, permissions: auth.permissions })
        } catch (err) {
          done(err)
        }
      }
    ))
  }

  if (process.env.STEAM_RETURN_URL && process.env.STEAM_REALM && process.env.STEAM_API_KEY) {
    passport.use(new SteamStrategy(
      {
        returnURL: process.env.STEAM_RETURN_URL,
        realm: process.env.STEAM_REALM,
        apiKey: process.env.STEAM_API_KEY
      },
      async (_identifier, profile, done) => {
        try {
          const user = upsertUserFromProfile('steam', profile)
          const auth = await getUserRoleAndPermissions(user.identifier)
          done(null, { ...user, role: auth.role, permissions: auth.permissions })
        } catch (err) {
          done(err)
        }
      }
    ))
  }

  app.use(passport.initialize())
  app.use(passport.session())
}

router.get('/discord', passport.authenticate('discord'))
router.get('/discord/callback', passport.authenticate('discord', { failureRedirect: '/auth/failure' }), (req, res) => {
  req.session.user = req.user
  res.redirect(process.env.CLIENT_URL)
})

router.get('/steam', passport.authenticate('steam'))
router.get('/steam/callback', passport.authenticate('steam', { failureRedirect: '/auth/failure' }), (req, res) => {
  req.session.user = req.user
  res.redirect(process.env.CLIENT_URL)
})

router.get('/failure', (_req, res) => {
  res.status(401).json({ error: 'auth_failed' })
})

router.get('/me', (req, res) => {
  const user = req.session?.user || null
  const capabilities = user ? {
    canViewBans: hasPermission(user, 'ti.ban.view'),
    canCreateBans: hasPermission(user, 'ti.ban.create'),
    canEditBans: hasPermission(user, 'ti.ban.edit'),
    canUnban: hasPermission(user, 'ti.ban.unban'),
    canViewIps: hasPermission(user, 'ti.ban.view_ip'),
    canViewAppeals: hasPermission(user, 'ti.appeals.view'),
    canManageAppeals: hasPermission(user, 'ti.appeals.manage'),
    canViewAudit: hasPermission(user, 'ti.audit.view'),
    canManagePermissions: hasPermission(user, 'ti.admin.manage_permissions'),
    isSuperAdmin: Boolean(user.role?.is_super)
  } : null

  res.json({ user, capabilities })
})

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true })
  })
})

export default router
