import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

// â”€â”€ GTA V world bounds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GAME_BOUNDS = { minX: -5665, maxX: 6690, minY: -4055, maxY: 8425 }
const MAP_SIZE    = 8192
const MIN_ZOOM    = 0.25
const MAX_ZOOM    = 8

function gameToMapXY(gx, gy) {
  const nx = (gx - GAME_BOUNDS.minX) / (GAME_BOUNDS.maxX - GAME_BOUNDS.minX)
  const ny = 1 - (gy - GAME_BOUNDS.minY) / (GAME_BOUNDS.maxY - GAME_BOUNDS.minY)
  return { x: nx * MAP_SIZE - MAP_SIZE / 2, y: ny * MAP_SIZE - MAP_SIZE / 2 }
}

function mapToScreen(mx, my, zoom, offsetX, offsetY, canvasW, canvasH) {
  return { sx: canvasW / 2 + offsetX + mx * zoom, sy: canvasH / 2 + offsetY + my * zoom }
}

const ROLE_COLORS = {
  superadmin: '#e84c6a', admin: '#f59e42', moderator: '#41c9c9', helper: '#4f8ef7', user: '#9db0be',
}
function hashRoleColor(role) {
  let h = 0
  for (let i = 0; i < role.length; i++) h = role.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360}, 65%, 62%)`
}
function getRoleColor(role) { return role ? (ROLE_COLORS[role] || hashRoleColor(role)) : '#9db0be' }

const MAP_STYLES = [
  { id: 'satellite', label: 'Satellite', ext: 'jpg' },
  { id: 'atlas',     label: 'Atlas',     ext: 'png' },
  { id: 'road',      label: 'Road',      ext: 'jpg' },
]

const DURATION_OPTIONS = [
  { label: 'Permanent', hours: 0  },
  { label: '1 hour',    hours: 1  },
  { label: '6 hours',   hours: 6  },
  { label: '12 hours',  hours: 12 },
  { label: '1 day',     hours: 24 },
  { label: '3 days',    hours: 72 },
  { label: '7 days',    hours: 168 },
  { label: '30 days',   hours: 720 },
]

function expiresAtFromHours(hours) {
  if (!hours) return null
  const d = new Date()
  d.setTime(d.getTime() + hours * 3600 * 1000)
  return d.toISOString().replace('T', ' ').slice(0, 19)
}

export default function MapPage() {
  const { capabilities } = useAuth()
  const canvasRef = useRef(null)
  const sr = useRef({
    zoom: 1.0, offsetX: 0, offsetY: 0,
    isDragging: false, dragStartX: 0, dragStartY: 0,
    images: {}, style: 'satellite',
    players: [], hoveredSrc: null, raf: null,
  })

  const [style, setStyle]           = useState('satellite')
  const [players, setPlayers]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // Selected blip card (quick info)
  const [selectedEntry, setSelected] = useState(null)

  // Player info / action panel (right side-panel)
  const [infoPlayer, setInfoPlayer] = useState(null)   // player object
  const [infoTab,    setInfoTab]    = useState('info') // 'info' | 'actions' | 'inventory' | 'spectate'

  // Action form state
  const [actionMsg, setActionMsg]   = useState('')
  const [actionErr, setActionErr]   = useState('')
  const [actLoading, setActLoading] = useState(false)
  const [kickReason, setKickReason] = useState('')
  const [warnMsg,    setWarnMsg]    = useState('')
  const [banForm,    setBanForm]    = useState({ reason:'', durationHours:24 })

  // Spectate: live screenshot polling
  const [spectateImg, setSpectateImg]         = useState(null)
  const [spectateLoading, setSpectateLoading] = useState(false)
  const [spectateErr,     setSpectateErr]     = useState('')
  const ssPollingRef = useRef(null)

  // Inventory
  const [inventory,   setInventory]   = useState(null)
  const [invLoading,  setInvLoading]  = useState(false)

  sr.current.style   = style
  sr.current.players = players

  // â”€â”€ Fetch players every 5s â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await api.get('/api/admin/map-snapshot')
        if (!cancelled) { setPlayers(data.players || []); setFetchError(null) }
      } catch (err) {
        if (!cancelled) setFetchError(err?.response?.data?.detail || err?.response?.data?.error || 'Cannot reach FiveM server')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // â”€â”€ Preload map tiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    MAP_STYLES.forEach(({ id, ext }) => {
      if (sr.current.images[id]) return
      const img = new Image()
      img.src = `/maps/${id}.${ext}`
      img.onload = () => { sr.current.images[id] = img }
    })
  }, [])

  // â”€â”€ Canvas resize + wheel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const wrap = canvas.parentElement
    const ro = new ResizeObserver(() => { canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight })
    ro.observe(wrap)
    canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight
    const onWheel = e => {
      e.preventDefault()
      const s = sr.current; const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left; const cy = e.clientY - rect.top
      const old = s.zoom; const factor = e.deltaY > 0 ? 0.85 : 1.18
      s.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * factor))
      const wx = (cx - canvas.width / 2 - s.offsetX) / old; const wy = (cy - canvas.height / 2 - s.offsetY) / old
      s.offsetX = cx - canvas.width / 2 - wx * s.zoom; s.offsetY = cy - canvas.height / 2 - wy * s.zoom
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); canvas.removeEventListener('wheel', onWheel) }
  }, [])

  // â”€â”€ Render loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    function render() {
      const { zoom, offsetX, offsetY, images, style: s, players: ps, hoveredSrc } = sr.current
      const w = canvas.width, h = canvas.height
      ctx.fillStyle = '#061019'; ctx.fillRect(0, 0, w, h)
      ctx.save(); ctx.translate(w / 2 + offsetX, h / 2 + offsetY); ctx.scale(zoom, zoom)
      const img = images[s]
      if (img) ctx.drawImage(img, -MAP_SIZE / 2, -MAP_SIZE / 2, MAP_SIZE, MAP_SIZE)
      else { ctx.fillStyle = '#0d1f2d'; ctx.fillRect(-MAP_SIZE / 2, -MAP_SIZE / 2, MAP_SIZE, MAP_SIZE) }
      ctx.restore()
      const BLIP_R = 7
      ps.forEach(p => {
        if (!p.coords) return
        const { x: mx, y: my } = gameToMapXY(p.coords.x, p.coords.y)
        const { sx, sy } = mapToScreen(mx, my, zoom, offsetX, offsetY, w, h)
        const isHovered = p.src === hoveredSrc
        const color = getRoleColor(p.role)
        const r = BLIP_R * (isHovered ? 1.35 : 1)
        if (isHovered) { ctx.shadowColor = color; ctx.shadowBlur = 12 }
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
        ctx.shadowBlur = 0
        if (isHovered || zoom >= 2.5) {
          ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
          ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 4
          ctx.fillStyle = '#eff7ff'; ctx.fillText(p.name, sx, sy - r - 2); ctx.shadowBlur = 0
        }
        if (zoom >= 4) {
          ctx.font = '9px sans-serif'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.fillText(`#${p.src}`, sx, sy + r + 2)
        }
      })
      sr.current.raf = requestAnimationFrame(render)
    }
    sr.current.raf = requestAnimationFrame(render)
    return () => { if (sr.current.raf) cancelAnimationFrame(sr.current.raf) }
  }, [])

  // â”€â”€ Mouse handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const onMouseDown = useCallback(e => {
    const s = sr.current; s.isDragging = true; s.dragStartX = e.clientX - s.offsetX; s.dragStartY = e.clientY - s.offsetY
  }, [])

  const onMouseMove = useCallback(e => {
    const s = sr.current; const canvas = canvasRef.current; if (!canvas) return
    if (s.isDragging) { s.offsetX = e.clientX - s.dragStartX; s.offsetY = e.clientY - s.dragStartY }
    const rect = canvas.getBoundingClientRect(); const cx = e.clientX - rect.left; const cy = e.clientY - rect.top
    const HIT = 14; let hov = null
    for (const p of s.players) {
      if (!p.coords) continue
      const { x: mx, y: my } = gameToMapXY(p.coords.x, p.coords.y)
      const { sx, sy } = mapToScreen(mx, my, s.zoom, s.offsetX, s.offsetY, canvas.width, canvas.height)
      if (Math.hypot(cx - sx, cy - sy) <= HIT) { hov = p.src; break }
    }
    s.hoveredSrc = hov; canvas.style.cursor = hov ? 'pointer' : (s.isDragging ? 'grabbing' : 'grab')
  }, [])

  const onMouseUp = useCallback(() => { sr.current.isDragging = false }, [])

  const onClick = useCallback(e => {
    const s = sr.current
    if (!s.hoveredSrc) { setSelected(null); return }
    const player = s.players.find(p => p.src === s.hoveredSrc)
    if (!player) return
    const canvas = canvasRef.current; const rect = canvas.getBoundingClientRect()
    setSelected({ player, x: e.clientX - rect.left, y: e.clientY - rect.top })
    setActionMsg(''); setActionErr('')
  }, [])

  // â”€â”€ Open full player info panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function openInfoPanel(player) {
    setInfoPlayer(player)
    setInfoTab('info')
    setActionMsg(''); setActionErr(''); setKickReason(''); setWarnMsg('')
    setBanForm({ reason:'', durationHours:24 })
    setSpectateImg(null); setSpectateErr(''); setInventory(null)
    if (ssPollingRef.current) { clearInterval(ssPollingRef.current); ssPollingRef.current = null }
  }

  function closeInfoPanel() {
    setInfoPlayer(null)
    if (ssPollingRef.current) { clearInterval(ssPollingRef.current); ssPollingRef.current = null }
  }

  useEffect(() => () => { if (ssPollingRef.current) clearInterval(ssPollingRef.current) }, [])

  // â”€â”€ Spectate = request screenshot + auto-refresh every 8s â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function startSpectate(player) {
    if (!player) return
    setSpectateLoading(true); setSpectateImg(null); setSpectateErr('')
    if (ssPollingRef.current) { clearInterval(ssPollingRef.current); ssPollingRef.current = null }
    try {
      const { data } = await api.post('/api/admin/player/screenshot', { src: player.src, context: 'map_spectate' })
      if (data.imageUrl) {
        setSpectateImg(data.imageUrl); setSpectateLoading(false)
      } else if (data.pending && data.token) {
        const token = data.token
        ssPollingRef.current = setInterval(async () => {
          try {
            const { data: poll } = await api.post('/api/admin/player/screenshot-poll', { token })
            if (poll.ready) {
              clearInterval(ssPollingRef.current); ssPollingRef.current = null
              setSpectateImg(poll.imageUrl); setSpectateLoading(false)
              // Auto-refresh every 8s
              ssPollingRef.current = setInterval(() => startSpectate(player), 8000)
            }
          } catch { /* keep polling */ }
        }, 1500)
      }
    } catch (e) {
      setSpectateErr(e?.response?.data?.error || 'Screenshot failed'); setSpectateLoading(false)
    }
  }

  // When tab switches to spectate, auto-start
  useEffect(() => {
    if (infoTab === 'spectate' && infoPlayer) {
      startSpectate(infoPlayer)
    } else {
      if (ssPollingRef.current) { clearInterval(ssPollingRef.current); ssPollingRef.current = null }
      if (infoTab !== 'spectate') { setSpectateImg(null); setSpectateLoading(false); setSpectateErr('') }
    }
  }, [infoTab, infoPlayer?.src])  // eslint-disable-line

  // â”€â”€ Load inventory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function loadInventory(player) {
    setInvLoading(true)
    try {
      const { data } = await api.get(`/api/admin/player/${player.src}/inventory`)
      setInventory(data)
    } catch (e) {
      setInventory({ error: e?.response?.data?.error || 'Failed' })
    } finally { setInvLoading(false) }
  }

  useEffect(() => {
    if (infoTab === 'inventory' && infoPlayer && !inventory) loadInventory(infoPlayer)
  }, [infoTab, infoPlayer?.src])  // eslint-disable-line

  // â”€â”€ Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function doKick() {
    if (!infoPlayer || !kickReason.trim()) return
    setActLoading(true); setActionErr(''); setActionMsg('')
    try {
      await api.post('/api/admin/player/kick', { src: infoPlayer.src, reason: kickReason.trim() })
      setActionMsg(`${infoPlayer.name} has been kicked.`); setKickReason('')
    } catch (e) { setActionErr(e?.response?.data?.error || 'Failed') }
    finally { setActLoading(false) }
  }

  async function doWarn() {
    if (!infoPlayer || !warnMsg.trim()) return
    setActLoading(true); setActionErr(''); setActionMsg('')
    try {
      await api.post('/api/admin/player/warn', { src: infoPlayer.src, message: warnMsg.trim() })
      setActionMsg(`${infoPlayer.name} has been warned.`); setWarnMsg('')
    } catch (e) { setActionErr(e?.response?.data?.error || 'Failed') }
    finally { setActLoading(false) }
  }

  async function doBan() {
    if (!infoPlayer || !banForm.reason.trim()) return
    setActLoading(true); setActionErr(''); setActionMsg('')
    try {
      await api.post('/api/bans/manual', {
        player_name: infoPlayer.name,
        reason:      banForm.reason.trim(),
        expires_at:  expiresAtFromHours(banForm.durationHours),
        identifiers: [],
      })
      const lbl = DURATION_OPTIONS.find(o => o.hours === banForm.durationHours)?.label || 'timed'
      setActionMsg(`${infoPlayer.name} has been banned (${lbl}).`)
      setBanForm({ reason:'', durationHours:24 })
    } catch (e) { setActionErr(e?.response?.data?.error || 'Failed') }
    finally { setActLoading(false) }
  }

  const withCoords = players.filter(p => p.coords)
  const noCoords   = players.filter(p => !p.coords)
  const uniqueRoles = [...new Set(players.map(p => p.role || 'user'))]
    .sort((a, b) => ({ superadmin:5, admin:4, moderator:3, helper:2, user:1 }[b]||0) - ({ superadmin:5, admin:4, moderator:3, helper:2, user:1 }[a]||0))

  const sel = selectedEntry?.player

  return (
    <main className="page map-page">
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Live Map</p>
          <h1>Player Map</h1>
          <p className="hero-copy">Real-time player positions. Click a blip to inspect Â· Spectate = live screen view.</p>
        </div>
        <div className="hero-stat-row">
          <article className="mini-stat-card"><span>On map</span><strong>{withCoords.length}</strong></article>
          <article className="mini-stat-card"><span>No coords</span><strong>{noCoords.length}</strong></article>
        </div>
      </section>

      {fetchError && (
        <div className="error-banner">
          <i className="fa-solid fa-triangle-exclamation" /> {fetchError}
        </div>
      )}

      {/* map + right panel layout */}
      <section style={{ display:'flex', gap:'1rem', alignItems:'flex-start' }}>
        {/* â”€â”€ Map card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="panel-card map-panel-card" style={{ flex:1, minWidth:0 }}>
          <div className="map-web-controls">
            <div className="map-web-style-switcher">
              {MAP_STYLES.map(({ id, label }) => (
                <button key={id} className={`map-web-style-btn ${style === id ? 'active' : ''}`} onClick={() => setStyle(id)}>{label}</button>
              ))}
            </div>
            <span className="map-web-hint">Scroll to zoom Â· drag to pan Â· click blip for details</span>
          </div>

          <div className="map-web-canvas-wrap">
            {loading && <div className="map-web-loading">Loading playersâ€¦</div>}
            <canvas
              ref={canvasRef}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove}
              onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onClick={onClick}
            />

            {/* Blip quick-card */}
            {sel && !infoPlayer && (
              <div className="map-player-card">
                <button className="map-player-card-close" onClick={() => setSelected(null)}>
                  <i className="fa-solid fa-xmark" />
                </button>
                <div className="map-player-card-name">{sel.name}</div>
                <div className="map-player-card-role" style={{ color: getRoleColor(sel.role) }}>{sel.role || 'user'}</div>
                <div className="map-player-card-stats">
                  <div className="map-player-card-stat-row"><span>Server ID</span><span>#{sel.src}</span></div>
                  {sel.job && <div className="map-player-card-stat-row"><span>Job</span><span>{sel.job}{sel.onDuty ? ' âœ“' : ''}</span></div>}
                  {sel.ping > 0 && <div className="map-player-card-stat-row"><span>Ping</span><span>{sel.ping} ms</span></div>}
                  <div className="map-player-card-stat-row">
                    <span>Status</span>
                    <span>
                      {sel.isDead ? <span style={{ color:'#f87171' }}>Dead</span> : sel.inVeh ? <span style={{ color:'#fbbf24' }}>In Vehicle</span> : 'On foot'}
                    </span>
                  </div>
                </div>
                {sel.coords && (
                  <div className="map-player-card-coords">
                    {sel.coords.x.toFixed(1)}, {sel.coords.y.toFixed(1)}, {sel.coords.z.toFixed(1)}
                  </div>
                )}
                <div className="map-player-card-actions">
                  <button className="map-action-btn spectate" onClick={() => { openInfoPanel(sel); setInfoTab('spectate'); setSelected(null) }}>
                    <span className="action-icon"><i className="fas fa-eye" /></span>
                    Live View
                  </button>
                  <button className="map-action-btn goto" onClick={() => { openInfoPanel(sel); setSelected(null) }}>
                    <span className="action-icon"><i className="fas fa-circle-info" /></span>
                    Player Info
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="map-web-legend">
            {uniqueRoles.map(role => (
              <span key={role} className="map-web-legend-item">
                <span className="map-web-legend-dot" style={{ background: getRoleColor(role) }} />{role}
              </span>
            ))}
            {noCoords.length > 0 && (
              <span className="map-web-legend-item" style={{ marginLeft:'auto', opacity:.6 }}>
                <i className="fas fa-circle-exclamation" style={{ marginRight:4 }} />
                {noCoords.length} without coords
              </span>
            )}
          </div>
        </div>

        {/* â”€â”€ Player info / action panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {infoPlayer && (
          <div className="panel-card" style={{ width:360, flexShrink:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'1rem 1.1rem .5rem', borderBottom:'1px solid var(--line)' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:'1rem' }}>{infoPlayer.name}</div>
                <div style={{ fontSize:'.72rem', color: getRoleColor(infoPlayer.role), marginTop:1 }}>{infoPlayer.role || 'user'} &nbsp;Â·&nbsp; <span style={{ color:'var(--muted)' }}>#{infoPlayer.src}</span></div>
              </div>
              <button className="ghost-button" onClick={closeInfoPanel} style={{ fontSize:'.8rem' }}>âœ•</button>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid var(--line)' }}>
              {[
                { id:'info',      label:'Info'      },
                { id:'spectate',  label:'ðŸ‘ Live View' },
                { id:'actions',   label:'âš¡ Actions'  },
                { id:'inventory', label:'ðŸŽ’ Inventory'},
              ].map(t => (
                <button key={t.id}
                  onClick={() => setInfoTab(t.id)}
                  style={{
                    flex:1, padding:'.55rem .3rem', fontSize:'.72rem', fontWeight:700,
                    background:'none', border:'none', cursor:'pointer',
                    borderBottom: infoTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                    color: infoTab === t.id ? 'var(--accent)' : 'var(--muted)',
                    transition:'color .15s'
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex:1, overflowY:'auto', padding:'1rem 1.1rem' }}>

              {/* INFO */}
              {infoTab === 'info' && (
                <div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.55rem', marginBottom:'.8rem' }}>
                    {[
                      { label:'Server ID', value:`#${infoPlayer.src}` },
                      { label:'Ping',      value: infoPlayer.ping > 0 ? `${infoPlayer.ping} ms` : 'â€”' },
                      { label:'Job',       value: infoPlayer.job || 'â€”' },
                      { label:'On Duty',   value: infoPlayer.onDuty ? 'Yes' : 'No' },
                      { label:'Status',    value: infoPlayer.isDead ? 'â˜  Dead' : infoPlayer.inVeh ? 'ðŸš— In Vehicle' : 'ðŸš¶ On foot' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ padding:'.45rem .6rem', borderRadius:8, background:'rgba(255,255,255,.03)', border:'1px solid var(--line)' }}>
                        <div style={{ fontSize:'.63rem', color:'var(--muted)', marginBottom:1 }}>{label}</div>
                        <div style={{ fontSize:'.82rem', fontWeight:700 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {infoPlayer.coords && (
                    <div style={{ padding:'.45rem .6rem', borderRadius:8, background:'rgba(255,255,255,.03)', border:'1px solid var(--line)', fontSize:'.78rem', fontFamily:'monospace', color:'var(--muted)' }}>
                      ðŸ“ {infoPlayer.coords.x.toFixed(1)}, {infoPlayer.coords.y.toFixed(1)}, {infoPlayer.coords.z.toFixed(1)}
                    </div>
                  )}
                </div>
              )}

              {/* SPECTATE (live view) */}
              {infoTab === 'spectate' && (
                <div>
                  <p style={{ fontSize:'.78rem', color:'var(--muted)', marginBottom:'.75rem' }}>
                    Live screenshot of the player's screen. Auto-refreshes every 8 s.
                  </p>
                  <button className="btn" onClick={() => startSpectate(infoPlayer)} disabled={spectateLoading} style={{ marginBottom:'.75rem', width:'100%' }}>
                    {spectateLoading ? 'Capturingâ€¦' : 'ðŸ”„ Refresh'}
                  </button>
                  {spectateErr && <div className="notice error" style={{ marginBottom:'.5rem' }}>{spectateErr}</div>}
                  {spectateLoading && !spectateImg && (
                    <div style={{ textAlign:'center', padding:'2rem', color:'var(--muted)', fontSize:'.82rem' }}>Waiting for captureâ€¦</div>
                  )}
                  {spectateImg && (
                    <div>
                      <img src={spectateImg} alt="Live view" style={{ width:'100%', borderRadius:8, border:'1px solid var(--line)' }} />
                      <a href={spectateImg} target="_blank" rel="noreferrer" className="ghost-button" style={{ marginTop:'.5rem', display:'inline-flex', fontSize:'.75rem' }}>
                        Open full size â†—
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* ACTIONS */}
              {infoTab === 'actions' && (
                <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                  {actionMsg && <div className="notice success">{actionMsg}</div>}
                  {actionErr && <div className="notice error">{actionErr}</div>}

                  {capabilities?.canCreateBans && (
                    <div>
                      <p className="eyebrow" style={{ marginBottom:'.4rem' }}>Kick</p>
                      <input value={kickReason} onChange={e => setKickReason(e.target.value)}
                        placeholder="Reasonâ€¦" style={{ width:'100%', marginBottom:'.4rem' }} />
                      <button className="btn-danger" style={{ width:'100%' }} onClick={doKick}
                        disabled={actLoading || !kickReason.trim()}>
                        {actLoading ? 'Kickingâ€¦' : `Kick ${infoPlayer.name}`}
                      </button>
                    </div>
                  )}

                  {capabilities?.canCreateBans && (
                    <div>
                      <p className="eyebrow" style={{ marginBottom:'.4rem' }}>Warn</p>
                      <input value={warnMsg} onChange={e => setWarnMsg(e.target.value)}
                        placeholder="Warning reasonâ€¦" style={{ width:'100%', marginBottom:'.4rem' }} />
                      <button className="btn" style={{ width:'100%' }} onClick={doWarn}
                        disabled={actLoading || !warnMsg.trim()}>
                        {actLoading ? 'Sendingâ€¦' : `Warn ${infoPlayer.name}`}
                      </button>
                    </div>
                  )}

                  {capabilities?.canCreateBans && (
                    <div>
                      <p className="eyebrow" style={{ marginBottom:'.4rem' }}>Ban</p>
                      <input value={banForm.reason} onChange={e => setBanForm(p => ({ ...p, reason:e.target.value }))}
                        placeholder="Ban reasonâ€¦" style={{ width:'100%', marginBottom:'.4rem' }} />
                      <select value={banForm.durationHours}
                        onChange={e => setBanForm(p => ({ ...p, durationHours:Number(e.target.value) }))}
                        style={{ width:'100%', marginBottom:'.4rem' }}>
                        {DURATION_OPTIONS.map(o => <option key={o.hours} value={o.hours}>{o.label}</option>)}
                      </select>
                      <button className="hero-primary btn-danger" style={{ width:'100%' }} onClick={doBan}
                        disabled={actLoading || !banForm.reason.trim()}>
                        {actLoading ? 'Banningâ€¦' : `Confirm Ban â€” ${DURATION_OPTIONS.find(o => o.hours === banForm.durationHours)?.label}`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* INVENTORY */}
              {infoTab === 'inventory' && (
                <div>
                  {invLoading && <div className="skeleton" style={{ height:120 }} />}
                  {!invLoading && inventory?.error && <div className="notice error">{inventory.error}</div>}
                  {!invLoading && inventory && !inventory.error && (
                    inventory.rows?.length
                      ? <div className="table-shell">
                          <table>
                            <thead><tr><th>Item</th><th>Count</th><th>Slot</th></tr></thead>
                            <tbody>
                              {inventory.rows.map((item, i) => (
                                <tr key={i}>
                                  <td><strong>{item.name}</strong></td>
                                  <td>{item.count ?? item.amount ?? 'â€”'}</td>
                                  <td>{item.slot ?? 'â€”'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      : <div className="empty-state"><span>Inventory empty.</span></div>
                  )}
                  {!invLoading && !inventory && (
                    <button onClick={() => loadInventory(infoPlayer)} style={{ width:'100%' }}>Load Inventory</button>
                  )}
                </div>
              )}

            </div>
          </div>
        )}
      </section>

      {noCoords.length > 0 && (
        <section className="panel-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Location unknown</p>
              <h2>Players without coordinates</h2>
            </div>
          </div>
          <div className="map-nocoords-list">
            {noCoords.map(p => (
              <div key={p.src} className="map-nocoords-row" style={{ cursor:'pointer' }} onClick={() => openInfoPanel(p)}>
                <span className="map-nocoords-dot" style={{ background: getRoleColor(p.role) }} />
                <span className="map-nocoords-name">{p.name}</span>
                <span className="map-nocoords-id">#{p.src}</span>
                <span className="map-nocoords-role" style={{ color: getRoleColor(p.role) }}>{p.role || 'user'}</span>
                <span style={{ marginLeft:'auto', fontSize:'.7rem', color:'var(--accent)' }}>Inspect â†’</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

