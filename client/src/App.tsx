import { useState, useRef, useEffect, useCallback } from "react"
import L from "leaflet"
import {
  MapPin, Navigation, Clock, Star, Users, Car, MessageCircle,
  ArrowLeft, Send, Plus, Calendar, Shield, Check,
  Phone, LogOut, Edit3, TrendingUp, Award, Search, Bell, Heart,
  History, Bookmark, ChevronRight, Home, MoreHorizontal, Zap,
  RefreshCw, SlidersHorizontal, CheckCircle2,
  Info, Mail, Lock
} from "lucide-react"
import { api } from "./api.js"
import { useAuth } from "./AuthContext.jsx"
import { useToast } from "./Toast.jsx"

// ─── Types ────────────────────────────────────────────────────────────────────

type View =
  | "home" | "find" | "offer" | "rides" | "messages"
  | "saved" | "history" | "auth" | "profile" | "chat"

type Ride = {
  id: number
  ownerName: string
  ownerInitial: string
  ownerColor: string
  rating: number
  trips?: number
  verified: boolean
  ladiesOnly?: boolean
  from: string
  fromSub?: string
  to: string
  toSub?: string
  date: string
  time: string
  leaveIn?: string
  vehicleEmoji: string
  vehicleModel: string
  vehicleColor?: string
  seats: number
  price: number
  desc?: string
  vehicle_type: string
  depart_at: string
  my_status?: string | null
  owner_ts?: string
}

type Conversation = {
  rideId: number
  name: string
  initial: string
  color: string
  route: string
  time: string
  unread: number
  lastMsg: string
  counterpartId?: number
}

type ChatMsg = { from: "me" | "them"; text: string; ts?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VEHICLE_EMOJI: Record<string, string> = {
  bike: "🏍️", car: "🚗", auto: "🛺", van: "🚐", other: "🚙",
}

const VEHICLE_COLORS: Record<string, string> = {
  bike: "#b45309", car: "#1d4ed8", auto: "#0369a1", van: "#7c3aed", other: "#0d9488",
}

const COLOR_PALETTE = ["#be185d", "#1d4ed8", "#b45309", "#7c3aed", "#0369a1", "#0d9488", "#c2410c", "#2563eb"]

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COLOR_PALETTE[h % COLOR_PALETTE.length]
}

function initials(name: string): string {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?"
}

function humanDate(iso: string): string {
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

function humanTime(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function leaveIn(iso: string): string {
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  if (diff <= 0) return "Departs soon"
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h <= 0) return `${m}m`
  if (h < 24) return `${h}h ${m}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function relativeTime(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return "Just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// Map an API ride row into the display Ride shape.
function toRide(r: any, isMe: boolean): Ride {
  const name = isMe ? r.owner_name || "You" : r.owner_name || r.name || "Rider"
  const vehicleType = r.vehicle_type || "car"
  return {
    id: r.id,
    ownerName: name,
    ownerInitial: initials(name),
    ownerColor: hashColor(name),
    rating: r.owner_rating || 0,
    trips: r.owner_ratings_count || 0,
    verified: Boolean(r.owner_verified || r.email_verified),
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

// ─── Small Components ─────────────────────────────────────────────────────────

function AvatarCircle({ initial, color, size = 40 }: { initial: string; color: string; size?: number }) {
  return (
    <div
      className="flex items-center justify-center font-display font-bold text-white flex-shrink-0"
      style={{
        width: size, height: size, borderRadius: "50%",
        background: color, fontSize: size * 0.38
      }}
    >
      {initial}
    </div>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      <Star size={11} className="fill-cta text-cta" />
      <span className="text-xs font-display font-600 text-ink-2">{value && value > 0 ? value.toFixed(1) : "New"}</span>
    </span>
  )
}

function Badge({ children, variant = "brand" }: { children: React.ReactNode; variant?: "brand" | "cta" | "ladies" | "success" | "muted" | "pending" | "danger" }) {
  const styles: Record<string, string> = {
    brand:   "bg-brand-light text-brand-dark",
    cta:     "bg-cta-light text-cta-dark",
    ladies:  "bg-ladies-light text-ladies",
    success: "bg-emerald-50 text-emerald-700",
    muted:   "bg-stone-100 text-stone-500",
    pending: "bg-amber-50 text-amber-700",
    danger:  "bg-red-50 text-red-600",
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-display font-600 ${styles[variant]}`}>
      {children}
    </span>
  )
}

function TimeUntilChip({ leaveIn: li }: { leaveIn: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cta-light text-cta-dark text-[11px] font-display font-700">
      <Clock size={10} />
      {li}
    </span>
  )
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-display font-700 text-base text-ink">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-brand text-sm font-display font-600">
          {action}
        </button>
      )}
    </div>
  )
}

// ─── India Map SVG ─────────────────────────────────────────────────────────────

function IndiaMapSVG({ highlight = "none" }: { highlight?: string }) {
  const cities: { name: string; cx: number; cy: number }[] = [
    { name: "Delhi",     cx: 175, cy: 112 },
    { name: "Mumbai",    cx: 108, cy: 228 },
    { name: "Bengaluru", cx: 185, cy: 340 },
    { name: "Hyderabad", cx: 200, cy: 282 },
    { name: "Chennai",   cx: 228, cy: 334 },
    { name: "Kolkata",   cx: 290, cy: 180 },
    { name: "Pune",      cx: 125, cy: 248 },
    { name: "Jaipur",    cx: 155, cy: 138 },
    { name: "Agra",      cx: 185, cy: 132 },
    { name: "Mysuru",    cx: 178, cy: 352 },
  ]
  return (
    <svg viewBox="0 0 380 460" className="w-full h-full" aria-label="Map of India showing major cities">
      <path
        d="M 168,22 L 198,15 L 235,22 L 278,40 L 325,60 L 362,88
           L 370,118 L 362,150 L 368,182 L 358,215 L 345,248
           L 328,278 L 308,305 L 285,330 L 262,355 L 244,378
           L 228,400 L 215,418 L 206,430
           L 190,415 L 170,388 L 148,358 L 128,325 L 110,290
           L 95,255 L 82,220 L 74,185 L 72,150 L 80,118
           L 76,92 L 90,68 L 112,50 L 142,35 Z"
        fill="rgba(255,255,255,0.18)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="348" cy="310" rx="6" ry="18" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      <circle cx="68" cy="280" r="4" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

      {highlight === "blr-mys" && (
        <line x1="185" y1="340" x2="178" y2="352" stroke="rgba(251,191,36,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 3" />
      )}
      {highlight === "del-agr" && (
        <line x1="175" y1="112" x2="185" y2="132" stroke="rgba(251,191,36,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 3" />
      )}
      {highlight === "mum-pun" && (
        <line x1="108" y1="228" x2="125" y2="248" stroke="rgba(251,191,36,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 3" />
      )}

      {cities.map(c => (
        <g key={c.name}>
          <circle cx={c.cx} cy={c.cy} r="4" fill="rgba(255,255,255,0.9)" />
          <circle cx={c.cx} cy={c.cy} r="2" fill="rgba(13,148,136,1)" />
        </g>
      ))}

      <text x="175" y="105" fontSize="9" fill="rgba(255,255,255,0.8)" textAnchor="middle" fontFamily="Outfit, sans-serif">Delhi</text>
      <text x="100" y="222" fontSize="9" fill="rgba(255,255,255,0.8)" textAnchor="middle" fontFamily="Outfit, sans-serif">Mumbai</text>
      <text x="197" y="354" fontSize="9" fill="rgba(255,255,255,0.8)" textAnchor="middle" fontFamily="Outfit, sans-serif">Bengaluru</text>
      <text x="304" y="174" fontSize="9" fill="rgba(255,255,255,0.8)" textAnchor="middle" fontFamily="Outfit, sans-serif">Kolkata</text>
    </svg>
  )
}

// ─── Ride Card ────────────────────────────────────────────────────────────────

function RideCard({
  ride, onTap, onRequest
}: {
  ride: Ride; onTap?: () => void; onRequest?: () => void
}) {
  const busy = ride.my_status
  return (
    <div
      onClick={onTap}
      className="bg-surface rounded-2xl p-4 card-lift cursor-pointer"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start gap-3 mb-3">
        <AvatarCircle initial={ride.ownerInitial} color={ride.ownerColor} size={44} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-700 text-[15px] text-ink">{ride.ownerName}</span>
            {ride.verified && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-display font-600 text-brand">
                <CheckCircle2 size={11} className="text-brand" /> Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {ride.rating > 0 ? (
              <Stars value={ride.rating} />
            ) : (
              <span className="text-[11px] font-display font-700 text-ink-3">⭐ New</span>
            )}
            {ride.trips ? (
              <span className="text-[11px] text-ink-3 font-body">{ride.trips} rides</span>
            ) : null}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-display font-800 text-lg text-ink">₹{ride.price}</div>
          <div className="text-[11px] text-ink-3">per seat</div>
          <div
            className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-display font-600 text-brand"
            style={{ background: "#ecfdf5" }}
            title="You only share the fuel cost — no driver fares or surge pricing"
          >
            <Info size={9} /> fuel split
          </div>
        </div>
      </div>

      <div className="flex items-stretch gap-3 mb-3">
        <div className="flex flex-col items-center py-1">
          <div className="w-2.5 h-2.5 rounded-full bg-brand border-2 border-brand-light" />
          <div className="w-px flex-1 bg-line my-1" />
          <MapPin size={12} className="text-cta-dark fill-cta-light" />
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <div>
            <div className="font-display font-700 text-[14px] text-ink">{ride.from}</div>
            {ride.fromSub ? <div className="text-[12px] text-ink-3">{ride.fromSub}</div> : null}
          </div>
          <div>
            <div className="font-display font-700 text-[14px] text-ink">{ride.to}</div>
            {ride.toSub ? <div className="text-[12px] text-ink-3">{ride.toSub}</div> : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        {ride.leaveIn ? <TimeUntilChip leaveIn={ride.leaveIn} /> : null}
        <span className="flex items-center gap-1 text-[12px] text-ink-3 font-body">
          <Calendar size={11} /> {ride.date} · {ride.time}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{ride.vehicleEmoji}</span>
          <div>
            <div className="text-[12px] font-display font-600 text-ink-2">{ride.vehicleModel}</div>
            {ride.vehicleColor ? <div className="text-[11px] text-ink-3">{ride.vehicleColor}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[12px] text-ink-3">
            <Users size={12} /> {ride.seats} left
          </span>
          {onRequest && (
            <button
              className={`${busy ? "btn-outline" : "btn-cta"} px-4 py-2 rounded-xl text-[13px]`}
              disabled={!!busy}
              onClick={e => { e.stopPropagation(); onRequest() }}
            >
              {busy === "accepted" ? "Booked" : busy === "pending" ? "Requested" : "Request Seat"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Route Map Card (for Find view) ───────────────────────────────────────────

function RouteMapCard({ from, to }: { from: string; to: string }) {
  const routeKey = [from.toLowerCase(), to.toLowerCase()].sort().join("-")
  const highlight =
    routeKey.includes("blr") || routeKey.includes("beng") || routeKey.includes("mys") ? "blr-mys" :
    routeKey.includes("del") || routeKey.includes("agr") ? "del-agr" :
    routeKey.includes("mum") || routeKey.includes("pun") ? "mum-pun" : "none"

  return (
    <div className="relative rounded-2xl overflow-hidden map-tile-bg" style={{ height: 200 }}>
      <div className="absolute inset-0 hero-gradient opacity-85" />
      <div className="absolute inset-0">
        <IndiaMapSVG highlight={highlight} />
      </div>
      <div className="absolute bottom-3 left-3 right-3 flex justify-between">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm">
          <div className="text-[10px] text-ink-3 font-body">FROM</div>
          <div className="text-[12px] font-display font-700 text-ink">{from || "Select city"}</div>
        </div>
        <div className="w-6 h-px bg-white/40 self-center mx-1" />
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm">
          <div className="text-[10px] text-ink-3 font-body">TO</div>
          <div className="text-[12px] font-display font-700 text-ink">{to || "Select city"}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({
  title, onBack, action
}: {
  title?: React.ReactNode; onBack?: () => void; action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3 pb-3 bg-surface border-b border-line/60 flex-shrink-0">
      {onBack && (
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-100 transition-colors -ml-1"
          aria-label="Back"
        >
          <ArrowLeft size={20} className="text-ink-2" />
        </button>
      )}
      <div className="flex-1">
        {title}
      </div>
      {action}
    </div>
  )
}

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

function BottomNav({
  active, onNavigate, messageUnread
}: {
  active: View; onNavigate: (v: View) => void; messageUnread: number
}) {
  const tabs = [
    { id: "home" as View, icon: Home, label: "Home" },
    { id: "find" as View, icon: Search, label: "Find" },
    { id: "offer" as View, icon: Plus, label: "Offer" },
    { id: "rides" as View, icon: Car, label: "My Rides" },
    { id: "messages" as View, icon: MessageCircle, label: "Chats" },
  ]

  return (
    <div className="flex items-stretch border-t border-line bg-surface flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {tabs.map(tab => {
        const isActive = active === tab.id
        const isOffer = tab.id === "offer"
        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all min-h-[56px] relative
              ${isOffer ? "" : isActive ? "text-brand" : "text-ink-3 hover:text-ink-2"}`}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
          >
            {isOffer ? (
              <div className="w-12 h-12 rounded-2xl btn-brand flex items-center justify-center -mt-4 shadow-lg" style={{ boxShadow: "0 4px 14px rgba(13,148,136,0.4)" }}>
                <Plus size={22} className="text-white" />
              </div>
            ) : (
              <>
                <div className="relative">
                  <tab.icon size={22} />
                  {tab.id === "messages" && messageUnread > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-cta rounded-full text-[9px] text-white font-display font-700 flex items-center justify-center">
                      {messageUnread}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-display font-600 ${isActive ? "text-brand" : ""}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand" />
                )}
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Autocomplete Input ───────────────────────────────────────────────────────

function AutocompleteInput({
  value, onChange, onSelect, placeholder, icon,
}: {
  value: string; onChange: (v: string) => void; onSelect: (name: string) => void; placeholder: string; icon?: React.ReactNode
}) {
  const [suggestions, setSuggestions] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const fetchSuggestions = (q: string) => {
    abortRef.current?.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q.trim())}`,
          { headers: { "Accept-Language": "en" }, signal: ctrl.signal }
        )
        const list = await res.json()
        setSuggestions(list || [])
        setOpen(list.length > 0)
      } catch { setSuggestions([]) }
    }, 350)
  }

  return (
    <div ref={wrapRef} className="relative flex items-center gap-3">
      {icon}
      <input
        className="rm-input"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); fetchSuggestions(e.target.value) }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-line z-50 max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2.5 text-[13px] text-ink hover:bg-stone-50 flex items-center gap-2 border-b border-line/40 last:border-0"
              onMouseDown={e => { e.preventDefault(); onSelect(s.display_name.split(",").slice(0, 2).join(", ")); setOpen(false); setSuggestions([]) }}
            >
              <MapPin size={12} className="text-ink-3 flex-shrink-0" />
              <span className="truncate">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Home View ────────────────────────────────────────────────────────────────

function HomeView({ onNavigate, user }: { onNavigate: (v: View) => void; user: any }) {
  const [search, setSearch] = useState({ from: "", to: "" })
  const [featured, setFeatured] = useState<Ride[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const data = await api("/rides/search?page_size=6")
        if (on) setFeatured((data.results || []).map((r: any) => toRide(r, false)))
      } catch { /* ignore */ } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [])

  const firstName = (user?.name || "").split(" ")[0]

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {/* Hero */}
      <div className="hero-gradient relative overflow-hidden" style={{ minHeight: 380 }}>
        <div className="absolute inset-0 opacity-20">
          <IndiaMapSVG />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-canvas to-transparent" />

        <div className="relative flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-lg">🛣️</span>
            </div>
            <span className="font-display font-800 text-xl text-white tracking-tight">RideMate</span>
          </div>
          <button className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center relative" onClick={() => onNavigate("home")} aria-label="Notifications">
            <Bell size={18} className="text-white" />
          </button>
        </div>

        <div className="relative px-5 pt-3 pb-10">
          <h1 className="font-display font-800 text-3xl text-white leading-tight mb-2">
            Hi{firstName ? ` ${firstName}` : ""} 👋<br />
            Share the journey,<br />
            <span className="text-amber-300">split the cost.</span>
          </h1>
          <p className="text-white/75 font-body text-[15px] mb-6 leading-relaxed">
            Connect with fellow travelers across India.<br />No professional drivers — just people helping people.
          </p>

          <div className="bg-white rounded-2xl p-4 shadow-xl">
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-brand flex-shrink-0" />
                <AutocompleteInput
                  value={search.from}
                  onChange={v => setSearch(s => ({ ...s, from: v }))}
                  onSelect={v => setSearch(s => ({ ...s, from: v }))}
                  placeholder="From — e.g. Bengaluru"
                />
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={12} className="text-cta flex-shrink-0 ml-0.5" />
                <AutocompleteInput
                  value={search.to}
                  onChange={v => setSearch(s => ({ ...s, to: v }))}
                  onSelect={v => setSearch(s => ({ ...s, to: v }))}
                  placeholder="To — e.g. Mysuru"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-cta flex-1 py-3 rounded-xl text-[14px] flex items-center justify-center gap-2"
                onClick={() => {
                  const params = new URLSearchParams()
                  if (search.from) params.set("from", search.from)
                  if (search.to) params.set("to", search.to)
                  const qs = params.toString()
                  onNavigate(("find" + (qs ? "?" + qs : "")) as View)
                }}
              >
                <Search size={16} /> Find a Ride
              </button>
              <button
                className="btn-brand px-4 py-3 rounded-xl text-[14px] flex items-center justify-center gap-2"
                onClick={() => onNavigate("offer")}
              >
                <Plus size={16} /> Offer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="px-5 -mt-2 mb-6">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {[
            { icon: "✅", label: "Verified IDs", sub: "All members KYC'd" },
            { icon: "⭐", label: "Ratings", sub: "Trusted community" },
            { icon: "🛡️", label: "SOS Button", sub: "24×7 safety support" },
            { icon: "💸", label: "Fair splits", sub: "No surge pricing" },
          ].map(b => (
            <div key={b.label} className="flex-shrink-0 bg-surface rounded-2xl p-3 shadow-sm flex items-center gap-2.5 min-w-[160px]" style={{ boxShadow: "var(--shadow-card)" }}>
              <span className="text-2xl">{b.icon}</span>
              <div>
                <div className="font-display font-700 text-[13px] text-ink">{b.label}</div>
                <div className="text-[11px] text-ink-3">{b.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-6 pb-8">
        <div>
          <SectionHeader title="Rides available" action="See all" onAction={() => onNavigate("find")} />
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[0, 1].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 200 }} />)}
              </div>
            ) : featured.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-2">🛣️</div>
                <p className="text-ink-3 text-sm">No rides posted yet. Be the first to offer one!</p>
              </div>
            ) : featured.slice(0, 2).map(r => (
              <RideCard key={r.id} ride={r} onTap={() => onNavigate("find")} />
            ))}
          </div>
        </div>

        <div>
          <SectionHeader title="How it works" />
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: "1", emoji: "🔍", label: "Find a ride", desc: "Search by route & date" },
              { step: "2", emoji: "💬", label: "Connect", desc: "Chat & confirm details" },
              { step: "3", emoji: "🚗", label: "Ride together", desc: "Split the fuel cost fairly" },
            ].map(s => (
              <div key={s.step} className="bg-surface rounded-2xl p-3 text-center shadow-sm" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="text-2xl mb-1.5">{s.emoji}</div>
                <div className="font-display font-700 text-[12px] text-ink mb-1">{s.label}</div>
                <div className="text-[11px] text-ink-3 leading-tight">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader title="Popular routes" />
          <div className="space-y-2">
            {[
              { from: "Bengaluru", to: "Mysuru", sub: "Most popular" },
              { from: "Delhi", to: "Agra", sub: "Weekend favourite" },
              { from: "Mumbai", to: "Pune", sub: "Daily commuters" },
              { from: "Hyderabad", to: "Vijayawada", sub: "Long drive" },
            ].map(r => (
              <button
                key={r.from + r.to}
                onClick={() => onNavigate("find")}
                className="w-full flex items-center justify-between bg-surface rounded-xl px-4 py-3 card-lift text-left"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-center gap-2.5">
                  <Navigation size={15} className="text-brand" />
                  <span className="font-display font-600 text-[14px] text-ink">{r.from} → {r.to}</span>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="text-[11px] text-ink-3">{r.sub}</span>
                  <ChevronRight size={14} className="text-ink-3" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Whole-India Map Picker ─────────────────────────────────────────────────

const INDIA_CENTER: [number, number] = [22.9734, 78.6569]
const INDIA_ZOOM = 5
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [5.9, 67.9],
  [36.2, 98.0],
]

function mapPinIcon(color = "#0d9488") {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2.5px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.35);"><div style="position:absolute;inset:5px;border-radius:50%;background:#fff;"></div></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -20],
  })
}

// ─── Shared Map Picker (single map for from + to) ─────────────────────────────

function SharedMapPicker({
  from, setFrom, to, setTo,
}: {
  from: { name: string; lat: number | null; lng: number | null }
  setFrom: (v: { name: string; lat: number | null; lng: number | null }) => void
  to: { name: string; lat: number | null; lng: number | null }
  setTo: (v: { name: string; lat: number | null; lng: number | null }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const fromMarkerRef = useRef<L.Marker | null>(null)
  const toMarkerRef = useRef<L.Marker | null>(null)
  const [pickMode, setPickMode] = useState<"from" | "to" | null>(null)
  const [fromQuery, setFromQuery] = useState(from.name || "")
  const [toQuery, setToQuery] = useState(to.name || "")
  const [locating, setLocating] = useState<"from" | "to" | null>(null)
  const [fromSuggestions, setFromSuggestions] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [toSuggestions, setToSuggestions] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)
  const fromDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fromAbortRef = useRef<AbortController | null>(null)
  const toAbortRef = useRef<AbortController | null>(null)
  const fromWrapRef = useRef<HTMLDivElement>(null)
  const toWrapRef = useRef<HTMLDivElement>(null)
  const fromRef = useRef(from)
  const toRef = useRef(to)
  fromRef.current = from
  toRef.current = to

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      minZoom: 4.2,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1,
      scrollWheelZoom: true,
      attributionControl: true,
      zoomControl: true,
    })
    mapRef.current = map
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    map.on("click", (e) => {
      const { lat, lng } = e.latlng
      const mode = pickModeRef.current
      if (mode === "from") {
        if (fromMarkerRef.current) fromMarkerRef.current.setLatLng([lat, lng])
        else fromMarkerRef.current = L.marker([lat, lng], { icon: mapPinIcon("#0d9488") }).addTo(map)
        setFrom({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng })
        setFromQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
      } else if (mode === "to") {
        if (toMarkerRef.current) toMarkerRef.current.setLatLng([lat, lng])
        else toMarkerRef.current = L.marker([lat, lng], { icon: mapPinIcon("#f59e0b") }).addTo(map)
        setTo({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng })
        setToQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
      }
    })

    const t = window.setTimeout(() => map.invalidateSize(), 150)
    const rAF = requestAnimationFrame(() => map.invalidateSize())
    return () => {
      window.clearTimeout(t)
      cancelAnimationFrame(rAF)
      map.remove()
      mapRef.current = null
    }
  }, [])

  const pickModeRef = useRef(pickMode)
  pickModeRef.current = pickMode

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (from.lat != null && from.lng != null) {
      if (fromMarkerRef.current) fromMarkerRef.current.setLatLng([from.lat, from.lng])
      else fromMarkerRef.current = L.marker([from.lat, from.lng], { icon: mapPinIcon("#0d9488") }).addTo(map)
    }
    if (to.lat != null && to.lng != null) {
      if (toMarkerRef.current) toMarkerRef.current.setLatLng([to.lat, to.lng])
      else toMarkerRef.current = L.marker([to.lat, to.lng], { icon: mapPinIcon("#f59e0b") }).addTo(map)
    }
  }, [from.lat, from.lng, to.lat, to.lng])

  const doGeocode = async (q: string, mode: "from" | "to") => {
    if (!q.trim()) return
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(q.trim())}`,
        { headers: { "Accept-Language": "en" } }
      )
      const list = await res.json()
      if (list?.length) {
        const top = list[0]
        const name = top.display_name.split(",").slice(0, 2).join(", ")
        const lat = +top.lat, lng = +top.lon
        if (mode === "from") {
          setFromQuery(name)
          setFrom({ name, lat, lng })
          if (fromMarkerRef.current) fromMarkerRef.current.setLatLng([lat, lng])
          else fromMarkerRef.current = L.marker([lat, lng], { icon: mapPinIcon("#0d9488") }).addTo(mapRef.current!)
        } else {
          setToQuery(name)
          setTo({ name, lat, lng })
          if (toMarkerRef.current) toMarkerRef.current.setLatLng([lat, lng])
          else toMarkerRef.current = L.marker([lat, lng], { icon: mapPinIcon("#f59e0b") }).addTo(mapRef.current!)
        }
      }
    } catch { /* ignore */ }
  }

  const useMyLocation = (mode: "from" | "to") => {
    if (!navigator.geolocation) return
    setLocating(mode)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(null)
        const { latitude: lat, longitude: lng } = pos.coords
        const name = `My location (${lat.toFixed(3)}, ${lng.toFixed(3)})`
        if (mode === "from") {
          setFromQuery(name)
          setFrom({ name, lat, lng })
          if (fromMarkerRef.current) fromMarkerRef.current.setLatLng([lat, lng])
          else fromMarkerRef.current = L.marker([lat, lng], { icon: mapPinIcon("#0d9488") }).addTo(mapRef.current!)
        } else {
          setToQuery(name)
          setTo({ name, lat, lng })
          if (toMarkerRef.current) toMarkerRef.current.setLatLng([lat, lng])
          else toMarkerRef.current = L.marker([lat, lng], { icon: mapPinIcon("#f59e0b") }).addTo(mapRef.current!)
        }
      },
      () => setLocating(null),
      { enableHighAccuracy: false, timeout: 8000 }
    )
  }

  // close suggestion dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (fromWrapRef.current && !fromWrapRef.current.contains(e.target as Node)) setFromOpen(false)
      if (toWrapRef.current && !toWrapRef.current.contains(e.target as Node)) setToOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const fetchFromSuggestions = (q: string) => {
    fromAbortRef.current?.abort()
    if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current)
    if (q.trim().length < 2) { setFromSuggestions([]); setFromOpen(false); return }
    fromDebounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController()
      fromAbortRef.current = ctrl
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q.trim())}`,
          { headers: { "Accept-Language": "en" }, signal: ctrl.signal }
        )
        const list = await res.json()
        setFromSuggestions(list || [])
        setFromOpen(list.length > 0)
      } catch { setFromSuggestions([]) }
    }, 350)
  }

  const fetchToSuggestions = (q: string) => {
    toAbortRef.current?.abort()
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current)
    if (q.trim().length < 2) { setToSuggestions([]); setToOpen(false); return }
    toDebounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController()
      toAbortRef.current = ctrl
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q.trim())}`,
          { headers: { "Accept-Language": "en" }, signal: ctrl.signal }
        )
        const list = await res.json()
        setToSuggestions(list || [])
        setToOpen(list.length > 0)
      } catch { setToSuggestions([]) }
    }, 350)
  }

  return (
    <div className="space-y-3">
      {/* From input */}
      <div>
        <label className="font-display font-600 text-[13px] text-ink-2">Departing from</label>
        <div className="rm-loc-row mt-1">
          <div ref={fromWrapRef} className="relative flex-1">
            <input
              className="rm-input w-full"
              placeholder="From — search or tap the map"
              value={fromQuery}
              onChange={e => { setFromQuery(e.target.value); if (!e.target.value) setFrom({ name: "", lat: null, lng: null }); else setFrom(s => ({ ...s, name: e.target.value })); fetchFromSuggestions(e.target.value) }}
              onKeyDown={e => { if (e.key === "Enter") doGeocode(fromQuery, "from") }}
              onFocus={() => { if (fromSuggestions.length > 0) setFromOpen(true) }}
            />
            {fromOpen && fromSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-line z-50 max-h-48 overflow-y-auto">
                {fromSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-[13px] text-ink hover:bg-stone-50 flex items-center gap-2 border-b border-line/40 last:border-0"
                    onMouseDown={e => {
                      e.preventDefault()
                      const name = s.display_name.split(",").slice(0, 2).join(", ")
                      setFromQuery(name)
                      setFrom({ name, lat: +s.lat, lng: +s.lon })
                      setFromOpen(false)
                      setFromSuggestions([])
                      if (fromMarkerRef.current) fromMarkerRef.current.setLatLng([+s.lat, +s.lon])
                      else if (mapRef.current) fromMarkerRef.current = L.marker([+s.lat, +s.lon], { icon: mapPinIcon("#0d9488") }).addTo(mapRef.current)
                    }}
                  >
                    <MapPin size={12} className="text-ink-3 flex-shrink-0" />
                    <span className="truncate">{s.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="rm-geo-btn" onClick={() => useMyLocation("from")} disabled={locating === "from"} aria-label="Use my location for pickup">
            <Navigation size={14} /> {locating === "from" ? "…" : "Locate"}
          </button>
        </div>
      </div>

      {/* Swap button */}
      <div className="flex items-center gap-2">
        <div className="flex-1 border-t border-dashed border-line" />
        <button
          onClick={() => { setFrom(to); setTo(from); setFromQuery(toQuery); setToQuery(fromQuery) }}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-line text-ink-3 hover:border-brand hover:text-brand transition-colors"
          aria-label="Swap from and to"
        >
          <RefreshCw size={15} />
        </button>
        <div className="flex-1 border-t border-dashed border-line" />
      </div>

      {/* To input */}
      <div>
        <label className="font-display font-600 text-[13px] text-ink-2">Going to</label>
        <div className="rm-loc-row mt-1">
          <div ref={toWrapRef} className="relative flex-1">
            <input
              className="rm-input w-full"
              placeholder="To — search or tap the map"
              value={toQuery}
              onChange={e => { setToQuery(e.target.value); if (!e.target.value) setTo({ name: "", lat: null, lng: null }); else setTo(s => ({ ...s, name: e.target.value })); fetchToSuggestions(e.target.value) }}
              onKeyDown={e => { if (e.key === "Enter") doGeocode(toQuery, "to") }}
              onFocus={() => { if (toSuggestions.length > 0) setToOpen(true) }}
            />
            {toOpen && toSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-line z-50 max-h-48 overflow-y-auto">
                {toSuggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-[13px] text-ink hover:bg-stone-50 flex items-center gap-2 border-b border-line/40 last:border-0"
                    onMouseDown={e => {
                      e.preventDefault()
                      const name = s.display_name.split(",").slice(0, 2).join(", ")
                      setToQuery(name)
                      setTo({ name, lat: +s.lat, lng: +s.lon })
                      setToOpen(false)
                      setToSuggestions([])
                      if (toMarkerRef.current) toMarkerRef.current.setLatLng([+s.lat, +s.lon])
                      else if (mapRef.current) toMarkerRef.current = L.marker([+s.lat, +s.lon], { icon: mapPinIcon("#f59e0b") }).addTo(mapRef.current)
                    }}
                  >
                    <MapPin size={12} className="text-ink-3 flex-shrink-0" />
                    <span className="truncate">{s.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="rm-geo-btn" onClick={() => useMyLocation("to")} disabled={locating === "to"} aria-label="Use my location for drop">
            <Navigation size={14} /> {locating === "to" ? "…" : "Locate"}
          </button>
        </div>
      </div>

      {/* Pick mode buttons */}
      <div className="flex items-center gap-2">
        <button
          className={`flex-1 py-2 rounded-xl text-[13px] font-display font-600 transition-all ${
            pickMode === "from"
              ? "bg-brand text-white shadow-md"
              : "bg-stone-100 text-ink-3 border border-line hover:border-brand"
          }`}
          onClick={() => setPickMode(pickMode === "from" ? null : "from")}
        >
          🟢 {from.lat != null ? "Change pickup" : "Set pickup on map"}
        </button>
        <button
          className={`flex-1 py-2 rounded-xl text-[13px] font-display font-600 transition-all ${
            pickMode === "to"
              ? "bg-cta text-white shadow-md"
              : "bg-stone-100 text-ink-3 border border-line hover:border-cta"
          }`}
          onClick={() => setPickMode(pickMode === "to" ? null : "to")}
        >
          🔴 {to.lat != null ? "Change drop" : "Set drop on map"}
        </button>
      </div>

      {/* Single shared map */}
      <div className="rm-map" style={{ height: 300 }}>
        <div className="map-tap-hint">
          {pickMode === "from" ? "Tap the map to set pickup" : pickMode === "to" ? "Tap the map to set drop" : "Pick a mode above, then tap the map"}
        </div>
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}

// ─── Find Ride View ────────────────────────────────────────────────────────────

const POPULAR_ROUTES = [
  { from: "Bengaluru", to: "Mysuru" },
  { from: "Delhi", to: "Agra" },
  { from: "Mumbai", to: "Pune" },
  { from: "Hyderabad", to: "Vijayawada" },
  { from: "Chennai", to: "Bengaluru" },
  { from: "Pune", to: "Mumbai" },
]

const COMMUNITY = [
  { name: "Ananya", avatar: "A", c1: "#0d9488", c2: "#14b8a6", msg: "drives Bengaluru → Mysuru every weekday, 3 seats free." },
  { name: "Rahul", avatar: "R", c1: "#f59e0b", c2: "#f97316", msg: "just shared a Pune → Mumbai ride for this weekend." },
  { name: "Shreya", avatar: "S", c1: "#8b5cf6", c2: "#6d28d9", msg: "is looking for a daily commute out of Hyderabad." },
]

function FindRideView({ onNavigate, onRequestRide, initialFrom = "", initialTo = "" }: { onNavigate: (v: View) => void; onRequestRide: (r: Ride) => void; initialFrom?: string; initialTo?: string }) {
  const [from, setFrom] = useState<{ name: string; lat: number | null; lng: number | null }>({ name: initialFrom, lat: null, lng: null })
  const [to, setTo] = useState<{ name: string; lat: number | null; lng: number | null }>({ name: initialTo, lat: null, lng: null })
  const [date, setDate] = useState("")
  const [results, setResults] = useState<Ride[]>([])
  const [loading, setLoading] = useState(true)
  const [savedRoutes, setSavedRoutes] = useState<any[] | null>(null)
  const toast = useToast()
  const initialFromRef = useRef(initialFrom)
  const initialToRef = useRef(initialTo)

  useEffect(() => {
    let alive = true
    api("/saved-routes").then(d => { if (alive) setSavedRoutes(d.routes || []) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const load = useCallback(async (f: { name: string; lat: number | null; lng: number | null }, t: { name: string; lat: number | null; lng: number | null }, dt: string) => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      const hasFrom = f.lat != null && f.lng != null
      const hasTo = t.lat != null && t.lng != null
      if (hasFrom && hasTo) {
        q.set("from_lat", String(f.lat))
        q.set("from_lng", String(f.lng))
        q.set("to_lat", String(t.lat))
        q.set("to_lng", String(t.lng))
      } else {
        if (f.name) q.set("from_text", f.name)
        if (t.name) q.set("to_text", t.name)
      }
      if (dt) q.set("date", dt)
      q.set("page_size", "50")
      const data = await api(`/rides/search?${q.toString()}`)
      setResults((data.results || []).map((r: any) => toRide(r, false)))
    } catch (err: any) {
      toast(err.message || "Couldn't load rides", "bad")
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    const f = initialFromRef.current
    const t = initialToRef.current
    load(
      { name: f, lat: null, lng: null },
      { name: t, lat: null, lng: null },
      ""
    )
  }, [load])

  const handleSearch = () => load(from, to, date)

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
      <div className="bg-surface px-4 pb-4 pt-3 flex-shrink-0 border-b border-line/60">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display font-600 text-[13px] text-ink-2">Pick your route on the map</span>
          <span className="text-[12px] text-ink-3">{results.length} rides</span>
        </div>

        <SharedMapPicker from={from} setFrom={setFrom} to={to} setTo={setTo} />

        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              type="date"
              className="rm-input pl-8 text-[14px]"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <button
            onClick={handleSearch}
            className="btn-cta px-5 py-3 rounded-xl text-[14px] flex items-center gap-1.5"
          >
            <Search size={15} /> Search
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-body"
          style={{ background: "linear-gradient(90deg, rgba(13,148,136,.08), rgba(245,158,11,.08))", border: "1px solid var(--line)" }}>
          {results.length > 0 ? (
            <span className="flex items-center gap-2 text-ink-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 0 0 rgba(34,197,94,.5)", animation: "radarPulse 1.8s infinite" }} />
              <b className="font-display font-700 text-ink">{results.length} driver{results.length === 1 ? "" : "s"}</b> driving that way ·{" "}
              <b className="font-display font-700 text-ink">{results.reduce((a, r) => a + r.seats, 0)} seat{results.reduce((a, r) => a + r.seats, 0) === 1 ? "" : "s"}</b> available
            </span>
          ) : (
            <span className="flex items-center gap-2 text-ink-2">
              <span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b", boxShadow: "0 0 0 0 rgba(245,158,11,.5)", animation: "radarPulse 1.8s infinite" }} />
              <b className="font-display font-700 text-ink">RideMate</b> is live — real people share trips every day near you
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pt-3 pb-6 space-y-3">
        {savedRoutes && savedRoutes.length > 0 && (
          <div className="rounded-2xl bg-surface p-3.5 border border-line/60">
            <div className="flex items-center gap-1.5 font-display font-600 text-[12px] text-ink-2 mb-2.5 uppercase tracking-wide">
              <Bookmark size={13} /> My commutes — tap to search
            </div>
            <div className="flex flex-wrap gap-2">
              {savedRoutes.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    setFrom({ name: r.from_name, lat: r.from_lat, lng: r.from_lng })
                    setTo({ name: r.to_name, lat: r.to_lat, lng: r.to_lng })
                    load({ name: r.from_name, lat: r.from_lat, lng: r.from_lng }, { name: r.to_name, lat: r.to_lat, lng: r.to_lng }, date)
                  }}
                  className="rounded-full px-3 py-2 text-[12.5px] font-display font-600 border border-line bg-white hover:border-brand hover:text-brand transition-colors"
                >
                  {r.label ? `${r.label} · ` : ""}{r.from_name} → {r.to_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 220 }} />)}
          </div>
        ) : results.length === 0 ? (
          <>
            <div className="text-center py-12">
              <div className="text-5xl mb-3">🛣️</div>
              <div className="font-display font-700 text-ink text-lg mb-1">No rides found</div>
              <p className="text-ink-3 text-sm">Try a different date or route, or offer one yourself!</p>
              <button className="btn-brand mt-4 px-6 py-3 rounded-xl text-[14px]" onClick={() => onNavigate("offer")}>
                Offer a Ride
              </button>
            </div>

            <div className="pt-1">
              <div className="font-display font-600 text-[13px] text-ink-2 mb-2">🔥 Popular routes — tap to search</div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_ROUTES.map(rt => (
                  <button
                    key={`${rt.from}-${rt.to}`}
                    onClick={() => { setFrom({ name: rt.from, lat: null, lng: null }); setTo({ name: rt.to, lat: null, lng: null }); load({ name: rt.from, lat: null, lng: null }, { name: rt.to, lat: null, lng: null }, date) }}
                    className="rounded-full px-3 py-2 text-[12.5px] font-display font-600 border border-line bg-surface hover:border-brand hover:text-brand transition-colors"
                  >
                    {rt.from} → {rt.to}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-surface p-4 border border-line/60">
              <div className="font-display font-600 text-[13px] text-ink-2 mb-3">💬 What fellow riders are up to</div>
              {COMMUNITY.map(c => (
                <div key={c.name} className="flex items-start gap-2.5 py-1.5">
                  <div className="w-7 h-7 rounded-full flex-shrink-0 grid place-items-center text-[12px] font-display font-700 text-white" style={{ background: `linear-gradient(135deg, ${c.c1}, ${c.c2})` }}>
                    {c.avatar}
                  </div>
                  <span className="text-[13px] text-ink-3 font-body leading-snug"><b className="text-ink font-display font-600">{c.name}</b> {c.msg}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          results.map(r => <RideCard key={r.id} ride={r} onRequest={() => onRequestRide(r)} />)
        )}
      </div>
    </div>
  )
}

// ─── Offer Ride View ──────────────────────────────────────────────────────────

function RideField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="font-display font-600 text-[13px] text-ink-2">{label}</label>
      {children}
    </div>
  )
}

function OfferRideView({ onDone }: { onDone: (v: View) => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    from: "", fromLat: null as number | null, fromLng: null as number | null,
    to: "", toLat: null as number | null, toLng: null as number | null,
    date: "", time: "", seats: "3",
    vehicle: "", vehicleType: "car", price: "", notes: "",
  })
  const [saving, setSaving] = useState(false)
  const totalSteps = 3
  const toast = useToast()
  const { user } = useAuth()

  const publish = async () => {
    if (!form.from || !form.to || !form.date || !form.time || !form.vehicle || !form.price) {
      toast("Please fill all the details", "bad")
      return
    }
    const departAt = new Date(`${form.date}T${form.time}:00`)
    if (Number.isNaN(departAt.getTime())) {
      toast("Pick a valid date & time", "bad")
      return
    }
    setSaving(true)
    try {
      await api("/rides", {
        method: "POST",
        body: {
          vehicle_type: form.vehicleType,
          vehicle_model: form.vehicle,
          from_name: form.from,
          from_lat: form.fromLat ?? 12.9716,
          from_lng: form.fromLng ?? 77.5946,
          to_name: form.to,
          to_lat: form.toLat ?? 13.0827,
          to_lng: form.toLng ?? 80.2707,
          depart_at: departAt.toISOString(),
          seats_total: Number(form.seats) || 1,
          price: Number(form.price) || 0,
          notes: form.notes,
          repeat_every: "none",
        },
      })
      toast("Ride published! 🎉")
      setForm({ from: "", fromLat: null, fromLng: null, to: "", toLat: null, toLng: null, date: "", time: "", seats: "3", vehicle: "", vehicleType: "car", price: "", notes: "" })
      setStep(1)
      onDone("rides")
    } catch (err: any) {
      toast(err.message || "Couldn't publish ride", "bad")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="px-4 py-4 bg-surface border-b border-line/60 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-display font-700 transition-all
                ${i + 1 < step ? "bg-brand text-white" :
                  i + 1 === step ? "bg-brand text-white ring-4 ring-brand-light" :
                  "bg-stone-100 text-ink-3"}`}
              >
                {i + 1 < step ? <Check size={14} /> : i + 1}
              </div>
              {i < totalSteps - 1 && (
                <div className={`flex-1 h-px w-8 transition-all ${i + 1 < step ? "bg-brand" : "bg-line"}`} />
              )}
            </div>
          ))}
          <span className="ml-auto text-[12px] text-ink-3 font-body">Step {step} of {totalSteps}</span>
        </div>
        <div className="font-display font-700 text-[15px] text-ink mt-2">
          {step === 1 ? "Route & Schedule" : step === 2 ? "Vehicle & Pricing" : "Review & Publish"}
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {step === 1 && (
          <>
            <SharedMapPicker
              from={{ name: form.from, lat: form.fromLat, lng: form.fromLng }}
              setFrom={v => setForm(f => ({ ...f, from: v.name, fromLat: v.lat, fromLng: v.lng }))}
              to={{ name: form.to, lat: form.toLat, lng: form.toLng }}
              setTo={v => setForm(f => ({ ...f, to: v.name, toLat: v.lat, toLng: v.lng }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <RideField label="Date">
                <input type="date" className="rm-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </RideField>
              <RideField label="Departure time">
                <input type="time" className="rm-input" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </RideField>
            </div>
            <RideField label="Seats available">
              <select className="rm-input" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))}>
                {["1", "2", "3", "4", "5", "6", "7", "8"].map(n => <option key={n} value={n}>{n} seat{n !== "1" ? "s" : ""}</option>)}
              </select>
            </RideField>
          </>
        )}

        {step === 2 && (
          <>
            <RideField label="Vehicle type">
              <select className="rm-input" value={form.vehicleType} onChange={e => setForm(f => ({ ...f, vehicleType: e.target.value }))}>
                {[["car", "🚗 Car"], ["bike", "🏍️ Bike"], ["auto", "🛺 Auto"], ["van", "🚐 Van"], ["other", "🚙 Other"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </RideField>
            <RideField label="Vehicle details">
              <input className="rm-input" placeholder="e.g. Honda City, White, 2022" value={form.vehicle}
                onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))}
              />
            </RideField>
            <RideField label="Price per seat (₹)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 font-body">₹</span>
                <input className="rm-input pl-7" type="number" placeholder="380" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
            </RideField>
            <RideField label="Notes for co-travelers (optional)">
              <textarea
                className="rm-input resize-none"
                rows={3}
                placeholder="e.g. Music on, dhaba stop at Channarayapatna…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </RideField>
          </>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="font-display font-700 text-[14px] text-ink mb-3">Route Summary</div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-brand flex-shrink-0" />
                <span className="font-display font-700 text-[15px] text-ink">{form.from || "—"}</span>
              </div>
              <div className="ml-1.5 border-l-2 border-dashed border-line pl-3 py-1 text-[12px] text-ink-3">
                {form.date} · {form.time}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <MapPin size={13} className="text-cta flex-shrink-0" />
                <span className="font-display font-700 text-[15px] text-ink">{form.to || "—"}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Seats", value: form.seats || "—" },
                { label: "Price/seat", value: form.price ? `₹${form.price}` : "—" },
                { label: "Vehicle", value: form.vehicle?.split(",")[0] || "—" },
              ].map(d => (
                <div key={d.label} className="bg-surface rounded-xl p-3 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
                  <div className="font-display font-700 text-[15px] text-ink">{d.value}</div>
                  <div className="text-[11px] text-ink-3">{d.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-brand-50 border border-brand-light rounded-xl p-3 flex items-start gap-2">
              <Info size={15} className="text-brand flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-brand-dark leading-relaxed">
                Your ride will be visible to verified travelers after publishing. You can edit or cancel anytime from My Rides.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-surface border-t border-line px-4 py-4 flex gap-3">
        {step > 1 && (
          <button className="btn-outline flex-1 py-3.5 rounded-xl text-[14px]" onClick={() => setStep(s => s - 1)}>
            Back
          </button>
        )}
        {step < totalSteps ? (
          <button className="btn-brand flex-1 py-3.5 rounded-xl text-[14px]" onClick={() => setStep(s => s + 1)}>
            Continue →
          </button>
        ) : (
          <button
            className="btn-cta flex-1 py-3.5 rounded-xl text-[14px] flex items-center justify-center gap-2"
            onClick={publish}
            disabled={saving}
          >
            <Zap size={16} /> {saving ? "Publishing…" : "Publish Ride"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── My Rides View ────────────────────────────────────────────────────────────

function MyRidesView({ onNavigate, onOpenChat }: { onNavigate: (v: View) => void; onOpenChat: (rideId: number, name: string) => void }) {
  const [tab, setTab] = useState<"upcoming" | "past" | "offered">("upcoming")
  const [bookings, setBookings] = useState<any[]>([])
  const [offered, setOffered] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const [b, o, h] = await Promise.all([
        api("/requests/mine").catch(() => ({ requests: [] })),
        api("/rides/mine").catch(() => ({ rides: [] })),
        api("/rides/history").catch(() => ({ joined: [], offered: [] })),
      ])
      setBookings(b.requests || [])
      setOffered(o.rides || [])
      setHistory([...(h.joined || []), ...(h.offered || [])])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const upcoming = bookings.filter(q => q.status === "pending" || q.status === "accepted")
  const past = history.filter(h => h.status === "completed")

  const cancelBooking = async (id: number) => {
    try {
      await api(`/requests/${id}/cancel`, { method: "POST" })
      toast("Booking cancelled")
      load()
    } catch (err: any) {
      toast(err.message || "Couldn't cancel", "bad")
    }
  }

  const completeRide = async (id: number) => {
    try {
      await api(`/rides/${id}/complete`, { method: "POST" })
      toast("Ride marked completed")
      load()
    } catch (err: any) {
      toast(err.message || "Couldn't complete", "bad")
    }
  }

  const cancelRide = async (id: number) => {
    try {
      await api(`/rides/${id}/cancel`, { method: "POST" })
      toast("Ride cancelled")
      load()
    } catch (err: any) {
      toast(err.message || "Couldn't cancel ride", "bad")
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, { v: any; t: string }> = {
      accepted: { v: "success", t: "Confirmed" },
      pending:  { v: "pending", t: "Pending" },
      rejected: { v: "danger", t: "Declined" },
      cancelled: { v: "muted", t: "Cancelled" },
      completed: { v: "success", t: "Completed" },
      open: { v: "pending", t: "Open" },
      full: { v: "pending", t: "Full" },
    }
    const m = map[s] || { v: "muted" as any, t: s }
    return <Badge variant={m.v}>{m.t}</Badge>
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="flex gap-1 mx-4 mt-3 p-1 bg-stone-100 rounded-xl mb-4">
        {(["upcoming", "past", "offered"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-[13px] font-display font-600 transition-all capitalize
              ${tab === t ? "bg-white text-ink shadow-sm" : "text-ink-3"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 pb-8 space-y-3">
        {loading ? (
          [0, 1, 2].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 180 }} />)
        ) : tab === "upcoming" && upcoming.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🚗</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No upcoming rides</div>
            <p className="text-ink-3 text-sm mb-4">Find a ride or offer one to get going!</p>
            <button className="btn-brand px-6 py-3 rounded-xl text-[14px]" onClick={() => onNavigate("find")}>
              Find a Ride
            </button>
          </div>
        ) : tab === "upcoming" ? (
          upcoming.map(q => (
            <div key={q.id} className="bg-surface rounded-2xl p-4 card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-display font-700 text-[15px] text-ink">{q.from_name} → {q.to_name}</div>
                  <div className="text-[12px] text-ink-3 mt-0.5">Owner · {q.owner_name}</div>
                </div>
                {statusBadge(q.status)}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-ink-3 mb-3 flex-wrap">
                <span className="flex items-center gap-1"><Calendar size={11} /> {humanDate(q.depart_at)} · {humanTime(q.depart_at)}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {q.seats} seat</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3">
                <div>
                  <div className="text-[11px] text-ink-3">Per seat</div>
                  <div className="font-display font-800 text-lg text-ink">₹{q.price}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {q.status === "accepted" && (
                  <button
                    className="btn-outline flex-1 py-2.5 rounded-xl text-[13px]"
                    onClick={() => onOpenChat(q.ride_id, q.owner_name)}
                  >
                    <MessageCircle size={14} className="inline mr-1" />Message
                  </button>
                )}
                {q.status !== "rejected" && q.status !== "cancelled" && (
                  <button
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-display font-600 bg-stone-100 text-ink-3"
                    onClick={() => cancelBooking(q.id)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))
        ) : tab === "past" ? (
          past.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">📅</div>
              <div className="font-display font-700 text-ink text-lg mb-1">No past rides yet</div>
            </div>
          ) : past.map(h => (
            <div key={h.id} className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-display font-700 text-[15px] text-ink">{h.from_name} → {h.to_name}</div>
                {statusBadge(h.status)}
              </div>
              <div className="text-[12px] text-ink-3 mb-2">{humanDate(h.depart_at)} · {h.owner_name}</div>
              <div className="flex items-center justify-between">
                <span className="font-display font-700 text-ink">₹{h.price}</span>
              </div>
            </div>
          ))
        ) : offered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🚗</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No rides offered yet</div>
            <p className="text-ink-3 text-sm mb-4">Share your next trip and help fellow travelers!</p>
            <button className="btn-brand px-6 py-3 rounded-xl text-[14px]" onClick={() => onNavigate("offer")}>
              Offer a Ride
            </button>
          </div>
        ) : (
          offered.map(r => (
            <div key={r.id} className="bg-surface rounded-2xl p-4 card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-display font-700 text-[15px] text-ink">{r.from_name} → {r.to_name}</div>
                  <div className="text-[12px] text-ink-3 mt-0.5">{VEHICLE_EMOJI[r.vehicle_type] || "🚗"} {r.vehicle_model}</div>
                </div>
                {statusBadge(r.status)}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-ink-3 mb-3 flex-wrap">
                <span className="flex items-center gap-1"><Calendar size={11} /> {humanDate(r.depart_at)} · {humanTime(r.depart_at)}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {r.seats_taken || 0}/{r.seats_total} seats</span>
              </div>
              {(r.requests || []).length > 0 && (
                <div className="border-t border-line pt-3 space-y-2 mb-3">
                  {r.requests.map((q: any) => (
                    <div key={q.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <AvatarCircle initial={initials(q.rider_name)} color={hashColor(q.rider_name)} size={28} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-display font-600 text-ink truncate">{q.rider_name}</div>
                          <div className="text-[11px] text-ink-3">{q.seats} seat{q.seats > 1 ? "s" : ""}</div>
                        </div>
                      </div>
                      {q.status === "pending" ? (
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button className="btn-brand px-3 py-1.5 rounded-lg text-[12px]" onClick={async () => {
                            try { await api(`/requests/${q.id}/accept`, { method: "POST" }); toast("Request accepted"); load() }
                            catch (e: any) { toast(e.message, "bad") }
                          }}>Accept</button>
                          <button className="btn-outline px-3 py-1.5 rounded-lg text-[12px]" onClick={async () => {
                            try { await api(`/requests/${q.id}/reject`, { method: "POST" }); toast("Request rejected"); load() }
                            catch (e: any) { toast(e.message, "bad") }
                          }}>Decline</button>
                        </div>
                      ) : (
                        <Badge variant={q.status === "accepted" ? "success" : "muted"}>{q.status}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                {r.status === "open" && (
                  <button className="btn-outline flex-1 py-2.5 rounded-xl text-[13px]" onClick={() => completeRide(r.id)}>
                    Complete
                  </button>
                )}
                {(r.status === "open" || r.status === "full") && (
                  <button className="flex-1 py-2.5 rounded-xl text-[13px] font-display font-600 bg-stone-100 text-ink-3" onClick={() => cancelRide(r.id)}>
                    Cancel ride
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Messages View ────────────────────────────────────────────────────────────

function MessagesView({ onSelectChat }: { onSelectChat: (c: Conversation) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    try {
      const data = await api("/messages")
      const list = (data.conversations || []).map((c: any) => {
        const name = c.counterpart?.name || "Traveler"
        return {
          rideId: c.ride.id,
          name,
          initial: initials(name),
          color: hashColor(name),
          route: `${c.ride.from_name} → ${c.ride.to_name}`,
          time: relativeTime(c.lastAt),
          unread: c.unread || 0,
          lastMsg: c.lastMessage || "No messages yet",
          counterpartId: c.counterpart?.id,
        }
      })
      setConversations(list)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = conversations.filter(c =>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.route.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="rm-input pl-9 text-[14px]" placeholder="Search conversations…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="divide-y divide-line/60">
        {loading ? (
          <div className="px-4 py-4 space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 64 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">💬</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No conversations yet</div>
            <p className="text-ink-3 text-sm">Once your seat is confirmed on a ride, you can chat here.</p>
          </div>
        ) : filtered.map(msg => (
          <button
            key={msg.rideId}
            onClick={() => onSelectChat(msg)}
            className="w-full flex items-start gap-3 px-4 py-4 hover:bg-stone-50 transition-colors text-left"
          >
            <AvatarCircle initial={msg.initial} color={msg.color} size={46} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-display font-700 text-[14px] text-ink">{msg.name}</span>
                <span className="text-[11px] text-ink-3">{msg.time}</span>
              </div>
              <div className="text-[12px] text-brand font-body mb-1">{msg.route}</div>
              <div className={`text-[13px] truncate ${msg.unread > 0 ? "text-ink font-600" : "text-ink-3"}`}>
                {msg.lastMsg}
              </div>
            </div>
            {msg.unread > 0 && (
              <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center text-[11px] font-display font-700 text-white flex-shrink-0 mt-1">
                {msg.unread}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({ convo, onBack }: { convo: Conversation; onBack: () => void }) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const { user } = useAuth()
  const meId = user?.id

  const load = useCallback(async () => {
    try {
      const data = await api(`/rides/${convo.rideId}/messages`)
      const list = (data.messages || []).map((m: any) => ({
        from: m.sender_id === meId ? "me" as const : "them" as const,
        text: m.body,
      }))
      setMessages(list)
      await api(`/rides/${convo.rideId}/messages/read`, { method: "POST", body: {} }).catch(() => null)
    } catch (err: any) {
      toast(err.message || "Couldn't load messages", "bad")
    } finally {
      setLoading(false)
    }
  }, [convo.rideId, meId, toast])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput("")
    setMessages(m => [...m, { from: "me", text }])
    try {
      const data = await api(`/rides/${convo.rideId}/messages`, { method: "POST", body: { body: text } })
      const msg = data.message
      if (msg) {
        setMessages(m => {
          const arr = m.filter(x => !(x.text === text && x.from === "me" && x === m[m.length - 1]))
          return [...arr, { from: "me" as const, text: msg.body }]
        })
      }
    } catch (err: any) {
      toast(err.message || "Couldn't send", "bad")
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-surface border-b border-line/60 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-100 transition-colors">
          <ArrowLeft size={20} className="text-ink-2" />
        </button>
        <AvatarCircle initial={convo.initial} color={convo.color} size={38} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-700 text-[14px] text-ink">{convo.name}</div>
          <div className="text-[12px] text-brand">{convo.route}</div>
        </div>
        <button className="text-ink-3 hover:text-ink" aria-label="More">
          <MoreHorizontal size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="shimmer rounded-full" style={{ height: 40, width: i % 2 ? "60%" : "45%" }} />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">👋</div>
            <div className="font-display font-700 text-ink text-lg mb-1">Say hello to {convo.name}</div>
            <p className="text-ink-3 text-sm">Coordinate the pickup spot and any other details here.</p>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[78%] px-4 py-2.5 text-[14px] leading-relaxed
                ${m.from === "me" ? "bubble-out text-white" : "bubble-in text-ink"}`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="bg-surface border-t border-line/60 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <input
          className="rm-input flex-1"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          className="w-10 h-10 rounded-xl btn-brand flex items-center justify-center flex-shrink-0"
          disabled={!input.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

// ─── Saved Routes View ────────────────────────────────────────────────────────

function SavedView({ onNavigate, onUnsaved }: { onNavigate: (v: View) => void; onUnsaved: () => void }) {
  const [routes, setRoutes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const data = await api("/saved-routes")
      setRoutes(data.routes || [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id: number) => {
    try {
      await api(`/saved-routes/${id}`, { method: "DELETE" })
      toast("Route removed")
      load()
    } catch (err: any) {
      toast(err.message || "Couldn't remove", "bad")
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-3 pb-8">
      <div className="space-y-3">
        {loading ? (
          [0, 1].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 120 }} />)
        ) : routes.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🗺️</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No saved routes</div>
            <p className="text-ink-3 text-sm">Save your regular trips here for quick access.</p>
          </div>
        ) : routes.map(r => (
          <div key={r.id} className="bg-surface rounded-2xl p-4 card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                {r.label ? <div className="text-[12px] text-brand font-display font-600 mb-0.5">{r.label}</div> : null}
                <div className="font-display font-700 text-[16px] text-ink">{r.from_name} → {r.to_name}</div>
              </div>
              <button className="text-ink-3 hover:text-ladies transition-colors" onClick={() => remove(r.id)} aria-label="Remove route">
                <Heart size={18} className="fill-ladies text-ladies" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-brand ml-auto px-4 py-2 rounded-xl text-[13px]"
                onClick={() => onNavigate("find")}
              >
                Find rides
              </button>
            </div>
          </div>
        ))}
        <button
          className="w-full border-2 border-dashed border-line rounded-2xl p-5 text-center text-ink-3 hover:border-brand hover:text-brand transition-colors font-display font-600 text-[14px]"
          onClick={() => { onNavigate("find"); onUnsaved() }}
        >
          <Plus size={20} className="inline mb-1" /> Save a new route
        </button>
      </div>
    </div>
  )
}

// ─── History View ──────────────────────────────────────────────────────────────

function HistoryView() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const h = await api("/rides/history")
        if (!on) return
        setItems([...(h.joined || []), ...(h.offered || [])])
      } catch { /* ignore */ } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [])

  const completed = items.filter(i => i.status === "completed")
  const total = completed.reduce((s, x) => s + (x.price || 0), 0)
  const avg = completed.length ? (completed.reduce((s, x) => s + (x.owner_rating || 0), 0) / completed.length).toFixed(1) : "—"

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="px-4 pt-3 pb-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total rides", value: String(items.length), icon: "🛣️" },
            { label: "Spent (est.)", value: `₹${total}`, icon: "💰" },
            { label: "Avg rating", value: `${avg} ⭐`, icon: "🏆" },
          ].map(s => (
            <div key={s.label} className="bg-surface rounded-2xl p-3 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="font-display font-800 text-[16px] text-ink">{s.value}</div>
              <div className="text-[10px] text-ink-3">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8 space-y-3">
        {loading ? (
          [0, 1].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 110 }} />)
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📒</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No history yet</div>
            <p className="text-ink-3 text-sm">Your completed and past rides will show up here.</p>
          </div>
        ) : items.map(h => (
          <div key={h.id} className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-display font-700 text-[14px] text-ink">{h.from_name} → {h.to_name}</div>
                <div className="text-[12px] text-ink-3 mt-0.5">{humanDate(h.depart_at)} · {h.owner_name}</div>
              </div>
              <Badge variant={h.status === "completed" ? "success" : "muted"}>{h.status}</Badge>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2 mt-2">
              <span className="text-[12px] text-ink-3">{h.myRating ? "Rated" : "Not rated"}</span>
              <span className="font-display font-700 text-ink">₹{h.price}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Auth View (email/password) ───────────────────────────────────────────────

function AuthView() {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const { login } = useAuth()
  const toast = useToast()

  const submit = async () => {
    if (!email || !password) { toast("Enter your email and password", "bad"); return }
    if (mode === "register") {
      if (!name || name.trim().length < 2) { toast("Enter your full name", "bad"); return }
    }
    setBusy(true)
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register"
      const body: any = { email, password }
      if (mode === "register") { body.name = name; body.phone = phone || email.split("@")[0] }
      const data = await api(path, { method: "POST", body })
      login(data.token, data.user)
      toast(mode === "login" ? "Welcome back! 👋" : "Account created! 🎉")
    } catch (err: any) {
      toast(err.message || "Something went wrong", "bad")
    } finally {
      setBusy(false)
    }
  }

  const IconCircle = ({ children }: { children: React.ReactNode }) => (
    <div className="w-10 h-10 rounded-xl bg-white/90 flex items-center justify-center text-[20px] shadow-sm flex-shrink-0">
      {children}
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl hero-gradient flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🛣️</span>
          </div>
          <h1 className="font-display font-800 text-2xl text-ink">RideMate</h1>
          <p className="text-ink-3 text-[14px] mt-1">India's friendliest carpool community</p>
        </div>

        <div className="bg-surface rounded-3xl p-6 shadow-xl" style={{ boxShadow: "var(--shadow-lifted)" }}>
          <h2 className="font-display font-700 text-[18px] text-ink mb-1">
            {mode === "login" ? "Welcome back 👋" : "Join RideMate"}
          </h2>
          <p className="text-[13px] text-ink-3 mb-5">
            {mode === "login" ? "Log in with your email and password" : "Create your account to start sharing rides"}
          </p>

          {mode === "register" && (
            <div className="mb-3 space-y-1.5">
              <label className="font-display font-600 text-[13px] text-ink-2 block">Full name</label>
              <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
                <span className="text-ink-3"><UserIcon /></span>
                <input className="rm-input !border-0 !bg-transparent !shadow-none" placeholder="Priya Sharma" value={name} onChange={e => setName(e.target.value)} />
              </div>
            </div>
          )}

          <div className="mb-3 space-y-1.5">
            <label className="font-display font-600 text-[13px] text-ink-2 block">Email</label>
            <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
              <Mail size={16} className="text-ink-3 flex-shrink-0" />
              <input className="rm-input !border-0 !bg-transparent !shadow-none" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          {mode === "register" && (
            <div className="mb-3 space-y-1.5">
              <label className="font-display font-600 text-[13px] text-ink-2 block">Phone (optional)</label>
              <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
                <Phone size={16} className="text-ink-3 flex-shrink-0" />
                <input className="rm-input !border-0 !bg-transparent !shadow-none" type="tel" placeholder="98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
          )}

          <div className="mb-4 space-y-1.5">
            <label className="font-display font-600 text-[13px] text-ink-2 block">Password</label>
            <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
              <Lock size={16} className="text-ink-3 flex-shrink-0" />
              <input className="rm-input !border-0 !bg-transparent !shadow-none" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
          </div>

          <button
            className="btn-brand w-full py-3.5 rounded-xl text-[15px] mb-3"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Please wait…" : mode === "login" ? "Log in →" : "Create account →"}
          </button>

          <div className="text-center text-[13px] text-ink-3 mt-4">
            {mode === "login" ? "New to RideMate? " : "Already have an account? "}
            <button
              onClick={() => setMode(m => m === "login" ? "register" : "login")}
              className="text-brand font-display font-600"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </div>
        </div>

        <p className="text-center text-[12px] text-ink-3 mt-5 flex items-center justify-center gap-1.5">
          <Shield size={13} className="text-brand" /> Trusted community · Fair cost splitting
        </p>
      </div>
    </div>
  )
}

function UserIcon() {
  return <Users size={16} />
}

// ─── Profile View ──────────────────────────────────────────────────────────────

function ProfileView({ onNavigate, onLogout }: { onNavigate: (v: View) => void; onLogout: () => void }) {
  const { user } = useAuth()
  const [stats, setStats] = useState({ ridesOffered: 0, ridesJoined: 0, avgRating: null as number | null })
  const [editMode, setEditMode] = useState(false)
  const [bio, setBio] = useState("")
  const toast = useToast()

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const data = await api("/profile")
        if (on) {
          setStats({ ridesOffered: data.stats?.ridesOffered || 0, ridesJoined: data.stats?.ridesJoined || 0, avgRating: data.stats?.avgRating || null })
          setBio(data.user?.bio || "")
        }
      } catch { /* ignore */ }
    })()
    return () => { on = false }
  }, [])

  const saveBio = async () => {
    try {
      const data = await api("/profile", { method: "PUT", body: { name: user?.name, phone: user?.phone, bio } })
      toast("Profile updated")
      setEditMode(false)
      void data
    } catch (err: any) {
      toast(err.message || "Couldn't update", "bad")
    }
  }

  const statCards = [
    { label: "Rides taken", value: stats.ridesJoined },
    { label: "Rides offered", value: stats.ridesOffered },
    { label: "Avg rating", value: stats.avgRating ? `${stats.avgRating} ⭐` : "—" },
  ]

  const name = user?.name || "You"
  const avatarStyle = user?.avatar
    ? { backgroundImage: `url(${user.avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "rgba(255,255,255,0.2)" }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
      <div className="hero-gradient px-5 pt-6 pb-10 relative">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl font-display font-800 text-white shadow-lg" style={avatarStyle}>
              {!user?.avatar ? initials(name) : ""}
            </div>
            <div>
              <div className="font-display font-800 text-xl text-white">{name}</div>
              <div className="text-white/70 text-[13px]">{user?.email}</div>
              <div className="flex items-center gap-1 mt-1">
                <Badge variant="brand">
                  <CheckCircle2 size={10} /> Member
                </Badge>
              </div>
            </div>
          </div>
          <button
            onClick={() => setEditMode(v => !v)}
            className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"
            aria-label="Edit"
          >
            <Edit3 size={16} className="text-white" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {statCards.map(s => (
            <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
              <div className="font-display font-800 text-xl text-white">{s.value}</div>
              <div className="text-white/70 text-[11px]">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 -mt-4">
        {editMode && (
          <div className="bg-surface rounded-2xl p-4 mb-4 shadow-lg" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="font-display font-700 text-[14px] text-ink mb-2">About you</div>
            <textarea
              className="rm-input resize-none"
              rows={3}
              placeholder="Tell fellow travelers a bit about yourself…"
              value={bio}
              onChange={e => setBio(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button className="btn-brand flex-1 py-2.5 rounded-xl text-[13px]" onClick={saveBio}>Save</button>
              <button className="btn-outline flex-1 py-2.5 rounded-xl text-[13px]" onClick={() => setEditMode(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="bg-surface rounded-2xl overflow-hidden shadow-lg" style={{ boxShadow: "var(--shadow-card)" }}>
          {[
            { icon: Bookmark, label: "Saved routes", sub: "Your favorite trips", onClick: () => onNavigate("saved") },
            { icon: History, label: "Ride history", sub: "Past and completed rides", onClick: () => onNavigate("history") },
            { icon: MessageCircle, label: "Messages", sub: "Your conversations", onClick: () => onNavigate("messages") },
            { icon: TrendingUp, label: "My rides", sub: "Offered rides & requests", onClick: () => onNavigate("rides") },
          ].map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-stone-50 transition-colors text-left border-b border-line/60 last:border-0"
            >
              <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                <item.icon size={17} className="text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-600 text-[14px] text-ink">{item.label}</div>
                <div className="text-[12px] text-ink-3 truncate">{item.sub}</div>
              </div>
              <ChevronRight size={16} className="text-ink-3" />
            </button>
          ))}
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 mt-4 py-3.5 rounded-xl border border-red-200 text-red-500 font-display font-600 text-[14px] hover:bg-red-50 transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  )
}

// ─── Request Seat Sheet ───────────────────────────────────────────────────────

function RequestSheet({ ride, onClose, onDone }: { ride: Ride; onClose: () => void; onDone: () => void }) {
  const [seats, setSeats] = useState(1)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const submit = async () => {
    setBusy(true)
    try {
      await api(`/rides/${ride.id}/request`, { method: "POST", body: { seats, message } })
      toast("Request sent! Check My Rides for updates 🎉")
      onDone()
    } catch (err: any) {
      toast(err.message || "Couldn't send request", "bad")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-surface rounded-t-3xl p-5 view-enter"
        style={{ maxHeight: "80%" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-line-2 rounded-full mx-auto mb-4" />
        <div className="font-display font-700 text-[16px] text-ink mb-1">Request a seat</div>
        <div className="text-[13px] text-ink-3 mb-4">{ride.from} → {ride.to} · {ride.date} {ride.time}</div>

        <div className="mb-4">
          <label className="font-display font-600 text-[13px] text-ink-2 mb-1.5 block">Seats needed</label>
          <div className="flex gap-2">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setSeats(n)}
                className={`w-12 h-12 rounded-xl font-display font-700 text-[15px] transition-all border-2
                  ${seats === n ? "border-brand bg-brand-50 text-brand" : "border-line bg-canvas text-ink-3"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="font-display font-600 text-[13px] text-ink-2 mb-1.5 block">Message to owner (optional)</label>
          <textarea
            className="rm-input resize-none"
            rows={2}
            placeholder="e.g. Can you pick me up at the main gate?"
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <button className="btn-outline flex-1 py-3 rounded-xl text-[14px]" onClick={onClose}>Cancel</button>
          <button className="btn-cta flex-1 py-3 rounded-xl text-[14px]" onClick={submit} disabled={busy}>
            {busy ? "Sending…" : `Request ${seats} seat${seats > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const { user, logout } = useAuth()
  const [view, setView] = useState<View>("home")
  const [prevView, setPrevView] = useState<View>("home")
  const [convo, setConvo] = useState<Conversation | null>(null)
  const [requestTarget, setRequestTarget] = useState<Ride | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const toast = useToast()

  const navigate = useCallback((v: View) => {
    setPrevView(view)
    setView(v)
  }, [view])

  const goBack = () => {
    if (view === "chat" && convo) { setView("messages"); setConvo(null); return }
    setView(prevView)
  }

  const openChat = (rideId: number, name: string) => {
    setConvo({
      rideId, name: name || "Traveler", initial: initials(name || "T"), color: hashColor(name || "T"),
      route: "", time: "", unread: 0, lastMsg: "",
    })
    setView("chat")
  }

  const topBarConfig: Record<View, { title: React.ReactNode; back?: boolean }> = {
    home:        { title: null },
    find:        { title: <span className="font-display font-700 text-[17px] text-ink">Find a Ride</span> },
    offer:       { title: <span className="font-display font-700 text-[17px] text-ink">Offer a Ride</span> },
    rides:       { title: <span className="font-display font-700 text-[17px] text-ink">My Rides</span>, back: true },
    messages:    { title: <span className="font-display font-700 text-[17px] text-ink">Messages</span> },
    saved:       { title: <span className="font-display font-700 text-[17px] text-ink">Saved Routes</span>, back: true },
    history:     { title: <span className="font-display font-700 text-[17px] text-ink">History</span>, back: true },
    auth:        { title: null },
    profile:     { title: <span className="font-display font-700 text-[17px] text-ink">Profile</span> },
    chat:        { title: null },
  }

  const showBottomNav = !["auth", "chat"].includes(view)
  const showTopBar = !["home", "auth", "chat"].includes(view)

  const messageUnread = 0

  if (!user) {
    return (
      <div className="desktop-backdrop" style={{ height: "100%", fontFamily: "var(--font-body)" }}>
        <div
          className="flex flex-col bg-app"
          style={{ height: "100%", maxWidth: 430, margin: "0 auto", boxShadow: "0 0 60px rgba(0,0,0,0.25)" }}
        >
          <div className="flex-1 flex flex-col overflow-hidden">
            <div key="auth" className="flex-1 flex flex-col overflow-hidden">
              <AuthView />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="desktop-backdrop" style={{ height: "100%", fontFamily: "var(--font-body)" }}>
      <div
        className="flex flex-col bg-app"
        style={{ height: "100%", maxWidth: 430, margin: "0 auto", boxShadow: "0 0 60px rgba(0,0,0,0.25)" }}
      >
      {showTopBar && (
        <div className="view-enter">
          <TopBar title={topBarConfig[view.split("?")[0] as View]?.title} onBack={topBarConfig[view.split("?")[0] as View]?.back ? goBack : undefined} />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {view === "home" && (
          <div key={`home-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            <HomeView onNavigate={navigate} user={user} />
          </div>
        )}
        {view.startsWith("find") && (
          <div key={`find-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            {(() => {
              const qs = view.includes("?") ? view.split("?")[1] : ""
              const sp = new URLSearchParams(qs)
              return (
                <FindRideView
                  onNavigate={navigate}
                  onRequestRide={r => setRequestTarget(r)}
                  initialFrom={sp.get("from") || ""}
                  initialTo={sp.get("to") || ""}
                />
              )
            })()}
          </div>
        )}
        {view === "offer" && (
          <div key="offer" className="flex-1 flex flex-col overflow-hidden view-enter">
            <OfferRideView onDone={navigate} />
          </div>
        )}
        {view === "rides" && (
          <div key={`rides-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            <MyRidesView onNavigate={navigate} onOpenChat={openChat} />
          </div>
        )}
        {view === "messages" && (
          <div key={`messages-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            <MessagesView onSelectChat={c => { setConvo(c); setView("chat") }} />
          </div>
        )}
        {view === "chat" && convo && (
          <div key="chat" className="flex-1 flex flex-col overflow-hidden view-enter">
            <ChatView convo={convo} onBack={() => { setView("messages"); setConvo(null); setRefreshKey(k => k + 1) }} />
          </div>
        )}
        {view === "saved" && (
          <div key="saved" className="flex-1 flex flex-col overflow-hidden view-enter">
            <SavedView onNavigate={navigate} onUnsaved={() => {}} />
          </div>
        )}
        {view === "history" && (
          <div key="history" className="flex-1 flex flex-col overflow-hidden view-enter">
            <HistoryView />
          </div>
        )}
        {view === "profile" && (
          <div key="profile" className="flex-1 flex flex-col overflow-hidden view-enter">
            <ProfileView onNavigate={navigate} onLogout={() => { logout(); toast("Signed out") }} />
          </div>
        )}
      </div>

      {showBottomNav && (
        <BottomNav
          active={view}
          onNavigate={v => navigate(v)}
          messageUnread={messageUnread}
        />
      )}

      {requestTarget && (
        <RequestSheet
          ride={requestTarget}
          onClose={() => setRequestTarget(null)}
          onDone={() => { setRequestTarget(null); navigate("rides") }}
        />
      )}
      </div>
    </div>
  )
}
