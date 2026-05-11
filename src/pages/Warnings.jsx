import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

function formatDate(v) {
  if (!v) return '-'
  const s = String(v).replace(' ', 'T')
  const hasTimezone = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)
  const d = new Date(hasTimezone ? s : s + 'Z')
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

export default function Warnings() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')

  async function load(pageNum) {
    const p = pageNum ?? page
    setError('')
    try {
      const { data } = await api.get('/api/warnings', { params: { q, page: p, limit: 50 } })
      setRows(data.rows || [])
      setTotal(data.total || 0)
    } catch {
      setError('Failed to load warnings.')
    }
  }

  async function deleteWarning(id) {
    if (!window.confirm(`Delete warning #${id}? This cannot be undone.`)) return
    try {
      await api.delete(`/api/warnings/${id}`)
      setRows((prev) => prev.filter((row) => row.id !== id))
      setTotal((prev) => Math.max(0, prev - 1))
    } catch {
      setError('Failed to delete warning.')
    }
  }

  useEffect(() => { load(1) }, [])

  function handleSearch() {
    setPage(1)
    load(1)
  }

  function changePage(next) {
    setPage(next)
    load(next)
  }

  return (
    <main className="page">
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Moderation</p>
          <h1>Warnings</h1>
          <p className="hero-copy">
            View, search, and manage player warnings. After{' '}
            <strong>5 warnings</strong> a player is automatically permanently banned.
          </p>
        </div>
        <div className="page-hero-stat">
          <span className="eyebrow">Total</span>
          <strong>{total}</strong>
          <p>Warnings in database</p>
        </div>
      </section>

      <section className="panel-card">
        <div className="toolbar">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search player, identifier, message, or staff..."
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>Search</button>
        </div>

        {error && <p style={{ color: 'var(--danger)', margin: '0.5rem 0' }}>{error}</p>}

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Identifier</th>
                <th>Warning</th>
                <th>Issued By</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td><strong>{row.target_name}</strong></td>
                  <td><span className="identifier-chip">{row.target_identifier}</span></td>
                  <td>{row.message}</td>
                  <td>{row.warned_by_name}</td>
                  <td>{formatDate(row.created_at)}</td>
                  <td>
                    <button
                      onClick={() => deleteWarning(row.id)}
                      style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', opacity: 0.5, padding: '2rem' }}>
                    No warnings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="toolbar" style={{ marginTop: '0.75rem' }}>
          <button disabled={page <= 1} onClick={() => changePage(page - 1)}>← Prev</button>
          <span>Page {page}</span>
          <button disabled={rows.length < 50} onClick={() => changePage(page + 1)}>Next →</button>
        </div>
      </section>
    </main>
  )
}
