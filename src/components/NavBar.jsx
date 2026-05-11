import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { usePanel } from '../context/PanelContext'

function BrandLogo({ branding }) {
  if (branding.logoUrl) {
    return <img className="topbar-logo-image" src={branding.logoUrl} alt={branding.title} />
  }

  const initials = String(branding.title || 'AP')
    .split(' ')
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return <span className="brand-mark">{initials}</span>
}

export default function NavBar() {
  const { user } = useAuth()
  const { branding } = usePanel()

  return (
    <header className="topbar" role="banner">
      <div className="topbar-brand-wrap">
        <Link className="brand" to="/" aria-label={`${branding.title} — home`}>
          <BrandLogo branding={branding} />
          <div className="brand-copy">
            <strong>{branding.title}</strong>
            <p>{branding.subtitle}</p>
          </div>
        </Link>
        <div className="topbar-meta" aria-hidden="true">
          <span className="topbar-live-dot" title="Panel online" aria-label="Panel online" />
          <span className="topbar-pill">Live desk</span>
          <span className="topbar-divider" />
          <span className="topbar-meta-text">{user ? 'Staff mode' : 'Public register'}</span>
        </div>
      </div>

      <div className="topbar-actions">
        {user ? (
          <>
            <div className="topbar-user" aria-label={`Signed in as ${user.name}`}>
              <span className="eyebrow" style={{ marginBottom: 0 }} aria-hidden="true">Signed in as</span>
              <strong>{user.name}</strong>
            </div>
            <span className="topbar-badge" role="status" aria-label={`Role: ${user.role?.label || user.role?.name || 'user'}`}>
              {user.role?.label || user.role?.name || 'user'}
            </span>
          </>
        ) : (
          <Link className="btn topbar-login" to="/login" aria-label="Sign in to admin panel">Login</Link>
        )}
      </div>
    </header>
  )
}
