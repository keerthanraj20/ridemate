import { Router } from 'express'
import { all, get, run } from '../db.js'
import { auth } from './auth.js'
import { publicUser, streakWeeks, addCredit } from '../util.js'
import { notify } from '../notify.js'

const router = Router()

// ---------- referrals ----------
// My outreach code + ledger + how many people I brought in.
router.get('/referral', auth, async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id=?', [req.user.id])
  const ledger = await all('SELECT id, amount, reason, created_at FROM credit_ledger WHERE user_id=? ORDER BY id DESC LIMIT 50', [req.user.id])
  const invited = await all('SELECT id, name, created_at FROM users WHERE referred_by=? ORDER BY id DESC LIMIT 20', [req.user.id])
  res.json({
    code: user.referral_code,
    credit: user.credit_balance || 0,
    invited: invited.map((u) => ({ id: u.id, name: u.name, created_at: u.created_at })),
    ledger,
  })
})

// Redeem someone's code once. Both get a ₹50 credit.
router.post('/referral/redeem', auth, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase()
  if (code.length < 4) return res.status(400).json({ error: 'Enter a valid referral code' })

  const me = await get('SELECT * FROM users WHERE id=?', [req.user.id])
  if (me.referred_by) return res.status(400).json({ error: 'You already redeemed a referral code' })

  const referrer = await get('SELECT * FROM users WHERE referral_code=?', [code])
  if (!referrer) return res.status(404).json({ error: 'Unknown referral code' })
  if (referrer.id === req.user.id) return res.status(400).json({ error: 'You cannot refer yourself' })

  const REWARD = 50
  await run('UPDATE users SET referred_by=? WHERE id=?', [referrer.id, req.user.id])
  await addCredit(req.user.id, REWARD, `Referral bonus (${referrer.name})`)
  await addCredit(referrer.id, REWARD, `New rider via your code (${me.name})`)

  await notify(req.user.id, {
    type: 'reward', title: 'Referral bonus 🎉',
    body: `₹${REWARD} credited to your RideMate wallet for joining via ${referrer.name}'s invite.`,
    link: '/profile',
  })
  await notify(referrer.id, {
    type: 'reward', title: 'You referred a rider! 🎉',
    body: `${me.name} joined with your code — ₹${REWARD} added to your wallet.`,
    link: '/profile',
  })

  res.json({ ok: true, message: `Referral redeemed — ₹${REWARD} added to your wallet` })
})

// ---------- follow favorite owners ----------
router.get('/users/:id/following', auth, async (req, res) => {
  const rows = await all(
    `SELECT u.* FROM owner_follows f JOIN users u ON u.id=f.followee_id
     WHERE f.follower_id=? ORDER BY f.created_at DESC`,
    [req.user.id]
  )
  res.json({ following: rows.map(publicUser) })
})

router.post('/users/:id/follow', auth, async (req, res) => {
  const followeeId = Number(req.params.id)
  if (followeeId === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself' })
  const target = await get('SELECT id FROM users WHERE id=?', [followeeId])
  if (!target) return res.status(404).json({ error: 'User not found' })
  await run('INSERT OR IGNORE INTO owner_follows (follower_id, followee_id) VALUES (?,?)', [req.user.id, followeeId])
  res.json({ ok: true, following: true })
})

router.delete('/users/:id/follow', auth, async (req, res) => {
  await run('DELETE FROM owner_follows WHERE follower_id=? AND followee_id=?', [req.user.id, Number(req.params.id)])
  res.json({ ok: true, following: false })
})

// ---------- leaderboard ----------
router.get('/leaderboard', async (req, res) => {
  const period = String(req.query.period || 'all') // week | month | all
  const since =
    period === 'week'
      ? new Date(Date.now() - 7 * 86400000).toISOString()
      : period === 'month'
        ? new Date(Date.now() - 30 * 86400000).toISOString()
        : null

  const rows = await all(
    `SELECT u.id, u.name, u.avatar, u.credit_balance,
            COUNT(DISTINCT r.id) AS rides_offered
     FROM users u
     LEFT JOIN rides r ON r.user_id=u.id AND r.status='completed' ${since ? 'AND r.created_at >= ?' : ''}
     GROUP BY u.id`,
    since ? [since] : []
  )

  // rides joined is a separate aggregate (per rider), so merge it in SQL-safely
  const joinedRows = await all(
    `SELECT q.rider_id AS uid, COUNT(DISTINCT r.id) AS rides_joined
     FROM requests q JOIN rides r ON r.id=q.ride_id
     WHERE r.status='completed' AND q.status='accepted' ${since ? 'AND r.created_at >= ?' : ''}
     GROUP BY q.rider_id`,
    since ? [since] : []
  )

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
router.get('/me/stats', auth, async (req, res) => {
  const profile = await get('SELECT * FROM users WHERE id=?', [req.user.id])
  const mine = await get("SELECT COUNT(*) AS c FROM rides WHERE user_id=? AND status='completed'", [req.user.id])
  const joined = await get(
    "SELECT COUNT(*) AS c FROM requests q JOIN rides r ON r.id=q.ride_id WHERE q.rider_id=? AND r.status='completed' AND q.status='accepted'",
    [req.user.id]
  )
  const completed = mine.c + joined.c
  const kmRow = await get(
    `SELECT COALESCE(SUM(
       (SELECT 2*6371*asin(sqrt(power(sin((r.to_lat-r.from_lat)*3.14159/360),2)
         + cos(r.from_lat*3.14159/180)*cos(r.to_lat*3.14159/180)
         * power(sin((r.to_lng-r.from_lng)*3.14159/360),2))))
     ),0) AS km
     FROM rides r WHERE r.user_id=? AND r.status='completed'`,
    [req.user.id]
  )
  const joinedKmRow = await get(
    `SELECT COALESCE(SUM(
       (SELECT 2*6371*asin(sqrt(power(sin((r.to_lat-r.from_lat)*3.14159/360),2)
         + cos(r.from_lat*3.14159/180)*cos(r.to_lat*3.14159/180)
         * power(sin((r.to_lng-r.from_lng)*3.14159/360),2))))
     ),0) AS km
     FROM requests q JOIN rides r ON r.id=q.ride_id
     WHERE q.rider_id=? AND q.status='accepted' AND r.status='completed'`,
    [req.user.id]
  )

  // my rank on the all-time leaderboard
  const rows = await all(
    `SELECT u.id, COUNT(DISTINCT r.id) AS c FROM users u
     LEFT JOIN rides r ON r.user_id=u.id AND r.status='completed'
     GROUP BY u.id`
  )
  const joinedRows = await all(
    `SELECT q.rider_id AS uid, COUNT(DISTINCT r.id) AS c FROM requests q
     JOIN rides r ON r.id=q.ride_id WHERE r.status='completed' AND q.status='accepted'
     GROUP BY q.rider_id`
  )
  const joinedMap = new Map(joinedRows.map((j) => [j.uid, j.c]))
  const totals = rows.map((u) => u.c + (joinedMap.get(u.id) || 0))
  totals.sort((a, b) => b - a)
  const rank = totals.indexOf(completed) + 1

  res.json({
    completed,
    km: Math.round((kmRow.km || 0) + (joinedKmRow.km || 0)),
    streakWeeks: await streakWeeks(req.user.id),
    credit: profile.credit_balance || 0,
    rank,
  })
})

export default router