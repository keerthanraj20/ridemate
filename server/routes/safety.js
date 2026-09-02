import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from '../db.js'
import { auth, requireAdmin } from './auth.js'
import { sendMail } from '../mail.js'
import { meUser, isBlocked } from '../util.js'

const router = Router()

function randomDigits(n) {
  return crypto.randomInt(0, 10 ** n).toString().padStart(n, '0')
}

// ---------- Phone verification (OTP) ----------
// In production the OTP would be sent via SMS; here we send it by email
// (dev-mail) so the flow is testable end-to-end without an SMS gateway.
router.post('/phone/send-code', auth, (req, res) => {
  const phone = String(req.body?.phone || req.user.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Enter a valid phone number' })

  const code = randomDigits(6)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO phone_verifications (user_id, code, expires_at) VALUES (?,?,?)').run(req.user.id, code, expires)

  sendMail({
    to: req.user.email,
    subject: 'RideMate — Verify your phone',
    text: `Hi ${req.user.name},\n\nYour phone verification code is: ${code}\n\nIt expires in 10 minutes.`,
  })

  res.json({ message: 'Verification code sent' })
})

router.post('/phone/verify', auth, (req, res) => {
  const code = String(req.body?.code || '').trim()
  if (!code) return res.status(400).json({ error: 'Enter the code' })

  const row = db
    .prepare("SELECT * FROM phone_verifications WHERE user_id=? AND used=0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1")
    .get(req.user.id)
  if (!row || row.code !== code) return res.status(400).json({ error: 'Invalid or expired code' })

  db.prepare('UPDATE phone_verifications SET used=1 WHERE id=?').run(row.id)
  db.prepare('UPDATE users SET phone_verified=1 WHERE id=?').run(req.user.id)

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  res.json({ user: meUser(user), message: 'Phone verified!' })
})

// ---------- Reports ----------
router.post('/users/:id/report', auth, (req, res) => {
  const reportedId = Number(req.params.id)
  if (reportedId === req.user.id) return res.status(400).json({ error: 'You cannot report yourself' })

  const target = db.prepare('SELECT id FROM users WHERE id=?').get(reportedId)
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (req.user.is_admin) return res.status(400).json({ error: 'Admins cannot report' })

  const reason = String(req.body?.reason || '').trim().slice(0, 100)
  if (!reason) return res.status(400).json({ error: 'Choose or enter a reason' })
  const details = String(req.body?.details || '').trim().slice(0, 1000)
  const rideId = Number.isFinite(Number(req.body?.ride_id)) ? Number(req.body.ride_id) : null

  const existing = db
    .prepare("SELECT id FROM reports WHERE reporter_id=? AND reported_id=? AND (? IS NULL OR ride_id=?)")
    .get(req.user.id, reportedId, rideId, rideId)
  if (existing) return res.status(409).json({ error: 'You already reported this user for this' })

  const info = db
    .prepare('INSERT INTO reports (reporter_id, reported_id, ride_id, reason, details) VALUES (?,?,?,?,?)')
    .run(req.user.id, reportedId, rideId, reason, details || null)

  res.json({ ok: true, message: 'Report submitted. Our team will review it.' })
})

// ---------- Blocks ----------
router.post('/users/:id/block', auth, (req, res) => {
  const blockedId = Number(req.params.id)
  if (blockedId === req.user.id) return res.status(400).json({ error: 'You cannot block yourself' })

  const target = db.prepare('SELECT id FROM users WHERE id=?').get(blockedId)
  if (!target) return res.status(404).json({ error: 'User not found' })

  db.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?,?)').run(req.user.id, blockedId)
  res.json({ ok: true, message: 'User blocked. They can no longer message or request your rides.' })
})

router.delete('/users/:id/block', auth, (req, res) => {
  db.prepare('DELETE FROM blocked_users WHERE blocker_id=? AND blocked_id=?').run(req.user.id, Number(req.params.id))
  res.json({ ok: true, message: 'User unblocked.' })
})

// Helper pushed through to messaging/booking endpoints (centralized block logic)
export { isBlocked }

// ---------- Account deletion (anonymize to preserve ride history/ratings) ----------
router.delete('/account', auth, (req, res) => {
  const userId = req.user.id

  // Invalidate active reset/verify tokens.
  db.prepare('UPDATE reset_tokens SET used=1 WHERE user_id=?').run(userId)

  // Anonymize PII while keeping the row so FK references (rides, requests,
  // messages, ratings) stay valid.
  const fakeEmail = `deleted-${userId}-${Date.now()}@deleted.ridemate.local`
  db.prepare(
    "UPDATE users SET name='Deleted User', email=?, phone='', bio='', avatar=NULL, email_verified=0, phone_verified=0, is_suspended=1 WHERE id=?"
  ).run(fakeEmail, userId)

  // Clear notifications and saved routes (user-owned, no history value).
  db.prepare('DELETE FROM notifications WHERE user_id=?').run(userId)
  db.prepare('DELETE FROM saved_routes WHERE user_id=?').run(userId)
  db.prepare('DELETE FROM phone_verifications WHERE user_id=?').run(userId)

  res.clearCookie('rm_token')
  res.json({ ok: true, message: 'Account deleted. Your personal data has been removed.' })
})

// ---------- Admin: moderation ----------
router.get('/admin/reports', auth, requireAdmin, (req, res) => {
  const reports = db
    .prepare(
      `SELECT rp.*, u1.name AS reporter_name, u2.name AS reported_name
       FROM reports rp
       JOIN users u1 ON u1.id=rp.reporter_id
       JOIN users u2 ON u2.id=rp.reported_id
       ORDER BY CASE rp.status WHEN 'open' THEN 0 ELSE 1 END, rp.created_at DESC
       LIMIT 200`
    )
    .all()
  res.json({ reports })
})

router.post('/admin/reports/:id/action', auth, requireAdmin, (req, res) => {
  const reportId = Number(req.params.id)
  const report = db.prepare('SELECT * FROM reports WHERE id=?').get(reportId)
  if (!report) return res.status(404).json({ error: 'Report not found' })

  const { action, status } = req.body || {}
  // action: 'suspend' | 'unsuspend' | 'dismiss-details'
  // status: 'reviewed' | 'actioned' | 'dismissed'
  if (action === 'suspend') {
    db.prepare('UPDATE users SET is_suspended=1 WHERE id=?').run(report.reported_id)
    db.prepare("UPDATE reports SET status='actioned' WHERE id=?").run(reportId)
  } else if (action === 'unsuspend') {
    db.prepare('UPDATE users SET is_suspended=0 WHERE id=?').run(report.reported_id)
    db.prepare("UPDATE reports SET status='reviewed' WHERE id=?").run(reportId)
  } else if (status && ['reviewed', 'actioned', 'dismissed'].includes(status)) {
    db.prepare('UPDATE reports SET status=? WHERE id=?').run(status, reportId)
  } else {
    return res.status(400).json({ error: 'Provide an action (suspend/unsuspend) or a status' })
  }

  res.json({ ok: true })
})

export default router
