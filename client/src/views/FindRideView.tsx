import { useState, useEffect, useRef, useCallback } from "react"
import { Search, Calendar, Bookmark } from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { toRide, POPULAR_ROUTES, COMMUNITY } from "../lib.ts"
import { RideCard } from "../components/ui.tsx"
import { SharedMapPicker } from "../components/MapPicker.tsx"
import type { Ride, Place, View } from "../types.ts"

export function FindRideView({ onNavigate, onRequestRide, initialFrom = "", initialTo = "" }: { onNavigate: (v: View) => void; onRequestRide: (r: Ride) => void; initialFrom?: string; initialTo?: string }) {
  const [from, setFrom] = useState<Place>({ name: initialFrom, lat: null, lng: null })
  const [to, setTo] = useState<Place>({ name: initialTo, lat: null, lng: null })
  const [date, setDate] = useState("")
  const [results, setResults] = useState<Ride[]>([])
  const [loading, setLoading] = useState(true)
  const [savedRoutes, setSavedRoutes] = useState<any[] | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ vehicle: "", maxPrice: "", mins: "", fromHr: "", toHr: "" })
  const toast = useToast()
  const initialFromRef = useRef(initialFrom)
  const initialToRef = useRef(initialTo)

  useEffect(() => {
    let alive = true
    api("/saved-routes").then(d => { if (alive) setSavedRoutes(d.routes || []) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const load = useCallback(async (f: Place, t: Place, dt: string, extra = filters) => {
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
      if (extra.vehicle) q.set("vehicle", extra.vehicle)
      if (extra.maxPrice) q.set("max_price", extra.maxPrice)
      if (extra.mins) q.set("min_seats", extra.mins)
      if (extra.fromHr) q.set("from_hr", extra.fromHr)
      if (extra.toHr) q.set("to_hr", extra.toHr)
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
      "",
      { vehicle: "", maxPrice: "", mins: "", fromHr: "", toHr: "" }
    )
  }, [load])

  const handleSearch = () => load(from, to, date, filters)

  const filterChips = [
    { k: "vehicle", label: "Vehicle type" },
    { k: "maxPrice", label: "Max ₹ per seat" },
    { k: "mins", label: "Min seats" },
    { k: "fromHr", label: "Depart after (hr)" },
    { k: "toHr", label: "Depart before (hr)" },
  ] as const

  const setF = (k: string, v: string) => {
    const next = { ...filters, [k]: v }
    setFilters(next)
    if (results.length > 0 || from.name || to.name) load(from, to, date, next)
  }

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
            onClick={() => setShowFilters(v => !v)}
            className={`px-3.5 py-3 rounded-xl text-[14px] flex items-center gap-1.5 border ${showFilters ? "border-brand bg-brand-50 text-brand" : "border-line text-ink-3"}`}
            aria-label="Filters"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filters
          </button>
          <button
            onClick={handleSearch}
            className="btn-cta px-5 py-3 rounded-xl text-[14px] flex items-center gap-1.5"
          >
            <Search size={15} /> Search
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 bg-stone-50 rounded-2xl p-3 border border-line/60 view-enter">
            <div className="font-display font-600 text-[12px] text-ink-2 mb-2.5 uppercase tracking-wide">Refine results</div>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] text-ink-3 font-display font-600 block mb-1">Vehicle</label>
                <div className="flex flex-wrap gap-1.5">
                  {["", "bike", "car", "auto", "van"].map(v => (
                    <button key={v} onClick={() => setF("vehicle", v)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-display font-600 border-2 capitalize transition-all ${filters.vehicle === v ? "border-brand text-brand bg-brand-50" : "border-line text-ink-3"}`}>
                      {v === "" ? "Any" : v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-ink-3 font-display font-600 block mb-1">Max ₹ per seat</label>
                  <input type="number" min="0" className="rm-input text-[13px]" placeholder="e.g. 300" value={filters.maxPrice}
                    onChange={e => setF("maxPrice", e.target.value)} />
                </div>
                <div>
                  <label className="text-[11px] text-ink-3 font-display font-600 block mb-1">Seats needed</label>
                  <input type="number" min="1" max="10" className="rm-input text-[13px]" placeholder="e.g. 2" value={filters.mins}
                    onChange={e => setF("mins", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-ink-3 font-display font-600 block mb-1">Depart after</label>
                  <select className="rm-input text-[13px]" value={filters.fromHr} onChange={e => setF("fromHr", e.target.value)}>
                    <option value="">Any time</option>
                    {["6", "9", "12", "15", "18", "21"].map(h => <option key={h} value={h}>{h}:00</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-ink-3 font-display font-600 block mb-1">Depart before</label>
                  <select className="rm-input text-[13px]" value={filters.toHr} onChange={e => setF("toHr", e.target.value)}>
                    <option value="">Any time</option>
                    {["6", "9", "12", "15", "18", "21"].map(h => <option key={h} value={h}>{h}:00</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => { setFilters({ vehicle: "", maxPrice: "", mins: "", fromHr: "", toHr: "" }); load(from, to, date, { vehicle: "", maxPrice: "", mins: "", fromHr: "", toHr: "" }) }}
                className="text-[12px] text-brand font-display font-600">Clear all filters</button>
            </div>
          </div>
        )}

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
              <b className="font-display font-700 text-ink">SaathYaan</b> is live — real people share trips every day near you
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
          results.map(r => <RideCard key={r.id} ride={r} onTap={() => onNavigate((`detail?ride=${r.id}`) as View)} onRequest={() => onRequestRide(r)} />)
        )}
      </div>
    </div>
  )
}