import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import rideRoutes from './routes/rides.js'
import profileRoutes from './routes/profile.js'
import notificationRoutes from './routes/notifications.js'

if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set — using dev fallback. Set JWT_SECRET in production!')
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'RideMate API' }))
app.use('/api/auth', authRoutes)
app.use('/api', rideRoutes)
app.use('/api', profileRoutes)
app.use('/api', notificationRoutes)

// 404 + error handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }))
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side' })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`🚗 RideMate API running at http://localhost:${PORT}`))
