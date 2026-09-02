export const VEHICLES = [
  { id: 'bike', label: 'Bike', emoji: '🏍️' },
  { id: 'car', label: 'Car', emoji: '🚗' },
  { id: 'auto', label: 'Auto', emoji: '🛺' },
  { id: 'van', label: 'Van', emoji: '🚐' },
  { id: 'other', label: 'Other', emoji: '🚌' },
]

export const vehicleEmoji = (t) => (VEHICLES.find((v) => v.id === t) || {}).emoji || '🚗'
export const vehicleLabel = (t) => (VEHICLES.find((v) => v.id === t) || {}).label || t

export const fmtDT = (iso) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function timeUntil(iso) {
  const mins = Math.round((new Date(iso) - Date.now()) / 60000)
  if (mins < 1) return 'departing now'
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  if (h < 24) return `in ${h}h ${mins % 60}m`
  const d = Math.round(h / 24)
  return d === 1 ? 'tomorrow' : `in ${d} days`
}

export const priceLabel = (p) => (Number(p) > 0 ? `₹${Number(p)} / seat` : 'Free')

export const initials = (name = '') =>
  name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

export const statusClass = (s) => ({ pending: 'warn', accepted: 'ok', rejected: 'bad', cancelled: 'muted' }[s] || 'muted')

export const REPEAT = {
  none: null,
  daily: { label: 'Daily', emoji: '🔁' },
  weekly: { label: 'Weekly', emoji: '📅' },
  weekdays: { label: 'Weekdays', emoji: '🗓️' },
}
export const repeatLabel = (r) => (REPEAT[r] ? `${REPEAT[r].emoji} ${REPEAT[r].label}` : '')

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const timeAgo = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

// trust level based on profile completeness + activity
export const trustLevel = (v) => {
  if (!v) return 0
  let score = 0
  if (v.hasPhone) score += 2
  if (v.hasBio) score += 1
  if ((v.ridesOffered || 0) > 0) score += 1
  if ((v.ridesJoined || 0) > 0) score += 1
  return score
}
export const trustBadge = (level) =>
  level >= 5 ? { label: 'Trusted traveler', cls: 'gold' }
  : level >= 3 ? { label: 'Verified', cls: 'green' }
  : level >= 1 ? { label: 'Getting started', cls: 'blue' }
  : { label: 'New', cls: 'gray' }

export const EMAIL_REGEX = /^\S+@\S+\.\S+$/
export const PHONE_REGEX = /^[6-9]\d{9}$/

