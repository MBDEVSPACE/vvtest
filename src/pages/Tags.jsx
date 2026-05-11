import React, { useEffect, useState } from 'react'
import { api } from '../api/client'

const ROLES = ['user', 'helper', 'moderator', 'admin', 'superadmin']
const DEFAULT_FORM = { label: '', color: '#41c995', icon: 'fa-solid fa-shield', min_role: 'helper', sort_order: 0 }

export default function Tags() {
  const [tags, setTags]       = useState([])
  const [editId, setEditId]   = useState(null)   // null = no edit open, 0 = new
  const [form, setForm]       = useState(DEFAULT_FORM)
  const [error, setError]     = useState('')
  const [message, setMessage] = useState('')

  async function load() {
    try {
      setError('')
      const { data } = await api.get('/api/admin/tags')
      setTags(data.tags || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tags.')
    }
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm(DEFAULT_FORM)
    setEditId(0)
    setError('')
    setMessage('')
  }

  function openEdit(tag) {
    setForm({
      label:      tag.label,
      color:      tag.color,
      icon:       tag.icon || '',
      min_role:   tag.min_role,
      sort_order: Number(tag.sort_order ?? 0)
    })
    setEditId(tag.id)
    setError('')
    setMessage('')
  }

  function cancelEdit() {
    setEditId(null)
    setError('')
  }

  async function save() {
    try {
      setError('')
      if (editId === 0) {
        await api.post('/api/admin/tags', form)
        setMessage('Tag created.')
      } else {
        await api.put(`/api/admin/tags/${editId}`, form)
        setMessage('Tag updated.')
      }
      setEditId(null)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.')
    }
  }

  async function deleteTag(id) {
    if (!window.confirm('Delete this tag? Any admin currently wearing it will be cleared on their next tag pick.')) return
    try {
      setError('')
      await api.delete(`/api/admin/tags/${id}`)
      setMessage('Tag deleted.')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed.')
    }
  }

  return (
    <div className="page-content">
      <div className="section-heading">
        <span>Admin Tags</span>
        <button className="btn-primary" onClick={openNew}>+ New Tag</button>
      </div>

      {error   && <div className="error-banner">{error}</div>}
      {message && <div className="success-banner">{message}</div>}

      {editId !== null && (
        <div className="panel-card" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-card-title">{editId === 0 ? 'Create Tag' : 'Edit Tag'}</div>
          <div className="form-grid">
            <label>
              Label
              <input
                value={form.label}
                maxLength={64}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. On Duty"
              />
            </label>
            <label>
              Color
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  style={{ width: 40, height: 34, padding: 2, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 6, background: 'none' }}
                />
                <input
                  value={form.color}
                  maxLength={32}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                  placeholder="#41c995"
                  style={{ flex: 1 }}
                />
              </div>
            </label>
            <label>
              Icon (Font Awesome class)
              <input
                value={form.icon}
                maxLength={64}
                onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))}
                placeholder="fa-solid fa-shield"
              />
            </label>
            <label>
              Minimum Role
              <select value={form.min_role} onChange={(e) => setForm((p) => ({ ...p, min_role: e.target.value }))}>
                {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </label>
            <label>
              Sort Order
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                style={{ width: 80 }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={save}>Save</button>
            <button className="btn-icon" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}

      {tags.length === 0 && editId === null && (
        <div className="empty-state">No tags created yet. Click &ldquo;+ New Tag&rdquo; to add one.</div>
      )}

      <div className="tags-grid">
        {tags.map((tag) => (
          <div key={tag.id} className="panel-card tag-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: tag.color,
                  background: `${tag.color}22`,
                  border: `1px solid ${tag.color}55`
                }}
              >
                {tag.icon && <i className={tag.icon} style={{ fontSize: '0.72rem' }} />}
                {tag.label}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                #{tag.id}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              <span>Min role: <strong>{tag.min_role}</strong></span>
              <span style={{ marginLeft: '1rem' }}>Order: {tag.sort_order}</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => openEdit(tag)}>Edit</button>
              <button className="btn-danger"    style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => deleteTag(tag.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
