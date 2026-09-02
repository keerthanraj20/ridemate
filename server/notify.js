import { db } from './db.js'

// Shared helper: insert an in-app notification for a user.
// `link` is a client-side route e.g. "/my-rides"
export function notify(userId, { type, title, body = '', link = null }) {
  if (!userId) return
  try {
    db.prepare(
      'INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)'
    ).run(userId, type, title.slice(0, 80), body.slice(0, 300), link ? link.slice(0, 200) : null)
  } catch {
    /* never let a notification break the request it accompanies */
  }
}

// Total unread count for a user (used by header polling)
export function unreadCount(userId) {
  try {
    return db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND read=0').get(userId)?.c || 0
  } catch {
    return 0
  }
}
