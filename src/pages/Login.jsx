import React from 'react'
import { usePanel } from '../context/PanelContext'

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3050'

export default function Login() {
  const { branding } = usePanel()

  return (
    <main className="center">
      <section className="card login login-shell">
        <div className="login-copy">
          <p className="eyebrow">Secure Access</p>
          <h1>{branding.title}</h1>
          <p className="hero-copy">{branding.subtitle}</p>
          <p className="login-support">
            Sign in to open staff tools, review appeals, manage bans, and access the permissions desk tied to your Discord or Steam identity.
          </p>
          <div className="login-feature-list">
            <span className="login-feature">Role-based access</span>
            <span className="login-feature">Discord role sync</span>
            <span className="login-feature">Shared live server data</span>
          </div>
        </div>

        <div className="login-actions-panel">
          <span className="eyebrow">Choose Provider</span>
          <a className="btn hero-primary login-provider" href={`${apiBase}/auth/discord`}>Continue with Discord</a>
          <a className="btn login-provider" href={`${apiBase}/auth/steam`}>Continue with Steam</a>
          <p className="tiny">Use the account that is already mapped to your panel permissions.</p>
        </div>
      </section>
    </main>
  )
}
