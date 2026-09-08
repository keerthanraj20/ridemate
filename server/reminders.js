import { all, get, run } from './db.js'
import { notify } from './notify.js'

// Pre-departure reminders: rides departing in the next 1-3 hours that haven't
// been reminded yet get a heads-up for the owner and every accepted rider.
// reminder_sent is a per-ride flag so each ride is only reminded once, even if
// the scheduler runs several times before departure.
async function remindForRide(ride) {
  const owner = await get('SELECT name FROM users WHERE id=?', [ride.user_id])
  if (owner) {
    await notify(ride.user_id, {
      type: 'reminder',
      title: 'Departing soon — ready to go? 🚗',
      body: `Your ${ride.from_name} → ${ride.to_name} ride departs at ${ride.depart_at}. ${ride.seats_total} seat(s) offered.`,
      link: `/rides/${ride.id}`,
    })
  }
  const riders = await all("SELECT rider_id FROM requests WHERE ride_id=? AND status='accepted'", [ride.id])
  for (const r of riders) {
    const rider = await get('SELECT name FROM users WHERE id=?', [r.rider_id])
    if (!rider) continue
    await notify(r.rider_id, {
      type: 'reminder',
      title: 'Your trip is approaching! 🚗',
      body: `You're booked on ${ride.from_name} → ${ride.to_name} at ${ride.depart_at}. Contact details are in the chat.`,
      link: `/rides/${ride.id}`,
    })
  }
  await run('UPDATE rides SET reminder_sent=1 WHERE id=?', [ride.id])
  return riders.length + 1
}

export async function sendDepartureReminders() {
  // 1-3 hours before departure (UTC-safe). Rides already past are skipped.
  const now = Date.now()
  const soon = new Date(now + 3 * 3600 * 1000).toISOString()
  const notYet = new Date(now + 1 * 3600 * 1000).toISOString()

  const rides = await all(
    `SELECT * FROM rides
     WHERE status='open' AND reminder_sent=0
       AND depart_at BETWEEN ? AND ?`,
    [notYet, soon]
  )

  let count = 0
  for (const ride of rides) count += await remindForRide(ride)
  return count
}

export function startReminderScheduler() {
  console.log('⏰ Departure reminder scheduler started (runs every 20 min)')
  sendDepartureReminders()
  setInterval(() => sendDepartureReminders().catch(() => {}), 20 * 60 * 1000)
}