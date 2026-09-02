import { Router } from 'express'
import { db } from '../db.js'
import { auth } from './auth.js'
import { publicUser } from '../util.js'

const router = Router()

router.get('/profile', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const ridesOffered = db.prepare('SELECT COUNT(*) AS c FROM rides WHERE user_id=?').get(req.user.id).c
  const ridesJoined = db.prepare("SELECT COUNT(*) AS c FROM requests WHERE rider_id=? AND status='accepted'").get(req.user.id).c

  const avgRow = db.prepare('SELECT AVG(stars) AS avg, COUNT(*) AS c FROM ratings WHERE to_user_id=?').get(req.user.id)

  const recentRatings = db
    .prepare(
      `SELECT r.*, u.name AS from_name FROM ratings r
       JOIN users u ON u.id = r.from_user_id
       WHERE r.to_user_id=? ORDER BY r.created_at DESC LIMIT 10`
    )
    .all(req.user.id)

  res.json({
    user: publicUser(user),
    stats: {
      ridesOffered,
      ridesJoined,
      avgRating: avgRow.avg ? Math.round(avgRow.avg * 10) / 10 : null,
      totalRatings: avgRow.c,
    },
    recentRatings,
    verification: {
      hasPhone: Boolean(user.phone && user.phone.trim().length >= 6),
      hasBio: Boolean(user.bio && user.bio.trim()),
      emailVerified: Boolean(user.email_verified),
      phoneVerified: Boolean(user.phone_verified),
      ridesOffered,
      ridesJoined,
    },
  })
})

router.put('/profile', auth, (req, res) => {
  const { name, phone, bio } = req.body || {}
  if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name must be at least 2 characters' })
  if (!phone || phone.trim().length < 6) return res.status(400).json({ error: 'Enter a valid phone number' })

  db.prepare('UPDATE users SET name=?, phone=?, bio=? WHERE id=?').run(
    name.trim(),
    phone.trim(),
    String(bio || '').trim().slice(0, 300),
    req.user.id
  )

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  res.json({ user: publicUser(user) })
})

// ---- Upload / update profile avatar (base64 data-URI or raw base64) ----
// Only raster formats are accepted. SVG (and any other markup-carrying type)
// is rejected because a data-URI SVG can embed script and is an XSS vector.
const ALLOWED_AVATAR_MIMES = new Set([
  'data:image/png;base64,',
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/webp;base64,',
  'data:image/gif;base64,',
])

router.put('/profile/avatar', auth, (req, res) => {
  const { avatar } = req.body || {}
  if (!avatar) return res.status(400).json({ error: 'No image provided' })

  const trimmed = String(avatar).trim()
  if (!ALLOWED_AVATAR_MIMES.has(trimmed.slice(0, trimmed.indexOf(',') + 1)))
    return res.status(400).json({ error: 'Avatar must be a PNG, JPEG, WebP or GIF image' })

  // Enforce ~1 MB max (base64 string length)
  if (trimmed.length > 1_400_000) return res.status(400).json({ error: 'Image must be under 1 MB' })

  db.prepare('UPDATE users SET avatar=? WHERE id=?').run(trimmed, req.user.id)
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  res.json({ user: publicUser(user) })
})

export default router
