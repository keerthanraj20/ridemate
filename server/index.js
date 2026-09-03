import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import rideRoutes from './routes/rides.js'
import profileRoutes from './routes/profile.js'
import notificationRoutes from './routes/notifications.js'
import safetyRoutes from './routes/safety.js'
import { startRecurringScheduler } from './recur.js'

// .env lives at the project root (this file is in server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Add it to your .env file.')
  process.exit(1)
}

export const app = express()

// Trust a single reverse proxy (e.g. nginx/Caddy) for secure IP/HTTPS
// detection. Set RM_TRUST_PROXY=1 in production.
if (process.env.RM_TRUST_PROXY === '1') app.set('trust proxy', 1)

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173']

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true)
      else cb(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })
)
// 2.5 MB body limit: avatars are uploaded as base64 data-URIs (~1.4x the
// binary size), so the default 100kb limit would reject even a small picture.
app.use(express.json({ limit: '2.5mb' }))

// Security headers (no external dependency)
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
  })
  next()
})

// Minimal structured request logging (timestamp, method, route, status, ms)
app.use((req, res, next) => {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6
    if (process.env.RM_DISABLE_LOG !== '1') {
      console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`)
    }
  })
  next()
})

// Rate limiting (skipped in tests via RM_DISABLE_RATE_LIMIT)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,                    // 10 attempts per window
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.RM_DISABLE_RATE_LIMIT === '1',
})
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 min
  max: 60,                    // 60 requests per min
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.RM_DISABLE_RATE_LIMIT === '1',
})
// Profile avatars are ~1MB uploads, so throttle the upload path harder than
// the general limit to stop a single account flooding large bodies.
const avatarLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 min
  max: 10,                    // 10 avatar uploads per min
  message: { error: 'Too many avatar uploads, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.RM_DISABLE_RATE_LIMIT === '1',
})

// Email/OTP sends should be throttled harder to prevent abuse.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 5,                     // 5 verification codes per window
  message: { error: 'Too many verification codes, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.RM_DISABLE_RATE_LIMIT === '1',
})

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'RideMate API' }))
app.use('/api/auth', loginLimiter, authRoutes)
app.use('/api', generalLimiter, rideRoutes)
app.use('/api/profile/avatar', avatarLimiter)
app.use('/api', generalLimiter, profileRoutes)
app.use('/api', generalLimiter, notificationRoutes)
app.use('/api/phone/send-code', otpLimiter)
app.use('/api', generalLimiter, safetyRoutes)

// Serve the React build in production
const clientDist = path.join(__dirname, '..', 'client', 'dist')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
} else {
  // 404 + error handler (dev mode)
  app.use((req, res) => res.status(404).json({ error: 'Not found' }))
}
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side' })
})

// Only listen when run directly (not when imported by tests)
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => {
    console.log(`🚗 RideMate API running at http://localhost:${PORT}`)
    startRecurringScheduler()
  })
}
