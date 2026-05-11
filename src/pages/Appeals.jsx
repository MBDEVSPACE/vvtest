import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

export default function Appeals() {
  const [staffRows, setStaffRows] = useState([])
  const [myRows, setMyRows] = useState([])
  const [newAppeal, setNewAppeal] = useState({ ban_id: '', message: '' })

  async function load() {
    try {
      const { data } = await api.get('/api/appeals')
      setStaffRows(data.rows || [])
    } catch {
      setStaffRows([])
    }

    const mine = await api.get('/api/appeals/mine')
    setMyRows(mine.data.rows || [])
  }

  async function createAppeal() {
    await api.post('/api/appeals', {
      ban_id: Number(newAppeal.ban_id),
      message: newAppeal.message
    })
    setNewAppeal({ ban_id: '', message: '' })
    await load()
  }

  async function updateStatus(id, status) {
    await api.post(`/api/appeals/${id}/status`, {
      status,
      admin_response: `Appeal ${status} by web staff`
    })
    await load()
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <main className="page">
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Appeals Desk</p>
          <h1>Review and Respond</h1>
          <p className="hero-copy">Handle player appeals with a cleaner queue, personal history, and quick response actions.</p>
        </div>
        <div className="hero-stat-row">
          <article className="mini-stat-card">
            <span>Mine</span>
            <strong>{myRows.length}</strong>
          </article>
          <article className="mini-stat-card">
            <span>Staff Queue</span>
            <strong>{staffRows.length}</strong>
          </article>
        </div>
      </section>

      <section className="layout-grid">
        <article className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Submit</p>
              <h2>Create Appeal</h2>
            </div>
          </div>
          <div className="editor-stack">
            <label>
              Ban ID
              <input
                placeholder="Ban ID"
                value={newAppeal.ban_id}
                onChange={(e) => setNewAppeal((prev) => ({ ...prev, ban_id: e.target.value }))}
              />
            </label>
            <label>
              Appeal message
              <textarea
                rows={6}
                placeholder="Explain why this ban should be reviewed"
                value={newAppeal.message}
                onChange={(e) => setNewAppeal((prev) => ({ ...prev, message: e.target.value }))}
              />
            </label>
            <button onClick={createAppeal}>Submit Appeal</button>
          </div>
        </article>

        <article className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>My Appeals</h2>
            </div>
          </div>
          <div className="stack-list">
            {myRows.length ? myRows.map((row) => (
              <div key={row.id} className="stack-list-card">
                <strong>Appeal #{row.id}</strong>
                <span>Ban #{row.ban_id}</span>
                <span className={`status-pill ${row.status}`}>{row.status}</span>
              </div>
            )) : <div className="empty-state">No appeals yet.</div>}
          </div>
        </article>
      </section>

      <section className="panel-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Staff Queue</p>
            <h2>Appeal Review</h2>
          </div>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Ban</th>
                <th>Player</th>
                <th>Status</th>
                <th>Message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.ban_id}</td>
                  <td>{row.appellant_name}</td>
                  <td><span className={`status-pill ${row.status}`}>{row.status}</span></td>
                  <td>{row.message}</td>
                  <td>
                    <div className="action-cluster">
                      <button className="ghost-button" onClick={() => updateStatus(row.id, 'in_review')}>Review</button>
                      <button className="ghost-button" onClick={() => updateStatus(row.id, 'accepted')}>Accept</button>
                      <button className="ghost-button" onClick={() => updateStatus(row.id, 'denied')}>Deny</button>
                      <button className="ghost-button" onClick={() => updateStatus(row.id, 'closed')}>Close</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
