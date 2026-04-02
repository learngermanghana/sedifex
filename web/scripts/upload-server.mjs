import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const uploadsDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(projectRoot, 'public', 'uploads')
const port = Number(process.env.UPLOAD_SERVER_PORT || 8787)

fs.mkdirSync(uploadsDir, { recursive: true })

const MAX_BYTES = 5 * 1024 * 1024

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

function getExtension(filename, mimeType) {
  const fromName = path.extname(filename || '').toLowerCase()
  if (fromName && fromName.length <= 10) return fromName
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  return '.jpg'
}

const server = http.createServer((req, res) => {
  if (!req.url) return sendJson(res, 400, { error: 'Missing URL' })

  if (req.method === 'OPTIONS' && req.url === '/api/uploads') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
    const filename = path.basename(req.url.replace('/uploads/', ''))
    const filePath = path.join(uploadsDir, filename)
    if (!fs.existsSync(filePath)) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    const stream = fs.createReadStream(filePath)
    stream.on('error', () => {
      res.writeHead(500)
      res.end('Failed to read file')
    })
    stream.pipe(res)
    return
  }

  if (req.method !== 'POST' || req.url !== '/api/uploads') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  let raw = ''
  req.on('data', chunk => {
    raw += chunk.toString('utf8')
    if (raw.length > MAX_BYTES * 2) {
      req.destroy()
    }
  })
  req.on('end', () => {
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON payload' })
      return
    }

    const mimeType = typeof payload?.mimeType === 'string' ? payload.mimeType : ''
    const filename = typeof payload?.filename === 'string' ? payload.filename : ''
    const dataBase64 = typeof payload?.dataBase64 === 'string' ? payload.dataBase64 : ''

    if (!mimeType.startsWith('image/')) {
      sendJson(res, 400, { error: 'Only image files are allowed' })
      return
    }

    if (!dataBase64) {
      sendJson(res, 400, { error: 'Missing image data' })
      return
    }

    const fileBuffer = Buffer.from(dataBase64, 'base64')
    if (fileBuffer.length === 0 || fileBuffer.length > MAX_BYTES) {
      sendJson(res, 400, { error: 'Image must be between 1 byte and 5MB' })
      return
    }

    const extension = getExtension(filename, mimeType)
    const generatedName = `${Date.now()}-${crypto.randomUUID()}${extension}`
    const outputPath = path.join(uploadsDir, generatedName)
    fs.writeFileSync(outputPath, fileBuffer)

  const publicBaseUrl =
    typeof process.env.PUBLIC_BASE_URL === 'string' && process.env.PUBLIC_BASE_URL.trim()
      ? process.env.PUBLIC_BASE_URL.trim().replace(/\/$/, '')
      : ''
    const imageUrl = `${publicBaseUrl}/uploads/${generatedName}`
    sendJson(res, 201, { url: imageUrl })
  })
  req.on('error', error => {
    console.error('[upload-server] upload failed', error)
    sendJson(res, 500, { error: 'Upload failed' })
  })
})

server.listen(port, () => {
  console.log(`[upload-server] listening on http://localhost:${port}`)
  console.log(`[upload-server] serving files from ${uploadsDir}`)
})
