import React, { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePanel } from '../context/PanelContext'

/* ── Inline SVG icons (Lucide-style, 16×16 stroke) ── */
function IconShieldX() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconClipboard() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  )
}
function IconAlertTriangle() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconList() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function IconBarChart() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
function IconSettings() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
function IconTag() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}
function IconTerminal() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}
function IconMap() {
  return (
    <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  )
}
function IconLogOut() {
  return (
    <svg style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.7 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function BrandLogo({ branding }) {
  if (branding.logoUrl) {
    return <img className="sidebar-logo-image" src={branding.logoUrl} alt={branding.title} />
  }

  const initials = String(branding.title || 'AP')
    .split(' ')
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return <span className="brand-mark sidebar-mark">{initials}</span>
}

const NAV_ICON = {
  '/':            <IconShieldX />,
  '/players':     <IconUsers />,
  '/appeals':     <IconClipboard />,
  '/warnings':    <IconAlertTriangle />,
  '/audit':       <IconList />,
  '/staff-stats': <IconBarChart />,
  '/permissions': <IconSettings />,
  '/tags':        <IconTag />,
  '/server':      <IconTerminal />,
  '/map':         <IconMap />,
}

export default function Sidebar() {
  const { user, capabilities, logout } = useAuth()
  const { branding } = usePanel()

  // ── Drag-to-reorder state ──────────────────────────────────────────────
  const [tabOrder, setTabOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('ti-sidebar-order')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const dragIndexRef = useRef(null)

  if (!user) return null

  const rawItems = [
    { to: '/',            label: 'Bans',        visible: true },
    { to: '/players',     label: 'Players',     visible: capabilities?.canCreateBans || capabilities?.canViewBans },
    { to: '/appeals',     label: 'Appeals',     visible: capabilities?.canViewAppeals || capabilities?.canManageAppeals },
    { to: '/warnings',    label: 'Warnings',    visible: capabilities?.canViewWarnings },
    { to: '/audit',       label: 'Audit Log',   visible: capabilities?.canViewAudit },
    { to: '/staff-stats', label: 'Staff Stats', visible: capabilities?.canViewAudit },
    { to: '/tags',        label: 'Admin Tags',  visible: capabilities?.canManageTags || capabilities?.canManagePermissions },
    { to: '/admin',       label: 'Admin Settings', visible: capabilities?.canManagePermissions },
    { to: '/server',      label: 'Server',      visible: capabilities?.canUseWebConsole || capabilities?.canViewResources || capabilities?.canBroadcast || capabilities?.isSuperAdmin },
    { to: '/map',         label: 'Live Map',    visible: capabilities?.canViewMap || capabilities?.canCreateBans || capabilities?.canViewBans },
  ].filter((item) => item.visible)

  // Apply saved order (only for routes that are still visible)
  const items = tabOrder
    ? [...rawItems].sort((a, b) => {
        const ai = tabOrder.indexOf(a.to)
        const bi = tabOrder.indexOf(b.to)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    : rawItems

  function handleDragStart(e, index) {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('dragging')
  }

  function handleDragEnd(e) {
    dragIndexRef.current = null
    e.currentTarget.classList.remove('dragging')
  }

  function handleDragOver(e, index) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const from = dragIndexRef.current
    if (from === null || from === index) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(index, 0, moved)
    dragIndexRef.current = index
    const routes = next.map((i) => i.to)
    setTabOrder(routes)
    try { localStorage.setItem('ti-sidebar-order', JSON.stringify(routes)) } catch { /* quota */ }
  }

  function handleDrop(e) {
    e.preventDefault()
    dragIndexRef.current = null
  }

  const quickFacts = [
    capabilities?.canCreateBans      ? 'Create bans'      : null,
    capabilities?.canManageAppeals   ? 'Appeal triage'    : null,
    capabilities?.canViewAudit       ? 'Audit access'     : null,
    capabilities?.isSuperAdmin       ? 'Superadmin'       : null,
  ].filter(Boolean)

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand" aria-hidden="true">
        <BrandLogo branding={branding} />
        <div>
          <strong>{branding.title}</strong>
          <p>{branding.subtitle}</p>
        </div>
      </div>

      <div className="sidebar-user" aria-label={`Signed in as ${user.name}, role: ${user.role?.label || user.role?.name || 'user'}`}>
        <span className="eyebrow" style={{ marginBottom: 0 }} aria-hidden="true">Signed in</span>
        <strong>{user.name}</strong>
        <p>{user.role?.label || user.role?.name || 'user'}</p>
      </div>

      <div className="sidebar-summary" aria-label="Session summary">
        <span className="eyebrow">Session</span>
        <div className="sidebar-summary-grid" aria-hidden="true">
          <div className="sidebar-summary-card">
            <strong>{items.length}</strong>
            <span>Visible tabs</span>
          </div>
          <div className="sidebar-summary-card">
            <strong>{quickFacts.length || 1}</strong>
            <span>Access grants</span>
          </div>
        </div>
        <div className="sidebar-tags" aria-label="Permissions">
          {(quickFacts.length ? quickFacts : ['Basic access']).map((fact) => (
            <span key={fact} className="sidebar-tag">{fact}</span>
          ))}
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Panel pages">
        {items.map((item, index) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            aria-current={undefined}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
          >
            {NAV_ICON[item.to]}
            <span className="sidebar-link-label">{item.label}</span>
            <span className="sidebar-drag-handle" aria-hidden="true" title="Drag to reorder">&#8942;</span>
          </NavLink>
        ))}
      </nav>

      <button className="sidebar-logout" onClick={logout} aria-label="Sign out of admin panel">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
          <IconLogOut />
          Sign out
        </span>
      </button>
    </aside>
  )
}
