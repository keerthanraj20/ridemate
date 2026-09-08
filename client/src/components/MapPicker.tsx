// ─── Map components (Leaflet picker + decorative India SVG) ───────────────────
import { useState, useRef, useEffect } from "react"
import L from "leaflet"
import { RefreshCw, Navigation, MapPin } from "lucide-react"
import type { Place } from "../types.ts"

// ─── India Map SVG ─────────────────────────────────────────────────────────────

export function IndiaMapSVG({ highlight = "none" }: { highlight?: string }) {
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
      {highlight === "hyd-vja" && (
        <line x1="200" y1="282" x2="285" y2="238" stroke="rgba(251,191,36,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 3" />
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

// ─── Route Map Card (for Find view) ───────────────────────────────────────────

export function RouteMapCard({ from, to }: { from: string; to: string }) {
  const routeKey = [from.toLowerCase(), to.toLowerCase()].sort().join("-")
  const highlight =
    routeKey.includes("blr") || routeKey.includes("beng") || routeKey.includes("mys") ? "blr-mys" :
    routeKey.includes("del") || routeKey.includes("agr") ? "del-agr" :
    routeKey.includes("mum") || routeKey.includes("pun") ? "mum-pun" :
    routeKey.includes("hyd") || routeKey.includes("vja") || routeKey.includes("vijay") ? "hyd-vja" : "none"

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

// ─── Whole-India Map Picker ───────────────────────────────────────────────────

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

export function SharedMapPicker({
  from, setFrom, to, setTo,
}: {
  from: Place
  setFrom: (v: Place) => void
  to: Place
  setTo: (v: Place) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const fromMarkerRef = useRef<L.Marker | null>(null)
  const toMarkerRef = useRef<L.Marker | null>(null)
  const [pickMode, setPickMode] = useState<"from" | "to" | null>(null)
  const [fromQuery, setFromQuery] = useState(from.name || "")
  const [toQuery, setToQuery] = useState(to.name || "")
  const [locating, setLocating] = useState<"from" | "to" | null>(null)
  const [fromSuggestions, setFromSuggestions] = useState<{ name?: string; display_name?: string; lat: string; lon: string }[]>([])
  const [toSuggestions, setToSuggestions] = useState<{ name?: string; display_name?: string; lat: string; lon: string }[]>([])
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
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q.trim())}&limit=3`)
      const data = await res.json()
      const list = data?.results || []
      if (list?.length) {
        const top = list[0]
        const name = top.name
        const lat = +top.lat, lng = +top.lng
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
          `/api/geocode?q=${encodeURIComponent(q.trim())}&limit=5`,
          { signal: ctrl.signal }
        )
        const data = await res.json()
        const list = data?.results || []
        setFromSuggestions(list as any)
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
          `/api/geocode?q=${encodeURIComponent(q.trim())}&limit=5`,
          { signal: ctrl.signal }
        )
        const data = await res.json()
        const list = data?.results || []
        setToSuggestions(list as any)
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
              onChange={e => { setFromQuery(e.target.value); if (!e.target.value) setFrom({ name: "", lat: null, lng: null }); else setFrom({ ...from, name: e.target.value }); fetchFromSuggestions(e.target.value) }}
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
                      const name = s.name || s.display_name || ""
                      setFromQuery(name)
                      setFrom({ name, lat: +s.lat, lng: +s.lon })
                      setFromOpen(false)
                      setFromSuggestions([])
                      if (fromMarkerRef.current) fromMarkerRef.current.setLatLng([+s.lat, +s.lon])
                      else if (mapRef.current) fromMarkerRef.current = L.marker([+s.lat, +s.lon], { icon: mapPinIcon("#0d9488") }).addTo(mapRef.current)
                    }}
                  >
                    <MapPin size={12} className="text-ink-3 flex-shrink-0" />
                    <span className="truncate">{s.name || s.display_name}</span>
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
              onChange={e => { setToQuery(e.target.value); if (!e.target.value) setTo({ name: "", lat: null, lng: null }); else setTo({ ...to, name: e.target.value }); fetchToSuggestions(e.target.value) }}
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
                      const name = s.name || s.display_name || ""
                      setToQuery(name)
                      setTo({ name, lat: +s.lat, lng: +s.lon })
                      setToOpen(false)
                      setToSuggestions([])
                      if (toMarkerRef.current) toMarkerRef.current.setLatLng([+s.lat, +s.lon])
                      else if (mapRef.current) toMarkerRef.current = L.marker([+s.lat, +s.lon], { icon: mapPinIcon("#f59e0b") }).addTo(mapRef.current)
                    }}
                  >
                    <MapPin size={12} className="text-ink-3 flex-shrink-0" />
                    <span className="truncate">{s.name || s.display_name}</span>
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