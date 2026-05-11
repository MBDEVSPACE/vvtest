import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

const RESOURCE_ACTIONS = ['start', 'stop', 'restart', 'ensure']

export default function ServerPanel() {
  const { capabilities } = useAuth()
  const tabs = [
    ...(capabilities?.canUseWebConsole || capabilities?.isSuperAdmin ? [{ id: 'console', label: 'Console' }] : []),
    ...(capabilities?.canViewResources || capabilities?.canControlResources || capabilities?.isSuperAdmin ? [{ id: 'resources', label: 'Resources' }] : []),
    ...(capabilities?.canBroadcast || capabilities?.isSuperAdmin ? [{ id: 'broadcast', label: 'Broadcast' }] : []),
  ]
  const [tab, setTab] = useState(tabs[0]?.id || 'console')

  useEffect(() => {
    if (tabs.length && !tabs.some((item) => item.id === tab)) {
      setTab(tabs[0].id)
    }
  }, [tabs.map((item) => item.id).join('|'), tab])

  // ── Console ──────────────────────────────────────────────────────────────
  const [cmd,        setCmd]        = useState('')
  const [log,        setLog]        = useState([])
  const [cmdLoading, setCmdLoading] = useState(false)
  const logEndRef = useRef(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  async function execCmd(e) {
    e.preventDefault()
    const trimmed = cmd.trim()
    if (!trimmed) return
    setCmdLoading(true)
    try {
      const { data } = await api.post('/api/admin/console/exec', { cmd: trimmed })
      setLog((prev) => [
        ...prev,
        { type: 'cmd', text: `> ${trimmed}` },
        { type: data.ok ? 'ok' : 'err', text: data.output || 'Executed.' },
      ])
      setCmd('')
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed.'
      setLog((prev) => [
        ...prev,
        { type: 'cmd', text: `> ${trimmed}` },
        { type: 'err', text: `Error: ${msg}` },
      ])
    } finally {
      setCmdLoading(false)
    }
  }

  // ── Resources ─────────────────────────────────────────────────────────────
  const [resources,      setResources]      = useState([])
  const [resFilter,      setResFilter]      = useState('')
  const [resLoading,     setResLoading]     = useState(false)
  const [resError,       setResError]       = useState('')
  const [controlLoading, setControlLoading] = useState({})

  async function loadResources() {
    setResLoading(true); setResError('')
    try {
      const { data } = await api.get('/api/admin/resources')
      setResources(data.resources || [])
    } catch (err) {
      setResError(err.response?.data?.error || 'Failed to load resources.')
    } finally {
      setResLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'resources') loadResources()
  }, [tab])

  async function controlResource(name, action) {
    setControlLoading((prev) => ({ ...prev, [name]: true }))
    try {
      await api.post(`/api/admin/resources/${encodeURIComponent(name)}/control`, { action })
      setTimeout(loadResources, 800)
    } catch (err) {
      setResError(`${name} ${action}: ${err.response?.data?.error || err.message}`)
    } finally {
      setControlLoading((prev) => ({ ...prev, [name]: false }))
    }
  }

  const filteredResources = resources.filter(
    (r) => !resFilter || r.name.toLowerCase().includes(resFilter.toLowerCase())
  )

  // ── Broadcast ──────────────────────────────────────────────────────────────
  const [broadcastMsg,     setBroadcastMsg]     = useState('')
  const [broadcastColor,   setBroadcastColor]   = useState('info')
  const [broadcastIcon,    setBroadcastIcon]    = useState('fa-solid fa-bullhorn')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastResult,  setBroadcastResult]  = useState(null)

  const ANNOUNCE_TEMPLATES = [
    { label: '— Custom —',                value: '' },
    { label: 'Restart in 10 min',         value: 'Server restart in 10 minutes. Please wrap up!' },
    { label: 'Restart in 5 min',          value: 'Server restart in 5 minutes. Finish up now!' },
    { label: 'Event starting soon',       value: 'A server event is starting soon! Head to the main plaza.' },
    { label: 'Rules reminder',            value: 'Please review the server rules in our Discord.' },
    { label: 'Staff monitoring',          value: 'Staff are actively monitoring. Please follow the rules.' },
    { label: 'Maintenance warning',       value: 'Server maintenance is coming up. Save your progress.' },
    { label: 'Welcome message',           value: 'Welcome to the server! Enjoy your stay and follow the rules.' },
  ]

  const ANNOUNCE_COLORS = [
    { value: 'info',    label: 'ℹ️  Info'    },
    { value: 'success', label: '✅ Success' },
    { value: 'warning', label: '⚠️  Warning' },
    { value: 'error',   label: '🚨 Alert'   },
    { value: 'neutral', label: '🔔 Neutral' },
  ]

  const ANNOUNCE_ICONS = [
    { value: 'fa-solid fa-bullhorn',           label: '📢 Bullhorn'      },
    { value: 'fa-solid fa-circle-info',        label: 'ℹ️  Info'          },
    { value: 'fa-solid fa-triangle-exclamation', label: '⚠️  Warning'   },
    { value: 'fa-solid fa-circle-xmark',       label: '❌ Alert'         },
    { value: 'fa-solid fa-circle-check',       label: '✅ Check'         },
    { value: 'fa-solid fa-server',             label: '🖥️  Server'        },
    { value: 'fa-solid fa-wrench',             label: '🔧 Maintenance'   },
    { value: 'fa-solid fa-calendar-days',      label: '📅 Event'         },
    { value: 'fa-solid fa-shield-halved',      label: '🛡️  Security'      },
    { value: 'fa-solid fa-gavel',              label: '⚖️  Rules'         },
    { value: 'fa-solid fa-star',               label: '⭐ Star'          },
    { value: 'fa-solid fa-crown',              label: '👑 Crown'         },
    { value: 'fa-solid fa-fire',               label: '🔥 Fire'          },
    { value: 'fa-solid fa-bolt',               label: '⚡ Bolt'           },
    { value: 'fa-solid fa-clock',              label: '🕐 Clock'         },
    { value: 'fa-solid fa-rocket',             label: '🚀 Rocket'        },
    { value: 'fa-solid fa-gift',               label: '🎁 Gift'          },
    { value: 'fa-solid fa-users',              label: '👥 Community'     },
    { value: 'fa-solid fa-ban',                label: '🚫 Ban'           },
    { value: 'fa-solid fa-money-bill',         label: '💵 Money'         },
  ]

  async function sendBroadcast(e) {
    e.preventDefault()
    if (!broadcastMsg.trim()) return
    setBroadcastLoading(true); setBroadcastResult(null)
    try {
      await api.post('/api/admin/broadcast', {
        message: broadcastMsg.trim(),
        color:   broadcastColor,
        icon:    broadcastIcon,
      })
      setBroadcastResult({ ok: true, text: 'Announcement sent to all online players.' })
      setBroadcastMsg('')
    } catch (err) {
      setBroadcastResult({ ok: false, text: err.response?.data?.error || 'Failed to send announcement.' })
    } finally {
      setBroadcastLoading(false)
    }
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <main className="page">
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Management</p>
          <h1>Server</h1>
          <p className="hero-copy">Execute console commands, manage resources, and broadcast messages.</p>
        </div>
      </section>

      <section className="panel-card">
        <div className="tab-nav" role="tablist">
          {tabs.map((t) => (
            <button key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Console ───────────────────────────────────────────────── */}
        {tab === 'console' && (capabilities?.canUseWebConsole || capabilities?.isSuperAdmin) && (
          <div style={{ marginTop: '1rem' }}>
            <div className="console-log" role="log" aria-label="Console output" aria-live="polite">
              {log.length === 0 && (
                <span style={{ opacity: 0.4 }}>Type a command below and press Enter…</span>
              )}
              {log.map((entry, i) => (
                <div key={i} className={`console-line console-line--${entry.type}`}>
                  {entry.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            <form onSubmit={execCmd} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                placeholder="e.g. restart ti_admin"
                disabled={cmdLoading}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                maxLength={256}
                autoFocus
                aria-label="Console command input"
              />
              <button type="submit" disabled={cmdLoading || !cmd.trim()}>
                {cmdLoading ? '…' : 'Run'}
              </button>
              <button type="button" className="ghost-button" onClick={() => setLog([])} aria-label="Clear console log">
                Clear
              </button>
            </form>
          </div>
        )}

        {/* ── Resources ─────────────────────────────────────────────── */}
        {tab === 'resources' && (capabilities?.canViewResources || capabilities?.canControlResources || capabilities?.isSuperAdmin) && (
          <div style={{ marginTop: '1rem' }}>
            <div className="toolbar">
              <input
                value={resFilter}
                onChange={(e) => setResFilter(e.target.value)}
                placeholder="Filter resources…"
                aria-label="Filter resources"
              />
              <button onClick={loadResources} disabled={resLoading} aria-label="Refresh resource list">
                {resLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {resError && <div className="notice error" role="alert">{resError}</div>}

            {filteredResources.length > 0 ? (
              <div className="table-shell" style={{ marginTop: '0.75rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>State</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResources.map((r) => {
                      const busy    = !!controlLoading[r.name]
                      const started = r.state === 'started'
                      return (
                        <tr key={r.name}>
                          <td><span style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.name}</span></td>
                          <td>
                            <span className={`status-pill ${started ? 'active' : 'expired'}`}>{r.state}</span>
                          </td>
                          <td>
                            <div className="action-cluster">
                              {(capabilities?.canControlResources || capabilities?.isSuperAdmin) && RESOURCE_ACTIONS.map((action) => (
                                <button key={action} disabled={busy}
                                  className={action === 'stop' ? 'ghost-button btn-danger-ghost' : 'ghost-button'}
                                  style={{ fontSize: '0.72rem', padding: '2px 8px', textTransform: 'capitalize' }}
                                  onClick={() => controlResource(r.name, action)}>
                                  {busy ? '…' : action}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              !resLoading && (
                <div className="empty-state" role="status">
                  <span>{resFilter ? 'No matching resources.' : 'No resources loaded.'}</span>
                </div>
              )
            )}
          </div>
        )}

        {/* ── Broadcast / Announce ──────────────────────────────── */}
        {tab === 'broadcast' && (capabilities?.canBroadcast || capabilities?.isSuperAdmin) && (
          <div style={{ marginTop: '1rem', maxWidth: 560 }}>
            {broadcastResult && (
              <div className={`notice ${broadcastResult.ok ? 'success' : 'error'}`}
                role={broadcastResult.ok ? 'status' : 'alert'} aria-live="polite"
                style={{ marginBottom: '1rem' }}>
                {broadcastResult.text}
              </div>
            )}

            <form onSubmit={sendBroadcast} className="editor-stack">
              <label>
                Quick template
                <select
                  onChange={(e) => { if (e.target.value) setBroadcastMsg(e.target.value) }}
                  defaultValue=""
                  disabled={broadcastLoading}
                  aria-label="Announcement template">
                  {ANNOUNCE_TEMPLATES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Message
                <textarea
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  placeholder="Type your announcement…"
                  rows={4}
                  maxLength={500}
                  disabled={broadcastLoading}
                  aria-label="Announcement message"
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label>
                  Type / Color
                  <select value={broadcastColor} onChange={(e) => setBroadcastColor(e.target.value)}
                    disabled={broadcastLoading} aria-label="Announcement color type">
                    {ANNOUNCE_COLORS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Icon
                  <select value={broadcastIcon} onChange={(e) => setBroadcastIcon(e.target.value)}
                    disabled={broadcastLoading} aria-label="Announcement icon">
                    {ANNOUNCE_ICONS.map((i) => (
                      <option key={i.value} value={i.value}>{i.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button type="submit" className="hero-primary"
                  disabled={broadcastLoading || !broadcastMsg.trim()}>
                  {broadcastLoading ? 'Sending…' : '📢 Send Announcement'}
                </button>
                <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>
                  {broadcastMsg.length}/500
                </span>
              </div>
            </form>
          </div>
        )}
      </section>
    </main>
  )
}
