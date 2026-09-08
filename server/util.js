import crypto from 'node:crypto'
import { get, all, run } from './db.js'

// Returns true if either direction of a block exists between two users.
export async function isBlocked(a, b) {
  const row1 = await get('SELECT 1 FROM blocked_users WHERE blocker_id=$1 AND blocked_id=$2 LIMIT 1', [a, b])
  if (row1) return true
  const row2 = await get('SELECT 1 FROM blocked_users WHERE blocker_id=$1 AND blocked_id=$2 LIMIT 1', [b, a])
  return Boolean(row2)
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  const test = crypto.scryptSync(pw, salt, 64)
  const orig = Buffer.from(hash, 'hex')
  return orig.length === test.length && crypto.timingSafeEqual(orig, test)
}

// Great-circle distance in km between two lat/lng points
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    bio: u.bio || '',
    avatar: u.avatar || null,
    email_verified: u.email_verified ? 1 : 0,
    phone_verified: u.phone_verified ? 1 : 0,
    id_verified: u.id_verified ? 1 : 0,
  }
}

// Developer/me view — adds moderation flags and account details the owner needs.
export function meUser(u) {
  return {
    ...publicUser(u),
    is_admin: u.is_admin ? 1 : 0,
    is_suspended: u.is_suspended ? 1 : 0,
    referral_code: u.referral_code || null,
    referred_by: u.referred_by || null,
    credit_balance: u.credit_balance || 0,
  }
}

// Short, human-friendly referral code that's unique across users.
export async function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0/I/1 ambiguity
  for (;;) {
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(0, chars.length)]
    const dup = await get('SELECT 1 FROM users WHERE referral_code=$1', [code])
    if (!dup) return code
  }
}

// Longest consecutive-week streak with at least one completed ride.
export async function streakWeeks(userId) {
  const rides = await all(
    `SELECT DISTINCT substr(depart_at,1,10) AS d FROM rides
     WHERE user_id=? AND status='completed'
     UNION
     SELECT DISTINCT substr(r.depart_at,1,10) AS d FROM rides r
     JOIN requests q ON q.ride_id=r.id
     WHERE q.rider_id=? AND q.status='accepted' AND r.status='completed'`,
    [userId, userId]
  )
  if (rides.length === 0) return 0
  const weeks = new Set(
    rides.map((r) => {
      const d = new Date(r.d + 'T00:00:00Z')
      const day = d.getUTCDay()
      const monday = new Date(d.getTime() - ((day + 6) % 7) * 86400000)
      return monday.toISOString().slice(0, 10)
    })
  )
  const sorted = [...weeks].sort()
  let streak = 0
  for (const w of sorted.reverse()) {
    const now = new Date()
    const thisWeekStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).getTime() - ((now.getUTCDay() + 6) % 7) * 86400000
    const weekMs = new Date(w + 'T00:00:00Z').getTime()
    const diff = Math.round((thisWeekStart - weekMs) / (7 * 86400000))
    if (diff <= 0) continue
    if (diff === streak + 1) streak++
    else break
  }
  return streak
}

export async function addCredit(userId, amount, reason) {
  await run('UPDATE users SET credit_balance = credit_balance + $1 WHERE id=$2', [amount, userId])
  await run('INSERT INTO credit_ledger (user_id, amount, reason) VALUES ($1,$2,$3)', [userId, amount, reason])
}