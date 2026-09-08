import { Router } from 'express'
import { db } from '../db.js'
import { auth } from './auth.js'
import { publicUser, streakWeeks, addCredit } from '../util.js'
import { notify } from '../notify.js'

const router = Router()

// ---------- referrals ----------
// My outreach code + ledger + how many people I brought in.
router.get('/referral', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  const ledger = db
    .prepare('SELECT id, amount, reason, created_at FROM credit_ledger WHERE user_id=? ORDER BY id DESC LIMIT 50')
    .all(req.user.id)
  const invited = db
    .prepare('SELECT id, name, created_at FROM users WHERE referred_by=? ORDER BY id DESC LIMIT 20')
    .all(req.user.id)
  res.json({
    code: user.referral_code,
    credit: user.credit_balance || 0,
    invited: invited.map((u) => ({ id: u.id, name: u.name, created_at: u.created_at })),
    ledger,
  })
})

// Redeem someone's code once. Both get a ₹50 credit.
router.post('/referral/redeem', auth, (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  if (code.length < 4) return res.status(400).json({ error: 'Enter a valid referral code' })

  const me = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  if (me.referred_by) return res.status(400).json({ error: 'You already redeemed a referral code' })

  const referrer = db.prepare('SELECT * FROM users WHERE referral_code=?').get(code)
  if (!referrer) return res.status(404).json({ error: 'Unknown referral code' })
  if (referrer.id === req.user.id) return res.status(400).json({ error: 'You cannot refer yourself' })

  const REWARD = 50
  db.prepare('UPDATE users SET referred_by=? WHERE id=?').run(referrer.id, req.user.id)
  addCredit(req.user.id, REWARD, `Referral bonus (${referrer.name})`)
  addCredit(referrer.id, REWARD, `New rider via your code (${me.name})`)

  notify(req.user.id, {
    type: 'reward', title: 'Referral bonus 🎉',
    body: `₹${REWARD} credited to your RideMate wallet for joining via ${referrer.name}'s invite.`,
    link: '/profile',
  })
  notify(referrer.id, {
    type: 'reward', title: 'You referred a rider! 🎉',
    body: `${me.name} joined with your code — ₹${REWARD} added to your wallet.`,
    link: '/profile',
  })

  res.json({ ok: true, message: `Referral redeemed — ₹${REWARD} added to your wallet` })
})

// ---------- follow favorite owners ----------
router.get('/users/:id/following', auth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.* FROM owner_follows f JOIN users u ON u.id=f.followee_id
       WHERE f.follower_id=? ORDER BY f.created_at DESC`
    )
    .all(req.user.id)
  res.json({ following: rows.map(publicUser) })
})

router.post('/users/:id/follow', auth, (req, res) => {
  const followeeId = Number(req.params.id)
  if (followeeId === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself' })
  const target = db.prepare('SELECT id FROM users WHERE id=?').get(followeeId)
  if (!target) return res.status(404).json({ error: 'User not found' })
  db.prepare('INSERT OR IGNORE INTO owner_follows (follower_id, followee_id) VALUES (?,?)').run(req.user.id, followeeId)
  res.json({ ok: true, following: true })
})

router.delete('/users/:id/follow', auth, (req, res) => {
  db.prepare('DELETE FROM owner_follows WHERE follower_id=? AND followee_id=?').run(req.user.id, Number(req.params.id))
  res.json({ ok: true, following: false })
})

// ---------- leaderboard ----------
router.get('/leaderboard', (req, res) => {
  const period = String(req.query.period || 'all') // week | month | all
  const since =
    period === 'week'
      ? new Date(Date.now() - 7 * 86400000).toISOString()
      : period === 'month'
        ? new Date(Date.now() - 30 * 86400000).toISOString()
        : null

  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.avatar, u.credit_balance,
              COUNT(DISTINCT r.id) AS rides_offered
       FROM users u
       LEFT JOIN rides r ON r.user_id=u.id AND r.status='completed' ${since ? 'AND r.created_at >= ?' : ''}
       GROUP BY u.id`
    )
    .all(...(since ? [since] : []))

  // rides joined is a separate aggregate (per rider), so merge it in SQL-safely
  const joinedRows = db
    .prepare(
      `SELECT q.rider_id AS uid, COUNT(DISTINCT r.id) AS rides_joined
       FROM requests q JOIN rides r ON r.id=q.ride_id
       WHERE r.status='completed' AND q.status='accepted' ${since ? 'AND r.created_at >= ?' : ''}
       GROUP BY q.rider_id`
    )
    .all(...(since ? [since] : []))

  const joinedMap = new Map(joinedRows.map((j) => [j.uid, j.rides_joined]))
  const entries = rows.map((u) => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    credit: u.credit_balance || 0,
    completed: u.rides_offered + (joinedMap.get(u.id) || 0),
  }))
  entries.sort((a, b) => b.completed - a.completed)
  res.json({ period, leaderboard: entries.slice(0, 25) })
})

// ---------- my stats & streaks ----------
router.get('/me/stats', auth, (req, res) => {
  const profile = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)
  const completed = db
    .prepare("SELECT COUNT(*) AS c FROM rides WHERE user_id=? AND status='completed'")
    .get(req.user.id).c +
    db
      .prepare("SELECT COUNT(*) AS c FROM requests q JOIN rides r ON r.id=q.ride_id WHERE q.rider_id=? AND r.status='completed' AND q.status='accepted'")
      .get(req.user.id).c
  const km = db
    .prepare(
      `SELECT COALESCE(SUM(
         (SELECT 2*6371*asin(sqrt(power(sin((r.to_lat-r.from_lat)*3.14159/360),2)
           + cos(r.from_lat*3.14159/180)*cos(r.to_lat*3.14159/180)
           * power(sin((r.to_lng-r.from_lng)*3.14159/360),2))))
       ),0) AS km
       FROM rides r WHERE r.user_id=? AND r.status='completed'`
    )
    .get(req.user.id).km
  const joinedKm = db
    .prepare(
      `SELECT COALESCE(SUM(
         (SELECT 2*6371*asin(sqrt(power(sin((r.to_lat-r.from_lat)*3.14159/360),2)
           + cos(r.from_lat*3.14159/180)*cos(r.to_lat*3.14159/180)
           * power(sin((r.to_lng-r.from_lng)*3.14159/360),2))))
       ),0) AS km
       FROM requests q JOIN rides r ON r.id=q.ride_id
       WHERE q.rider_id=? AND q.status='accepted' AND r.status='completed'`
    )
    .get(req.user.id).km

  // my rank on the all-time leaderboard
  const rows = db
    .prepare(
      `SELECT u.id, COUNT(DISTINCT r.id) AS c FROM users u
       LEFT JOIN rides r ON r.user_id=u.id AND r.status='completed'
       GROUP BY u.id`
    )
    .all()
  const joined = db
    .prepare(
      `SELECT q.rider_id AS uid, COUNT(DISTINCT r.id) AS c FROM requests q
       JOIN rides r ON r.id=q.ride_id WHERE r.status='completed' AND q.status='accepted'
       GROUP BY q.rider_id`
    )
    .all()
  const joinedMap = new Map(joined.map((j) => [j.uid, j.c]))
  const totals = rows.map((u) => u.c + (joinedMap.get(u.id) || 0))
  totals.sort((a, b) => b - a)
  const rank = totals.indexOf(completed >= 0 ? completed : 0) + 1

  res.json({
    completed,
    km: Math.round((km || 0) + (joinedKm || 0)),
    streakWeeks: streakWeeks(req.user.id),
    credit: profile.credit_balance || 0,
    rank,
  })
})

export default router