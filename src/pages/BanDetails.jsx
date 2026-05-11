import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'

function formatDate(value) {
  if (!value) return 'Permanent'
  const s = String(value).replace(' ', 'T')
  const hasTimezone = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)
  const d = new Date(hasTimezone ? s : s + 'Z')
  return isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function normalizeEvidence(value) {
  if (!value) return ''
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function parseEvidence(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function chipClass(identifier) {
  const prefix = String(identifier).split(':')[0]
  const map = { discord: 'chip-discord', steam: 'chip-steam', license: 'chip-license', license2: 'chip-license', ip: 'chip-ip', hwid: 'chip-hwid', fivem: 'chip-fivem', xbl: 'chip-xbl' }
  return map[prefix] || ''
}

export default function BanDetails() {
  const { id } = useParams()
  const [ban, setBan] = useState(null)
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [evidence, setEvidence] = useState('')
  const [unbanNote, setUnbanNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    const { data } = await api.get(`/api/bans/${id}`)
    setBan(data)
    setReason(data.reason || '')
    setExpiresAt(data.ban_expire ? data.ban_expire.replace(' ', 'T') : '')
    setEvidence(normalizeEvidence(data.evidence))
  }

  async function save() {
    await api.put(`/api/bans/${id}`, {
      reason,
      expires_at: expiresAt ? expiresAt.replace('T', ' ') : null,
      evidence: parseEvidence(evidence)
    })
    await load()
  }

  async function unban() {
    setError('')
    setMessage('')
    try {
      await api.post(`/api/bans/${id}/unban`, { note: unbanNote })
      setMessage('Ban revoked successfully.')
      await load()
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error
      if (err.response?.status === 403) {
        setError('You do not have permission to revoke this ban (insufficient rank).')
      } else if (err.response?.status === 401) {
        setError('Your session expired. Please sign in again.')
      } else {
        setError(detail || 'Failed to revoke ban.')
      }
    }
  }

  useEffect(() => {
    load()
  }, [id])

  if (!ban) return <main className="page"><div className="empty-state">Loading ban details...</div></main>

  return (
    <main className="page">
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Ban Record</p>
          <h1>Ban #{ban.id}</h1>
          <p className="hero-copy">Player identifiers, ban details, and enforcement options.</p>
        </div>
        <div className="hero-stat-row">
          <article className="mini-stat-card">
            <span>Player</span>
            <strong>{ban.player_name}</strong>
          </article>
          <article className="mini-stat-card">
            <span>Expires</span>
            <strong>{ban.ban_expire ? 'Timed' : 'Permanent'}</strong>
          </article>
        </div>
      </section>

      <section className="layout-grid">
        <article className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>Player details</h2>
            </div>
          </div>
          {error ? <div className="notice error">{error}</div> : null}
          {message ? <div className="notice success">{message}</div> : null}
          <div className="details-grid">
            <div>
              <span className="field-label">Player</span>
              <strong>{ban.player_name}</strong>
            </div>
            <div>
              <span className="field-label">Expires</span>
              <strong>{formatDate(ban.ban_expire)}</strong>
            </div>
            {ban.steam_id ? (
              <div>
                <span className="field-label">Steam ID</span>
                <strong className="monospace">{ban.steam_id}</strong>
              </div>
            ) : null}
            {ban.discord_id ? (
              <div>
                <span className="field-label">Discord ID</span>
                <strong className="monospace">{ban.discord_id}</strong>
              </div>
            ) : null}
            {ban.ip ? (
              <div>
                <span className="field-label">IP Address</span>
                <strong className="monospace chip-ip-text">{ban.ip}</strong>
              </div>
            ) : null}
            {ban.hwid_token ? (
              <div className="full-width">
                <span className="field-label">Hardware ID</span>
                <strong className="monospace chip-hwid-text" style={{wordBreak:'break-all',fontSize:'0.78rem'}}>{ban.hwid_token}</strong>
              </div>
            ) : null}
            <div className="full-width">
              <span className="field-label">All Identifiers</span>
              <div className="identifier-list">
                {(ban.identifiers || []).map((identifier) => (
                  <span key={identifier} className={`identifier-chip ${chipClass(identifier)}`}>{identifier}</span>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Enforcement</p>
              <h2>Actions</h2>
            </div>
          </div>
          {ban.capabilities?.canEdit ? (
            <div className="editor-stack">
              <label>
                Reason
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <label>
                Expires At (UTC)
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </label>
              <label>
                Evidence / notes
                <textarea rows={8} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              </label>
              <button onClick={save}>Save Changes</button>
            </div>
          ) : (
            <div className="stack-list">
              <div className="stack-list-card">
                <strong>Reason</strong>
                <span>{ban.reason}</span>
              </div>
              <div className="stack-list-card">
                <strong>Expires</strong>
                <span>{formatDate(ban.ban_expire)}</span>
              </div>
            </div>
          )}

          <div className="editor-stack bordered-top">
            <label>
              Unban note
              <input placeholder="Unban note" value={unbanNote} onChange={(e) => setUnbanNote(e.target.value)} />
            </label>
            {ban.capabilities?.canUnban ? (
              <button className="danger-button" onClick={unban}>Unban Player</button>
            ) : (
              <div className="empty-state">You do not have permission to revoke this ban.</div>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}
