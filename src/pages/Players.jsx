import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { PermissionsPanel } from './Permissions'

const DURATION_OPTIONS = [
  { label: 'Permanent', hours: 0 },
  { label: '1 hour',    hours: 1 },
  { label: '6 hours',   hours: 6 },
  { label: '12 hours',  hours: 12 },
  { label: '1 day',     hours: 24 },
  { label: '3 days',    hours: 72 },
  { label: '7 days',    hours: 168 },
  { label: '14 days',   hours: 336 },
  { label: '30 days',   hours: 720 },
]

function expiresAtFromHours(hours) {
  if (!hours) return null
  const d = new Date()
  d.setTime(d.getTime() + hours * 3600 * 1000)
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

function fmt(v) {
  if (!v) return '—'
  try { return new Date(String(v).includes('T') ? v : v + 'Z').toLocaleString() } catch { return v }
}

const TABS = [
  { id: 'overview',     label: 'Overview'     },
  { id: 'actions',      label: 'Actions'      },
  { id: 'inventory',    label: 'Inventory'    },
  { id: 'vehicles',     label: 'Vehicles'     },
  { id: 'history',      label: 'History'      },
  { id: 'screenshot',   label: 'Screenshot'   },
  { id: 'permissions',  label: 'Admin',  permsOnly: true },
]

export default function Players() {
  const { capabilities } = useAuth()

  const [players,  setPlayers]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [message,  setMessage]  = useState('')
  const [query,    setQuery]    = useState('')
  const [showOffline, setShowOffline] = useState(false)

  // selectedKey = String(src) for online players, identifier for offline
  const [selectedKey, setSelectedKey] = useState(null)
  const [activeTab,   setActiveTab]   = useState('overview')

  const [inventory,   setInventory]   = useState(null)
  const [invLoading,  setInvLoading]  = useState(false)
  const [vehicles,    setVehicles]    = useState(null)
  const [vehLoading,  setVehLoading]  = useState(false)
  const [history,     setHistory]     = useState(null)
  const [histLoading, setHistLoading] = useState(false)
  const [screenshot,  setScreenshot]  = useState(null)
  const [ssLoading,   setSsLoading]   = useState(false)
  const ssPolling = useRef(null)

  const [kickReason, setKickReason] = useState('')
  const [kicking,    setKicking]    = useState(false)
  const [jobForm,    setJobForm]    = useState({ job: '', grade: 0, isGang: false })
  const [settingJob, setSettingJob] = useState(false)
  const [banForm,    setBanForm]    = useState({ reason: '', durationHours: 24 })
  const [banning,    setBanning]    = useState(false)

  const selectedPlayer = players.find((p) =>
    (p.src != null && String(p.src) === selectedKey) ||
    p.identifier === selectedKey
  ) || null

  // helper used throughout
  function playerKey(p) { return p.src != null ? String(p.src) : p.identifier }

  // ── Load players ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (showOffline) {
        const searchParam = query ? `?search=${encodeURIComponent(query)}&limit=150` : '?limit=150'
        const { data } = await api.get(`/api/admin/all-players${searchParam}`)
        setPlayers(data.players || [])
      } else {
        const { data } = await api.get('/api/admin/online-players')
        setPlayers(data.players || [])
      }
      setError('')
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to load players.')
    } finally {
      setLoading(false)
    }
  }, [showOffline, query])

  useEffect(() => {
    load()
    if (showOffline) return  // no polling for offline/all view
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load, showOffline])

  // ── Select / deselect player ──────────────────────────────────────────────
  function selectPlayer(key) {
    setSelectedKey(key === selectedKey ? null : key)
    setActiveTab('overview')
    setInventory(null)
    setVehicles(null)
    setHistory(null)
    setScreenshot(null)
    setKickReason('')
    setJobForm({ job: '', grade: 0, isGang: false })
    setBanForm({ reason: '', durationHours: 24 })
    if (ssPolling.current) { clearInterval(ssPolling.current); ssPolling.current = null }
  }

  // ── Tab data loaders ──────────────────────────────────────────────────────
  async function loadInventory(player) {
    setInvLoading(true)
    try {
      const { data } = await api.get(`/api/admin/player/${player.src}/inventory`)
      setInventory(data)
    } catch (e) {
      setInventory({ error: e.response?.data?.error || 'Failed to load inventory.' })
    } finally {
      setInvLoading(false)
    }
  }

  async function loadVehicles(player) {
    setVehLoading(true)
    try {
      const { data } = await api.get(`/api/admin/player/${encodeURIComponent(player.identifier)}/vehicles`)
      setVehicles(data)
    } catch (e) {
      setVehicles({ error: e.response?.data?.error || 'Failed to load vehicles.' })
    } finally {
      setVehLoading(false)
    }
  }

  async function loadHistory(player) {
    setHistLoading(true)
    try {
      const [warnsRes, reportsRes] = await Promise.allSettled([
        api.get(`/api/admin/player/${encodeURIComponent(player.identifier)}/warns`),
        api.get(`/api/admin/player/${encodeURIComponent(player.identifier)}/reports`),
      ])
      setHistory({
        warns:   warnsRes.status   === 'fulfilled' ? (warnsRes.value.data.rows   || []) : [],
        reports: reportsRes.status === 'fulfilled' ? (reportsRes.value.data.rows || []) : [],
      })
    } catch {
      setHistory({ warns: [], reports: [] })
    } finally {
      setHistLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedPlayer) return
    if (activeTab === 'inventory' && !inventory) loadInventory(selectedPlayer)
    if (activeTab === 'vehicles'  && !vehicles)  loadVehicles(selectedPlayer)
    if (activeTab === 'history'   && !history)   loadHistory(selectedPlayer)
  }, [activeTab, selectedKey])  // eslint-disable-line

  // ── Screenshot ────────────────────────────────────────────────────────────
  async function requestScreenshot() {
    if (!selectedPlayer) return
    setSsLoading(true)
    setScreenshot(null)
    if (ssPolling.current) { clearInterval(ssPolling.current); ssPolling.current = null }
    try {
      const { data } = await api.post('/api/admin/player/screenshot', {
        src: selectedPlayer.src, context: 'web_panel'
      })
      if (data.imageUrl) {
        setScreenshot({ imageUrl: data.imageUrl })
        setSsLoading(false)
      } else if (data.pending && data.token) {
        setScreenshot({ pending: true })
        const token = data.token
        ssPolling.current = setInterval(async () => {
          try {
            const { data: poll } = await api.post('/api/admin/player/screenshot-poll', { token })
            if (poll.ready) {
              clearInterval(ssPolling.current); ssPolling.current = null
              setScreenshot({ imageUrl: poll.imageUrl })
              setSsLoading(false)
            }
          } catch { /* keep polling */ }
        }, 1500)
      }
    } catch (e) {
      setScreenshot({ error: e.response?.data?.error || 'Screenshot request failed.' })
      setSsLoading(false)
    }
  }

  useEffect(() => () => { if (ssPolling.current) clearInterval(ssPolling.current) }, [])

  // ── Action handlers ───────────────────────────────────────────────────────
  async function kickPlayer() {
    if (!selectedPlayer || !kickReason.trim()) return
    setKicking(true); setError('')
    try {
      await api.post('/api/admin/player/kick', { src: selectedPlayer.src, reason: kickReason.trim() })
      setMessage(`${selectedPlayer.name} has been kicked.`)
      selectPlayer(selectedKey)
      load()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to kick player.')
    } finally {
      setKicking(false)
    }
  }

  async function setJob() {
    if (!selectedPlayer || !jobForm.job.trim()) return
    setSettingJob(true); setError('')
    try {
      await api.post('/api/admin/player/set-job', {
        src: selectedPlayer.src, job: jobForm.job.trim(),
        grade: jobForm.grade, isGang: jobForm.isGang
      })
      setMessage(`Set ${selectedPlayer.name}'s ${jobForm.isGang ? 'gang' : 'job'} to ${jobForm.job} (grade ${jobForm.grade}).`)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to set job.')
    } finally {
      setSettingJob(false)
    }
  }

  async function submitBan() {
    if (!selectedPlayer || !banForm.reason.trim()) return
    setBanning(true); setError('')
    try {
      await api.post('/api/bans/manual', {
        player_name: selectedPlayer.name,
        reason:      banForm.reason.trim(),
        expires_at:  expiresAtFromHours(banForm.durationHours),
        identifiers: selectedPlayer.identifiers,
      })
      const label = DURATION_OPTIONS.find((o) => o.hours === banForm.durationHours)?.label || 'timed'
      setMessage(`${selectedPlayer.name} has been banned (${label}).`)
      selectPlayer(selectedKey)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || e.response?.data?.error || 'Failed to ban player.')
    } finally {
      setBanning(false)
    }
  }

  // For offline mode the search param is sent server-side, but also filter locally
  const filtered = query.trim()
    ? players.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.identifier || '').toLowerCase().includes(query.toLowerCase())
      )
    : players

  // Tabs available depend on whether player is online
  const visibleTabs = selectedPlayer?.is_online === false
    ? TABS.filter((t) => t.id !== 'inventory' && t.id !== 'screenshot')
    : TABS

  // ── Tab content ───────────────────────────────────────────────────────────
  function renderTabContent() {
    if (!selectedPlayer) return null
    switch (activeTab) {
      case 'overview':
        return (
          <div className="player-drawer-body">
            <div className="details-grid">
              {selectedPlayer.src != null && <div><span className="field-label">Server ID</span><strong>#{selectedPlayer.src}</strong></div>}
              <div><span className="field-label">Status</span><span className={`status-pill ${selectedPlayer.is_online === false ? 'expired' : 'active'}`}>{selectedPlayer.is_online === false ? 'Offline' : 'Online'}</span></div>
              <div><span className="field-label">Name</span><strong>{selectedPlayer.name}</strong></div>
              {selectedPlayer.coords && <>
                <div><span className="field-label">X</span><strong>{selectedPlayer.coords.x?.toFixed(1)}</strong></div>
                <div><span className="field-label">Y</span><strong>{selectedPlayer.coords.y?.toFixed(1)}</strong></div>
                <div><span className="field-label">Z</span><strong>{selectedPlayer.coords.z?.toFixed(1)}</strong></div>
              </>}
            </div>
            <div style={{ marginTop: '1rem' }}>
              <span className="field-label">Identifiers</span>
              {capabilities?.canViewIdentifiers ? (
                <div className="identifier-list" style={{ marginTop: '0.4rem' }}>
                  {selectedPlayer.identifiers.map((id) => (
                    <span key={id} className="identifier-chip">{id}</span>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: '0.4rem', fontSize: '.8rem', color: 'var(--color-muted, #9db0be)' }}>
                  Identifier details are restricted to authorized staff only.
                </p>
              )}
            </div>
            {selectedPlayer.coords && (
              <div style={{ marginTop: '1.25rem' }}>
                <Link className="ghost-button" to="/map" title="View on live map">📍 View on Map</Link>
              </div>
            )}
          </div>
        )

      case 'actions':
        return (
          <div className="player-drawer-body">
            {capabilities?.canCreateBans && selectedPlayer.is_online !== false && (
              <div className="action-group">
                <p className="eyebrow">Kick Player</p>
                <div className="editor-stack">
                  <label>
                    Reason
                    <input value={kickReason} onChange={(e) => setKickReason(e.target.value)}
                      placeholder="State the reason…" />
                  </label>
                  <button className="btn-danger" onClick={kickPlayer}
                    disabled={kicking || !kickReason.trim()}>
                    {kicking ? 'Kicking…' : `Kick ${selectedPlayer.name}`}
                  </button>
                </div>
              </div>
            )}

            {capabilities?.isSuperAdmin && selectedPlayer.is_online !== false && (
              <div className="action-group" style={{ marginTop: '1.5rem' }}>
                <p className="eyebrow">Set Job / Gang</p>
                <div className="form-grid">
                  <label>
                    Job / Gang name
                    <input value={jobForm.job}
                      onChange={(e) => setJobForm((p) => ({ ...p, job: e.target.value }))}
                      placeholder="police / mechanic / ballas…" />
                  </label>
                  <label>
                    Grade
                    <input type="number" min={0} max={20} value={jobForm.grade}
                      onChange={(e) => setJobForm((p) => ({ ...p, grade: Number(e.target.value) }))} />
                  </label>
                  <label className="checkbox-row full-width">
                    <input type="checkbox" checked={jobForm.isGang}
                      onChange={(e) => setJobForm((p) => ({ ...p, isGang: e.target.checked }))} />
                    This is a gang (not a job)
                  </label>
                </div>
                <button onClick={setJob} disabled={settingJob || !jobForm.job.trim()}>
                  {settingJob ? 'Setting…' : `Set ${jobForm.isGang ? 'Gang' : 'Job'}`}
                </button>
              </div>
            )}

            {capabilities?.canCreateBans && (
              <div className="action-group" style={{ marginTop: '1.5rem' }}>
                <p className="eyebrow">Issue Ban</p>
                <div className="editor-stack">
                  <label>
                    Reason
                    <input value={banForm.reason}
                      onChange={(e) => setBanForm((p) => ({ ...p, reason: e.target.value }))}
                      placeholder="State the ban reason…" />
                  </label>
                  <label>
                    Duration
                    <select value={banForm.durationHours}
                      onChange={(e) => setBanForm((p) => ({ ...p, durationHours: Number(e.target.value) }))}>
                      {DURATION_OPTIONS.map((o) => (
                        <option key={o.hours} value={o.hours}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <button className="hero-primary" onClick={submitBan}
                    disabled={banning || !banForm.reason.trim()}>
                    {banning ? 'Banning…' : `Confirm Ban — ${DURATION_OPTIONS.find((o) => o.hours === banForm.durationHours)?.label}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )

      case 'inventory':
        return (
          <div className="player-drawer-body">
            {invLoading && <div className="skeleton" style={{ height: 120 }} />}
            {!invLoading && inventory?.error && <div className="notice error">{inventory.error}</div>}
            {!invLoading && inventory && !inventory.error && (
              inventory.rows?.length
                ? <div className="table-shell">
                    <table>
                      <thead><tr><th>Item</th><th>Count</th><th>Slot</th></tr></thead>
                      <tbody>
                        {inventory.rows.map((item, i) => (
                          <tr key={i}>
                            <td><strong>{item.name}</strong></td>
                            <td>{item.count ?? item.amount ?? '—'}</td>
                            <td>{item.slot ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                : <div className="empty-state" role="status"><span>Inventory is empty.</span></div>
            )}
            {!invLoading && !inventory && (
              <button onClick={() => loadInventory(selectedPlayer)}>Load Inventory</button>
            )}
          </div>
        )

      case 'vehicles':
        return (
          <div className="player-drawer-body">
            {vehLoading && <div className="skeleton" style={{ height: 120 }} />}
            {!vehLoading && vehicles?.error && <div className="notice error">{vehicles.error}</div>}
            {!vehLoading && vehicles && !vehicles.error && (
              vehicles.rows?.length
                ? <div className="table-shell">
                    <table>
                      <thead><tr><th>Plate</th><th>Model</th><th>State</th><th>Garage</th></tr></thead>
                      <tbody>
                        {vehicles.rows.map((v, i) => (
                          <tr key={i}>
                            <td><span className="identifier-chip">{v.plate}</span></td>
                            <td>{v.vehicle}</td>
                            <td><span className={`status-pill ${v.state === 'out' ? 'active' : 'expired'}`}>{v.state ?? '—'}</span></td>
                            <td>{v.garage ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                : <div className="empty-state" role="status"><span>No owned vehicles found.</span></div>
            )}
            {!vehLoading && !vehicles && (
              <button onClick={() => loadVehicles(selectedPlayer)}>Load Vehicles</button>
            )}
          </div>
        )

      case 'history':
        return (
          <div className="player-drawer-body">
            {histLoading && <div className="skeleton" style={{ height: 160 }} />}
            {!histLoading && history && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <p className="eyebrow" style={{ margin: 0 }}>Warnings</p>
                  <span className="player-src-badge">{history.warns?.length ?? 0}</span>
                </div>
                {history.warns?.length
                  ? <div className="table-shell" style={{ marginBottom: '1.5rem' }}>
                      <table>
                        <thead><tr><th>Message</th><th>By</th><th>Date</th></tr></thead>
                        <tbody>
                          {history.warns.map((w) => (
                            <tr key={w.id}>
                              <td>{w.message}</td>
                              <td>{w.warned_by_name}</td>
                              <td>{fmt(w.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  : <p style={{ opacity: 0.6, marginBottom: '1.5rem' }}>No warnings on record.</p>
                }

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <p className="eyebrow" style={{ margin: 0 }}>Reports</p>
                  <span className="player-src-badge">{history.reports?.length ?? 0}</span>
                </div>
                {history.reports?.length
                  ? <div className="table-shell">
                      <table>
                        <thead><tr><th>Type</th><th>Message</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>
                          {history.reports.map((r) => (
                            <tr key={r.id}>
                              <td><span className="identifier-chip">{r.report_type}</span></td>
                              <td style={{ maxWidth: 200 }}>{r.message?.slice(0, 80)}</td>
                              <td><span className={`status-pill ${r.status === 'closed' ? 'revoked' : 'active'}`}>{r.status}</span></td>
                              <td>{fmt(r.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  : <p style={{ opacity: 0.6 }}>No reports on record.</p>
                }
              </>
            )}
            {!histLoading && !history && (
              <button onClick={() => loadHistory(selectedPlayer)}>Load History</button>
            )}
          </div>
        )

      case 'permissions':
        return (
          <div className="player-drawer-body">
            <PermissionsPanel hideHero />
          </div>
        )

      case 'screenshot':
        return (
          <div className="player-drawer-body">
            <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.85rem' }}>
              Captures the player's screen via the ti_admin resource.
              Requires <code>Screenshots.Enabled = true</code> in config and a valid upload endpoint.
            </p>
            {capabilities?.canCreateBans && (
              <button onClick={requestScreenshot} disabled={ssLoading}>
                {ssLoading ? 'Requesting…' : '📷 Capture Screenshot'}
              </button>
            )}
            {screenshot?.pending && (
              <div className="notice" style={{ marginTop: '1rem' }}>
                Waiting for the player's screen to upload…
              </div>
            )}
            {screenshot?.error && (
              <div className="notice error" style={{ marginTop: '1rem' }}>{screenshot.error}</div>
            )}
            {screenshot?.imageUrl && (
              <div style={{ marginTop: '1rem' }}>
                <img src={screenshot.imageUrl} alt="Player screenshot"
                  style={{ width: '100%', borderRadius: 8, border: '1px solid var(--glass-border)' }} />
                <a href={screenshot.imageUrl} target="_blank" rel="noreferrer"
                  className="ghost-button" style={{ marginTop: '0.75rem', display: 'inline-flex' }}>
                  Open Full Size ↗
                </a>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <main className="page">
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Live Server</p>
          <h1>Online Players</h1>
          <p className="hero-copy">Select a player to inspect inventory, history, or take action.</p>
        </div>
        <div className="hero-stat-row">
          <article className="mini-stat-card"><span>Online</span><strong>{players.length}</strong></article>
          <article className="mini-stat-card"><span>Shown</span><strong>{filtered.length}</strong></article>
        </div>
      </section>

      {message && <div className="notice success" role="status" aria-live="polite" style={{ marginBottom: '1rem' }}>{message}</div>}
      {error   && <div className="notice error"   role="alert"  aria-live="assertive" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div className="players-shell">
        {/* ── Player list ────────────────────────────────────────── */}
        <section className="panel-card players-list-card">
          <div className="toolbar">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or identifier…" aria-label="Search players" />
            <button
              className={showOffline ? '' : 'ghost-button'}
              onClick={() => { setShowOffline((v) => !v); setSelectedKey(null) }}
              title={showOffline ? 'Showing all players — click to show online only' : 'Showing online only — click to include offline'}
              aria-pressed={showOffline}>
              {showOffline ? '👥 All Players' : '🟢 Online'}
            </button>
            <button onClick={load} aria-label="Refresh player list">
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {filtered.length > 0 ? (
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((player) => {
                    const pKey = playerKey(player)
                    return (
                    <tr key={pKey}
                      className={selectedKey === pKey ? 'selected' : ''}
                      onClick={() => selectPlayer(pKey)}
                      style={{ cursor: 'pointer' }}>
                      <td>
                        {player.src != null
                          ? <span className="player-src-badge">#{player.src}</span>
                          : <span className="status-pill expired" style={{ fontSize: '0.72rem' }}>offline</span>}
                      </td>
                      <td>
                        <strong>{player.name}</strong>
                        <div className="identifier-list" style={{ marginTop: 4 }}>
                          {player.identifiers.slice(0, 2).map((id) => (
                            <span key={id} className="identifier-chip">{id}</span>
                          ))}
                          {player.identifiers.length > 2 && (
                            <span className="identifier-chip">+{player.identifiers.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {player.coords
                          ? <span className="identifier-chip" title={`X:${player.coords.x?.toFixed(0)} Y:${player.coords.y?.toFixed(0)}`}>
                              📍 {player.coords.x?.toFixed(0)}, {player.coords.y?.toFixed(0)}
                            </span>
                          : <span style={{ opacity: 0.4 }}>No coords</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="action-cluster">
                          <button className="ghost-button" onClick={() => selectPlayer(pKey)}>
                            {selectedKey === pKey ? 'Close' : 'Inspect'}
                          </button>
                          {capabilities?.canCreateBans && (
                            <button className="ghost-button btn-danger-ghost"
                              onClick={() => { selectPlayer(pKey); setTimeout(() => setActiveTab('actions'), 30) }}>
                              Actions
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}  
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" role="status">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                style={{ opacity: 0.4 }}>
                <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
              </svg>
              <span>
                {loading      ? 'Loading…'
                : query       ? 'No players match that search.'
                : showOffline ? 'No player history found.'
                : 'No players online.'}
              </span>
            </div>
          )}
        </section>

        {/* ── Player drawer ─────────────────────────────────────── */}
        {selectedPlayer && (
          <section className="panel-card player-drawer-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Selected Player</p>
                <h2>{selectedPlayer.name}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="player-src-badge player-src-badge--lg">#{selectedPlayer.src}</span>
                <button className="ghost-button" onClick={() => setSelectedKey(null)} aria-label="Close player panel">✕</button>
              </div>
            </div>

            <div className="tab-nav" role="tablist">
              {TABS
                .filter((tab) => {
                  if (tab.permsOnly && !capabilities?.canManagePermissions) return false
                  if (selectedPlayer?.is_online === false && (tab.id === 'inventory' || tab.id === 'screenshot')) return false
                  return true
                })
                .map((tab) => (
                <button key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>

            {renderTabContent()}
          </section>
        )}
      </div>
    </main>
  )
}
