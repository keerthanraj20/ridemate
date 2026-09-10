import { useState, useEffect } from "react"
import { Bell, Search, Plus, Navigation, ChevronRight, MapPin, Crosshair, Loader2 } from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { toRide } from "../lib.ts"
import { AutocompleteInput, RideCard, SectionHeader } from "../components/ui.tsx"
import { IndiaMapSVG } from "../components/MapPicker.tsx"
import type { Ride, View } from "../types.ts"

export function HomeView({ onNavigate, user }: { onNavigate: (v: View) => void; user: any }) {
  const [search, setSearch] = useState({ from: "", to: "" })
  const [featured, setFeatured] = useState<Ride[]>([])
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const toast = useToast()

  const raiseSos = () => {
    const doRaise = async (lat?: number, lng?: number) => {
      try {
        await api("/safety/sos", { method: "POST", body: { lat, lng, message: "SOS alert raised from home" } })
        toast("🚨 SOS raised — our safety team has been notified")
      } catch (err: any) {
        toast(err.message || "Couldn't raise SOS — please call local emergency services", "bad")
      }
    }
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => doRaise(pos.coords.latitude, pos.coords.longitude),
        () => doRaise(),
        { enableHighAccuracy: true, timeout: 8000 }
      )
    } else {
      doRaise()
    }
  }

  const useCurrentLocation = (field: "from" | "to") => {
    if (!("geolocation" in navigator)) {
      toast("Location support is not available in this browser", "bad")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`/api/geocode/reverse?lat=${latitude}&lng=${longitude}`)
          const data = await res.json()
          const name = data?.name || "My current location"
          setSearch(s => ({ ...s, [field]: name }))
        } catch {
          setSearch(s => ({ ...s, [field]: "My current location" }))
        } finally {
          setLocating(false)
        }
      },
      (err) => {
        setLocating(false)
        toast(err.code === 1 ? "Location permission denied" : "Could not get your location", "bad")
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

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
            <span className="font-display font-800 text-xl text-white tracking-tight">SaathYaan</span>
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
                <div className="flex-1">
                  <AutocompleteInput
                    value={search.from}
                    onChange={v => setSearch(s => ({ ...s, from: v }))}
                    onSelect={v => setSearch(s => ({ ...s, from: v }))}
                    placeholder="From — e.g. Bengaluru"
                  />
                </div>
                <button
                  onClick={() => useCurrentLocation("from")}
                  disabled={locating}
                  className="w-9 h-9 rounded-xl bg-brand-50 border border-brand/20 flex items-center justify-center flex-shrink-0 hover:bg-brand-100 transition-colors"
                  aria-label="Use my current location for pickup"
                  title="Use my current location for pickup"
                >
                  {locating ? (
                    <Loader2 size={17} className="text-brand animate-spin" />
                  ) : (
                    <Crosshair size={17} className="text-brand" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <MapPin size={12} className="text-cta flex-shrink-0 ml-0.5" />
                <div className="flex-1">
                  <AutocompleteInput
                    value={search.to}
                    onChange={v => setSearch(s => ({ ...s, to: v }))}
                    onSelect={v => setSearch(s => ({ ...s, to: v }))}
                    placeholder="To — e.g. Mysuru"
                  />
                </div>
                <button
                  onClick={() => useCurrentLocation("to")}
                  disabled={locating}
                  className="w-9 h-9 rounded-xl bg-cta-50 border border-cta/20 flex items-center justify-center flex-shrink-0 hover:bg-cta-100 transition-colors"
                  aria-label="Use my current location for drop"
                  title="Use my current location for drop"
                >
                  {locating ? (
                    <Loader2 size={17} className="text-cta animate-spin" />
                  ) : (
                    <Crosshair size={17} className="text-cta" />
                  )}
                </button>
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
            {
              icon: "✅", label: "Verified IDs", sub: "All members KYC'd",
              toast: "Every member's government ID is verified before they can offer rides.",
              go: () => onNavigate("profile"),
            },
            {
              icon: "⭐", label: "Ratings", sub: "Trusted community",
              toast: "Only travelers who actually rode together can rate each other — keeps the community honest.",
              go: () => onNavigate("profile"),
            },
            {
              icon: "🛡️", label: "SOS Button", sub: "24×7 safety support",
              action: raiseSos,
            },
            {
              icon: "💸", label: "Fair splits", sub: "No surge pricing",
              toast: "You see the owner's full fare split upfront — no hidden fees, no surge.",
              go: () => onNavigate("find"),
            },
          ].map(b => (
            <button
              key={b.label}
              onClick={() => { if (b.action) b.action(); else { toast(b.toast); b.go?.() } }}
              className="flex-shrink-0 bg-surface rounded-2xl p-3 shadow-sm flex items-center gap-2.5 min-w-[160px] text-left hover:-translate-y-0.5 active:translate-y-0 transition-transform"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <span className="text-2xl">{b.icon}</span>
              <div>
                <div className="font-display font-700 text-[13px] text-ink">{b.label}</div>
                <div className="text-[11px] text-ink-3">{b.sub}</div>
              </div>
            </button>
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
              <RideCard key={r.id} ride={r} onTap={() => onNavigate((`detail?ride=${r.id}`) as View)} />
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