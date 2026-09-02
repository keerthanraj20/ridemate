import { db } from './db.js'

// Generate tomorrow's instance of each recurring ride (copied from the
// original ride every day). Encodes schedule in repeat_child_on.
// repeat_every values: daily | weekly | weekdays
//
// The original ride row acts as the TEMPLATE (repeat_parent_id IS NULL).
// Generated instances carry repeat_parent_id = template.id and a
// repeat_child_on date ("YYYY-MM-DD") so we can regenerate each day.

function copyInstance(template, dateStr) {
  const depart = new Date(template.depart_at)
  // Keep the same time-of-day (UTC) as the template. Constructing in UTC
  // (not local time) avoids DST shifts on the child instance.
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(
    Date.UTC(y, m - 1, d, depart.getUTCHours(), depart.getUTCMinutes(), depart.getUTCSeconds())
  )

  const insert = db.prepare(
    `INSERT INTO rides
       (user_id, vehicle_type, vehicle_model, from_name, from_lat, from_lng,
        to_name, to_lat, to_lng, depart_at, seats_total, price, notes, status,
        repeat_every, repeat_parent_id, repeat_child_on)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'open', ?, ?, ?)`
  )
  insert.run(
    template.user_id,
    template.vehicle_type,
    template.vehicle_model,
    template.from_name,
    template.from_lat,
    template.from_lng,
    template.to_name,
    template.to_lat,
    template.to_lng,
    next.toISOString(),
    template.seats_total,
    template.price,
    template.notes,
    template.repeat_every,
    template.id,
    dateStr
  )
}

// Which dates must a template have an instance for?
// We only look at the NEXT calendar day to avoid back-filling the past.
function shouldHaveInstanceOn(template, dateObj) {
  const dow = dateObj.getUTCDay() // 0=Sun ... 6=Sat (dateObj is UTC midnight)
  switch (template.repeat_every) {
    case 'daily':
      return true
    case 'weekdays':
      return dow >= 1 && dow <= 5
    case 'weekly':
      // repeat on the same weekday as the template's ORIGINAL departure,
      // not the day the ride row happened to be created.
      return dow === new Date(template.depart_at).getUTCDay()
    default:
      return false
  }
}

export function generateRecurringRides() {
  // Work in UTC so the "tomorrow" boundary and every generated instance are
  // unambiguous and consistent regardless of the server's local timezone.
  const now = new Date()
  const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const y = tomorrowUtc.getUTCFullYear()
  const m = String(tomorrowUtc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(tomorrowUtc.getUTCDate()).padStart(2, '0')
  const dateStr = `${y}-${m}-${d}`

  // All active templates (the originally-offered recurring rides)
  const templates = db
    .prepare(
      `SELECT * FROM rides
       WHERE repeat_every IN ('daily','weekly','weekdays')
         AND status NOT IN ('cancelled','completed')
         AND repeat_parent_id IS NULL`
    )
    .all()

  for (const t of templates) {
    if (!shouldHaveInstanceOn(t, tomorrowUtc)) continue

    const exists = db
      .prepare(
        `SELECT id FROM rides
         WHERE repeat_parent_id=? AND repeat_child_on=?`
      )
      .get(t.id, dateStr)

    if (!exists) copyInstance(t, dateStr)
  }
}

export function startRecurringScheduler() {
  console.log('🔁 Recurring ride scheduler started (runs hourly)')
  generateRecurringRides()
  setInterval(generateRecurringRides, 60 * 60 * 1000) // every hour
}