import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { usePanel } from '../context/PanelContext'
import { useAuth } from '../context/AuthContext'

const PERM_TABS = [
  { id: 'roles',       label: 'Roles',       icon: 'fa-solid fa-shield-halved' },
  { id: 'assignments', label: 'Assignments',  icon: 'fa-solid fa-id-card'       },
  { id: 'webhooks',    label: 'Webhooks',     icon: 'fa-brands fa-discord'      },
  { id: 'settings',    label: 'Settings',     icon: 'fa-solid fa-sliders'       },
]

/** Group a flat permission list by their first segment (e.g. "ti.admin.*" → "ti.admin") */
function groupPermissions(catalog) {
  const groups = {}
  for (const perm of catalog) {
    const seg = perm.split('.').slice(0, 2).join('.')
    if (!groups[seg]) groups[seg] = []
    groups[seg].push(perm)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

const NS_LABELS = {
  '*':            { label: 'Full Access',     color: '#eef6ff' },
  'ti.dashboard': { label: 'Dashboard Page',  color: '#4eedc4' },
  'ti.analytics': { label: 'Analytics / Logs', color: '#60b4ff' },
  'ti.audit':     { label: 'Audit Log',       color: '#fbbf24' },
  'ti.map':       { label: 'Live Map',        color: '#38bdf8' },
  'ti.tags':      { label: 'Admin Tags',      color: '#f472b6' },
  'ti.web':       { label: 'Web Panel Server', color: '#22d3ee' },
  'ti.admin':     { label: 'Admin Controls', color: '#60b4ff' },
  'ti.ban':       { label: 'Ban System',      color: '#ff6652' },
  'ti.reports':   { label: 'Reports',         color: '#4eedc4' },
  'ti.appeals':   { label: 'Appeals',         color: '#fb7185' },
  'ti.players':   { label: 'Player Profiles', color: '#38bdf8' },
  'ti.economy':   { label: 'Economy',         color: '#fbbf24' },
  'ti.inventory': { label: 'Inventory',       color: '#a78bfa' },
  'ti.jobs':      { label: 'Jobs',            color: '#fb923c' },
  'ti.itemlookup': { label: 'Item Lookup',    color: '#c084fc' },
}

const PERMISSION_LABELS = {
  '*': 'Everything',
  'ti.admin.*': 'All Admin Actions',
  'ti.reports.*': 'All Report Actions',
  'ti.ban.*': 'All Ban Actions',
  'ti.appeals.*': 'All Appeal Actions',
  'ti.dashboard.view': 'View Dashboard',
  'ti.analytics.view': 'View Analytics',
  'ti.analytics.logs': 'View Analytics Logs',
  'ti.audit.view': 'View Audit Log',
  'ti.map.view': 'View Live Map',
  'ti.tags.manage': 'Manage Admin Tags',
  'ti.web.*': 'All Web Server Tools',
  'ti.web.console_exec': 'Web Console Execute',
  'ti.web.resources.view': 'View Resources',
  'ti.web.resources.control': 'Start / Stop Resources',
  'ti.admin.duty': 'Toggle Duty',
  'ti.admin.kick': 'Kick Players',
  'ti.admin.freeze': 'Freeze Players',
  'ti.admin.self_freeze': 'Freeze Self',
  'ti.admin.spectate': 'Spectate Players',
  'ti.admin.freecam': 'Freecam',
  'ti.admin.noclip': 'Noclip',
  'ti.admin.goto': 'Goto Player',
  'ti.admin.goto_back': 'Goto Back',
  'ti.admin.tp_waypoint': 'TP to Waypoint',
  'ti.admin.tp_coords': 'TP to Coordinates',
  'ti.admin.bring': 'Bring Player',
  'ti.admin.send_back': 'Send Player Back',
  'ti.admin.revive': 'Revive Player',
  'ti.admin.self_revive': 'Revive Self',
  'ti.admin.heal': 'Heal Player',
  'ti.admin.self_heal': 'Heal Self',
  'ti.admin.set_health': 'Set Health',
  'ti.admin.set_armor': 'Set Armor',
  'ti.admin.god': 'God Mode on Player',
  'ti.admin.self_god': 'God Mode Self',
  'ti.admin.self_invisible': 'Invisible Self',
  'ti.admin.self_clear_wanted': 'Clear Wanted Level',
  'ti.admin.kill': 'Kill Player',
  'ti.admin.strip_weapons': 'Strip Weapons',
  'ti.admin.warn': 'Warn Player',
  'ti.admin.warnings.view': 'View Warnings',
  'ti.admin.warnings.delete': 'Delete Warnings',
  'ti.admin.mute': 'Mute Player',
  'ti.admin.unmute': 'Unmute Player',
  'ti.admin.screenshot': 'Request Screenshot',
  'ti.admin.view_identifiers': 'View Identifiers',
  'ti.admin.manage_permissions': 'Manage Roles',
  'ti.admin.repair_vehicle': 'Repair Vehicle',
  'ti.admin.spawn_vehicle': 'Spawn Vehicle',
  'ti.admin.give_vehicle_keys': 'Give Vehicle / Keys',
  'ti.admin.clear_world': 'Clear World',
  'ti.admin.clear_vehicles': 'Clear Vehicles',
  'ti.admin.clear_props': 'Clear Props',
  'ti.admin.announce': 'Send Announcements',
  'ti.admin.server_lock': 'Lock Server',
  'ti.admin.chat': 'Staff Chat',
  'ti.admin.chat_export': 'Export Staff Chat',
  'ti.admin.chat_clear': 'Clear Staff Chat',
  'ti.admin.set_weather': 'Set Weather',
  'ti.admin.set_time': 'Set Time',
  'ti.admin.comserv': 'Community Service',
  'ti.reports.view': 'View Reports',
  'ti.reports.claim': 'Claim / Unclaim Reports',
  'ti.reports.comment': 'Add Report Notes',
  'ti.reports.delete_note': 'Delete Report Notes',
  'ti.reports.tp': 'TP to Report Players',
  'ti.reports.summon': 'Summon Report Players',
  'ti.reports.summon_freeze': 'Summon and Freeze Reported',
  'ti.reports.revive': 'Revive Reporter',
  'ti.reports.freeze': 'Freeze from Report',
  'ti.reports.mute': 'Mute from Report',
  'ti.reports.comserv': 'Comserv from Report',
  'ti.reports.ban': 'Ban from Report',
  'ti.reports.manage': 'Manage Report Status',
  'ti.reports.close': 'Close Reports',
  'ti.reports.delete': 'Delete Reports',
  'ti.ban.view': 'View Bans',
  'ti.ban.create': 'Create Ban',
  'ti.ban.offline_create': 'Offline Ban',
  'ti.ban.edit': 'Edit Bans',
  'ti.ban.unban': 'Unban',
  'ti.ban.view_ip': 'View IP / Sensitive IDs',
  'ti.ban.player_history': 'View Player Ban History',
  'ti.appeals.view': 'View Appeals',
  'ti.appeals.manage': 'Manage Appeals',
  'ti.players.advanced_view': 'View Player Profile',
  'ti.players.inventory_view': 'View Player Inventory',
  'ti.economy.give_money': 'Give Money',
  'ti.inventory.give_item': 'Give Item',
  'ti.inventory.remove_item': 'Remove Item',
  'ti.jobs.manage': 'Set Jobs',
  'ti.itemlookup.search': 'Search Items',
  'ti.itemlookup.inspect': 'Inspect Item Data',
}

/** Convert #rrggbb to "r,g,b" for CSS rgba() */
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '155,176,190'
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`
}

export function PermissionsPanel({ hideHero = false }) {
  const [activeTab, setActiveTab] = useState('roles')
  const { capabilities } = useAuth()
  const { branding, refreshBranding } = usePanel()
  const [data, setData] = useState({ roles: [], assignments: [], permissionCatalog: [], identifierTypes: [] })
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const [roleForm, setRoleForm] = useState({ label: '', weight: 0, is_super: false, color: '#9db0be', permissions: [] })
  const [createForm, setCreateForm] = useState({ name: '', label: '', weight: 0, is_super: false, color: '#9db0be', permissions: [] })
  const [assignmentForm, setAssignmentForm] = useState({ identifierType: 'discord', identifierValue: '', role_id: '' })
  const [brandingForm, setBrandingForm] = useState({ title: '', subtitle: '', logoUrl: '', heroLogoUrl: '', colorScheme: 'teal', discordLogsEnabled: false, discordLogChannelId: '', discordBotToken: '', discordGuildId: '', discordBannedRoles: '', discordReportWebhook: '', discordAuditWebhook: '', discordSecurityWebhook: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [roleSearch, setRoleSearch] = useState('')

  const selectedRole = data.roles.find((role) => role.id === selectedRoleId) || null
  const selectedIdentifierType = data.identifierTypes.find((type) => type.value === assignmentForm.identifierType)
  const permGroups = useMemo(() => groupPermissions(data.permissionCatalog), [data.permissionCatalog])
  const filteredRoles = useMemo(() => {
    if (!roleSearch.trim()) return data.roles
    return data.roles.filter(r => r.label.toLowerCase().includes(roleSearch.toLowerCase()) || r.name.toLowerCase().includes(roleSearch.toLowerCase()))
  }, [data.roles, roleSearch])

  async function load() {
    try {
      setError('')
      const { data: payload } = await api.get('/api/admin/permissions')
      setData(payload)

      const nextRoleId = selectedRoleId && payload.roles.some((role) => role.id === selectedRoleId)
        ? selectedRoleId
        : payload.roles[0]?.id || null

      setSelectedRoleId(nextRoleId)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load permissions data.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!selectedRole) return
    setRoleForm({
      label: selectedRole.label || '',
      weight: Number(selectedRole.weight || 0),
      is_super: Boolean(selectedRole.is_super),
      color: selectedRole.color || '#9db0be',
      permissions: selectedRole.permissions || []
    })
  }, [selectedRoleId, data.roles])

  useEffect(() => {
    setBrandingForm({
      title: branding.title || '',
      subtitle: branding.subtitle || '',
      logoUrl: branding.logoUrl || '',
      heroLogoUrl: branding.heroLogoUrl || '',
      colorScheme: branding.colorScheme || 'teal',
      discordLogsEnabled: Boolean(branding.discordLogsEnabled),
      discordLogChannelId: branding.discordLogChannelId || '',
      discordBotToken: branding.discordBotToken || '',
      discordGuildId: branding.discordGuildId || '',
      discordBannedRoles: Array.isArray(branding.discordBannedRoles) ? branding.discordBannedRoles.join(', ') : (branding.discordBannedRoles || ''),
      discordReportWebhook: branding.discordReportWebhook || '',
      discordAuditWebhook: branding.discordAuditWebhook || '',
      discordSecurityWebhook: branding.discordSecurityWebhook || ''
    })
  }, [branding])

  function togglePermission(target, permission) {
    const nextPermissions = target.permissions.includes(permission)
      ? target.permissions.filter((entry) => entry !== permission)
      : [...target.permissions, permission].sort()

    return {
      ...target,
      permissions: nextPermissions
    }
  }

  async function saveRole() {
    if (!selectedRole) return
    setError('')
    await api.put(`/api/admin/roles/${selectedRole.id}`, roleForm)
    setMessage(`Saved ${selectedRole.label}.`)
    await load()
  }

  async function createRole() {
    setError('')
    await api.post('/api/admin/roles', createForm)
    setCreateForm({ name: '', label: '', weight: 0, is_super: false, permissions: [] })
    setMessage('Created new admin role.')
    await load()
  }

  async function saveAssignment() {
    setError('')
    await api.post('/api/admin/assignments', {
      identifier_type: assignmentForm.identifierType,
      identifier_value: assignmentForm.identifierValue,
      role_id: Number(assignmentForm.role_id)
    })
    setAssignmentForm({ identifierType: 'discord', identifierValue: '', role_id: '' })
    setMessage('Identifier mapping saved.')
    await load()
  }

  async function removeAssignment(id) {
    setError('')
    await api.delete(`/api/admin/assignments/${id}`)
    setMessage('Identifier mapping removed.')
    await load()
  }

  async function saveBranding() {
    setError('')
    const bannedRolesArray = brandingForm.discordBannedRoles
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    await api.put('/api/admin/branding', { ...brandingForm, discordBannedRoles: bannedRolesArray })
    setMessage('Panel settings updated.')
    await refreshBranding()
  }

  return (
    <>
      {!hideHero && (
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Access Control</p>
            <h1>Admin Page</h1>
            <p className="hero-copy">Configure roles, assignments, Discord webhooks, and panel settings.</p>
          </div>
          <div className="hero-status-stack">
            {message ? <div className="notice success">{message}</div> : null}
            {error ? <div className="notice error">{error}</div> : null}
          </div>
        </section>
      )}

      {/* ── Tab nav ──────────────────────────────────────────────────────── */}
      <div className="tab-nav" role="tablist" style={{ marginBottom: '1.5rem' }}>
        {PERM_TABS.map((t) => (
          <button key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`tab-btn${activeTab === t.id ? ' active' : ''}`}
            style={activeTab === t.id ? { boxShadow: '0 0 0 2px rgba(var(--accent-rgb),0.45)', position: 'relative' } : {}}
            onClick={() => setActiveTab(t.id)}>
            {t.icon && <i className={t.icon} style={{ marginRight: 6, fontSize: '0.85em', opacity: 0.85 }} />}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Roles tab ───────────────────────────────────────────────────── */}
      {activeTab === 'roles' && (
        <section className="layout-grid admin-layout">
          <div className="panel-stack">
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Roles</p>
                  <h2>Existing roles</h2>
                </div>
              </div>
              <input
                placeholder="Search roles…"
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
                style={{ marginBottom: '0.75rem', width: '100%' }}
              />
              <div className="role-list">
                {filteredRoles.map((role) => (
                  <button
                    key={role.id}
                    className={`role-pill ${selectedRoleId === role.id ? 'active' : ''}`}
                    style={{
                      borderLeft: `3px solid ${role.color || '#9db0be'}`,
                      borderRadius: 'var(--r-lg)',
                      transition: 'border-color var(--t-normal), background var(--t-normal), box-shadow var(--t-normal)',
                      ...(selectedRoleId === role.id ? {
                        background: `rgba(${hexToRgb(role.color || '#9db0be')},0.1)`,
                        boxShadow: `0 0 18px rgba(${hexToRgb(role.color || '#9db0be')},0.2)`,
                      } : {})
                    }}
                    onClick={() => setSelectedRoleId(role.id)}
                  >
                    <span className="role-pill-dot" style={{ background: role.color || '#9db0be', boxShadow: `0 0 6px ${role.color || '#9db0be'}60` }} />
                    <strong>{role.label}</strong>
                    <span>{role.name}{role.is_super ? ' · Super' : ''}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="panel-stack">
            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Edit Role</p>
                  <h2>{selectedRole ? selectedRole.label : 'Select a role'}</h2>
                </div>
              </div>
              {selectedRole ? (
                <>
                  <div className="form-grid">
                    <label>
                      Label
                      <input value={roleForm.label} onChange={(e) => setRoleForm((prev) => ({ ...prev, label: e.target.value }))} />
                    </label>
                    <label>
                      Weight
                      <input type="number" value={roleForm.weight} onChange={(e) => setRoleForm((prev) => ({ ...prev, weight: Number(e.target.value) }))} />
                    </label>
                    <label>
                      Role Color
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <input
                          type="color"
                          value={roleForm.color}
                          onChange={(e) => setRoleForm((prev) => ({ ...prev, color: e.target.value }))}
                          style={{ width: 40, height: 32, padding: 2, borderRadius: 6, cursor: 'pointer', border: 'none', background: 'none' }}
                        />
                        <input
                          type="text"
                          value={roleForm.color}
                          maxLength={9}
                          onChange={(e) => {
                            const v = e.target.value
                            setRoleForm((prev) => ({ ...prev, color: v }))
                          }}
                          style={{ width: 90, fontFamily: 'monospace' }}
                          placeholder="#hex"
                        />
                      </div>
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={roleForm.is_super} onChange={(e) => setRoleForm((prev) => ({ ...prev, is_super: e.target.checked }))} />
                      Super role
                    </label>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    {permGroups.map(([ns, perms]) => {
                      const meta = NS_LABELS[ns] || { label: ns, color: 'var(--accent)' }
                      const allChecked = perms.every(p => roleForm.permissions.includes(p))
                      return (
                        <div key={ns} style={{
                          background: 'rgba(255,255,255,0.025)',
                          border: '1px solid var(--line)',
                          borderLeft: `3px solid ${meta.color}`,
                          borderRadius: 'var(--r-md)',
                          padding: '0.85rem 1rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.6rem' }}>
                            <span style={{ color: meta.color, fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{meta.label}</span>
                            <button
                              style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '0.18rem 0.6rem', borderRadius: 'var(--r-full)' }}
                              onClick={() => setRoleForm(prev => ({
                                ...prev,
                                permissions: allChecked
                                  ? prev.permissions.filter(p => !perms.includes(p))
                                  : [...new Set([...prev.permissions, ...perms])].sort()
                              }))}
                            >{allChecked ? 'Deselect All' : 'Select All'}</button>
                          </div>
                          <div className="permission-grid" style={{ gap: '0.4rem' }}>
                            {perms.map((permission) => (
                              <label key={permission} className="permission-chip" style={{
                                ...(roleForm.permissions.includes(permission) ? {
                                  background: `${meta.color}18`,
                                  borderColor: `${meta.color}50`,
                                  color: 'var(--text)',
                                } : {})
                              }}>
                                <input
                                  type="checkbox"
                                  checked={roleForm.permissions.includes(permission)}
                                  onChange={() => setRoleForm((prev) => togglePermission(prev, permission))}
                                />
                                <span>
                                  <strong>{PERMISSION_LABELS[permission] || permission}</strong>
                                  <small>{permission}</small>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={saveRole}>Save Role</button>
                </>
              ) : (
                <p className="empty-state">No role selected.</p>
              )}
            </section>

            <section className="panel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Create Role</p>
                  <h2>New admin role</h2>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Role name
                  <input value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} />
                </label>
                <label>
                  Label
                  <input value={createForm.label} onChange={(e) => setCreateForm((prev) => ({ ...prev, label: e.target.value }))} />
                </label>
                <label>
                  Weight
                  <input type="number" value={createForm.weight} onChange={(e) => setCreateForm((prev) => ({ ...prev, weight: Number(e.target.value) }))} />
                </label>
                <label>
                  Role Color
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <input
                      type="color"
                      value={createForm.color}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, color: e.target.value }))}
                      style={{ width: 40, height: 32, padding: 2, borderRadius: 6, cursor: 'pointer', border: 'none', background: 'none' }}
                    />
                    <input
                      type="text"
                      value={createForm.color}
                      maxLength={9}
                      onChange={(e) => {
                        const v = e.target.value
                        setCreateForm((prev) => ({ ...prev, color: v }))
                      }}
                      style={{ width: 90, fontFamily: 'monospace' }}
                      placeholder="#hex"
                    />
                  </div>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={createForm.is_super} onChange={(e) => setCreateForm((prev) => ({ ...prev, is_super: e.target.checked }))} />
                  Super role
                </label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {permGroups.map(([ns, perms]) => {
                  const meta = NS_LABELS[ns] || { label: ns, color: 'var(--accent)' }
                  const allChecked = perms.every(p => createForm.permissions.includes(p))
                  return (
                    <div key={ns} style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--line)',
                      borderLeft: `3px solid ${meta.color}`,
                      borderRadius: 'var(--r-md)',
                      padding: '0.75rem 1rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.5rem' }}>
                        <span style={{ color: meta.color, fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{meta.label}</span>
                        <button
                          style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '0.18rem 0.6rem', borderRadius: 'var(--r-full)' }}
                          onClick={() => setCreateForm(prev => ({
                            ...prev,
                            permissions: allChecked
                              ? prev.permissions.filter(p => !perms.includes(p))
                              : [...new Set([...prev.permissions, ...perms])].sort()
                          }))}
                        >{allChecked ? 'Deselect All' : 'Select All'}</button>
                      </div>
                      <div className="permission-grid compact" style={{ gap: '0.35rem' }}>
                        {perms.map((permission) => (
                          <label key={permission} className="permission-chip" style={{
                            ...(createForm.permissions.includes(permission) ? {
                              background: `${meta.color}18`,
                              borderColor: `${meta.color}50`,
                              color: 'var(--text)',
                            } : {})
                          }}>
                            <input
                              type="checkbox"
                              checked={createForm.permissions.includes(permission)}
                              onChange={() => setCreateForm((prev) => togglePermission(prev, permission))}
                            />
                            <span>
                              <strong>{PERMISSION_LABELS[permission] || permission}</strong>
                              <small>{permission}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button onClick={createRole}>Create Role</button>
            </section>
          </div>
        </section>
      )}

      {/* ── Assignments tab ─────────────────────────────────────────────── */}
      {activeTab === 'assignments' && (
        <section className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Assignments</p>
              <h2>Identifier mapping</h2>
            </div>
          </div>
          <div className="mapping-shell">
            <div className="mapping-type-card">
              <span className="eyebrow">Identifier Type</span>
              <select
                value={assignmentForm.identifierType}
                onChange={(e) => setAssignmentForm((prev) => ({ ...prev, identifierType: e.target.value }))}
              >
                {data.identifierTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
              <p className="tiny">Selected: {selectedIdentifierType?.label || 'Unknown type'}</p>
            </div>
            <div className="mapping-form-card">
              <div className="form-grid">
                <label>
                  Identifier value
                  <input
                    placeholder="1126872809965105224 or steam hex"
                    value={assignmentForm.identifierValue}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, identifierValue: e.target.value }))}
                  />
                </label>
                <label>
                  Assign role
                  <select
                    value={assignmentForm.role_id}
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, role_id: e.target.value }))}
                  >
                    <option value="">Select role</option>
                    {data.roles.map((role) => (
                      <option key={role.id} value={role.id}>{role.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button onClick={saveAssignment}>Save Assignment</button>
            </div>
          </div>
          <div className="assignment-list">
            {data.assignments.map((assignment) => (
              <div key={assignment.id} className="assignment-row">
                <div>
                  <strong>{assignment.identifier}</strong>
                  <span>{assignment.role_label}</span>
                </div>
                <button className="ghost-button" onClick={() => removeAssignment(assignment.id)}>Remove</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Webhooks tab ────────────────────────────────────────────────── */}
      {activeTab === 'webhooks' && capabilities?.isSuperAdmin && (
        <section className="panel-card" style={{ maxWidth: 620 }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Discord</p>
              <h2>Webhooks &amp; Bot</h2>
            </div>
          </div>
          <div className="brand-preview-grid" style={{ marginBottom: '1rem' }}>
            <article className="brand-preview-card">
              <span className="eyebrow">Discord Logs</span>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={brandingForm.discordLogsEnabled}
                  onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordLogsEnabled: e.target.checked }))}
                />
                Enable Discord logs
              </label>
              <input
                value={brandingForm.discordLogChannelId}
                onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordLogChannelId: e.target.value }))}
                placeholder="Discord log channel ID"
              />
            </article>
          </div>
          <div className="form-grid">
            <label className="full-width">
              Bot token
              <input
                type="password"
                value={brandingForm.discordBotToken}
                onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordBotToken: e.target.value }))}
                placeholder="Bot token (stored securely in DB)"
              />
            </label>
            <label>
              Guild ID
              <input
                value={brandingForm.discordGuildId}
                onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordGuildId: e.target.value }))}
                placeholder="Your Discord server ID"
              />
            </label>
            <label className="full-width">
              Banned Discord role IDs
              <input
                value={brandingForm.discordBannedRoles}
                onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordBannedRoles: e.target.value }))}
                placeholder="Role IDs separated by commas: 123456, 789012"
              />
              <p className="tiny">Players with any of these roles will be blocked on join.</p>
            </label>
            <label className="full-width">
              Report webhook
              <input
                value={brandingForm.discordReportWebhook}
                onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordReportWebhook: e.target.value }))}
                placeholder="https://discord.com/api/webhooks/..."
              />
              <p className="tiny">Sent when a report is claimed or closed.</p>
            </label>
            <label className="full-width">
              Audit log webhook
              <input
                value={brandingForm.discordAuditWebhook}
                onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordAuditWebhook: e.target.value }))}
                placeholder="https://discord.com/api/webhooks/..."
              />
              <p className="tiny">All admin actions posted as embeds.</p>
            </label>
            <label className="full-width">
              Security alerts webhook
              <input
                value={brandingForm.discordSecurityWebhook}
                onChange={(e) => setBrandingForm((prev) => ({ ...prev, discordSecurityWebhook: e.target.value }))}
                placeholder="https://discord.com/api/webhooks/..."
              />
              <p className="tiny">Authentication failures and security events.</p>
            </label>
          </div>
          <button onClick={saveBranding}>Save Webhooks</button>
        </section>
      )}
      {activeTab === 'webhooks' && !capabilities?.isSuperAdmin && (
        <div className="empty-state" role="status"><span>Only superadmins can manage Discord config.</span></div>
      )}

      {/* ── Settings tab ─────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <section className="panel-card" style={{ maxWidth: 620 }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Branding</p>
              <h2>Panel identity</h2>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Panel title
              <input value={brandingForm.title} onChange={(e) => setBrandingForm((prev) => ({ ...prev, title: e.target.value }))} />
            </label>
            <label>
              Panel subtitle
              <input value={brandingForm.subtitle} onChange={(e) => setBrandingForm((prev) => ({ ...prev, subtitle: e.target.value }))} />
            </label>
            <label className="full-width">
              Logo URL
              <input value={brandingForm.logoUrl} onChange={(e) => setBrandingForm((prev) => ({ ...prev, logoUrl: e.target.value }))} placeholder="https://example.com/logo.png" />
            </label>
            <label className="full-width">
              Hero logo URL
              <input value={brandingForm.heroLogoUrl} onChange={(e) => setBrandingForm((prev) => ({ ...prev, heroLogoUrl: e.target.value }))} placeholder="https://example.com/hero-logo.png" />
            </label>
          </div>
          <div className="brand-preview-grid">
            <article className="brand-preview-card">
              <span className="eyebrow">Theme</span>
              <strong>{brandingForm.colorScheme}</strong>
              <select value={brandingForm.colorScheme} onChange={(e) => setBrandingForm((prev) => ({ ...prev, colorScheme: e.target.value }))}>
                <option value="teal">Teal (default)</option>
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="yellow">Yellow / Gold</option>
                <option value="purple">Purple</option>
                <option value="orange">Orange</option>
                <option value="pink">Pink</option>
              </select>
            </article>
          </div>
          <button onClick={saveBranding}>Save Settings</button>
        </section>
      )}
    </>
  )
}

export default function Permissions() {
  return (
    <main className="page">
      <PermissionsPanel />
    </main>
  )
}
