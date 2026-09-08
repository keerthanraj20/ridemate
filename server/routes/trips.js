import { Router } from 'express'
import { all, get, run } from '../db.js'
import { auth } from './auth.js'
import { notify } from '../notify.js'
import { pushToUser } from '../ws.js'

const router = Router()

// Who else is on this ride (accepted participants) — used to push live updates.
async function rideParticipants(rideId, exceptUserId) {
  const ride = await get('SELECT user_id FROM rides WHERE id=?', [rideId])
  const riders = (await all(
    "SELECT rider_id FROM requests WHERE ride_id=? AND status='accepted'",
    [rideId]
  )).map((r) => r.rider_id)
  return [...new Set([ride.user_id, ...riders])].filter((id) => id !== exceptUserId)
}

// Helper: is this user part of the given ride (owner or accepted rider)?
async function isParticipant(userId, rideId) {
  const ride = await get('SELECT user_id FROM rides WHERE id=?', [rideId])
  if (!ride) return false
  if (ride.user_id === userId) return true
  return Boolean(
    await get("SELECT 1 FROM requests WHERE ride_id=? AND rider_id=? AND status='accepted'", [rideId, userId])
  )
}

// ---------- start / resume live tracking for a ride you're part of ----------
router.post('/trips/start', auth, async (req, res) => {
  const rideId = Number(req.body?.ride_id)
  const ride = await get('SELECT * FROM rides WHERE id=?', [rideId])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (!(await isParticipant(req.user.id, ride.id))) return res.status(403).json({ error: 'You are not part of this ride' })
  if (ride.status === 'cancelled') return res.status(400).json({ error: 'This ride was cancelled' })

  const role = ride.user_id === req.user.id ? 'owner' : 'rider'
  await run('INSERT OR IGNORE INTO trips (ride_id, user_id, role) VALUES (?,?,?)', [ride.id, req.user.id, role])

  const trip = await get(
    "SELECT * FROM trips WHERE ride_id=? AND user_id=? AND status='active'",
    [ride.id, req.user.id]
  )

  const others = await rideParticipants(ride.id, req.user.id)
  for (const uid of others) {
    pushToUser(uid, { event: 'trip', action: 'start', rideId: ride.id, by: req.user.id })
  }

  res.json({ trip, message: 'Live tracking started' })
})

// ---------- update my location on an active trip ----------
router.post('/trips/:id/location', auth, async (req, res) => {
  const trip = await get("SELECT * FROM trips WHERE id=? AND user_id=? AND status='active'", [Number(req.params.id), req.user.id])
  if (!trip) return res.status(404).json({ error: 'No active trip' })

  const lat = Number(req.body?.lat)
  const lng = Number(req.body?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return res.status(400).json({ error: 'Invalid coordinates' })

  await run('INSERT INTO trip_locations (trip_id, lat, lng) VALUES (?,?,?)', [trip.id, lat, lng])
  await run('DELETE FROM trip_locations WHERE trip_id=? AND id NOT IN (SELECT id FROM trip_locations WHERE trip_id=? ORDER BY id DESC LIMIT 50)', [trip.id, trip.id])

  // push to the other party so the live view updates without polling
  const others = await rideParticipants(trip.ride_id, req.user.id)
  for (const uid of others) {
    pushToUser(uid, { event: 'trip', action: 'location', rideId: trip.ride_id, tripId: trip.id, lat, lng, by: req.user.id })
  }

  res.json({ ok: true })
})

// ---------- end tracking ----------
router.post('/trips/:id/end', auth, async (req, res) => {
  const trip = await get("SELECT * FROM trips WHERE id=? AND user_id=? AND status='active'", [Number(req.params.id), req.user.id])
  if (!trip) return res.status(404).json({ error: 'No active trip' })
  await run("UPDATE trips SET status='ended', ended_at=datetime('now') WHERE id=?", [trip.id])

  const others = await rideParticipants(trip.ride_id, req.user.id)
  for (const uid of others) {
    pushToUser(uid, { event: 'trip', action: 'end', rideId: trip.ride_id, by: req.user.id })
    await notify(uid, {
      type: 'trip', title: 'Trip shared ended',
      body: 'The live location sharing for this trip has stopped.',
      link: '/rides',
    })
  }
  res.json({ ok: true })
})

// ---------- live view of a ride's shared locations ----------
router.get('/trips/ride/:rideId', auth, async (req, res) => {
  const rideId = Number(req.params.rideId)
  if (!(await isParticipant(req.user.id, rideId))) return res.status(403).json({ error: 'You are not part of this ride' })

  const active = await all(
    "SELECT * FROM trips WHERE ride_id=? AND status='active'",
    [rideId]
  )
  const locs = await Promise.all(active.map(async (t) => {
    const last = await get(
      'SELECT lat, lng, at FROM trip_locations WHERE trip_id=? ORDER BY id DESC LIMIT 1',
      [t.id]
    )
    return { trip_id: t.id, user_id: t.user_id, role: t.role, ...(last || { lat: null, lng: null, at: null }) }
  }))
  res.json({ locations: locs })
})

// ---------- SOS alert ----------
// Raised anywhere (usually mid-trip); notifies every admin and opens a queue item.
router.post('/safety/sos', auth, async (req, res) => {
  const lat = Number.isFinite(Number(req.body?.lat)) ? Number(req.body.lat) : null
  const lng = Number.isFinite(Number(req.body?.lng)) ? Number(req.body.lng) : null
  const rideId = Number.isFinite(Number(req.body?.ride_id)) ? Number(req.body.ride_id) : null
  const message = String(req.body?.message || '').trim().slice(0, 300) || 'SOS alert raised'

  await run('INSERT INTO sos_alerts (user_id, lat, lng, ride_id, message) VALUES (?,?,?,?,?)', [
    req.user.id, lat, lng, rideId, message,
  ])

  const admins = await all("SELECT id FROM users WHERE is_admin=1")
  const me = await get('SELECT name, phone FROM users WHERE id=?', [req.user.id])
  for (const a of admins) {
    await notify(a.id, {
      type: 'sos',
      title: '🚨 SOS ALERT',
      body: `${me.name} (${me.phone}) pressed SOS${rideId ? ` while on ride #${rideId}` : ''}${lat ? ` · ${lat.toFixed(5)},${lng.toFixed(5)}` : ''}`,
      link: '/admin',
    })
  }

  res.json({ ok: true, message: 'SOS raised — help is on the way' })
})

// ---------- admin review SOS ----------
router.get('/admin/sos', auth, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admins only' })
  const alerts = await all(
    `SELECT s.*, u.name AS user_name, u.phone AS user_phone,
            r.from_name, r.to_name
     FROM sos_alerts s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN rides r ON r.id=s.ride_id
     ORDER BY CASE s.status WHEN 'open' THEN 0 ELSE 1 END, s.created_at DESC
     LIMIT 100`
  )
  res.json({ alerts })
})

router.post('/admin/sos/:id/close', auth, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admins only' })
  await run("UPDATE sos_alerts SET status='closed' WHERE id=?", [Number(req.params.id)])
  res.json({ ok: true })
})

export default router