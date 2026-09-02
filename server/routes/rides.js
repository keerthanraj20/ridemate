import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../db.js'
import { distanceKm } from '../util.js'
import { auth } from './auth.js'
import { notify } from '../notify.js'

const router = Router()
export const VEHICLES = ['bike', 'car', 'auto', 'van', 'other']
export const REPEAT = ['none', 'daily', 'weekly', 'weekdays']

// ---------- helpers ----------
const seatsTaken = (rideId) =>
  db.prepare("SELECT COALESCE(SUM(seats),0) AS s FROM requests WHERE ride_id=? AND status='accepted'").get(rideId).s

// keep ride open/full flag accurate based on accepted seats
function refreshStatus(rideId) {
  const ride = db.prepare('SELECT seats_total, status FROM rides WHERE id=?').get(rideId)
  if (!ride || ride.status === 'cancelled') return
  const status = seatsTaken(rideId) >= ride.seats_total ? 'full' : 'open'
  db.prepare('UPDATE rides SET status=? WHERE id=?').run(status, rideId)
}

// attach "my_status" (viewer's existing request) to each ride
function withMyStatus(rows, userId) {
  if (!userId || rows.length === 0) return rows.map((r) => ({ ...r, my_status: null }))
  const map = new Map(
    db
      .prepare("SELECT ride_id, status FROM requests WHERE rider_id=? AND status IN ('pending','accepted')")
      .all(userId)
      .map((x) => [x.ride_id, x.status])
  )
  return rows.map((r) => ({ ...r, my_status: map.get(r.id) || null }))
}

// ---------- create a ride (vehicle owner) ----------
router.post('/rides', auth, (req, res) => {
  const b = req.body || {}
  const num = (v) => Number(v)

  if (!VEHICLES.includes(b.vehicle_type)) return res.status(400).json({ error: 'Choose a vehicle type' })
  if (!b.from_name?.trim() || !b.to_name?.trim()) return res.status(400).json({ error: 'Enter start and destination names' })
  if (![b.from_lat, b.from_lng, b.to_lat, b.to_lng].every((v) => Number.isFinite(num(v))))
    return res.status(400).json({ error: 'Drop pins on the map for both start and destination' })

  const depart = new Date(b.depart_at)
  if (!b.depart_at || Number.isNaN(depart.getTime())) return res.status(400).json({ error: 'Pick a departure date & time' })
  if (depart.getTime() < Date.now() - 60_000) return res.status(400).json({ error: 'Departure time must be in the future' })

  const seats = Math.floor(num(b.seats_total))
  if (!Number.isInteger(seats) || seats < 1 || seats > 8) return res.status(400).json({ error: 'Seats must be between 1 and 8' })

  const price = num(b.price)
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be 0 or more' })

  const repeat = b.repeat_every || 'none'
  if (!REPEAT.includes(repeat)) return res.status(400).json({ error: 'Invalid repeat schedule' })

  const info = db
    .prepare(
      `INSERT INTO rides
       (user_id,vehicle_type,vehicle_model,from_name,from_lat,from_lng,to_name,to_lat,to_lng,depart_at,seats_total,price,notes,repeat_every)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.id,
      b.vehicle_type,
      String(b.vehicle_model || '').trim().slice(0, 60),
      b.from_name.trim().slice(0, 100),
      num(b.from_lat),
      num(b.from_lng),
      b.to_name.trim().slice(0, 100),
      num(b.to_lat),
      num(b.to_lng),
      depart.toISOString(),
      seats,
      price,
      String(b.notes || '').trim().slice(0, 300),
      repeat
    )

  res.json({ ride: db.prepare('SELECT * FROM rides WHERE id=?').get(Number(info.lastInsertRowid)) })
})

// ---------- search / browse rides ----------
// Pass from_* & to_* coords to match trips that start near you AND end near your destination.
router.get('/rides/search', (req, res) => {
  const viewer = req.headers.authorization ? tryAuth(req) : null

  let rows = db
    .prepare(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone, u.bio AS owner_bio FROM rides r JOIN users u ON u.id=r.user_id
       WHERE r.status='open' AND r.depart_at >= datetime('now','-30 minutes')
       ORDER BY r.depart_at ASC LIMIT 200`
    )
    .all()

  if (req.query.date) rows = rows.filter((r) => r.depart_at.slice(0, 10) === String(req.query.date))

  // filters
  if (req.query.vehicle) rows = rows.filter((r) => r.vehicle_type === String(req.query.vehicle))
  if (req.query.max_price !== undefined && req.query.max_price !== '') {
    const mp = Number(req.query.max_price)
    if (Number.isFinite(mp)) rows = rows.filter((r) => r.price <= mp)
  }
  if (req.query.repeat && req.query.repeat !== '') {
    rows = rows.filter((r) => r.repeat_every === String(req.query.repeat))
  }

  // one aggregate query for all rides instead of a COUNT per ride (avoids N+1)
  const takenMap = new Map(
    db
      .prepare("SELECT ride_id, COALESCE(SUM(seats),0) AS s FROM requests WHERE status='accepted' GROUP BY ride_id")
      .all()
      .map((x) => [x.ride_id, x.s])
  )
  rows = rows.filter((r) => (takenMap.get(r.id) || 0) < r.seats_total)
  if (viewer) rows = rows.filter((r) => r.user_id !== viewer.id)

  const fLat = Number.parseFloat(req.query.from_lat)
  const fLng = Number.parseFloat(req.query.from_lng)
  const tLat = Number.parseFloat(req.query.to_lat)
  const tLng = Number.parseFloat(req.query.to_lng)
  const hasPoints = [fLat, fLng, tLat, tLng].every(Number.isFinite)

  rows = rows.map((r) => ({ ...r, seats_taken: takenMap.get(r.id) || 0 }))

  // trim owner contact if viewer isn't an accepted participant yet (privacy)
  rows = rows.map((r) => {
    const { owner_phone, ...rest } = r
    void owner_phone
    return rest
  })

  // one aggregate query for owner trust scores
  const ownerIds = [...new Set(rows.map((r) => r.user_id))]
  let ownerStats = new Map()
  if (ownerIds.length > 0) {
    const stats = db
      .prepare(
        `SELECT to_user_id, ROUND(AVG(stars),1) AS avg_rating, COUNT(*) AS total_ratings
         FROM ratings WHERE to_user_id IN (${ownerIds.map(() => '?').join(',')})
         GROUP BY to_user_id`
      )
      .all(...ownerIds)
    stats.forEach((s) => ownerStats.set(s.to_user_id, s))
  }
  rows = rows.map((r) => ({
    ...r,
    owner_rating: ownerStats.get(r.user_id)?.avg_rating || null,
    owner_ratings_count: ownerStats.get(r.user_id)?.total_ratings || 0,
  }))

  let results
  if (hasPoints) {
    // proximity match: trip starts near my start, ends near my destination
    results = rows
      .map((r) => {
        const dStart = distanceKm(fLat, fLng, r.from_lat, r.from_lng)
        const dEnd = distanceKm(tLat, tLng, r.to_lat, r.to_lng)
        return { ...r, dist_start: Math.round(dStart * 10) / 10, dist_end: Math.round(dEnd * 10) / 10 }
      })
      .filter((r) => r.dist_start <= 15 && r.dist_end <= 15)
      .sort((a, b) => a.dist_start + a.dist_end - (b.dist_start + b.dist_end))
  } else {
    // text-only fallback (or plain browse when no filters given)
    const ft = String(req.query.from_text || '').toLowerCase().trim()
    const tt = String(req.query.to_text || '').toLowerCase().trim()
    results = rows.filter(
      (r) => (!ft || r.from_name.toLowerCase().includes(ft)) && (!tt || r.to_name.toLowerCase().includes(tt))
    )
  }

  res.json({ results: withMyStatus(results, viewer?.id) })
})

// ---------- my offered rides + incoming requests (owner) ----------
router.get('/rides/mine', auth, (req, res) => {
  const rides = db
    .prepare(
      `SELECT r.*, u.name AS owner_name FROM rides r JOIN users u ON u.id=r.user_id
       WHERE r.user_id=? ORDER BY r.depart_at DESC`
    )
    .all(req.user.id)

  if (rides.length === 0) return res.json({ rides: [] })

  const rideIds = rides.map((r) => r.id)
  const placeholders = rideIds.map(() => '?').join(',')

  const takenMap = new Map(
    db
      .prepare(
        `SELECT ride_id, COALESCE(SUM(seats),0) AS s FROM requests
         WHERE ride_id IN (${placeholders}) AND status='accepted' GROUP BY ride_id`
      )
      .all(...rideIds)
      .map((x) => [x.ride_id, x.s])
  )

  const requestRows = db
    .prepare(
      `SELECT q.*, u.name AS rider_name
       FROM requests q JOIN users u ON u.id=q.rider_id
       WHERE q.ride_id IN (${placeholders}) ORDER BY q.created_at DESC`
    )
    .all(...rideIds)

  const requestsByRide = new Map()
  for (const q of requestRows) {
    if (!requestsByRide.has(q.ride_id)) requestsByRide.set(q.ride_id, [])
    requestsByRide.get(q.ride_id).push(q)
  }

  // fetch phone only for accepted riders, batched
  const acceptedRiderIds = [...new Set(requestRows.filter((q) => q.status === 'accepted').map((q) => q.rider_id))]
  let phoneMap = new Map()
  if (acceptedRiderIds.length > 0) {
    const ph = db
      .prepare(`SELECT id, phone FROM users WHERE id IN (${acceptedRiderIds.map(() => '?').join(',')})`)
      .all(...acceptedRiderIds)
    ph.forEach((u) => phoneMap.set(u.id, u.phone))
  }

  const out = rides.map((r) => ({
    ...r,
    seats_taken: takenMap.get(r.id) || 0,
    requests: (requestsByRide.get(r.id) || []).map((q) => ({
      id: q.id,
      ride_id: q.ride_id,
      seats: q.seats,
      message: q.message,
      status: q.status,
      created_at: q.created_at,
      rider_id: q.rider_id,
      rider_name: q.rider_name,
      rider_phone: q.status === 'accepted' ? phoneMap.get(q.rider_id) || null : null,
    })),
  }))
  res.json({ rides: out })
})

// ---------- my sent requests (traveler) ----------
router.get('/requests/mine', auth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT q.id, q.ride_id, q.seats, q.message, q.status, q.created_at,
              r.vehicle_type, r.vehicle_model, r.from_name, r.from_lat, r.from_lng,
              r.to_name, r.to_lat, r.to_lng, r.depart_at, r.price, r.notes, r.status AS ride_status,
              u.name AS owner_name, u.phone AS owner_phone
       FROM requests q
       JOIN rides r ON r.id=q.ride_id
       JOIN users u ON u.id=r.user_id
       WHERE q.rider_id=?
       ORDER BY q.created_at DESC`
    )
    .all(req.user.id)

  res.json({
    requests: rows.map((q) => ({
      ...q,
      owner_phone: q.status === 'accepted' ? q.owner_phone : null, // reveal contact only after acceptance
    })),
  })
})

// ---------- request a seat ----------
router.post('/rides/:id/request', auth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(Number(req.params.id))
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (ride.user_id === req.user.id) return res.status(400).json({ error: 'This is your own ride 🙂' })
  if (ride.status !== 'open') return res.status(400).json({ error: 'This ride is no longer taking requests' })
  if (new Date(ride.depart_at).getTime() < Date.now()) return res.status(400).json({ error: 'This ride already departed' })

  const seats = Math.floor(Number(req.body?.seats || 1))
  if (!Number.isInteger(seats) || seats < 1) return res.status(400).json({ error: 'Seats must be at least 1' })

  const message = String(req.body?.message || '').trim().slice(0, 300)

  // Atomic: only insert if the caller has no active request and enough seats are free.
  // Runs as a single statement, so concurrent requests can't overbook.
  const info = db
    .prepare(
      `INSERT INTO requests (ride_id, rider_id, seats, message)
       SELECT ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM requests
         WHERE ride_id=? AND rider_id=? AND status IN ('pending','accepted')
       )
       AND NOT EXISTS (
         SELECT 1 FROM rides WHERE id=? AND status != 'open'
       )
       AND (
         SELECT COALESCE(SUM(seats),0) FROM requests
         WHERE ride_id=? AND status='accepted'
       ) + ? <= (SELECT seats_total FROM rides WHERE id=?)`
    )
    .run(ride.id, req.user.id, seats, message, ride.id, req.user.id, ride.id, ride.id, seats, ride.id)

  if (info.changes === 0) {
    const free = ride.seats_total - seatsTaken(ride.id)
    const dup = db
      .prepare("SELECT id FROM requests WHERE ride_id=? AND rider_id=? AND status IN ('pending','accepted')")
      .get(ride.id, req.user.id)
    if (dup) return res.status(409).json({ error: 'You already requested this ride — check My Rides' })
    return res.status(400).json({ error: free <= 0 ? 'No seats left on this ride' : `Only ${free} seat(s) left` })
  }

  const yourName = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id)?.name
  notify(ride.user_id, {
    type: 'request',
    title: `${yourName} requested a seat`,
    body: `${yourName} wants ${seats} seat(s) on your ${ride.from_name} → ${ride.to_name} trip.`,
    link: '/my-rides',
  })

  res.json({ ok: true, message: 'Request sent! You will see the response under My Rides.' })
})

// ---------- accept / reject (owner) ----------
for (const action of ['accept', 'reject']) {
  router.post(`/requests/:id/${action}`, auth, (req, res) => {
    const row = db
      .prepare(
        `SELECT q.*, r.user_id AS owner_id FROM requests q JOIN rides r ON r.id=q.ride_id WHERE q.id=?`
      )
      .get(Number(req.params.id))
    if (!row) return res.status(404).json({ error: 'Request not found' })
    if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can do this' })
    if (row.status !== 'pending') return res.status(400).json({ error: `This request was already ${row.status}` })

    if (action === 'accept') {
      const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(row.ride_id)
      const free = ride.seats_total - seatsTaken(ride.id)
      if (row.seats > free) return res.status(400).json({ error: `Not enough seats left (${free} free)` })
    }

    db.prepare('UPDATE requests SET status=? WHERE id=?').run(action === 'accept' ? 'accepted' : 'rejected', row.id)
    refreshStatus(row.ride_id)

    const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(row.ride_id)
    const ownerName = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id)?.name
    if (action === 'accept') {
      notify(row.rider_id, {
        type: 'accept',
        title: 'Your seat is confirmed! 🎉',
        body: `${ownerName} accepted your request on the ${ride.from_name} → ${ride.to_name} trip. Contact details are now visible.`,
        link: '/my-rides',
      })
    } else {
      notify(row.rider_id, {
        type: 'reject',
        title: 'Request declined',
        body: `${ownerName} couldn't take you on the ${ride.from_name} → ${ride.to_name} trip.`,
        link: '/my-rides',
      })
    }

    res.json({ ok: true, message: action === 'accept' ? 'Request accepted — contact details are now visible.' : 'Request rejected.' })
  })
}

// ---------- cancel my booking (traveler) ----------
router.post('/requests/:id/cancel', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM requests WHERE id=?').get(Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'Request not found' })
  if (row.rider_id !== req.user.id) return res.status(403).json({ error: 'Not your request' })
  if (row.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' })

  db.prepare("UPDATE requests SET status='cancelled' WHERE id=?").run(row.id)
  refreshStatus(row.ride_id)

  const yourName = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id)?.name
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(row.ride_id)
  const wasAccepted = row.status === 'accepted'
  if (wasAccepted) {
    notify(ride.user_id, {
      type: 'cancel',
      title: `${yourName} cancelled their seat`,
      body: `${yourName} cancelled on your ${ride.from_name} → ${ride.to_name} trip.`,
      link: '/my-rides',
    })
  } else {
    notify(ride.user_id, {
      type: 'cancel',
      title: `${yourName} withdrew a request`,
      body: `${yourName} withdrew their request for your ${ride.from_name} → ${ride.to_name} trip.`,
      link: '/my-rides',
    })
  }

  res.json({ ok: true, message: 'Booking cancelled.' })
})

// ---------- complete a ride (owner) ----------
router.post('/rides/:id/complete', auth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(Number(req.params.id))
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (ride.user_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can complete this' })
  if (ride.status === 'cancelled') return res.status(400).json({ error: 'Ride was cancelled' })
  if (ride.status === 'completed') return res.status(400).json({ error: 'Already marked as completed' })

  db.prepare("UPDATE rides SET status='completed' WHERE id=?").run(ride.id)
  res.json({ ok: true, message: 'Ride marked as completed.' })
})

// ---------- cancel a ride (owner, before departure) ----------
router.post('/rides/:id/cancel', auth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(Number(req.params.id))
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (ride.user_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can cancel this' })
  if (ride.status === 'cancelled') return res.status(400).json({ error: 'Ride already cancelled' })
  if (ride.status === 'completed') return res.status(400).json({ error: 'Ride already completed' })

  db.prepare("UPDATE rides SET status='cancelled' WHERE id=?").run(ride.id)
  db.prepare(
    "UPDATE requests SET status='cancelled' WHERE ride_id=? AND status IN ('pending','accepted')"
  ).run(ride.id)

  // notify every accepted / pending rider
  const yourName = db.prepare('SELECT name FROM users WHERE id=?').get(req.user.id)?.name
  const riders = db
    .prepare("SELECT DISTINCT rider_id FROM requests WHERE ride_id=? AND status IN ('pending','accepted') AND rider_id != ?")
    .all(ride.id, req.user.id)
  riders.forEach((r) =>
    notify(r.rider_id, {
      type: 'cancel',
      title: 'Trip cancelled — sorry!',
      body: `${yourName} cancelled the ${ride.from_name} → ${ride.to_name} trip you requested.`,
      link: '/find',
    })
  )

  res.json({ ok: true, message: 'Ride cancelled. All riders have been notified.' })
})

// ---------- submit a rating ----------
router.post('/rides/:id/rate', auth, (req, res) => {
  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(Number(req.params.id))
  if (!ride) return res.status(404).json({ error: 'Ride not found' })

  const stars = Math.floor(Number(req.body?.stars))
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: 'Stars must be 1-5' })

  const review = String(req.body?.review || '').trim().slice(0, 500)

  let toUserId = null

  if (ride.user_id === req.user.id) {
    const acceptedRiders = db
      .prepare("SELECT rider_id FROM requests WHERE ride_id=? AND status='accepted'")
      .all(ride.id)
      .map((r) => r.rider_id)
    const target = Number(req.body?.to_user_id)
    if (!target || !acceptedRiders.includes(target))
      return res.status(400).json({ error: 'Target user must be an accepted rider on this ride' })
    toUserId = target
  } else {
    const reqRow = db
      .prepare("SELECT * FROM requests WHERE ride_id=? AND rider_id=? AND status='accepted'")
      .get(ride.id, req.user.id)
    if (!reqRow) return res.status(403).json({ error: 'You can only rate rides you were accepted on' })
    toUserId = ride.user_id
  }

  const existing = db.prepare('SELECT id FROM ratings WHERE ride_id=? AND from_user_id=? AND to_user_id=?').get(ride.id, req.user.id, toUserId)
  if (existing) {
    db.prepare('UPDATE ratings SET stars=?, review=? WHERE id=?').run(stars, review, existing.id)
  } else {
    db.prepare('INSERT INTO ratings (ride_id, from_user_id, to_user_id, stars, review) VALUES (?,?,?,?,?)').run(ride.id, req.user.id, toUserId, stars, review)
  }

  res.json({ ok: true, message: 'Rating submitted!' })
})

// ---------- get ratings for a user ----------
router.get('/users/:id/ratings', auth, (req, res) => {
  const userId = Number(req.params.id)
  const avg = db.prepare('SELECT AVG(stars) AS avg, COUNT(*) AS c FROM ratings WHERE to_user_id=?').get(userId)

  const ratings = db
    .prepare(
      `SELECT r.*, u.name AS from_name FROM ratings r
       JOIN users u ON u.id = r.from_user_id
       WHERE r.to_user_id=? ORDER BY r.created_at DESC LIMIT 50`
    )
    .all(userId)

  res.json({
    avgRating: avg.avg ? Math.round(avg.avg * 10) / 10 : null,
    totalRatings: avg.c,
    ratings,
  })
})

// ---------- ride history (owner + traveler) ----------
router.get('/rides/history', auth, (req, res) => {
  const offered = db
    .prepare(
      `SELECT r.*, u.name AS owner_name FROM rides r
       JOIN users u ON u.id=r.user_id
       WHERE r.user_id=? AND r.status IN ('completed','cancelled')
       ORDER BY r.depart_at DESC`
    )
    .all(req.user.id)

  const offeredWithRiders = offered.map((r) => ({
    ...r,
    _acceptedRiders: db
      .prepare(
        `SELECT q.rider_id AS id, u.name FROM requests q
         JOIN users u ON u.id=q.rider_id
         WHERE q.ride_id=? AND q.status='accepted'`
      )
      .all(r.id),
  }))

  const acceptedIds = db
    .prepare("SELECT ride_id FROM requests WHERE rider_id=? AND status='accepted'")
    .all(req.user.id)
    .map((r) => r.ride_id)

  const uniqueIds = [...new Set(acceptedIds)]
  const joined = uniqueIds.length === 0
    ? []
    : db
        .prepare(
          `SELECT r.*, u.name AS owner_name,
                  (SELECT status FROM requests WHERE ride_id=r.id AND rider_id=?) AS my_status
           FROM rides r JOIN users u ON u.id=r.user_id
           WHERE r.id IN (${uniqueIds.map(() => '?').join(',')})
           ORDER BY r.depart_at DESC`
        )
        .all(req.user.id, ...uniqueIds)

  const allIds = [...new Set([...offeredWithRiders.map((r) => r.id), ...joined.map((r) => r.id)])]
  let ratingsMap = new Map()
  if (allIds.length > 0) {
    const ratings = db
      .prepare(`SELECT * FROM ratings WHERE ride_id IN (${allIds.map(() => '?').join(',')}) AND from_user_id=?`)
      .all(...allIds, req.user.id)
    ratings.forEach((r) => ratingsMap.set(r.ride_id, r))
  }

  res.json({
    offered: offeredWithRiders.map((r) => ({ ...r, myRating: ratingsMap.get(r.id) || null })),
    joined: joined.map((r) => ({ ...r, myRating: ratingsMap.get(r.id) || null })),
  })
})

// tiny helper: verify token but never throw (used for optional auth on search)
function tryAuth(req) {
  try {
    return jwt.verify(String(req.headers.authorization).slice(7), process.env.JWT_SECRET)
  } catch {
    return null
  }
}

export default router
