import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

function formatDate(value) {
  if (!value) return '-'
  return new Date(String(value).replace(' ', 'T') + 'Z').toLocaleString()
}

export default function Audit() {
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')

  async function load() {
    const { data } = await api.get('/api/audit', {
      params: { q }
    })
    setRows(data.rows || [])
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <main className="page">
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Oversight</p>
          <h1>Audit Log</h1>
          <p className="hero-copy">Track panel activity, investigate changes, and search action history from one place.</p>
        </div>
        <div className="page-hero-stat">
          <span className="eyebrow">Loaded</span>
          <strong>{rows.length}</strong>
          <p>Recent log rows in the current view.</p>
        </div>
      </section>

      <section className="panel-card">
        <div className="toolbar">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, actor, target, or identifier" />
          <button onClick={load}>Search Logs</button>
        </div>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Actor</th>
                <th>Identifier</th>
                <th>Action</th>
                <th>Target</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.actor_name}</td>
                  <td>{row.actor_identifier}</td>
                  <td><span className="identifier-chip">{row.action}</span></td>
                  <td>{row.target || '-'}</td>
                  <td>{formatDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
