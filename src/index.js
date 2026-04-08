import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import helmet from 'helmet'
import session from 'express-session'
import path from 'node:path'
import authRouter, { configureAuth } from './routes/auth.js'
import bansRouter from './routes/bans.js'
import appealsRouter from './routes/appeals.js'
import auditRouter from './routes/audit.js'
import uploadRouter from './routes/uploads.js'
import adminRouter from './routes/admin.js'
import gameRouter from './routes/game.js'
import warningsRouter from './routes/warnings.js'
import { bindUser } from './middleware/auth.js'

dotenv.config()

const app = express()

app.set('trust proxy', 1)

app.use(helmet({
  crossOriginResourcePolicy: false
}))
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}))
app.use(express.json({ limit: '2mb' }))
app.use(session({
  name: 'ti.admin.sid',
  secret: process.env.SESSION_SECRET || 'replace-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 12
  }
}))

configureAuth(app)
app.use(bindUser)

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'admin_web_panel' })
})

app.use('/auth', authRouter)
app.use('/api/bans', bansRouter)
app.use('/api/appeals', appealsRouter)
app.use('/api/audit', auditRouter)
app.use('/api/admin', adminRouter)
app.use('/api/uploads', uploadRouter)
app.use('/api/ingest', gameRouter)
app.use('/api/warnings', warningsRouter)
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')))

// Serve built React frontend (production only)
const distPath = path.resolve(process.cwd(), '..', 'client', 'dist')
app.use(express.static(distPath))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use((err, _req, res, _next) => {
  console.error('[web-panel] unhandled error', err)
  res.status(500).json({ error: 'internal_error' })
})

const port = Number(process.env.PORT || 3050)
app.listen(port, () => {
  console.log(`[web-panel] listening on :${port}`)
})
