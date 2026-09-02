import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../db.js'
import { hashPassword, verifyPassword, publicUser } from '../util.js'

const router = Router()
const SECRET = process.env.JWT_SECRET || 'ridemate-dev-secret-change-me'

export function sign(u) {
  return jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' })
}

export function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Please log in first' })
  try {
    req.user = jwt.verify(token, SECRET)
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

export default router
