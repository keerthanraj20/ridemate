import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import rideRoutes from './routes/rides.js'
import profileRoutes from './routes/profile.js'
import notificationRoutes from './routes/notifications.js'
import { startRecurringScheduler } from './recur.js'

// .env lives at the project root (this file is in server/)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Add it to your .env file.')
  process.exit(1)
}

export const app = express()

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173']

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true)
      else cb(new Error('Not allowed by CORS'))
    },
  })
)
app.use(express.json())

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

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'RideMate API' }))
app.use('/api/auth', loginLimiter, authRoutes)
app.use('/api', generalLimiter, rideRoutes)
app.use('/api', generalLimiter, profileRoutes)
app.use('/api', generalLimiter, notificationRoutes)

// 404 + error handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }))
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
