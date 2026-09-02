import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import rideRoutes from './routes/rides.js'
import profileRoutes from './routes/profile.js'
import notificationRoutes from './routes/notifications.js'
import { startRecurringScheduler } from './recur.js'

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set — using dev fallback. Set JWT_SECRET in production!')
}

const app = express()
app.use(cors())
app.use(express.json())

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,                    // 10 attempts per window
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 min
  max: 60,                    // 60 requests per min
  message: { error: 'Too many requests, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
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

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`🚗 RideMate API running at http://localhost:${PORT}`)
  startRecurringScheduler()
})
