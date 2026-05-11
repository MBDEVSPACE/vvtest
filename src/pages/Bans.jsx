import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { usePanel } from '../context/PanelContext'

function formatDate(value) {
  if (!value) return 'Permanent'
  const s = String(value).replace(' ', 'T')
  const hasTimezone = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)
  const d = new Date(hasTimezone ? s : s + 'Z')
  return isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

function statusLabel(status) {
  if (status === 'active') return 'Active'
  if (status === 'revoked') return 'Revoked'
  return 'Expired'
}

function serializeEvidenceInput(value) {
  const trimmed = String(value || '').trim()

  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function formatEvidenceForEditor(value) {
  if (!value) return ''
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function Bans() {
  const { user, capabilities } = useAuth()
  const { branding } = usePanel()
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [selectedId, setSelectedId] = useState(null)
  const [stats, setStats] = useState({ total: 0, active: 0, expired: 0, revoked: 0, awaitingAppeals: 0, flagged: 0 })
  const [view, setView] = useState('staff')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [evidence, setEvidence] = useState('')
  const [unbanNote, setUnbanNote] = useState('')
  const [appealMessage, setAppealMessage] = useState('')
  const [manualBan, setManualBan] = useState({
    playerName: '',
    reason: '',
    expiresAt: '',
    identifiersText: '',
    evidenceText: ''
  })
  const [showManualBan, setShowManualBan] = useState(false)
  const [onlinePlayers, setOnlinePlayers] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const permissions = user?.permissions || []
  const canViewAll = permissions.includes('*') || permissions.includes('ti.ban.view') || permissions.includes('ti.ban.*')
  const selectedBan = rows.find((row) => row.id === selectedId) || rows[0] || null
  const showIpColumn = useMemo(
    () => rows.some((row) => row.capabilities?.canViewIp),
    [rows]
  )

  async function load() {
    setError('')

    try {
      const { data } = await api.get('/api/bans', {
        params: {
          q: canViewAll ? query : '',
          status,
          sort: 'priority',
          limit: 50
        }
      })

      const nextRows = data.rows || []
      setRows(nextRows)
      setStats(data.stats || { total: 0, active: 0, expired: 0, revoked: 0, awaitingAppeals: 0, flagged: 0 })
      setView(data.view || 'staff')
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : nextRows[0]?.id || null))
    } catch (err) {
      setRows([])
      setStats({ total: 0, active: 0, expired: 0, revoked: 0, awaitingAppeals: 0, flagged: 0 })
      setError(err.response?.data?.error || 'Failed to load bans.')
    }
  }

  useEffect(() => {
    load()
  }, [canViewAll])

  useEffect(() => {
    if (!showManualBan || !canViewAll) return
    api.get('/api/admin/online-players')
      .then(({ data }) => setOnlinePlayers(data.players || []))
      .catch(() => setOnlinePlayers([]))
  }, [showManualBan])

  useEffect(() => {
    if (!selectedBan) return

    setReason(selectedBan.reason || '')
    setExpiresAt(selectedBan.ban_expire ? selectedBan.ban_expire.replace(' ', 'T') : '')
    setEvidence(formatEvidenceForEditor(selectedBan.evidence))
    setUnbanNote('')
    setAppealMessage('')
  }, [selectedBan?.id])

  async function saveBan() {
    if (!selectedBan) return

    try {
      await api.put(`/api/bans/${selectedBan.id}`, {
        reason,
        expires_at: expiresAt ? expiresAt.replace('T', ' ') : null,
        evidence: serializeEvidenceInput(evidence)
      })
      setMessage(`Ban #${selectedBan.id} updated.`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save ban.')
    }
  }

  async function unban() {
    if (!selectedBan) return

    try {
      await api.post(`/api/bans/${selectedBan.id}/unban`, { note: unbanNote })
      setMessage(`Ban #${selectedBan.id} revoked.`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to unban.')
    }
  }

  async function submitAppeal() {
    if (!selectedBan) return

    try {
      await api.post('/api/appeals', {
        ban_id: selectedBan.id,
        message: appealMessage
      })
      setMessage(`Appeal submitted for ban #${selectedBan.id}.`)
      setAppealMessage('')
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit appeal.')
    }
  }

  async function createManualBan() {
    try {
      await api.post('/api/bans/manual', {
        player_name: manualBan.playerName,
        reason: manualBan.reason,
        expires_at: manualBan.expiresAt ? manualBan.expiresAt.replace('T', ' ') : null,
        identifiers: manualBan.identifiersText.split('\n').map((value) => value.trim()).filter(Boolean),
        evidence: serializeEvidenceInput(manualBan.evidenceText)
      })
      setManualBan({
        playerName: '',
        reason: '',
        expiresAt: '',
        identifiersText: '',
        evidenceText: ''
      })
      setShowManualBan(false)
      setMessage('Manual ban created.')
      await load()
    } catch (err) {
      setError(
        err.response?.status === 401
          ? 'Your login expired. Sign in again before creating a manual ban.'
          : (err.response?.data?.error || 'Failed to create manual ban.')
      )
    }
  }

  const showStaffMetrics = view === 'staff' || capabilities?.canManageAppeals || capabilities?.canViewAudit
  const metricCards = showStaffMetrics
    ? [
        ['Total Bans', stats.total],
        ['Active', stats.active],
        ['Needs Attention', stats.flagged],
        ['Open Appeals', stats.awaitingAppeals]
      ]
    : [
        ['Total Bans', stats.total],
        ['Active', stats.active]
      ]

  return (
    <main className="page">
      <section className="hero-panel hero-landing">
        <div className="hero-copy-block">
          <p className="eyebrow">Server Control Center</p>
          <h1>{branding.title}</h1>
          <p className="hero-copy">{branding.subtitle}</p>

          <div className="hero-cta-row">
            <Link className="btn hero-primary" to={user ? (selectedBan ? `/bans/${selectedBan.id}` : '/') : '/login'}>
              {user ? 'View Selected Ban' : 'Sign In'}
            </Link>
            <button className="ghost-button hero-secondary" onClick={load}>Refresh</button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-logo-frame">
            {branding.heroLogoUrl || branding.logoUrl ? (
              <img className="hero-logo-image" src={branding.heroLogoUrl || branding.logoUrl} alt={branding.title} />
            ) : (
              <div className="hero-logo-fallback">{String(branding.title || 'AP').slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="hero-floating-card">
            <span className="eyebrow">Live Mode</span>
            <strong>{view === 'staff' ? 'Operations ready' : view === 'self' ? 'Personal review' : 'Public register'}</strong>
          </div>
        </div>
      </section>

      <section className="metric-row metric-row-shell">
        {metricCards.map(([label, value]) => (
          <article key={label} className="metric-card">
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="panel-card">
        <div className="toolbar">
          {canViewAll ? (
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by steam name, identifier, staff, or reason"
            />
          ) : null}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
          {capabilities?.canCreateBans ? (
            <button
              className={`manual-ban-toggle ${showManualBan ? 'active' : ''}`}
              onClick={() => setShowManualBan((current) => !current)}
            >
              {showManualBan ? 'Close Manual Ban' : 'Add Manual Ban'}
            </button>
          ) : null}
          <button onClick={load} aria-label="Refresh ban list">Refresh</button>
        </div>

        {message ? <div className="notice success" role="status" aria-live="polite">{message}</div> : null}
        {error ? <div className="notice error" role="alert" aria-live="assertive">{error}</div> : null}

        {rows.length ? (
          <div className="table-shell">
            <table className="ban-table">
              <thead>
                <tr>
                  <th>Steam Name</th>
                  <th>Steam ID</th>
                  <th>Discord ID</th>
                  <th>Ban Reason</th>
                  <th>Issue Date</th>
                  <th>Ban Expire</th>
                  <th>Ban Giver</th>
                  {showIpColumn ? <th>IP</th> : null}
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`${selectedBan?.id === row.id ? 'selected' : ''} ${row.is_connected ? 'connected-row' : ''} ${!user ? 'row-locked' : ''}`}
                    onClick={() => user && setSelectedId(row.id)}
                  >
                    <td>
                      <div className="cell-stack">
                        <strong>{row.steam_name}</strong>
                        <span>#{row.id}</span>
                        {row.last_connection_attempt_at ? <span>Blocked reconnect: {formatDate(row.last_connection_attempt_at)}</span> : null}
                      </div>
                    </td>
                    <td>{row.steam_id || '-'}</td>
                    <td>{row.discord_id || '-'}</td>
                    <td>{row.reason}</td>
                    <td>{formatDate(row.ban_issue_date)}</td>
                    <td>{formatDate(row.ban_expire)}</td>
                    <td>{row.ban_giver}</td>
                    {showIpColumn ? <td>{row.capabilities?.canViewIp ? (row.ip || '-') : 'Hidden'}</td> : null}
                    <td>
                      <span className={`status-pill ${row.status}`}>
                        {statusLabel(row.status)}
                        {row.is_connected ? ' | Connected' : ''}
                      </span>
                    </td>
                    <td>
                      <div className="action-cluster">
                        {user ? <Link className="ghost-button" to={`/bans/${row.id}`}>Open</Link> : null}
                        {row.capabilities?.canEdit ? <button className="ghost-button" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id) }}>Edit</button> : null}
                        {row.capabilities?.canUnban ? <button className="ghost-button" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id) }}>Unban</button> : null}
                        {row.capabilities?.canAppeal ? <button className="ghost-button" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id) }}>Appeal</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" role="status">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.4 }}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="9" y1="9" x2="15" y2="15" />
              <line x1="15" y1="9" x2="9" y2="15" />
            </svg>
            <span>No bans matched this view.</span>
            <span style={{ fontSize: '0.78rem', opacity: 0.6 }}>Try adjusting the status filter or search query.</span>
          </div>
        )}
      </section>

      {capabilities?.canCreateBans && showManualBan ? (
        <section className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Enforcement</p>
              <h2>Manual ban entry</h2>
            </div>
            <button className="ghost-button" onClick={() => setShowManualBan(false)}>Hide Form</button>
          </div>
          <div className="manual-ban-shell">
            <div className="manual-ban-intro">
              <span className="eyebrow">Quick Intake</span>
              <p>Create a ban from the panel when you already have the identifiers and do not need the in-game flow.</p>
            </div>
            <div className="form-grid">
              {onlinePlayers.length > 0 ? (
                <label className="full-width">
                  Pick online player
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const player = onlinePlayers.find((p) => String(p.src) === event.target.value)
                      if (player) {
                        setManualBan((current) => ({
                          ...current,
                          playerName: player.name,
                          identifiersText: player.identifiers.join('\n')
                        }))
                      }
                    }}
                  >
                    <option value="">-- Select online player --</option>
                    {onlinePlayers.map((player) => (
                      <option key={player.src} value={String(player.src)}>
                        {player.name} (ID {player.src})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Steam name
                <input value={manualBan.playerName} onChange={(event) => setManualBan((current) => ({ ...current, playerName: event.target.value }))} />
              </label>
              <label>
                Reason
                <input value={manualBan.reason} onChange={(event) => setManualBan((current) => ({ ...current, reason: event.target.value }))} />
              </label>
              <label>
                Expires at (UTC)
                <input type="datetime-local" value={manualBan.expiresAt} onChange={(event) => setManualBan((current) => ({ ...current, expiresAt: event.target.value }))} />
              </label>
              <label className="full-width">
                Identifiers
                <textarea rows={5} value={manualBan.identifiersText} onChange={(event) => setManualBan((current) => ({ ...current, identifiersText: event.target.value }))} placeholder={'discord:123456789\nsteam:1100001...\nlicense:abcdef'} />
              </label>
              <label className="full-width">
                Evidence / notes
                <textarea rows={5} value={manualBan.evidenceText} onChange={(event) => setManualBan((current) => ({ ...current, evidenceText: event.target.value }))} placeholder="Optional note, clip link, or plain text evidence." />
              </label>
            </div>
          </div>
          <button onClick={createManualBan}>Create Manual Ban</button>
        </section>
      ) : null}

      {selectedBan && user ? (
        <section className="layout-grid">
          <article className="panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Selected Ban</p>
                <h2>{selectedBan.steam_name}</h2>
              </div>
              <span className={`status-pill ${selectedBan.status}`}>{statusLabel(selectedBan.status)}</span>
            </div>

            <div className="details-grid">
              <div>
                <span className="field-label">Steam ID</span>
                <strong>{selectedBan.steam_id || '-'}</strong>
              </div>
              <div>
                <span className="field-label">Discord ID</span>
                <strong>{selectedBan.discord_id || '-'}</strong>
              </div>
              {selectedBan.ip ? (
                <div>
                  <span className="field-label">IP Address</span>
                  <strong className="monospace" style={{fontSize:'0.85rem'}}>{selectedBan.ip}</strong>
                </div>
              ) : null}
              {selectedBan.hwid_token ? (
                <div className="full-width">
                  <span className="field-label">Hardware ID</span>
                  <strong className="monospace" style={{fontSize:'0.75rem',wordBreak:'break-all'}}>{selectedBan.hwid_token}</strong>
                </div>
              ) : null}
              <div>
                <span className="field-label">Appeals</span>
                <strong>{selectedBan.appeal_count || 0}</strong>
              </div>
              <div>
                <span className="field-label">Connection State</span>
                <strong>{selectedBan.is_connected ? 'Connected now' : selectedBan.connection_state || 'Offline'}</strong>
              </div>
            </div>

            <div className="details-grid">
              <div>
                <span className="field-label">Connected At</span>
                <strong>{selectedBan.connected_at ? formatDate(selectedBan.connected_at) : '-'}</strong>
              </div>
              <div>
                <span className="field-label">Last Seen</span>
                <strong>{selectedBan.last_seen_at ? formatDate(selectedBan.last_seen_at) : '-'}</strong>
              </div>
              <div>
                <span className="field-label">Last Blocked Attempt</span>
                <strong>{selectedBan.last_connection_attempt_at ? formatDate(selectedBan.last_connection_attempt_at) : '-'}</strong>
              </div>
              <div>
                <span className="field-label">Latest Appeal</span>
                <strong>{selectedBan.latest_appeal_status || 'none'}</strong>
              </div>
            </div>

            <div className="identifier-list">
              {selectedBan.identifiers?.map((identifier) => {
                const prefix = String(identifier).split(':')[0]
                const chipMap = { discord: 'chip-discord', steam: 'chip-steam', license: 'chip-license', license2: 'chip-license', ip: 'chip-ip', hwid: 'chip-hwid', fivem: 'chip-fivem', xbl: 'chip-xbl' }
                return <span key={identifier} className={`identifier-chip ${chipMap[prefix] || ''}`}>{identifier}</span>
              })}
            </div>
          </article>

          <article className="panel-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Actions</p>
                <h2>Ban management</h2>
              </div>
            </div>

            {selectedBan.capabilities?.canEdit ? (
              <div className="editor-stack">
                <label>
                  Reason
                  <input value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                <label>
                  Expires At (UTC)
                  <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
                </label>
                <label>
                  Evidence / notes
                  <textarea rows={8} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Optional note or JSON details." />
                </label>
                <button onClick={saveBan}>Save Ban</button>
              </div>
            ) : null}

            {selectedBan.capabilities?.canUnban ? (
              <div className="editor-stack bordered-top">
                <label>
                  Unban note
                  <input value={unbanNote} onChange={(event) => setUnbanNote(event.target.value)} placeholder="Reason for revoking this ban" />
                </label>
                <button className="danger-button" onClick={unban}>Unban Player</button>
              </div>
            ) : null}

            {selectedBan.capabilities?.canAppeal ? (
              <div className="editor-stack bordered-top">
                <label>
                  Appeal message
                  <textarea rows={6} value={appealMessage} onChange={(event) => setAppealMessage(event.target.value)} placeholder="Explain why this ban should be reviewed." />
                </label>
                <button onClick={submitAppeal}>Submit Appeal</button>
              </div>
            ) : null}
          </article>
        </section>
      ) : null}
    </main>
  )
}
