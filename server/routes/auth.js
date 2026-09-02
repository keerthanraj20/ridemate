import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { db } from '../db.js'
import { hashPassword, verifyPassword, publicUser } from '../util.js'
import { sendMail } from '../mail.js'

const router = Router()

// Read env values lazily (at call time) — routes are imported before
// dotenv loads, so a module-level constant would capture `undefined`.
const SECRET = () => process.env.JWT_SECRET
const CLIENT_URL = () => process.env.CLIENT_URL || 'http://localhost:5173'

export function sign(u) {
  return jwt.sign({ id: u.id }, SECRET(), { expiresIn: '7d' })
}

export function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Please log in first' })
  try {
    req.user = jwt.verify(token, SECRET())
    next()
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' })
  }
}

router.post('/register', (req, res) => {
  const { name, email, phone, password } = req.body || {}
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Enter your full name' })
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' })
  if (!phone || phone.trim().length < 6) return res.status(400).json({ error: 'Enter a valid phone number' })
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

  const exists = db.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').get(email.trim())
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' })

  const info = db
    .prepare('INSERT INTO users (name,email,phone,password_hash) VALUES (?,?,?,?)')
    .run(name.trim(), email.trim().toLowerCase(), phone.trim(), hashPassword(password))

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(info.lastInsertRowid))
  res.json({ token: sign(user), user: publicUser(user) })
})

router.post('/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(email).trim())
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: 'Wrong email or password' })
  res.json({ token: sign(user), user: publicUser(user) })
})

router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: publicUser(user) })
})

// ---- Password reset: request token ----
router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Enter your email' })
  const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(String(email).trim())
  if (!user) return res.json({ message: 'If that email exists, a reset link was sent' })

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  db.prepare("INSERT INTO reset_tokens (user_id, token, type, expires_at) VALUES (?,?,'reset',?)").run(user.id, token, expires)

  const resetUrl = `${CLIENT_URL()}/reset-password?token=${token}`
  sendMail({
    to: user.email,
    subject: 'RideMate — Reset your password',
    text: `Hi ${user.name},\n\nClick the link below to reset your password (valid 30 min):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  })

  res.json({ message: 'If that email exists, a reset link was sent' })
})

// ---- Password reset: complete ----
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body || {}
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

  const row = db
    .prepare("SELECT * FROM reset_tokens WHERE token=? AND type='reset' AND used=0 AND expires_at > datetime('now')")
    .get(token)

  if (!row) return res.status(400).json({ error: 'Invalid or expired token' })

  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), row.user_id)
  db.prepare('UPDATE reset_tokens SET used=1 WHERE id=?').run(row.id)
  res.json({ message: 'Password updated, you can now log in' })
})

// ---- Email verification: send verification link ----
router.post('/verify-email', auth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (user.email_verified) return res.json({ message: 'Email already verified' })

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  db.prepare("INSERT INTO reset_tokens (user_id, token, type, expires_at) VALUES (?,?,'verify',?)").run(user.id, token, expires)

  const verifyUrl = `${CLIENT_URL()}/verify-email?token=${token}`
  await sendMail({
    to: user.email,
    subject: 'RideMate — Verify your email',
    text: `Hi ${user.name},\n\nClick below to verify your email (valid 24h):\n\n${verifyUrl}\n\nIf you didn't register, ignore this email.`,
  })

  res.json({ message: 'Verification email sent' })
})

// ---- Email verification: confirm token ----
router.post('/verify-email/confirm', (req, res) => {
  const { token } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Token is required' })

  const row = db
    .prepare("SELECT * FROM reset_tokens WHERE token=? AND type='verify' AND used=0 AND expires_at > datetime('now')")
    .get(token)
  if (!row) return res.status(400).json({ error: 'Invalid or expired token' })

  db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id)
  db.prepare('UPDATE reset_tokens SET used=1 WHERE id=?').run(row.id)
  res.json({ message: 'Email verified' })
})

export default router
