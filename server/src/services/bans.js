import { hasPermission } from './roles.js'

function cleanIdentifier(value) {
  return String(value || '').trim()
}

export function splitIdentifiers(rawValue) {
  const raw = String(rawValue || '')

  return raw
    .split(',')
    .map((item) => cleanIdentifier(item))
    .filter(Boolean)
}

export function extractIdentifierMap(identifiers) {
  const values = Array.isArray(identifiers) ? identifiers : splitIdentifiers(identifiers)
  const getValue = (prefix) => values.find((value) => value.startsWith(`${prefix}:`)) || null

  return {
    steamId: getValue('steam'),
    discordId: getValue('discord'),
    licenseId: getValue('license') || getValue('license2'),
    ip: getValue('ip'),
    hwid: getValue('hwid')
  }
}

/**
 * Parse a datetime value (JS Date or MySQL DATETIME string) as UTC.
 * All ban timestamps are stored as UTC — never assume local time.
 */
function parseUtc(value) {
  if (!value) return null
  if (value instanceof Date) return value
  // MySQL DATETIME strings have no timezone indicator; append Z to force UTC
  const s = String(value).trim().replace(' ', 'T')
  return new Date(s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z')
}

/**
 * Normalise a datetime value to a plain UTC string (YYYY-MM-DD HH:MM:SS).
 * Returns null for empty values.
 */
export function toUtcString(value) {
  if (!value) return null
  const d = parseUtc(value)
  return isNaN(d?.getTime()) ? String(value) : d.toISOString().replace('T', ' ').slice(0, 19)
}

export function getBanStatus(row) {
  if (row.revoked_at) return 'revoked'
  if (!row.expires_at) return 'active'
  const exp = parseUtc(row.expires_at)
  return exp > new Date() ? 'active' : 'expired'
}

export function getBanCapabilities(user, row) {
  const status = getBanStatus(row)
  const canViewAll = hasPermission(user, 'ti.ban.view')
  const canViewIp = hasPermission(user, 'ti.ban.view_ip')
  const canEdit = hasPermission(user, 'ti.ban.edit')
  const canUnban = hasPermission(user, 'ti.ban.unban') && status === 'active'
  const canManagePermissions = hasPermission(user, 'ti.admin.manage_permissions')
  const ownedByUser = Number(row.owned_by_user || 0) === 1
  const hasOpenAppeal = Number(row.open_appeal_count || 0) > 0

  return {
    canViewAll,
    canViewIp,
    canEdit,
    canUnban,
    canManagePermissions,
    canAppeal: ownedByUser && status === 'active' && !hasOpenAppeal
  }
}

export function serializeBanRow(row, user) {
  const identifiers = splitIdentifiers(row.identifiers)
  const fields = extractIdentifierMap(identifiers)
  const capabilities = getBanCapabilities(user, row)
  const isGuest = !user?.identifier
  let evidence = row.evidence

  if (typeof evidence === 'string') {
    try {
      evidence = JSON.parse(evidence)
    } catch {
      evidence = row.evidence
    }
  }

  return {
    id: row.id,
    steam_name: row.player_name,
    player_name: row.player_name,
    steam_id: isGuest ? null : fields.steamId,
    discord_id: isGuest ? null : fields.discordId,
    license_id: isGuest ? null : fields.licenseId,
    ip: capabilities.canViewIp ? (row.ip_address || fields.ip) : null,
    hwid_token: capabilities.canViewIp ? fields.hwid : null,
    reason: row.reason,
    evidence: isGuest ? null : evidence,
    ban_issue_date: toUtcString(row.created_at),
    ban_expire: toUtcString(row.expires_at),
    ban_giver: row.created_by_name,
    ban_giver_identifier: row.created_by_identifier,
    revoked_at: toUtcString(row.revoked_at),
    updated_at: toUtcString(row.updated_at),
    status: getBanStatus(row),
    identifiers: isGuest ? [] : identifiers,
    appeal_count: isGuest ? 0 : Number(row.appeal_count || 0),
    is_connected: isGuest ? false : Number(row.is_connected || 0) === 1,
    connected_at: isGuest ? null : toUtcString(row.connected_at),
    last_seen_at: isGuest ? null : toUtcString(row.last_seen_at),
    connection_state: isGuest ? null : (row.connection_state || null),
    last_connection_attempt_at: isGuest ? null : toUtcString(row.last_connection_attempt_at),
    open_appeal_count: isGuest ? 0 : Number(row.open_appeal_count || 0),
    latest_appeal_status: isGuest ? null : (row.latest_appeal_status || null),
    owned_by_user: Number(row.owned_by_user || 0) === 1,
    capabilities
  }
}

export const formatBanRow = serializeBanRow
