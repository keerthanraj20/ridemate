import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { all, get, run } from '../db.js'
import { distanceKm, isBlocked, publicUser } from '../util.js'
import { auth } from './auth.js'
import { notify } from '../notify.js'
import { refundEscrowForRequest, refundEscrowForRide, autoReleaseForRide } from '../payments.js'

const router = Router()
export const VEHICLES = ['bike', 'car', 'auto', 'van', 'other']
export const REPEAT = ['none', 'daily', 'weekly', 'weekdays']
const VEHICLE_LABEL = { bike: 'bike', car: 'car', auto: 'auto-rickshaw', van: 'van', other: 'vehicle' }
const vehicleName = (t) => VEHICLE_LABEL[t] || 'vehicle'

// ---------- helpers ----------
const seatsTaken = async (rideId) =>
  (await get("SELECT COALESCE(SUM(seats),0) AS s FROM requests WHERE ride_id=? AND status='accepted'", [rideId])).s

// keep ride open/full flag accurate based on accepted seats
async function refreshStatus(rideId) {
  const ride = await get('SELECT seats_total, status FROM rides WHERE id=?', [rideId])
  if (!ride || ride.status === 'cancelled') return
  const status = (await seatsTaken(rideId)) >= ride.seats_total ? 'full' : 'open'
  await run('UPDATE rides SET status=? WHERE id=?', [status, rideId])
}

// ---------- create a ride (vehicle owner) ----------
router.post('/rides', auth, async (req, res) => {
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

  const info = await run(
    `INSERT INTO rides
     (user_id,vehicle_type,vehicle_model,from_name,from_lat,from_lng,to_name,to_lat,to_lng,depart_at,seats_total,price,notes,repeat_every)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
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
      repeat,
    ]
  )

  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(info.lastInsertRowid)])

  // Notify followers that this owner posted a new ride.
  const followers = await all("SELECT follower_id FROM owner_follows WHERE followee_id=?", [req.user.id])
  for (const f of followers) {
    await notify(f.follower_id, {
      type: 'ride',
      title: `${req.user.name} shared a new ${vehicleName} ride`,
      body: `${b.from_name.trim()} → ${b.to_name.trim()} · ${seats} seat(s) · ₹${price}`,
      link: `/rides/${ride.id}`,
    })
  }

  // Optional round trip: auto-create the return leg (reverse route).
  if (b.return_depart_at) {
    const returnDepart = new Date(b.return_depart_at)
    if (!Number.isNaN(returnDepart.getTime()) && returnDepart.getTime() > Date.now() - 60_000) {
      const ret = await run(
        `INSERT INTO rides
         (user_id,vehicle_type,vehicle_model,from_name,from_lat,from_lng,to_name,to_lat,to_lng,depart_at,seats_total,price,notes,repeat_every)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          req.user.id,
          b.vehicle_type,
          String(b.vehicle_model || '').trim().slice(0, 60),
          b.to_name.trim().slice(0, 100),
          num(b.to_lat),
          num(b.to_lng),
          b.from_name.trim().slice(0, 100),
          num(b.from_lat),
          num(b.from_lng),
          returnDepart.toISOString(),
          seats,
          price,
          (String(b.notes || '').trim() + ' · return leg').slice(0, 300),
          repeat,
        ]
      )
      return res.json({ ride, returnRide: await get('SELECT * FROM rides WHERE id=?', [Number(ret.lastInsertRowid)]) })
    }
  }

  res.json({ ride })
})

// ---------- search / browse rides ----------
// Pass from_* & to_* coords to match trips that start near you AND end near your destination.
router.get('/rides/search', async (req, res) => {
  const viewer = req.headers.authorization ? tryAuth(req) : null

  const PAGE_SIZE = Math.min(100, Math.max(1, Number(req.query.page_size) || 50))
  const page = Math.max(1, Number(req.query.page) || 1)

  const fLat = Number.parseFloat(req.query.from_lat)
  const fLng = Number.parseFloat(req.query.from_lng)
  const tLat = Number.parseFloat(req.query.to_lat)
  const tLng = Number.parseFloat(req.query.to_lng)
  const hasPoints = [fLat, fLng, tLat, tLng].every(Number.isFinite)

  // Approximate km-to-degree conversion for bounding box (at India latitudes ~1° ≈ 111km)
  const KM_TO_DEG = 1 / 111
  const RADIUS_KM = 15

  // Build WHERE conditions dynamically for indexed queries
  const conditions = ["r.status = 'open'", "r.depart_at >= datetime('now', '-30 minutes')"]
  const params = []

  // Bounding box pre-filter on FROM coordinates (uses idx_rides_from_coords)
  if (hasPoints) {
    const latDelta = RADIUS_KM * KM_TO_DEG
    const lngDelta = RADIUS_KM * KM_TO_DEG / Math.cos((fLat * Math.PI) / 180)
    conditions.push('r.from_lat BETWEEN ? AND ?')
    params.push(fLat - latDelta, fLat + latDelta)
    conditions.push('r.from_lng BETWEEN ? AND ?')
    params.push(fLng - lngDelta, fLng + lngDelta)
  }

  // Bounding box on TO coordinates (uses idx_rides_to_coords) — a 15km radius
  // is always inside a ±15km lat/lng box, so this is a safe superset.
  if (hasPoints) {
    const latDelta = RADIUS_KM * KM_TO_DEG
    const lngDelta = RADIUS_KM * KM_TO_DEG / Math.cos((tLat * Math.PI) / 180)
    conditions.push('r.to_lat BETWEEN ? AND ?')
    params.push(tLat - latDelta, tLat + latDelta)
    conditions.push('r.to_lng BETWEEN ? AND ?')
    params.push(tLng - lngDelta, tLng + lngDelta)
  }

  // SQL-level filters (avoids fetching then discarding in JS)
  if (req.query.date) {
    conditions.push("date(r.depart_at) = ?")
    params.push(String(req.query.date))
  }
  if (req.query.vehicle) {
    conditions.push('r.vehicle_type = ?')
    params.push(String(req.query.vehicle))
  }
  if (req.query.max_price !== undefined && req.query.max_price !== '') {
    const mp = Number(req.query.max_price)
    if (Number.isFinite(mp)) {
      conditions.push('r.price <= ?')
      params.push(mp)
    }
  }
  if (req.query.repeat && req.query.repeat !== '') {
    conditions.push('r.repeat_every = ?')
    params.push(String(req.query.repeat))
  }

  // Time-of-day window (compared in UTC)
  const fromHr = req.query.from_hr !== undefined && req.query.from_hr !== ''
    ? Math.max(0, Math.min(23, Math.floor(Number(req.query.from_hr))))
    : null
  const toHr = req.query.to_hr !== undefined && req.query.to_hr !== ''
    ? Math.max(0, Math.min(23, Math.floor(Number(req.query.to_hr))))
    : null
  if (fromHr !== null) {
    conditions.push("cast(strftime('%H', r.depart_at) as integer) >= ?")
    params.push(fromHr)
  }
  if (toHr !== null) {
    conditions.push("cast(strftime('%H', r.depart_at) as integer) <= ?")
    params.push(toHr)
  }

  const whereClause = conditions.join(' AND ')

  // One query: rides + seat availability (avoids separate N+1 seat queries)
  let sql = `
    SELECT r.*,
           u.name AS owner_name, u.phone AS owner_phone, u.bio AS owner_bio,
           u.email_verified AS owner_verified, u.id_verified AS owner_id_verified,
           COALESCE(taken.s, 0) AS seats_taken
    FROM rides r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN (
      SELECT ride_id, SUM(seats) AS s FROM requests WHERE status='accepted' GROUP BY ride_id
    ) taken ON taken.ride_id = r.id
    WHERE ${whereClause}
      AND (COALESCE(taken.s, 0) < r.seats_total)`

  // Exclude own rides
  if (viewer) {
    sql += ' AND r.user_id != ?'
    params.push(viewer.id)
  }

  // Min seats filter
  const minSeats = Number.isFinite(Number(req.query.min_seats))
    ? Math.max(1, Math.floor(Number(req.query.min_seats)))
    : null
  if (minSeats) {
    sql += ' AND (COALESCE(taken.s, 0) + ? <= r.seats_total)'
    params.push(minSeats)
  }

  // Order by departure (indexed) — fetch a generous set for proximity sorting
  sql += ' ORDER BY r.depart_at ASC LIMIT ?'
  params.push(hasPoints ? 500 : 200)

  let rows = await all(sql, params)

  // Attach my_status (viewer's existing request)
  if (viewer) {
    const myRequests = await all(
      "SELECT ride_id, status FROM requests WHERE rider_id=? AND status IN ('pending','accepted')",
      [viewer.id]
    )
    const myMap = new Map(myRequests.map((x) => [x.ride_id, x.status]))
    rows = rows.map((r) => ({ ...r, my_status: myMap.get(r.id) || null }))
  } else {
    rows = rows.map((r) => ({ ...r, my_status: null }))
  }

  // Owner trust scores (batched)
  const ownerIds = [...new Set(rows.map((r) => r.user_id))]
  let ownerStats = new Map()
  if (ownerIds.length > 0) {
    const stats = await all(
      `SELECT to_user_id, ROUND(AVG(stars),1) AS avg_rating, COUNT(*) AS total_ratings
       FROM ratings WHERE to_user_id IN (${ownerIds.map(() => '?').join(',')})
       GROUP BY to_user_id`,
      ownerIds
    )
    stats.forEach((s) => ownerStats.set(s.to_user_id, s))
  }
  rows = rows.map((r) => ({
    ...r,
    owner_rating: ownerStats.get(r.user_id)?.avg_rating || null,
    owner_ratings_count: ownerStats.get(r.user_id)?.total_ratings || 0,
    owner_verified: r.email_verified ? 1 : 0,
    owner_id_verified: r.id_verified ? 1 : 0,
  }))

  // Trim owner contact (privacy — only revealed after acceptance)
  rows = rows.map((r) => {
    const { owner_phone, ...rest } = r
    void owner_phone
    return rest
  })

  let results
  if (hasPoints) {
    // Haversine distance filtering + sort by combined proximity
    results = rows
      .map((r) => {
        const dStart = distanceKm(fLat, fLng, r.from_lat, r.from_lng)
        const dEnd = distanceKm(tLat, tLng, r.to_lat, r.to_lng)
        return { ...r, dist_start: Math.round(dStart * 10) / 10, dist_end: Math.round(dEnd * 10) / 10 }
      })
      .filter((r) => r.dist_start <= RADIUS_KM && r.dist_end <= RADIUS_KM)
      .sort((a, b) => a.dist_start + a.dist_end - (b.dist_start + b.dist_end))
  } else {
    // Text-only fallback (or plain browse when no filters given)
    const ft = String(req.query.from_text || '').toLowerCase().trim()
    const tt = String(req.query.to_text || '').toLowerCase().trim()
    results = rows.filter(
      (r) => (!ft || r.from_name.toLowerCase().includes(ft)) && (!tt || r.to_name.toLowerCase().includes(tt))
    )
  }

  const total = results.length
  const slice = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  res.json({
    results: slice,
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: page * PAGE_SIZE < total,
  })
})

// ---------- my offered rides + incoming requests (owner) ----------
router.get('/rides/mine', auth, async (req, res) => {
  const rides = await all(
    `SELECT r.*, u.name AS owner_name FROM rides r JOIN users u ON u.id=r.user_id
     WHERE r.user_id=? ORDER BY r.depart_at DESC`,
    [req.user.id]
  )

  if (rides.length === 0) return res.json({ rides: [] })

  const rideIds = rides.map((r) => r.id)
  const placeholders = rideIds.map(() => '?').join(',')

  const takenMap = new Map(
    (await all(
      `SELECT ride_id, COALESCE(SUM(seats),0) AS s FROM requests
       WHERE ride_id IN (${placeholders}) AND status='accepted' GROUP BY ride_id`,
      rideIds
    )).map((x) => [x.ride_id, x.s])
  )

  const requestRows = await all(
    `SELECT q.*, u.name AS rider_name
     FROM requests q JOIN users u ON u.id=q.rider_id
     WHERE q.ride_id IN (${placeholders}) ORDER BY q.created_at DESC`,
    rideIds
  )

  const requestsByRide = new Map()
  for (const q of requestRows) {
    if (!requestsByRide.has(q.ride_id)) requestsByRide.set(q.ride_id, [])
    requestsByRide.get(q.ride_id).push(q)
  }

  // fetch phone only for accepted riders, batched
  const acceptedRiderIds = [...new Set(requestRows.filter((q) => q.status === 'accepted').map((q) => q.rider_id))]
  let phoneMap = new Map()
  if (acceptedRiderIds.length > 0) {
    const ph = await all(`SELECT id, phone FROM users WHERE id IN (${acceptedRiderIds.map(() => '?').join(',')})`, acceptedRiderIds)
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
router.get('/requests/mine', auth, async (req, res) => {
  const rows = await all(
    `SELECT q.id, q.ride_id, q.seats, q.message, q.status, q.created_at,
            r.vehicle_type, r.vehicle_model, r.from_name, r.from_lat, r.from_lng,
            r.to_name, r.to_lat, r.to_lng, r.depart_at, r.price, r.notes, r.status AS ride_status,
            u.name AS owner_name, u.phone AS owner_phone
     FROM requests q
     JOIN rides r ON r.id=q.ride_id
     JOIN users u ON u.id=r.user_id
     WHERE q.rider_id=?
     ORDER BY q.created_at DESC`,
    [req.user.id]
  )

  res.json({
    requests: rows.map((q) => ({
      ...q,
      owner_phone: q.status === 'accepted' ? q.owner_phone : null, // reveal contact only after acceptance
    })),
  })
})

// ---------- request a seat ----------
router.post('/rides/:id/request', auth, async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (ride.user_id === req.user.id) return res.status(400).json({ error: 'This is your own ride 🙂' })
  if (await isBlocked(ride.user_id, req.user.id)) return res.status(403).json({ error: 'You cannot request rides from this user' })
  if (ride.status !== 'open') return res.status(400).json({ error: 'This ride is no longer taking requests' })
  if (new Date(ride.depart_at).getTime() < Date.now()) return res.status(400).json({ error: 'This ride already departed' })

  const seats = Math.floor(Number(req.body?.seats || 1))
  if (!Number.isInteger(seats) || seats < 1) return res.status(400).json({ error: 'Seats must be at least 1' })

  const message = String(req.body?.message || '').trim().slice(0, 300)

  // Atomic: only insert if the caller has no active request and enough seats are free.
  // Runs as a single statement, so concurrent requests can't overbook.
  const info = await run(
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
     ) + ? <= (SELECT seats_total FROM rides WHERE id=?)`,
    [ride.id, req.user.id, seats, message, ride.id, req.user.id, ride.id, ride.id, seats, ride.id]
  )

  if (info.changes === 0) {
    const free = ride.seats_total - (await seatsTaken(ride.id))
    const dup = await get(
      "SELECT id FROM requests WHERE ride_id=? AND rider_id=? AND status IN ('pending','accepted')",
      [ride.id, req.user.id]
    )
    if (dup) return res.status(409).json({ error: 'You already requested this ride — check My Rides' })
    return res.status(400).json({ error: free <= 0 ? 'No seats left on this ride' : `Only ${free} seat(s) left` })
  }

  const yourName = (await get('SELECT name FROM users WHERE id=?', [req.user.id]))?.name
  await notify(ride.user_id, {
    type: 'request',
    title: `${yourName} requested a seat`,
    body: `${yourName} wants ${seats} seat(s) on your ${ride.from_name} → ${ride.to_name} trip.`,
    link: '/my-rides',
  })

  res.json({ ok: true, message: 'Request sent! You will see the response under My Rides.' })
})

// ---------- accept / reject (owner) ----------
for (const action of ['accept', 'reject']) {
  router.post(`/requests/:id/${action}`, auth, async (req, res) => {
    const row = await get(
      `SELECT q.*, r.user_id AS owner_id FROM requests q JOIN rides r ON r.id=q.ride_id WHERE q.id=?`,
      [Number(req.params.id)]
    )
    if (!row) return res.status(404).json({ error: 'Request not found' })
    if (row.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can do this' })
    if (row.status !== 'pending') return res.status(400).json({ error: `This request was already ${row.status}` })

    if (action === 'accept') {
      // Reserve a seat. Requests are inserted atomically, so a single owner
      // accepting sequentially can't overbook; the re-check below guards
      // against a full ride at accept time.
      const ride = await get('SELECT * FROM rides WHERE id=?', [row.ride_id])
      const free = ride.seats_total - (await seatsTaken(ride.id))
      if (row.seats > free) return res.status(400).json({ error: `Not enough seats left (${free} free)` })

      await run('UPDATE requests SET status=? WHERE id=?', ['accepted', row.id])
      await refreshStatus(row.ride_id)

      const ownerName = (await get('SELECT name FROM users WHERE id=?', [req.user.id]))?.name
      await notify(row.rider_id, {
        type: 'accept',
        title: 'Your seat is confirmed! 🎉',
        body: `${ownerName} accepted your request on the ${ride.from_name} → ${ride.to_name} trip. Contact details are now visible.`,
        link: '/my-rides',
      })
    } else {
      await run('UPDATE requests SET status=? WHERE id=?', ['rejected', row.id])
      await refreshStatus(row.ride_id)

      const ride = await get('SELECT * FROM rides WHERE id=?', [row.ride_id])
      const ownerName = (await get('SELECT name FROM users WHERE id=?', [req.user.id]))?.name
      await notify(row.rider_id, {
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
router.post('/requests/:id/cancel', auth, async (req, res) => {
  const row = await get('SELECT * FROM requests WHERE id=?', [Number(req.params.id)])
  if (!row) return res.status(404).json({ error: 'Request not found' })
  if (row.rider_id !== req.user.id) return res.status(403).json({ error: 'Not your request' })
  if (row.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled' })

  const reason = String(req.body?.reason || '').trim().slice(0, 200)
  const wasAccepted = row.status === 'accepted'
  await run("UPDATE requests SET status='cancelled', cancel_reason=? WHERE id=?", [reason || null, row.id])
  await refreshStatus(row.ride_id)
  try {
    await refundEscrowForRequest(row.id)
  } catch (err) {
    // Refund failed at the gateway (e.g. already refunded) — don't block the
    // cancellation, but surface it so admins can reconcile.
    console.error(`Refund failed for request ${row.id}:`, err?.message || err)
  }

  const yourName = (await get('SELECT name FROM users WHERE id=?', [req.user.id]))?.name
  const ride = await get('SELECT * FROM rides WHERE id=?', [row.ride_id])
  const reasonSuffix = reason ? ` Reason: ${reason}` : ''
  await notify(ride.user_id, {
    type: 'cancel',
    title: wasAccepted ? `${yourName} cancelled their seat` : `${yourName} withdrew a request`,
    body: wasAccepted
      ? `${yourName} cancelled on your ${ride.from_name} → ${ride.to_name} trip.${reasonSuffix}`
      : `${yourName} withdrew their request for your ${ride.from_name} → ${ride.to_name} trip.${reasonSuffix}`,
    link: '/my-rides',
  })

  res.json({ ok: true, message: 'Booking cancelled.' })
})

// ---------- complete a ride (owner) ----------
router.post('/rides/:id/complete', auth, async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (ride.user_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can complete this' })
  if (ride.status === 'cancelled') return res.status(400).json({ error: 'Ride was cancelled' })
  if (ride.status === 'completed') return res.status(400).json({ error: 'Already marked as completed' })

  await run("UPDATE rides SET status='completed' WHERE id=?", [ride.id])
  await autoReleaseForRide(ride.id)
  res.json({ ok: true, message: 'Ride marked as completed.' })
})

// ---------- cancel a ride (owner, before departure) ----------
router.post('/rides/:id/cancel', auth, async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (ride.user_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can cancel this' })
  if (ride.status === 'cancelled') return res.status(400).json({ error: 'Ride already cancelled' })
  if (ride.status === 'completed') return res.status(400).json({ error: 'Ride already completed' })

  const reason = String(req.body?.reason || '').trim().slice(0, 200)
  await run("UPDATE rides SET status='cancelled', cancel_reason=? WHERE id=?", [reason || null, ride.id])
  await run(
    "UPDATE requests SET status='cancelled' WHERE ride_id=? AND status IN ('pending','accepted')",
    [ride.id]
  )
  try {
    await refundEscrowForRide(ride.id)
  } catch (err) {
    console.error(`Refund failed on ride cancel ${ride.id}:`, err?.message || err)
  }

  // notify every accepted / pending rider
  const yourName = (await get('SELECT name FROM users WHERE id=?', [req.user.id]))?.name
  const riders = await all(
    "SELECT DISTINCT rider_id FROM requests WHERE ride_id=? AND status IN ('pending','accepted') AND rider_id != ?",
    [ride.id, req.user.id]
  )
  for (const r of riders) {
    await notify(r.rider_id, {
      type: 'cancel',
      title: 'Trip cancelled — sorry!',
      body: `${yourName} cancelled the ${ride.from_name} → ${ride.to_name} trip you requested.`,
      link: '/find',
    })
  }

  res.json({ ok: true, message: 'Ride cancelled. All riders have been notified.' })
})

// ---------- submit a rating ----------
router.post('/rides/:id/rate', auth, async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })

  const stars = Math.floor(Number(req.body?.stars))
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return res.status(400).json({ error: 'Stars must be 1-5' })

  const review = String(req.body?.review || '').trim().slice(0, 500)

  let toUserId = null

  if (ride.user_id === req.user.id) {
    const acceptedRiders = (await all(
      "SELECT rider_id FROM requests WHERE ride_id=? AND status='accepted'",
      [ride.id]
    )).map((r) => r.rider_id)
    const target = Number(req.body?.to_user_id)
    if (!target || !acceptedRiders.includes(target))
      return res.status(400).json({ error: 'Target user must be an accepted rider on this ride' })
    toUserId = target
  } else {
    const reqRow = await get(
      "SELECT * FROM requests WHERE ride_id=? AND rider_id=? AND status='accepted'",
      [ride.id, req.user.id]
    )
    if (!reqRow) return res.status(403).json({ error: 'You can only rate rides you were accepted on' })
    toUserId = ride.user_id
  }

  const existing = await get('SELECT id FROM ratings WHERE ride_id=? AND from_user_id=? AND to_user_id=?', [ride.id, req.user.id, toUserId])
  if (existing) {
    await run('UPDATE ratings SET stars=?, review=? WHERE id=?', [stars, review, existing.id])
  } else {
    await run('INSERT INTO ratings (ride_id, from_user_id, to_user_id, stars, review) VALUES (?,?,?,?,?)', [ride.id, req.user.id, toUserId, stars, review])
  }

  res.json({ ok: true, message: 'Rating submitted!' })
})

// ---------- get ratings for a user ----------
router.get('/users/:id/ratings', auth, async (req, res) => {
  const userId = Number(req.params.id)
  const avg = await get('SELECT AVG(stars) AS avg, COUNT(*) AS c FROM ratings WHERE to_user_id=?', [userId])

  const ratings = await all(
    `SELECT r.*, u.name AS from_name FROM ratings r
     JOIN users u ON u.id = r.from_user_id
     WHERE r.to_user_id=? ORDER BY r.created_at DESC LIMIT 50`,
    [userId]
  )

  res.json({
    avgRating: avg.avg ? Math.round(avg.avg * 10) / 10 : null,
    totalRatings: avg.c,
    ratings,
  })
})

// ---------- ride history (owner + traveler) ----------
router.get('/rides/history', auth, async (req, res) => {
  const offered = await all(
    `SELECT r.*, u.name AS owner_name FROM rides r
     JOIN users u ON u.id=r.user_id
     WHERE r.user_id=? AND r.status IN ('completed','cancelled')
     ORDER BY r.depart_at DESC`,
    [req.user.id]
  )

  // Batch-fetch accepted riders for all offered rides (avoids per-ride N+1).
  let ridersByRide = new Map()
  if (offered.length > 0) {
    const placeholders = offered.map(() => '?').join(',')
    const riderRows = await all(
      `SELECT q.ride_id, q.rider_id AS id, u.name FROM requests q
       JOIN users u ON u.id=q.rider_id
       WHERE q.ride_id IN (${placeholders}) AND q.status='accepted'
       ORDER BY q.created_at ASC`,
      offered.map((r) => r.id)
    )
    for (const rr of riderRows) {
      if (!ridersByRide.has(rr.ride_id)) ridersByRide.set(rr.ride_id, [])
      ridersByRide.get(rr.ride_id).push({ id: rr.id, name: rr.name })
    }
  }

  const offeredWithRiders = offered.map((r) => ({ ...r, _acceptedRiders: ridersByRide.get(r.id) || [] }))

  const acceptedIds = (await all(
    "SELECT ride_id FROM requests WHERE rider_id=? AND status='accepted'",
    [req.user.id]
  )).map((r) => r.ride_id)

  const uniqueIds = [...new Set(acceptedIds)]
  const joined = uniqueIds.length === 0
    ? []
    : await all(
        `SELECT r.*, u.name AS owner_name,
                (SELECT status FROM requests WHERE ride_id=r.id AND rider_id=?) AS my_status
         FROM rides r JOIN users u ON u.id=r.user_id
         WHERE r.id IN (${uniqueIds.map(() => '?').join(',')})
         ORDER BY r.depart_at DESC`,
        [req.user.id, ...uniqueIds]
      )

  const allIds = [...new Set([...offeredWithRiders.map((r) => r.id), ...joined.map((r) => r.id)])]
  let ratingsMap = new Map()
  if (allIds.length > 0) {
    const ratings = await all(
      `SELECT * FROM ratings WHERE ride_id IN (${allIds.map(() => '?').join(',')}) AND from_user_id=?`,
      [...allIds, req.user.id]
    )
    ratings.forEach((r) => ratingsMap.set(r.ride_id, r))
  }

  const totalJoined = joined.length
  const PAGE_SIZE = Math.min(100, Math.max(1, Number(req.query.page_size) || 20))
  const page = Math.max(1, Number(req.query.page) || 1)
  const joinedPage = joined.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  res.json({
    offered: offeredWithRiders.map((r) => ({ ...r, myRating: ratingsMap.get(r.id) || null })),
    joined: joinedPage.map((r) => ({ ...r, myRating: ratingsMap.get(r.id) || null })),
    page,
    totalJoined,
    hasMore: page * PAGE_SIZE < totalJoined,
  })
})

// small helper: verify token but never throw (used for optional auth on search)
function tryAuth(req) {
  try {
    return jwt.verify(String(req.headers.authorization).slice(7), process.env.JWT_SECRET)
  } catch {
    return null
  }
}

// ---------- ride detail (public) ----------
router.get('/rides/:id', async (req, res) => {
  const ride = await get('SELECT * FROM rides WHERE id=?', [Number(req.params.id)])
  if (!ride) return res.status(404).json({ error: 'Ride not found' })

  const owner = await get('SELECT * FROM users WHERE id=?', [ride.user_id])
  const taken = (await get(
    "SELECT COALESCE(SUM(seats),0) AS s FROM requests WHERE ride_id=? AND status='accepted'",
    [ride.id]
  )).s
  const stats = await get(
    'SELECT ROUND(AVG(stars),1) AS avg_rating, COUNT(*) AS total_ratings FROM ratings WHERE to_user_id=?',
    [ride.user_id]
  )

  const viewer = req.headers.authorization ? tryAuth(req) : null
  let my_request = null
  let is_participant = false
  if (viewer) {
    my_request = await get(
      "SELECT id, seats, status FROM requests WHERE ride_id=? AND rider_id=?",
      [ride.id, viewer.id]
    ) || null
    is_participant = ride.user_id === viewer.id || Boolean(my_request && my_request.status === 'accepted')
  }

  // accepted riders are visible (names only) so owners/rider can recognize group
  const acceptedRiders = await all(
    `SELECT q.rider_id, u.name, u.avatar, u.id_verified FROM requests q
     JOIN users u ON u.id=q.rider_id
     WHERE q.ride_id=? AND q.status='accepted'
     ORDER BY q.created_at ASC`,
    [ride.id]
  )

  res.json({
    ride: {
      ...ride,
      seats_taken: taken,
      seats_left: ride.seats_total - taken,
      repeat_label: ride.repeat_every === 'none' ? null : ride.repeat_every,
    },
    owner: publicUser(owner),
    owner_rating: stats.avg_rating,
    owner_ratings_count: stats.total_ratings,
    acceptedRiders: is_participant || viewer === null
      ? acceptedRiders
      : acceptedRiders.map((r) => ({ rider_id: r.rider_id, name: r.name.slice(0, 1) + '***' })),
    my_request,
    is_participant,
    is_owner: viewer ? ride.user_id === viewer.id : false,
  })
})

export default router