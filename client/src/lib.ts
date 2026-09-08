// ─── Pure helpers shared across views ─────────────────────────────────────────

import type { Ride } from "./types.ts"

const VEHICLE_EMOJI: Record<string, string> = {
  bike: "🏍️", car: "🚗", auto: "🛺", van: "🚐", other: "🚙",
}

const VEHICLE_COLORS: Record<string, string> = {
  bike: "#b45309", car: "#1d4ed8", auto: "#0369a1", van: "#7c3aed", other: "#0d9488",
}

const COLOR_PALETTE = ["#be185d", "#1d4ed8", "#b45309", "#7c3aed", "#0369a1", "#0d9488", "#c2410c", "#2563eb"]

export function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLOR_PALETTE[h % COLOR_PALETTE.length]
}

export function initials(name: string): string {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?"
}

export function humanDate(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const today = new Date()
  const diff = d.toDateString() === today.toDateString()
  if (diff) return "Today"
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function humanTime(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function leaveIn(iso: string): string {
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return "Departs soon"
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h <= 0) return `${m}m`
  if (h < 24) return `${h}h ${m}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function relativeTime(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return "Just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export { VEHICLE_EMOJI, VEHICLE_COLORS }

// Map an API ride row into the display Ride shape.
export function toRide(r: any, isMe: boolean): Ride {
  const name = isMe ? r.owner_name || "You" : r.owner_name || r.name || "Rider"
  const vehicleType = r.vehicle_type || "car"
  return {
    id: r.id,
    ownerName: name,
    ownerInitial: initials(name),
    ownerColor: hashColor(name),
    rating: r.owner_rating || 0,
    trips: r.owner_ratings_count || 0,
    verified: Boolean(r.owner_id_verified || r.id_verified || r.owner_verified),
    ladiesOnly: false,
    from: r.from_name || "",
    fromSub: "",
    to: r.to_name || "",
    toSub: "",
    date: humanDate(r.depart_at),
    time: humanTime(r.depart_at),
    leaveIn: leaveIn(r.depart_at),
    vehicleEmoji: VEHICLE_EMOJI[vehicleType] || "🚗",
    vehicleModel: r.vehicle_model || vehicleType,
    vehicleColor: VEHICLE_COLORS[vehicleType] || "",
    seats: Math.max(0, (r.seats_total || 0) - (r.seats_taken || 0)),
    price: r.price || 0,
    desc: r.notes || "",
    vehicle_type: vehicleType,
    depart_at: r.depart_at,
    my_status: r.my_status || null,
  }
}

// popular routes + community snippets shown in the Find view (Hyderabad-first)
export const POPULAR_ROUTES = [
  { from: "Madhapur", to: "Gachibowli" },
  { from: "Jubilee Hills", to: "HITEC City" },
  { from: "Kukatpally", to: "Financial District" },
  { from: "Begumpet", to: "Shamshabad Airport" },
  { from: "Uppal", to: "Kondapur" },
  { from: "Secunderabad", to: "HITEC City" },
  { from: "Hyderabad", to: "Vijayawada" },
  { from: "Hyderabad", to: "Bengaluru" },
]

export const COMMUNITY = [
  { name: "Ananya", avatar: "A", c1: "#0d9488", c2: "#14b8a6", msg: "drives Madhapur → Gachibowli every weekday, 3 seats free." },
  { name: "Ravi", avatar: "R", c1: "#f59e0b", c2: "#f97316", msg: "just shared a Jubilee Hills → HITEC City ride for tomorrow morning." },
  { name: "Shreya", avatar: "S", c1: "#8b5cf6", c2: "#6d28d9", msg: "is looking for a daily commute out of Kukatpally." },
]