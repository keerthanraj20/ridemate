import { Router } from 'express'
import { all, get, run } from '../db.js'
import { auth } from './auth.js'
import { isBlocked } from '../util.js'
import { notify, unreadCount } from '../notify.js'
import { pushToUser } from '../ws.js'

const router = Router()

// ---------- notifications ----------
router.get('/notifications', auth, async (req, res) => {
  const PAGE_SIZE = Math.min(100, Math.max(1, Number(req.query.page_size) || 50))
  const page = Math.max(1, Number(req.query.page) || 1)

  const totalRow = await get('SELECT COUNT(*) AS c FROM notifications WHERE user_id=?', [req.user.id])
  const list = await all(
    'SELECT id, type, title, body, link, read, created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [req.user.id, PAGE_SIZE, (page - 1) * PAGE_SIZE]
  )
  res.json({ count: await unreadCount(req.user.id), notifications: list, page, total: totalRow.c, hasMore: page * PAGE_SIZE < totalRow.c })
})

router.post('/notifications/read', auth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : []
  if (ids.length > 0) {
    const q = `UPDATE notifications SET read=1 WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`
    await run(q, [req.user.id, ...ids])
  }
  // mark all if no ids provided
  if (ids.length === 0) {
    await run("UPDATE notifications SET read=1 WHERE user_id=? AND read=0", [req.user.id])
  }
  res.json({ count: await unreadCount(req.user.id) })
})

// ---------- direct chat between accepted owner & rider ----------
// Return the conversation between the current user and a counterpart on a ride.
router.get('/rides/:id/messages', auth, async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })

  // must be owner OR an accepted rider on this ride to view the thread
  const isOwner = ride.user_id === req.user.id
  const isRider = await get(
    "SELECT id FROM requests WHERE ride_id=? AND rider_id=? AND status='accepted'",
    [ride.id, req.user.id]
  )

  if (!isOwner && !isRider) return res.status(403).json({ error: 'You are not part of this trip' })

  const messages = await all('SELECT id, sender_id, recipient_id, body, created_at FROM messages WHERE ride_id=? ORDER BY id ASC LIMIT 500', [ride.id])

  // mark incoming messages as read implicitly is done via /messages/read
  res.json({ ride, messages })
})

// Send a chat message to the other party on an accepted ride.
router.post('/rides/:id/messages', auth, async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })

  const isOwner = ride.user_id === req.user.id
  const acceptedRiders = (await all(
    "SELECT rider_id FROM requests WHERE ride_id=? AND status='accepted'",
    [ride.id]
  )).map((x) => x.rider_id)
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
  if (await isBlocked(req.user.id, recipientId))
    return res.status(403).json({ error: 'You cannot message this user' })

  const info = await run('INSERT INTO messages (ride_id, sender_id, recipient_id, body) VALUES (?,?,?,?)', [
    ride.id, req.user.id, recipientId, body,
  ])

  const msg = await get('SELECT * FROM messages WHERE id=?', [Number(info.lastInsertRowid)])

  const senderName = (await get('SELECT name FROM users WHERE id=?', [req.user.id]))?.name
  const otherUser = await get('SELECT name FROM users WHERE id=?', [recipientId])
  await notify(recipientId, {
    type: 'message',
    title: `New message on your ${ride.from_name} → ${ride.to_name} trip`,
    body,
    link: `/messages/${ride.id}`,
  })

  // Push to the recipient's live connections so chat is instant (no polling).
  pushToUser(recipientId, {
    event: 'message',
    rideId: ride.id,
    message: {
      id: msg.id,
      ride_id: ride.id,
      sender_id: req.user.id,
      sender_name: senderName,
      recipient_id: recipientId,
      body: msg.body,
      created_at: msg.created_at,
    },
  })

  res.json({ message: msg, you: senderName, other: otherUser?.name })
})

// Mark my incoming messages in a thread as read
router.post('/rides/:id/messages/read', auth, async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  await run(
    "UPDATE messages SET read=1 WHERE ride_id=? AND recipient_id=? AND read=0",
    [ride.id, req.user.id]
  )
  res.json({ ok: true })
})

// ---------- list all active conversations for the user ----------
router.get('/messages', auth, async (req, res) => {
  const asOwner = await all(
    `SELECT DISTINCT q.ride_id FROM requests q JOIN rides r ON r.id=q.ride_id
     WHERE r.user_id=? AND q.status='accepted'`,
    [req.user.id]
  )

  const asRiderRows = await all(
    "SELECT ride_id FROM requests WHERE rider_id=? AND status='accepted'",
    [req.user.id]
  )

  const rideIds = [...new Set([...asOwner.map((r) => r.ride_id), ...asRiderRows.map((r) => r.ride_id)])]
  if (rideIds.length === 0) return res.json({ conversations: [] })

  const placeholders = rideIds.map(() => '?').join(',')
  const rides = await all(
    `SELECT r.*, u.name AS owner_name FROM rides r JOIN users u ON u.id=r.user_id WHERE r.id IN (${placeholders})`,
    rideIds
  )

  const conversations = []
  for (const ride of rides) {
    const isOwner = ride.user_id === req.user.id
    const acceptedRiders = await all(
      `SELECT q.rider_id AS id, u.name FROM requests q JOIN users u ON u.id=q.rider_id
       WHERE q.ride_id=? AND q.status='accepted'`,
      [ride.id]
    )
    const counterpart = isOwner ? acceptedRiders[0] : { id: ride.user_id, name: ride.owner_name }
    const last = await get('SELECT body, sender_id, created_at FROM messages WHERE ride_id=? ORDER BY id DESC LIMIT 1', [ride.id])
    const unreadRow = await get("SELECT COUNT(*) AS c FROM messages WHERE ride_id=? AND recipient_id=? AND read=0", [ride.id, req.user.id])
    conversations.push({
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
      unread: unreadRow?.c || 0,
    })
  }

  conversations.sort((a, b) => {
    if (a.unread !== b.unread) return b.unread - a.unread
    return new Date(b.lastAt || 0) - new Date(a.lastAt || 0)
  })

  res.json({ conversations })
})

// ---------- saved routes (favorites) ----------
router.get('/saved-routes', auth, async (req, res) => {
  const rows = await all('SELECT * FROM saved_routes WHERE user_id=? ORDER BY created_at DESC', [req.user.id])
  res.json({ routes: rows })
})

router.post('/saved-routes', auth, async (req, res) => {
  const b = req.body || {}
  if (!b.from_name?.trim() || !b.to_name?.trim()) return res.status(400).json({ error: 'Enter both places' })
  if (![b.from_lat, b.from_lng, b.to_lat, b.to_lng].every((v) => Number.isFinite(Number(v))))
    return res.status(400).json({ error: 'Drop pins for both places' })

  const label = String(b.label || '').trim().slice(0, 60)
  await run(
    `INSERT INTO saved_routes (user_id, label, from_name, from_lat, from_lng, to_name, to_lat, to_lng)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, from_name, to_name) DO UPDATE SET
       from_lat=excluded.from_lat, from_lng=excluded.from_lng,
       to_lat=excluded.to_lat, to_lng=excluded.to_lng,
       label=excluded.label`,
    [
      req.user.id,
      label,
      b.from_name.trim().slice(0, 100),
      Number(b.from_lat),
      Number(b.from_lng),
      b.to_name.trim().slice(0, 100),
      Number(b.to_lat),
      Number(b.to_lng),
    ]
  )

  const row = await get(
    'SELECT * FROM saved_routes WHERE user_id=? AND from_name=? AND to_name=?',
    [req.user.id, b.from_name.trim().slice(0, 100), b.to_name.trim().slice(0, 100)]
  )
  res.json({ route: row, message: 'Route saved!' })
})

router.delete('/saved-routes/:id', auth, async (req, res) => {
  await run('DELETE FROM saved_routes WHERE id=? AND user_id=?', [Number(req.params.id), req.user.id])
  res.json({ ok: true })
})

export default router