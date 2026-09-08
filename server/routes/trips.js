import { Router } from 'express'
import { db } from '../db.js'
import { auth } from './auth.js'
import { notify } from '../notify.js'
import { pushToUser } from '../ws.js'

const router = Router()

// Who else is on this ride (accepted participants) — used to push live updates.
function rideParticipants(rideId, exceptUserId) {
  const ride = db.prepare('SELECT user_id FROM rides WHERE id=?').get(rideId)
  const riders = db
    .prepare("SELECT rider_id FROM requests WHERE ride_id=? AND status='accepted'")
    .all(rideId)
    .map((r) => r.rider_id)
  return [...new Set([ride.user_id, ...riders])].filter((id) => id !== exceptUserId)
}

// Helper: is this user part of the given ride (owner or accepted rider)?
function isParticipant(userId, rideId) {
  const ride = db.prepare('SELECT user_id FROM rides WHERE id=?').get(rideId)
  if (!ride) return false
  if (ride.user_id === userId) return true
  return Boolean(
    db.prepare("SELECT 1 FROM requests WHERE ride_id=? AND rider_id=? AND status='accepted'").get(rideId, userId)
  )
}

// ---------- start / resume live tracking for a ride you're part of ----------
router.post('/trips/start', auth, (req, res) => {
  const rideId = Number(req.body?.ride_id)
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(rideId)
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (!isParticipant(req.user.id, ride.id)) return res.status(403).json({ error: 'You are not part of this ride' })
  if (ride.status === 'cancelled') return res.status(400).json({ error: 'This ride was cancelled' })

  const role = ride.user_id === req.user.id ? 'owner' : 'rider'
  db.prepare('INSERT OR IGNORE INTO trips (ride_id, user_id, role) VALUES (?,?,?)').run(ride.id, req.user.id, role)

  const trip = db
    .prepare("SELECT * FROM trips WHERE ride_id=? AND user_id=? AND status='active'")
    .get(ride.id, req.user.id)

  const others = rideParticipants(ride.id, req.user.id)
  for (const uid of others) {
    pushToUser(uid, { event: 'trip', action: 'start', rideId: ride.id, by: req.user.id })
  }

  res.json({ trip, message: 'Live tracking started' })
})

// ---------- update my location on an active trip ----------
router.post('/trips/:id/location', auth, (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE id=? AND user_id=? AND status='active'").get(Number(req.params.id), req.user.id)
  if (!trip) return res.status(404).json({ error: 'No active trip' })

  const lat = Number(req.body?.lat)
  const lng = Number(req.body?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return res.status(400).json({ error: 'Invalid coordinates' })

  db.prepare('INSERT INTO trip_locations (trip_id, lat, lng) VALUES (?,?,?)').run(trip.id, lat, lng)
  db.prepare('DELETE FROM trip_locations WHERE trip_id=? AND id NOT IN (SELECT id FROM trip_locations WHERE trip_id=? ORDER BY id DESC LIMIT 50)').run(trip.id, trip.id)

  // push to the other party so the live view updates without polling
  const others = rideParticipants(trip.ride_id, req.user.id)
  for (const uid of others) {
    pushToUser(uid, { event: 'trip', action: 'location', rideId: trip.ride_id, tripId: trip.id, lat, lng, by: req.user.id })
  }

  res.json({ ok: true })
})

// ---------- end tracking ----------
router.post('/trips/:id/end', auth, (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE id=? AND user_id=? AND status='active'").get(Number(req.params.id), req.user.id)
  if (!trip) return res.status(404).json({ error: 'No active trip' })
  db.prepare("UPDATE trips SET status='ended', ended_at=datetime('now') WHERE id=?").run(trip.id)

  const others = rideParticipants(trip.ride_id, req.user.id)
  for (const uid of others) {
    pushToUser(uid, { event: 'trip', action: 'end', rideId: trip.ride_id, by: req.user.id })
    notify(uid, {
      type: 'trip', title: 'Trip shared ended',
      body: 'The live location sharing for this trip has stopped.',
      link: '/rides',
    })
  }
  res.json({ ok: true })
})

// ---------- live view of a ride's shared locations ----------
router.get('/trips/ride/:rideId', auth, (req, res) => {
  const rideId = Number(req.params.rideId)
  if (!isParticipant(req.user.id, rideId)) return res.status(403).json({ error: 'You are not part of this ride' })

  const active = db
    .prepare("SELECT * FROM trips WHERE ride_id=? AND status='active'")
    .all(rideId)
  const locs = active.map((t) => {
    const last = db
      .prepare('SELECT lat, lng, at FROM trip_locations WHERE trip_id=? ORDER BY id DESC LIMIT 1')
      .get(t.id)
    return { trip_id: t.id, user_id: t.user_id, role: t.role, ...(last || { lat: null, lng: null, at: null }) }
  })
  res.json({ locations: locs })
})

// ---------- SOS alert ----------
// Raised anywhere (usually mid-trip); notifies every admin and opens a queue item.
router.post('/safety/sos', auth, (req, res) => {
  const lat = Number.isFinite(Number(req.body?.lat)) ? Number(req.body.lat) : null
  const lng = Number.isFinite(Number(req.body?.lng)) ? Number(req.body.lng) : null
  const rideId = Number.isFinite(Number(req.body?.ride_id)) ? Number(req.body.ride_id) : null
  const message = String(req.body?.message || '').trim().slice(0, 300) || 'SOS alert raised'

  db.prepare('INSERT INTO sos_alerts (user_id, lat, lng, ride_id, message) VALUES (?,?,?,?,?)').run(
    req.user.id, lat, lng, rideId, message
  )

  const admins = db.prepare("SELECT id FROM users WHERE is_admin=1").all()
  const me = db.prepare('SELECT name, phone FROM users WHERE id=?').get(req.user.id)
  for (const a of admins) {
    notify(a.id, {
      type: 'sos',
      title: '🚨 SOS ALERT',
      body: `${me.name} (${me.phone}) pressed SOS${rideId ? ` while on ride #${rideId}` : ''}${lat ? ` · ${lat.toFixed(5)},${lng.toFixed(5)}` : ''}`,
      link: '/admin',
    })
  }

  res.json({ ok: true, message: 'SOS raised — help is on the way' })
})

// ---------- admin review SOS ----------
router.get('/admin/sos', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admins only' })
  const alerts = db
    .prepare(
      `SELECT s.*, u.name AS user_name, u.phone AS user_phone,
              r.from_name, r.to_name
       FROM sos_alerts s
       JOIN users u ON u.id=s.user_id
       LEFT JOIN rides r ON r.id=s.ride_id
       ORDER BY CASE s.status WHEN 'open' THEN 0 ELSE 1 END, s.created_at DESC
       LIMIT 100`
    )
    .all()
  res.json({ alerts })
})

router.post('/admin/sos/:id/close', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admins only' })
  db.prepare("UPDATE sos_alerts SET status='closed' WHERE id=?").run(Number(req.params.id))
  res.json({ ok: true })
})

export default router