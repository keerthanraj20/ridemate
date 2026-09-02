import crypto from 'node:crypto'
import { db } from './db.js'

// Returns true if either direction of a block exists between two users.
export function isBlocked(a, b) {
  return Boolean(
    db.prepare('SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=? LIMIT 1').get(a, b) ||
      db.prepare('SELECT 1 FROM blocked_users WHERE blocker_id=? AND blocked_id=? LIMIT 1').get(b, a)
  )
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
  }
}

// Developer/me view — adds moderation flags the owner needs.
export function meUser(u) {
  return { ...publicUser(u), is_admin: u.is_admin ? 1 : 0, is_suspended: u.is_suspended ? 1 : 0 }
}
