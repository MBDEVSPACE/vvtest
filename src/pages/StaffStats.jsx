import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmt(v) {
  if (!v) return '-'
  const s = String(v).replace(' ', 'T')
  const hasZ = s.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(s)
  const d = new Date(hasZ ? s : s + 'Z')
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString()
}

function fmtPlaytime(seconds) {
  const s = Number(seconds || 0)
  if (s === 0) return 'â€”'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// Trust score: 0-100. Starts at 100, penalises abuse rate (revoked/total bans)
// and rewards activity (closed reports, playtime). Clamped 0-100.
function calcTrust(row) {
  const revoked   = Number(row.bans_revoked_total || 0)
  const total     = Number(row.bans_total         || 0)
  const closed    = Number(row.reports_closed     || 0)
  const playtime  = Number(row.playtime_seconds   || 0)

  // Abuse penalty: each % of revoked bans costs 3 trust points (capped at 50)
  const abuseRate  = total > 0 ? revoked / total : 0
  const abusePen   = Math.min(50, Math.round(abuseRate * 300))

  // Activity bonus: capped at +10 for active staff
  const actBonus   = Math.min(10, Math.floor(closed / 5) + Math.floor(playtime / 3600))

  return Math.max(0, Math.min(100, 100 - abusePen + actBonus))
}

function TrustBar({ score }) {
  const color =
    score >= 80 ? '#41c995' :
    score >= 55 ? '#fbbf24' :
    score >= 30 ? '#fb923c' : '#f87171'
  const label =
    score >= 80 ? 'Trusted'  :
    score >= 55 ? 'Caution'  :
    score >= 30 ? 'At Risk'  : 'Flagged'
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
        <span style={{ fontSize:'.62rem', color, fontWeight:700, letterSpacing:'.04em' }}>{label}</span>
        <span style={{ fontSize:'.68rem', color, fontWeight:800 }}>{score}</span>
      </div>
      <div style={{ height:5, borderRadius:3, background:'rgba(255,255,255,.08)', overflow:'hidden' }}>
        <div style={{
          height:'100%', width:`${score}%`, borderRadius:3,
          background:`linear-gradient(90deg,${color}cc,${color})`,
          transition:'width .5s ease'
        }} />
      </div>
    </div>
  )
}

function Bar({ value, max, color }) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, minWidth:64 }}>
      <span style={{
        display:'inline-block', height:4,
        width: pct + '%', maxWidth: 72, minWidth: value > 0 ? 3 : 0,
        background: color, borderRadius:2, opacity:.65,
        transition:'width .4s ease'
      }} />
      <strong style={{ minWidth:20, textAlign:'right', fontSize:'.82rem' }}>{value}</strong>
    </span>
  )
}

// Render a linked Discord avatar + steam hex for podium cards
function IdentChips({ discordId, steamHex }) {
  return (
    <div style={{ display:'flex', gap:5, flexWrap:'wrap', justifyContent:'center', marginTop:6 }}>
      {discordId ? (
        <a href={`https://discord.com/users/${discordId}`} target="_blank" rel="noreferrer"
          style={{
            display:'inline-flex', alignItems:'center', gap:4,
            padding:'2px 8px', borderRadius:99, fontSize:'.67rem', fontWeight:700,
            background:'rgba(88,101,242,.22)', border:'1px solid rgba(88,101,242,.5)', color:'#818cf8',
            textDecoration:'none'
          }}>
          <i className="fa-brands fa-discord" style={{ fontSize:'.72rem' }} />
          {discordId}
        </a>
      ) : null}
      {steamHex ? (
        <span style={{
          display:'inline-flex', alignItems:'center', gap:4,
          padding:'2px 8px', borderRadius:99, fontSize:'.67rem', fontWeight:700,
          background:'rgba(32,156,215,.15)', border:'1px solid rgba(32,156,215,.38)', color:'#38bdf8'
        }}>
          <i className="fa-brands fa-steam" style={{ fontSize:'.72rem' }} />
          {steamHex.slice(-8)}
        </span>
      ) : null}
    </div>
  )
}

// â”€â”€â”€ constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const RANK_STYLE = [
  { bg:'linear-gradient(135deg,rgba(251,191,36,.22),rgba(251,191,36,.06))', border:'rgba(251,191,36,.5)', badge:'ðŸ¥‡ 1st', color:'#fbbf24', glow:'rgba(251,191,36,.35)' },
  { bg:'linear-gradient(135deg,rgba(148,163,184,.18),rgba(148,163,184,.05))', border:'rgba(148,163,184,.38)', badge:'ðŸ¥ˆ 2nd', color:'#cbd5e1', glow:'rgba(148,163,184,.25)' },
  { bg:'linear-gradient(135deg,rgba(180,120,60,.18),rgba(180,120,60,.05))',    border:'rgba(180,120,60,.4)',  badge:'ðŸ¥‰ 3rd', color:'#d97706', glow:'rgba(180,120,60,.3)'  },
]

const SORT_OPTS = [
  { key:'total_actions',    label:'Total'    },
  { key:'playtime_seconds', label:'Playtime' },
  { key:'reports_closed',   label:'Closed'   },
  { key:'reports_claimed',  label:'Claimed'  },
  { key:'bans_issued',      label:'Bans'     },
  { key:'warns',            label:'Warns'    },
  { key:'mutes',            label:'Mutes'    },
]

const PERIOD_OPTS = [
  { key:'all', label:'All Time' },
  { key:'30d', label:'30 Days'  },
  { key:'7d',  label:'7 Days'   },
]

const STAT_COLS = [
  { key:'reports_claimed', label:'Claimed', color:'#34d399'            },
  { key:'reports_closed',  label:'Closed',  color:'var(--accent)'      },
  { key:'bans_issued',     label:'Bans',    color:'var(--danger)'      },
  { key:'warns',           label:'Warns',   color:'var(--accent-warm)' },
  { key:'mutes',           label:'Mutes',   color:'#60a5fa'            },
]

const GRID = '52px minmax(175px,1fr) 82px repeat(5,minmax(62px,1fr)) 110px 84px 130px'

// â”€â”€â”€ main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function StaffStats() {
  const { user } = useAuth()
  const [rows,         setRows]         = useState([])
  const [reportStats,  setReportStats]  = useState(null)
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [period,       setPeriod]       = useState('7d')
  const [sortKey,      setSortKey]      = useState('reports_closed')
  const [closerPeriod, setCloserPeriod] = useState('7d')

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get('/api/admin/stats/staff', { params: { period } })
      .then(({ data }) => setRows(data.rows || []))
      .catch(() => setError('Failed to load. Check audit permissions.'))
      .finally(() => setLoading(false))
  }, [period])

  useEffect(() => {
    api.get('/api/admin/stats/reports')
      .then(({ data }) => setReportStats(data))
      .catch(() => {/* non-fatal */})
  }, [])

  const sorted = useMemo(() =>
    [...rows].sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0)),
    [rows, sortKey]
  )

  const maxOf  = key => Math.max(1, ...rows.map(r => Number(r[key] || 0)))
  const maxMap = useMemo(() => Object.fromEntries(STAT_COLS.map(c => [c.key, maxOf(c.key)])), [rows])
  const maxTotal    = useMemo(() => maxOf('total_actions'),    [rows])
  const maxPlaytime = useMemo(() => maxOf('playtime_seconds'), [rows])

  const totals = useMemo(() => rows.reduce((a, r) => ({
    bans:     a.bans     + Number(r.bans_issued     || 0),
    warns:    a.warns    + Number(r.warns           || 0),
    claimed:  a.claimed  + Number(r.reports_claimed || 0),
    closed:   a.closed   + Number(r.reports_closed  || 0),
    mutes:    a.mutes    + Number(r.mutes           || 0),
    playtime: a.playtime + Number(r.playtime_seconds|| 0),
  }), { bans:0, warns:0, claimed:0, closed:0, mutes:0, playtime:0 }), [rows])

  const myId      = user?.identifier || ''
  const ov        = reportStats?.overview || {}
  const byType    = reportStats?.byType || []
  const topClosers = reportStats?.topClosers?.[closerPeriod] || []
  const maxByType  = Math.max(1, ...byType.map(t => Number(t.total || 0)))

  // Top 3 for the podium
  const podium = sorted.slice(0, 3)

  return (
    <main className="page">
      {/* â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="hero-panel page-hero">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Staff Leaderboard</h1>
          <p className="hero-copy">
            Playtime (AFK-capped), reports, bans and a trust score per staff member.
            {period !== 'all' && <> Showing last <strong>{period}</strong>.</>}
          </p>
        </div>
        <div className="page-hero-stat">
          <span className="eyebrow">Active Staff</span>
          <strong>{rows.length}</strong>
          <p>with recorded activity</p>
        </div>
      </section>

      {/* â”€â”€ Summary tiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'.75rem' }}>
        {[
          { label:'Staff On Board',  value: rows.length,               color:'var(--accent)'      },
          { label:'Total Playtime',  value: fmtPlaytime(totals.playtime), color:'#38bdf8'          },
          { label:'Reports Claimed', value: totals.claimed,            color:'#34d399'            },
          { label:'Reports Closed',  value: totals.closed,             color:'var(--accent)'      },
          { label:'Total Bans',      value: totals.bans,               color:'var(--danger)'      },
          { label:'Total Warns',     value: totals.warns,              color:'var(--accent-warm)' },
          { label:'Total Mutes',     value: totals.mutes,              color:'#60a5fa'            },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ padding:'1.1rem', textAlign:'center' }}>
            <div style={{ fontSize:'1.6rem', fontWeight:800, color, lineHeight:1.1 }}>{value}</div>
            <div style={{ fontSize:'.75rem', color:'var(--muted)', marginTop:4 }}>{label}</div>
          </div>
        ))}
      </section>

      {/* â”€â”€ Podium cards (top 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {podium.length > 0 && (
        <section style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1rem' }}>
          {podium.map((row, i) => {
            const rs    = RANK_STYLE[i]
            const trust = calcTrust(row)
            const initial = String(row.actor_name || '?').trim().charAt(0).toUpperCase()
            return (
              <div key={row.actor_identifier} style={{
                background: rs.bg,
                border:`1px solid ${rs.border}`,
                borderRadius:20,
                padding:'1.5rem 1.25rem',
                textAlign:'center',
                boxShadow:`0 0 28px ${rs.glow}, 0 4px 12px rgba(0,0,0,.25)`,
                position:'relative',
                overflow:'hidden',
              }}>
                {/* rank badge */}
                <div style={{
                  position:'absolute', top:12, right:14,
                  fontSize:'.72rem', fontWeight:800, color: rs.color,
                  background: `${rs.color}18`, border:`1px solid ${rs.border}`,
                  padding:'2px 8px', borderRadius:99, letterSpacing:'.04em'
                }}>{rs.badge}</div>

                {/* avatar */}
                <div style={{
                  width:56, height:56, borderRadius:'50%', margin:'0 auto .75rem',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background:`${rs.color}20`, border:`2px solid ${rs.border}`,
                  fontSize:'1.5rem', fontWeight:800, color: rs.color
                }}>{initial}</div>

                <div style={{ fontWeight:800, fontSize:'1.05rem', marginBottom:2 }}>{row.actor_name}</div>
                <div style={{ fontSize:'.72rem', color:'var(--muted)', marginBottom:8, wordBreak:'break-all' }}>
                  {row.actor_identifier}
                </div>

                {/* Discord + Steam */}
                <IdentChips discordId={row.discord_id} steamHex={row.steam_hex} />

                {/* Trust score */}
                <div style={{ marginTop:12, marginBottom:12 }}>
                  <TrustBar score={trust} />
                </div>

                {/* Key stats grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'.4rem', marginTop:4 }}>
                  {[
                    { label:'Playtime',  value: fmtPlaytime(row.playtime_seconds), color:'#38bdf8' },
                    { label:'Closed',    value: Number(row.reports_closed||0),     color:'var(--accent)' },
                    { label:'Bans',      value: Number(row.bans_issued||0),         color:'var(--danger)' },
                    { label:'Warns',     value: Number(row.warns||0),               color:'var(--accent-warm)' },
                    { label:'Mutes',     value: Number(row.mutes||0),               color:'#60a5fa' },
                    { label:'Actions',   value: Number(row.total_actions||0),       color: rs.color },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      padding:'.4rem .3rem', borderRadius:8,
                      background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)'
                    }}>
                      <div style={{ fontSize:'.95rem', fontWeight:800, color }}>{value}</div>
                      <div style={{ fontSize:'.62rem', color:'var(--muted)', marginTop:1 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* Abuse rate */}
                {Number(row.bans_total||0) > 0 && (
                  <div style={{ marginTop:10, fontSize:'.72rem', color:'var(--muted)' }}>
                    Revoked bans: {' '}
                    <strong style={{ color: Number(row.bans_revoked_total||0) > 0 ? '#fb923c' : '#41c995' }}>
                      {Number(row.bans_revoked_total||0)}/{Number(row.bans_total||0)}
                      {' '}({Math.round((Number(row.bans_revoked_total||0)/Number(row.bans_total||1))*100)}%)
                    </strong>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}

      {/* â”€â”€ Reports overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {reportStats && (
        <section style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
          <div className="panel-card" style={{ padding:'1.2rem 1.4rem' }}>
            <p className="eyebrow" style={{ marginBottom:'.8rem' }}>Report Overview (All Time)</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'.6rem', marginBottom:'1rem' }}>
              {[
                { label:'Total',      value: ov.total,        color:'var(--text)'        },
                { label:'Open',       value: ov.open_count,   color:'#fbbf24'            },
                { label:'All Closed', value: ov.closed_total, color:'#41c995'            },
                { label:'Today',      value: ov.closed_today, color:'var(--accent)'      },
                { label:'This Week',  value: ov.closed_7d,    color:'#38bdf8'            },
                { label:'This Month', value: ov.closed_30d,   color:'#a78bfa'            },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign:'center', padding:'.5rem .4rem', borderRadius:8, background:'rgba(255,255,255,.03)', border:'1px solid var(--line)' }}>
                  <div style={{ fontSize:'1.3rem', fontWeight:800, color, lineHeight:1 }}>{value ?? 'â€”'}</div>
                  <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:3 }}>{label}</div>
                </div>
              ))}
            </div>
            {ov.avg_resolution_hours != null && (
              <div style={{ fontSize:'.8rem', color:'var(--muted)' }}>
                Avg. resolution: <strong style={{ color:'var(--accent)' }}>{Number(ov.avg_resolution_hours).toFixed(1)} h</strong>
              </div>
            )}
            {byType.length > 0 && (
              <div style={{ marginTop:'.9rem' }}>
                <p className="eyebrow" style={{ marginBottom:'.5rem', fontSize:'.65rem' }}>By Type</p>
                {byType.map(t => (
                  <div key={t.report_type} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ width:64, fontSize:'.72rem', color:'var(--muted)', flexShrink:0 }}>{t.report_type}</span>
                    <div style={{ flex:1, height:5, borderRadius:3, background:'rgba(255,255,255,.07)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.round(Number(t.total)/maxByType*100)}%`, background:'var(--accent)', borderRadius:3 }} />
                    </div>
                    <span style={{ fontSize:'.72rem', color:'var(--muted)', minWidth:26, textAlign:'right' }}>{t.total}</span>
                    {Number(t.open_count) > 0 && (
                      <span style={{ fontSize:'.66rem', color:'#fbbf24', minWidth:32 }}>{t.open_count} open</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel-card" style={{ padding:'1.2rem 1.4rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'.8rem' }}>
              <p className="eyebrow" style={{ margin:0 }}>Top Report Closers</p>
              <div style={{ display:'flex', gap:'.3rem' }}>
                {['7d','30d'].map(p => (
                  <button key={p}
                    onClick={() => setCloserPeriod(p)}
                    className={p === closerPeriod ? 'btn active' : 'btn'}
                    style={{ padding:'.28rem .65rem', fontSize:'.72rem', borderRadius:99 }}>
                    {p === '7d' ? '7 Days' : '30 Days'}
                  </button>
                ))}
              </div>
            </div>
            {topClosers.length === 0
              ? <p style={{ color:'var(--muted)', fontSize:'.82rem', textAlign:'center', padding:'1.5rem 0' }}>No data.</p>
              : (
                <div style={{ display:'flex', flexDirection:'column', gap:'.4rem' }}>
                  {topClosers.map((c, i) => {
                    const rs = i < 3 ? RANK_STYLE[i] : null
                    return (
                      <div key={c.actor_identifier} style={{ display:'grid', gridTemplateColumns:'24px 1fr 50px 50px', alignItems:'center', gap:'.5rem', padding:'.45rem .6rem', borderRadius:9, background: rs ? rs.bg : 'rgba(255,255,255,.02)', border:`1px solid ${rs ? rs.border : 'var(--line)'}` }}>
                        <span style={{ fontSize:'.72rem', color: rs ? rs.color : 'var(--muted)', fontWeight:700, textAlign:'center' }}>{rs ? rs.badge : `#${i+1}`}</span>
                        <span style={{ fontSize:'.82rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.actor_name}</span>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:'.78rem', fontWeight:700, color:'var(--accent)' }}>{c.closed ?? 0}</div>
                          <div style={{ fontSize:'.62rem', color:'var(--muted)' }}>closed</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:'.78rem', fontWeight:700, color:'#34d399' }}>{c.claimed ?? 0}</div>
                          <div style={{ fontSize:'.62rem', color:'var(--muted)' }}>claimed</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>
        </section>
      )}

      {/* â”€â”€ Period / Sort controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="panel-card" style={{ padding:'.9rem 1.4rem', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'.75rem' }}>
        <div style={{ display:'flex', gap:'.4rem', alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:'.74rem', color:'var(--muted)', fontWeight:700, letterSpacing:'.06em' }}>PERIOD</span>
          {PERIOD_OPTS.map(o => (
            <button key={o.key} className={o.key === period ? 'btn active' : 'btn'} onClick={() => setPeriod(o.key)} style={{ padding:'.38rem .9rem', fontSize:'.78rem', borderRadius:99 }}>
              {o.label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:'.4rem', alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:'.74rem', color:'var(--muted)', fontWeight:700, letterSpacing:'.06em' }}>SORT BY</span>
          {SORT_OPTS.map(o => (
            <button key={o.key} className={o.key === sortKey ? 'btn active' : 'btn'} onClick={() => setSortKey(o.key)} style={{ padding:'.38rem .9rem', fontSize:'.78rem', borderRadius:99 }}>
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* â”€â”€ Full leaderboard table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="panel-card" style={{ padding:'1.2rem 1.4rem', display:'flex', flexDirection:'column', gap:'.6rem' }}>
        {error   && <p style={{ color:'var(--danger)' }}>{error}</p>}
        {loading && <p style={{ color:'var(--muted)', textAlign:'center', padding:'2rem 0' }}>Loading...</p>}

        {!loading && sorted.length === 0 && !error && (
          <p style={{ textAlign:'center', color:'var(--muted)', padding:'3rem 0' }}>No staff activity recorded yet.</p>
        )}

        {!loading && sorted.length > 0 && <>
          {/* Column headers */}
          <div style={{
            display:'grid', gridTemplateColumns: GRID,
            gap:'1rem', padding:'.3rem 1.1rem .6rem',
            fontSize:'.69rem', fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase',
            color:'var(--muted)', borderBottom:'1px solid var(--line)'
          }}>
            <span>Rank</span>
            <span>Staff</span>
            <span onClick={() => setSortKey('playtime_seconds')} style={{ cursor:'pointer', color: sortKey==='playtime_seconds' ? 'var(--accent)' : undefined }}>
              Playtime{sortKey==='playtime_seconds' ? ' â–¾' : ''}
            </span>
            {STAT_COLS.map(c => (
              <span key={c.key} onClick={() => setSortKey(c.key)} style={{ cursor:'pointer', color: sortKey===c.key ? 'var(--accent)' : undefined }}>
                {c.label}{sortKey===c.key ? ' â–¾' : ''}
              </span>
            ))}
            <span>Trust</span>
            <span onClick={() => setSortKey('total_actions')} style={{ cursor:'pointer', color: sortKey==='total_actions' ? 'var(--accent)' : undefined }}>
              Total{sortKey==='total_actions' ? ' â–¾' : ''}
            </span>
            <span style={{ textAlign:'right' }}>Last Active</span>
          </div>

          {/* Rows */}
          {sorted.map((row, i) => {
            const rank     = i + 1
            const rs       = rank <= 3 ? RANK_STYLE[i] : null
            const isSelf   = myId && row.actor_identifier === myId
            const initial  = String(row.actor_name || '?').trim().charAt(0).toUpperCase()
            const totalPct = Math.max(2, Math.round((Number(row.total_actions) / maxTotal) * 100))
            const ptPct    = Math.max(2, Math.round((Number(row.playtime_seconds) / maxPlaytime) * 100))
            const trust    = calcTrust(row)

            return (
              <div key={row.actor_identifier} style={{
                display:'grid', gridTemplateColumns: GRID,
                alignItems:'center', gap:'1rem', padding:'.8rem 1.1rem',
                borderRadius:18,
                border:`1px solid ${rs ? rs.border : isSelf ? 'rgba(125,227,194,.32)' : 'var(--line)'}`,
                background: rs ? rs.bg : isSelf ? 'linear-gradient(135deg,rgba(125,227,194,.09),transparent)' : 'rgba(255,255,255,.018)',
                transition:'border-color .2s',
              }}>
                {/* Rank */}
                <div style={{ textAlign:'center' }}>
                  {rs
                    ? <span style={{ display:'inline-block', padding:'3px 8px', borderRadius:7, background:rs.bg, border:`1px solid ${rs.border}`, fontSize:'.72rem', fontWeight:800, color:rs.color }}>{rs.badge}</span>
                    : <span style={{ fontSize:'.82rem', color:'var(--muted)', fontWeight:700 }}>#{rank}</span>
                  }
                </div>

                {/* Name + identifiers */}
                <div style={{ display:'flex', alignItems:'center', gap:'.6rem', minWidth:0 }}>
                  <div style={{
                    width:34, height:34, borderRadius:'50%', flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    background: rs ? `${rs.color}22` : 'rgba(125,227,194,.12)',
                    border:`1px solid ${rs ? rs.border : 'rgba(255,255,255,.1)'}`,
                    fontWeight:800, fontSize:'.88rem', color: rs ? rs.color : 'var(--accent)'
                  }}>{initial}</div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:'.88rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.actor_name}
                      {isSelf && <span style={{ marginLeft:6, fontSize:'.65rem', color:'var(--accent)', fontWeight:800 }}>YOU</span>}
                    </div>
                    <div style={{ display:'flex', gap:4, marginTop:3, flexWrap:'wrap' }}>
                      {row.discord_id && (
                        <a href={`https://discord.com/users/${row.discord_id}`} target="_blank" rel="noreferrer"
                          style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'1px 5px', borderRadius:99, fontSize:'.63rem', fontWeight:700, background:'rgba(88,101,242,.2)', border:'1px solid rgba(88,101,242,.45)', color:'#818cf8', textDecoration:'none' }}>
                          <i className="fa-brands fa-discord" style={{ fontSize:'.65rem' }} />
                          {row.discord_id}
                        </a>
                      )}
                      {row.steam_hex && (
                        <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'1px 5px', borderRadius:99, fontSize:'.63rem', fontWeight:700, background:'rgba(32,156,215,.15)', border:'1px solid rgba(32,156,215,.35)', color:'#38bdf8' }}>
                          <i className="fa-brands fa-steam" style={{ fontSize:'.65rem' }} />
                          {row.steam_hex.replace('steam:','').slice(-8)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Playtime */}
                <div>
                  <div style={{ fontWeight:700, fontSize:'.82rem', color:'#38bdf8', whiteSpace:'nowrap' }}>{fmtPlaytime(row.playtime_seconds)}</div>
                  <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,.07)', marginTop:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:ptPct+'%', background:'#38bdf8', borderRadius:2, transition:'width .4s ease', opacity:.65 }} />
                  </div>
                </div>

                {/* Stat bars */}
                {STAT_COLS.map(c => (
                  <Bar key={c.key} value={Number(row[c.key] || 0)} max={maxMap[c.key]} color={c.color} />
                ))}

                {/* Trust score */}
                <TrustBar score={trust} />

                {/* Total */}
                <div>
                  <div style={{ fontWeight:800, fontSize:'1rem', color: rs ? rs.color : 'var(--text)', textAlign:'center' }}>{row.total_actions}</div>
                  <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,.07)', marginTop:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:totalPct+'%', background: rs ? rs.color : 'var(--accent)', borderRadius:2, transition:'width .4s ease' }} />
                  </div>
                </div>

                {/* Last active */}
                <div style={{ fontSize:'.7rem', color:'var(--muted)', textAlign:'right' }}>{fmt(row.last_action_at)}</div>
              </div>
            )
          })}
        </>}
      </section>
    </main>
  )
}

