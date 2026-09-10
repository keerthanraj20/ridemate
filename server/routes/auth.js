import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { get, run } from '../db.js'
import { hashPassword, verifyPassword, meUser, generateReferralCode } from '../util.js'
import { sendMail } from '../mail.js'

const router = Router()

// Shared password policy: at least 8 chars with a mix of letters and numbers.
export function passwordError(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters'
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers'
  return null
}

// Read env values lazily (at call time) — routes are imported before
// dotenv loads, so a module-level constant would capture `undefined`.
const SECRET = () => process.env.JWT_SECRET
const CLIENT_URL = () => process.env.CLIENT_URL || 'http://localhost:5173'

export function sign(u) {
  return jwt.sign({ id: u.id, is_admin: u.is_admin ? 1 : 0 }, SECRET(), { expiresIn: '7d' })
}

export async function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Please log in first' })
  try {
    const payload = jwt.verify(token, SECRET())
    // Re-check suspension against the DB so bans apply immediately (not
    // waiting for the 7-day token to expire).
    const u = await get('SELECT * FROM users WHERE id=$1', [payload.id])
    if (!u) return res.status(401).json({ error: 'Account not found' })
    if (u.is_suspended) return res.status(403).json({ error: 'This account has been suspended.' })
    req.user = u
    next()
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' })
  }
}

// Mount a router only for admin users. Place BEFORE a generic router.
export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Admins only' })
  next()
}

router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body || {}
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Enter your full name' })
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' })
  if (!phone || phone.trim().length < 6) return res.status(400).json({ error: 'Enter a valid phone number' })
  const pwErr = passwordError(password)
  if (pwErr) return res.status(400).json({ error: pwErr })

  const exists = await get('SELECT id FROM users WHERE lower(email)=lower($1)', [email.trim()])
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' })

  const referralCode = await generateReferralCode()
  const info = await run(
    'INSERT INTO users (name,email,phone,password_hash,email_verified,referral_code) VALUES ($1,$2,$3,$4,0,$5)',
    [name.trim(), email.trim().toLowerCase(), phone.trim(), hashPassword(password), referralCode]
  )

  const user = await get('SELECT * FROM users WHERE id=$1', [Number(info.lastInsertRowid)])
  res.json({ token: sign(user), user: meUser(user) })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
  const user = await get('SELECT * FROM users WHERE lower(email)=lower($1)', [String(email).trim()])
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: 'Wrong email or password' })
  res.json({ token: sign(user), user: meUser(user) })
})

router.get('/me', auth, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id=$1', [req.user.id])
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ user: meUser(user) })
})

// ---- Password reset: request token ----
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {}
  if (!email) return res.status(400).json({ error: 'Enter your email' })
  const user = await get('SELECT * FROM users WHERE lower(email)=lower($1)', [String(email).trim()])
  if (!user) return res.json({ message: 'If that email exists, a reset link was sent' })

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  await run("INSERT INTO reset_tokens (user_id, token, type, expires_at) VALUES ($1,$2,'reset',$3)", [user.id, token, expires])

  const resetUrl = `${CLIENT_URL()}/reset-password?token=${token}`
  await sendMail({
    to: user.email,
    subject: 'SaathYaan — Reset your password',
    text: `Hi ${user.name},\n\nClick the link below to reset your password (valid 30 min):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  })

  res.json({ message: 'If that email exists, a reset link was sent' })
})

// ---- Password reset: complete ----
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {}
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' })
  const pwErr = passwordError(password)
  if (pwErr) return res.status(400).json({ error: pwErr })

  const row = await get(
    "SELECT * FROM reset_tokens WHERE token=$1 AND type='reset' AND used=0 AND expires_at > NOW()",
    [token]
  )

  if (!row) return res.status(400).json({ error: 'Invalid or expired token' })

  await run('UPDATE users SET password_hash=$1 WHERE id=$2', [hashPassword(password), row.user_id])
  await run('UPDATE reset_tokens SET used=1 WHERE id=$1', [row.id])
  res.json({ message: 'Password updated, you can now log in' })
})

// ---- Email verification: send verification link ----
router.post('/verify-email', auth, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id=$1', [req.user.id])
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (user.email_verified) return res.json({ message: 'Email already verified' })

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  await run("INSERT INTO reset_tokens (user_id, token, type, expires_at) VALUES ($1,$2,'verify',$3)", [user.id, token, expires])

  const verifyUrl = `${CLIENT_URL()}/verify-email?token=${token}`
  await sendMail({
    to: user.email,
    subject: 'SaathYaan — Verify your email',
    text: `Hi ${user.name},\n\nClick below to verify your email (valid 24h):\n\n${verifyUrl}\n\nIf you didn't register, ignore this email.`,
  })

  res.json({ message: 'Verification email sent' })
})

// ---- Email verification: confirm token ----
router.post('/verify-email/confirm', async (req, res) => {
  const { token } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Token is required' })

  const row = await get(
    "SELECT * FROM reset_tokens WHERE token=$1 AND type='verify' AND used=0 AND expires_at > NOW()",
    [token]
  )
  if (!row) return res.status(400).json({ error: 'Invalid or expired token' })

  await run('UPDATE users SET email_verified=1 WHERE id=$1', [row.user_id])
  await run('UPDATE reset_tokens SET used=1 WHERE id=$1', [row.id])
  res.json({ message: 'Email verified' })
})

export default router