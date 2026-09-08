// ─── Shared presentational components ─────────────────────────────────────────
import { useState, useRef, useEffect } from "react"
import {
  Star, Clock, MapPin, Calendar, Users, CheckCircle2, Info,
  ArrowLeft, Home, Search, Plus, Car, MessageCircle, User,
} from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import type { Ride, View } from "../types.ts"

export function AvatarCircle({ initial, color, size = 40 }: { initial: string; color: string; size?: number }) {
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

export function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      <Star size={11} className="fill-cta text-cta" />
      <span className="text-xs font-display font-600 text-ink-2">{value && value > 0 ? value.toFixed(1) : "New"}</span>
    </span>
  )
}

export function Badge({ children, variant = "brand" }: { children: React.ReactNode; variant?: "brand" | "cta" | "ladies" | "success" | "muted" | "pending" | "danger" }) {
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

export function TimeUntilChip({ leaveIn: li }: { leaveIn: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cta-light text-cta-dark text-[11px] font-display font-700">
      <Clock size={10} />
      {li}
    </span>
  )
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
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

export function RideCard({
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

export function TopBar({
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

export function BottomNav({
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
    { id: "profile" as View, icon: User, label: "Profile" },
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

export function AutocompleteInput({
  value, onChange, onSelect, placeholder, icon,
}: {
  value: string; onChange: (v: string) => void; onSelect: (name: string) => void; placeholder: string; icon?: React.ReactNode
}) {
  const [suggestions, setSuggestions] = useState<{ name?: string; display_name?: string; lat: string; lon: string }[]>([])
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
          `/api/geocode?q=${encodeURIComponent(q.trim())}&limit=5`,
          { signal: ctrl.signal }
        )
        const data = await res.json()
        const list = data?.results || []
        setSuggestions(list as any)
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
              onMouseDown={e => { e.preventDefault(); const n = s.name || s.display_name; onSelect(n ? n.split(",").slice(0, 2).join(", ") : String(s.lat + ", " + s.lon)); setOpen(false); setSuggestions([]) }}
            >
              <MapPin size={12} className="text-ink-3 flex-shrink-0" />
              <span className="truncate">{s.name || s.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function RequestSheet({ ride, onClose, onDone }: { ride: Ride; onClose: () => void; onDone: () => void }) {
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