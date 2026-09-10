import { Router } from 'express'
import crypto from 'node:crypto'
import { all, get, run } from '../db.js'
import { auth, requireAdmin } from './auth.js'
import { sendMail } from '../mail.js'
import { sendSms } from '../sms.js'
import { meUser, isBlocked } from '../util.js'
import { exportCsv } from '../backup.js'

const router = Router()

function randomDigits(n) {
  return crypto.randomInt(0, 10 ** n).toString().padStart(n, '0')
}

// ---------- Phone verification (OTP) ----------
// Sends the code by SMS in production (provider configured via SMS_*.env vars).
// The email copy is kept as a delivery fallback and for dev-mail, so the flow
// stays testable end-to-end without an SMS gateway.
router.post('/phone/send-code', auth, async (req, res) => {
  const phone = String(req.body?.phone || req.user.phone || '').trim()
  if (phone.length < 6) return res.status(400).json({ error: 'Enter a valid phone number' })

  const code = randomDigits(6)
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  await run('INSERT INTO phone_verifications (user_id, code, expires_at) VALUES (?,?,?)', [req.user.id, code, expires])

  sendSms(phone, `SaathYaan: your phone verification code is ${code}. It expires in 10 minutes.`)

  sendMail({
    to: req.user.email,
    subject: 'SaathYaan — Verify your phone',
    text: `Hi ${req.user.name},\n\nYour phone verification code is: ${code}\n\nIt expires in 10 minutes.`,
  })

  res.json({ message: 'Verification code sent' })
})

// Max verification attempts per code before it's invalidated (brute-force guard).
const OTP_MAX_ATTEMPTS = 5

router.post('/phone/verify', auth, async (req, res) => {
  const code = String(req.body?.code || '').trim()
  if (!code) return res.status(400).json({ error: 'Enter the code' })

  const row = await get(
    "SELECT * FROM phone_verifications WHERE user_id=? AND used=0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1",
    [req.user.id]
  )
  if (!row) return res.status(400).json({ error: 'Invalid or expired code' })

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await run('UPDATE phone_verifications SET used=1 WHERE id=?', [row.id])
    return res.status(400).json({ error: 'Too many attempts. Request a new code.' })
  }

  if (row.code !== code) {
    const next = row.attempts + 1
    // Consume the code on the final allowed attempt so it can't keep being spammed.
    await run(
      next >= OTP_MAX_ATTEMPTS
        ? 'UPDATE phone_verifications SET attempts=?, used=1 WHERE id=?'
        : 'UPDATE phone_verifications SET attempts=? WHERE id=?',
      [next, row.id]
    )
    const message = next >= OTP_MAX_ATTEMPTS
      ? 'Too many attempts. Request a new code.'
      : 'Invalid or expired code'
    return res.status(400).json({ error: message })
  }

  await run('UPDATE phone_verifications SET used=1 WHERE id=?', [row.id])
  await run('UPDATE users SET phone_verified=1 WHERE id=?', [req.user.id])

  const user = await get('SELECT * FROM users WHERE id=?', [req.user.id])
  res.json({ user: meUser(user), message: 'Phone verified!' })
})

// ---------- Reports ----------
router.post('/users/:id/report', auth, async (req, res) => {
  const reportedId = Number(req.params.id)
  if (reportedId === req.user.id) return res.status(400).json({ error: 'You cannot report yourself' })

  const target = await get('SELECT id FROM users WHERE id=?', [reportedId])
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (req.user.is_admin) return res.status(400).json({ error: 'Admins cannot report' })

  const reason = String(req.body?.reason || '').trim().slice(0, 100)
  if (!reason) return res.status(400).json({ error: 'Choose or enter a reason' })
  const details = String(req.body?.details || '').trim().slice(0, 1000)
  const rideId = Number.isFinite(Number(req.body?.ride_id)) ? Number(req.body.ride_id) : null

  const existing = await get(
    "SELECT id FROM reports WHERE reporter_id=? AND reported_id=? AND (? IS NULL OR ride_id=?)",
    [req.user.id, reportedId, rideId, rideId]
  )
  if (existing) return res.status(409).json({ error: 'You already reported this user for this' })

  await run('INSERT INTO reports (reporter_id, reported_id, ride_id, reason, details) VALUES (?,?,?,?,?)', [
    req.user.id, reportedId, rideId, reason, details || null,
  ])

  res.json({ ok: true, message: 'Report submitted. Our team will review it.' })
})

// ---------- Blocks ----------
router.post('/users/:id/block', auth, async (req, res) => {
  const blockedId = Number(req.params.id)
  if (blockedId === req.user.id) return res.status(400).json({ error: 'You cannot block yourself' })

  const target = await get('SELECT id FROM users WHERE id=?', [blockedId])
  if (!target) return res.status(404).json({ error: 'User not found' })

  await run('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?,?)', [req.user.id, blockedId])
  res.json({ ok: true, message: 'User blocked. They can no longer message or request your rides.' })
})

router.delete('/users/:id/block', auth, async (req, res) => {
  await run('DELETE FROM blocked_users WHERE blocker_id=? AND blocked_id=?', [req.user.id, Number(req.params.id)])
  res.json({ ok: true, message: 'User unblocked.' })
})

// Helper pushed through to messaging/booking endpoints (centralized block logic)
export { isBlocked }

// ---------- Account deletion (anonymize to preserve ride history/ratings) ----------
router.delete('/account', auth, async (req, res) => {
  const userId = req.user.id

  // Invalidate active reset/verify tokens.
  await run('UPDATE reset_tokens SET used=1 WHERE user_id=?', [userId])

  // Anonymize PII while keeping the row so FK references (rides, requests,
  // messages, ratings) stay valid.
  const fakeEmail = `deleted-${userId}-${Date.now()}@deleted.saathyaan.local`
  await run(
    "UPDATE users SET name='Deleted User', email=?, phone='', bio='', avatar=NULL, email_verified=0, phone_verified=0, is_suspended=1 WHERE id=?",
    [fakeEmail, userId]
  )

  // Clear notifications and saved routes (user-owned, no history value).
  await run('DELETE FROM notifications WHERE user_id=?', [userId])
  await run('DELETE FROM saved_routes WHERE user_id=?', [userId])
  await run('DELETE FROM phone_verifications WHERE user_id=?', [userId])

  res.clearCookie('rm_token')
  res.json({ ok: true, message: 'Account deleted. Your personal data has been removed.' })
})

// ---------- Admin: moderation ----------
router.get('/admin/reports', auth, requireAdmin, async (req, res) => {
  const reports = await all(
    `SELECT rp.*, u1.name AS reporter_name, u2.name AS reported_name
     FROM reports rp
     JOIN users u1 ON u1.id=rp.reporter_id
     JOIN users u2 ON u2.id=rp.reported_id
     ORDER BY CASE rp.status WHEN 'open' THEN 0 ELSE 1 END, rp.created_at DESC
     LIMIT 200`
  )
  res.json({ reports })
})

router.post('/admin/reports/:id/action', auth, requireAdmin, async (req, res) => {
  const reportId = Number(req.params.id)
  const report = await get('SELECT * FROM reports WHERE id=?', [reportId])
  if (!report) return res.status(404).json({ error: 'Report not found' })

  const { action, status } = req.body || {}
  // action: 'suspend' | 'unsuspend' | 'dismiss-details'
  // status: 'reviewed' | 'actioned' | 'dismissed'
  if (action === 'suspend') {
    await run('UPDATE users SET is_suspended=1 WHERE id=?', [report.reported_id])
    await run("UPDATE reports SET status='actioned' WHERE id=?", [reportId])
  } else if (action === 'unsuspend') {
    await run('UPDATE users SET is_suspended=0 WHERE id=?', [report.reported_id])
    await run("UPDATE reports SET status='reviewed' WHERE id=?", [reportId])
  } else if (status && ['reviewed', 'actioned', 'dismissed'].includes(status)) {
    await run('UPDATE reports SET status=? WHERE id=?', [status, reportId])
  } else {
    return res.status(400).json({ error: 'Provide an action (suspend/unsuspend) or a status' })
  }

  res.json({ ok: true })
})

// ---------- Admin: dashboard stats ----------
router.get('/admin/stats', auth, requireAdmin, async (req, res) => {
  const usersRow = await get('SELECT COUNT(*) AS c FROM users')
  const ridesRow = await get("SELECT COUNT(*) AS c FROM rides WHERE status='open'")
  const completedRow = await get("SELECT COUNT(*) AS c FROM rides WHERE status='completed'")
  const openReportsRow = await get("SELECT COUNT(*) AS c FROM reports WHERE status='open'")
  const pendingVerifyRow = await get("SELECT COUNT(*) AS c FROM id_verifications WHERE status='pending'")
  const openSosRow = await get("SELECT COUNT(*) AS c FROM sos_alerts WHERE status='open'")
  const capturedRow = await get("SELECT COALESCE(SUM(amount_paise),0) AS c FROM escrow_payments WHERE status='captured'")
  res.json({
    stats: {
      users: usersRow.c, openRides: ridesRow.c, completedRides: completedRow.c,
      openReports: openReportsRow.c, pendingVerify: pendingVerifyRow.c, openSos: openSosRow.c,
      escrowHeld: Math.round(capturedRow.c / 100),
    },
  })
})

// ---------- Admin: CSV export ----------
router.get('/admin/export/:table', auth, requireAdmin, async (req, res) => {
  const table = req.params.table
  const plans = {
    users: ['id', 'name', 'email', 'phone', 'id_verified', 'credit_balance', 'created_at'],
    rides: ['id', 'user_id', 'vehicle_type', 'from_name', 'to_name', 'depart_at', 'seats_total', 'price', 'status', 'created_at'],
    payments: ['id', 'ride_id', 'payer_id', 'payee_id', 'amount_paise', 'currency', 'status', 'provider', 'created_at'],
  }
  const columns = plans[table]
  if (!columns) return res.status(404).json({ error: 'Unknown export' })
  res.type('text/csv').attachment(`${table}.csv`).send(await exportCsv(table, columns))
})

export default router