import { Router } from 'express'
import { db } from '../db.js'
import { auth } from './auth.js'
import { notify, unreadCount } from '../notify.js'

const router = Router()

// ---------- notifications ----------
router.get('/notifications', auth, (req, res) => {
  const list = db
    .prepare(
      'SELECT id, type, title, body, link, read, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 60'
    )
    .all(req.user.id)
  res.json({ count: unreadCount(req.user.id), notifications: list })
})

router.post('/notifications/read', auth, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : []
  if (ids.length > 0) {
    const q = `UPDATE notifications SET read=1 WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`
    db.prepare(q).run(req.user.id, ...ids)
  }
  // mark all if no ids provided
  if (ids.length === 0) {
    db.prepare("UPDATE notifications SET read=1 WHERE user_id=? AND read=0").run(req.user.id)
  }
  res.json({ count: unreadCount(req.user.id) })
})

// ---------- direct chat between accepted owner & rider ----------
// Return the conversation between the current user and a counterpart on a ride.
router.get('/rides/:id/messages', auth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(Number(req.params.id))
  if (!ride) return res.status(404).json({ error: 'Ride not found' })

  // must be owner OR an accepted rider on this ride to view the thread
  const isOwner = ride.user_id === req.user.id
  const isRider = db
    .prepare("SELECT id FROM requests WHERE ride_id=? AND rider_id=? AND status='accepted'")
    .get(ride.id, req.user.id)

  if (!isOwner && !isRider) return res.status(403).json({ error: 'You are not part of this trip' })

  const messages = db
    .prepare('SELECT id, sender_id, recipient_id, body, created_at FROM messages WHERE ride_id=? ORDER BY id ASC LIMIT 500')
    .all(ride.id)

  // mark incoming messages as read implicitly is done via /messages/read
  res.json({ ride, messages })
})

// Send a chat message to the other party on an accepted ride.
router.post('/rides/:id/messages', auth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(Number(req.params.id))
  if (!ride) return res.status(404).json({ error: 'Ride not found' })

  const isOwner = ride.user_id === req.user.id
  const acceptedRiders = db
    .prepare("SELECT rider_id FROM requests WHERE ride_id=? AND status='accepted'")
    .all(ride.id)
    .map((x) => x.rider_id)
  const isRider = acceptedRiders.includes(req.user.id)

  if (!isOwner && !isRider) return res.status(403).json({ error: 'You can only chat on trips you are part of' })

  // determine the counterpart: owner sends to the rider he's replying to (or first), rider sends to owner
  const body = String(req.body?.body || '').trim().slice(0, 1000)
  if (!body) return res.status(400).json({ error: 'Message cannot be empty' })

  let recipientId
  if (isOwner) {
    const target = Number(req.body?.to_user_id)
    recipientId = target && acceptedRiders.includes(target) ? target : acceptedRiders[0] || null
  } else {
    recipientId = ride.user_id
  }
  if (!recipientId) return res.status(400).json({ error: 'No accepted rider to message' })

  const info = db
    .prepare('INSERT INTO messages (ride_id, sender_id, recipient_id, body) VALUES (?,?,?,?)')
    .run(ride.id, req.user.id, recipientId, body)

  const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(Number(info.lastInsertRowid))

  const senderName = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id)?.name
  const otherUser = db.prepare('SELECT name FROM users WHERE id=?').get(recipientId)
  notify(recipientId, {
    type: 'message',
    title: `New message on your ${ride.from_name} → ${ride.to_name} trip`,
    body,
    link: `/messages/${ride.id}`,
  })

  res.json({ message: msg, you: senderName, other: otherUser?.name })
})

// Mark my incoming messages in a thread as read
router.post('/rides/:id/messages/read', auth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(Number(req.params.id))
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  db.prepare(
    "UPDATE messages SET read=1 WHERE ride_id=? AND recipient_id=? AND read=0"
  ).run(ride.id, req.user.id)
  res.json({ ok: true })
})

// ---------- list all active conversations for the user ----------
router.get('/messages', auth, (req, res) => {
  const asOwner = db
    .prepare(
      `SELECT DISTINCT q.ride_id, r.id AS ride_id2 FROM requests q JOIN rides r ON r.id=q.ride_id
       WHERE r.user_id=? AND q.status='accepted'`
    )
    .all(req.user.id)

  const asRiderRows = db
    .prepare("SELECT ride_id FROM requests WHERE rider_id=? AND status='accepted'")
    .all(req.user.id)

  const rideIds = [...new Set([...asOwner.map((r) => r.ride_id), ...asRiderRows.map((r) => r.ride_id)])]
  if (rideIds.length === 0) return res.json({ conversations: [] })

  const placeholders = rideIds.map(() => '?').join(',')
  const rides = db
    .prepare(`SELECT r.*, u.name AS owner_name FROM rides r JOIN users u ON u.id=r.user_id WHERE r.id IN (${placeholders})`)
    .all(...rideIds)

  const conversations = rides.map((ride) => {
    const isOwner = ride.user_id === req.user.id
    const acceptedRiders = db
      .prepare(
        `SELECT q.rider_id AS id, u.name FROM requests q JOIN users u ON u.id=q.rider_id
         WHERE q.ride_id=? AND q.status='accepted'`
      )
      .all(ride.id)
    const counterpart = isOwner ? acceptedRiders[0] : { id: ride.user_id, name: ride.owner_name }
    const last = db
      .prepare('SELECT body, sender_id, created_at FROM messages WHERE ride_id=? ORDER BY id DESC LIMIT 1')
      .get(ride.id)
    const unread = db
      .prepare("SELECT COUNT(*) AS c FROM messages WHERE ride_id=? AND recipient_id=? AND read=0")
      .get(ride.id, req.user.id)?.c || 0
    return {
      ride: {
        id: ride.id,
        from_name: ride.from_name,
        to_name: ride.to_name,
        vehicle_type: ride.vehicle_type,
        depart_at: ride.depart_at,
        status: ride.status,
      },
      counterpart,
      lastMessage: last?.body || null,
      lastAt: last?.created_at || null,
      lastSenderMe: last ? last.sender_id === req.user.id : false,
      unread,
    }
  })

  conversations.sort((a, b) => {
    if (a.unread !== b.unread) return b.unread - a.unread
    return new Date(b.lastAt || 0) - new Date(a.lastAt || 0)
  })

  res.json({ conversations })
})

// ---------- saved routes (favorites) ----------
router.get('/saved-routes', auth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM saved_routes WHERE user_id=? ORDER BY created_at DESC')
    .all(req.user.id)
  res.json({ routes: rows })
})

router.post('/saved-routes', auth, (req, res) => {
  const b = req.body || {}
  if (!b.from_name?.trim() || !b.to_name?.trim()) return res.status(400).json({ error: 'Enter both places' })
  if (![b.from_lat, b.from_lng, b.to_lat, b.to_lng].every((v) => Number.isFinite(Number(v))))
    return res.status(400).json({ error: 'Drop pins for both places' })

  const label = String(b.label || '').trim().slice(0, 60)
  const info = db
    .prepare(
      `INSERT INTO saved_routes (user_id, label, from_name, from_lat, from_lng, to_name, to_lat, to_lng)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, from_name, to_name) DO UPDATE SET
         from_lat=excluded.from_lat, from_lng=excluded.from_lng,
         to_lat=excluded.to_lat, to_lng=excluded.to_lng,
         label=excluded.label`
    )
    .run(
      req.user.id,
      label,
      b.from_name.trim().slice(0, 100),
      Number(b.from_lat),
      Number(b.from_lng),
      b.to_name.trim().slice(0, 100),
      Number(b.to_lat),
      Number(b.to_lng)
    )

  const row = db
    .prepare('SELECT * FROM saved_routes WHERE user_id=? AND from_name=? AND to_name=?')
    .get(req.user.id, b.from_name.trim().slice(0, 100), b.to_name.trim().slice(0, 100))
  res.json({ route: row, message: 'Route saved!' })
})

router.delete('/saved-routes/:id', auth, (req, res) => {
  db.prepare('DELETE FROM saved_routes WHERE id=? AND user_id=?').run(Number(req.params.id), req.user.id)
  res.json({ ok: true })
})

export default router
