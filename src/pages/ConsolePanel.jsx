import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

const ACTIONS = ['start', 'stop', 'restart', 'ensure']

export default function ConsolePanel() {
  // ── Console tab ──────────────────────────────────────────────────────────────
  const [cmd, setCmd]           = useState('')
  const [log, setLog]           = useState([])
  const [cmdLoading, setCmdLoading] = useState(false)
  const logEndRef = useRef(null)

  // ── Resources tab ────────────────────────────────────────────────────────────
  const [tab, setTab]             = useState('console')
  const [resources, setResources] = useState([])
  const [resFilter, setResFilter] = useState('')
  const [resLoading, setResLoading] = useState(false)
  const [resError, setResError]   = useState('')
  const [controlLoading, setControlLoading] = useState({})

  // ── Error/message ─────────────────────────────────────────────────────────────
  const [error, setError] = useState('')

  // Keep log scrolled to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  async function execCmd(e) {
    e.preventDefault()
    const trimmed = cmd.trim()
    if (!trimmed) return
    setCmdLoading(true)
    setError('')
    try {
      const { data } = await api.post('/api/admin/console/exec', { cmd: trimmed })
      setLog((prev) => [...prev, { type: 'cmd', text: `> ${trimmed}` }, { type: data.ok ? 'ok' : 'err', text: data.output || 'Executed.' }])
      setCmd('')
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to execute command.'
      setLog((prev) => [...prev, { type: 'cmd', text: `> ${trimmed}` }, { type: 'err', text: `Error: ${msg}` }])
    } finally {
      setCmdLoading(false)
    }
  }

  async function loadResources() {
    setResLoading(true)
    setResError('')
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
    setError('')
    try {
      await api.post(`/api/admin/resources/${encodeURIComponent(name)}/control`, { action })
      // Reload resource list after a short delay to let the server settle
      setTimeout(loadResources, 800)
    } catch (err) {
      setError(`${name} ${action}: ${err.response?.data?.error || err.message}`)
    } finally {
      setControlLoading((prev) => ({ ...prev, [name]: false }))
    }
  }

  const filteredResources = resources.filter((r) =>
    !resFilter || r.name.toLowerCase().includes(resFilter.toLowerCase())
  )

  return (
    <div className="page-content">
      <div className="section-heading">
        <span>Server Console &amp; Resources</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {['console', 'resources'].map((t) => (
          <button
            key={t}
            className={tab === t ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.82rem', padding: '5px 14px', textTransform: 'capitalize' }}
            onClick={() => setTab(t)}
          >
            {t === 'console' ? 'Console' : 'Resources'}
          </button>
        ))}
      </div>

      {/* ── Console tab ─────────────────────────────────────────────────────── */}
      {tab === 'console' && (
        <div className="panel-card">
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '0.82rem',
              background: 'var(--bg-deep, #0d0d0d)',
              borderRadius: 8,
              padding: '0.75rem',
              minHeight: 220,
              maxHeight: 420,
              overflowY: 'auto',
              color: 'var(--text-muted)',
              marginBottom: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {log.length === 0 && (
              <span style={{ opacity: 0.4 }}>Type a command below and press Enter…</span>
            )}
            {log.map((entry, i) => (
              <div
                key={i}
                style={{
                  color: entry.type === 'cmd' ? 'var(--accent, #41c995)' :
                         entry.type === 'err' ? '#f87171' : '#e5e5e5',
                  marginBottom: '0.15rem'
                }}
              >
                {entry.text}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>

          <form onSubmit={execCmd} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="e.g. restart ti_admin"
              disabled={cmdLoading}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
              maxLength={256}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={cmdLoading || !cmd.trim()}>
              {cmdLoading ? '…' : 'Run'}
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setLog([])}
              title="Clear log"
            >
              Clear
            </button>
          </form>
        </div>
      )}

      {/* ── Resources tab ────────────────────────────────────────────────────── */}
      {tab === 'resources' && (
        <div className="panel-card">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
            <input
              value={resFilter}
              onChange={(e) => setResFilter(e.target.value)}
              placeholder="Filter resources…"
              style={{ flex: 1, fontSize: '0.85rem' }}
            />
            <button className="btn-secondary" onClick={loadResources} disabled={resLoading} style={{ fontSize: '0.8rem', padding: '5px 12px' }}>
              {resLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {resError && <div className="error-banner">{resError}</div>}

          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Name</th>
                  <th style={{ padding: '6px 8px' }}>State</th>
                  <th style={{ padding: '6px 8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredResources.map((r) => {
                  const busy = controlLoading[r.name]
                  const started = r.state === 'started'
                  return (
                    <tr key={r.name} style={{ borderBottom: '1px solid var(--border-faint, #1e1e1e)' }}>
                      <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.name}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 8px',
                          borderRadius: 999,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: started ? '#41c99522' : '#6b728022',
                          color: started ? '#41c995' : '#9ca3af',
                          border: `1px solid ${started ? '#41c99555' : '#6b728055'}`
                        }}>
                          {r.state}
                        </span>
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {ACTIONS.map((action) => (
                            <button
                              key={action}
                              disabled={busy}
                              className={action === 'stop' ? 'btn-danger' : 'btn-secondary'}
                              style={{ fontSize: '0.72rem', padding: '2px 8px', textTransform: 'capitalize' }}
                              onClick={() => controlResource(r.name, action)}
                            >
                              {busy ? '…' : action}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!resLoading && filteredResources.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {resFilter ? 'No matching resources.' : 'No resources loaded.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
