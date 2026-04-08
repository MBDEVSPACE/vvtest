import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import multer from 'multer'

const router = Router()
const uploadsDir = path.resolve(process.cwd(), 'uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg')
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
    cb(null, name)
  }
})

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1
  }
})

router.post('/', upload.single('files[]'), (req, res) => {
  const expected = process.env.UPLOAD_SECRET
  if (expected && req.headers['x-upload-secret'] !== expected) {
    return res.status(401).json({ error: 'invalid_upload_secret' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'file_required' })
  }

  const baseUrl = process.env.UPLOAD_PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}/uploads`
  const url = `${baseUrl}/${req.file.filename}`

  return res.json({
    url,
    files: [{ url, filename: req.file.filename }]
  })
})

export default router
