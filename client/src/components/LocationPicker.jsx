import { useEffect, useRef, useState } from 'react'

/**
 * Text input + live place suggestions + "use my location".
 * value: { name:'', lat:null, lng:null } — controlled by parent
 */
export default function LocationPicker({ label, hint, value, onChange }) {
  const [query, setQuery] = useState(value.name || '')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const abortRef = useRef(null)
  const debounceRef = useRef(null)

  // live suggestions while typing (debounced)
  useEffect(() => {
    if (query.trim().length < 3 || query === value.name) {
      setResults([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(geocode, 450)
    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  async function geocode() {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setBusy(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query.trim())}`,
        { headers: { 'Accept-Language': 'en' }, signal: ctrl.signal }
      )
      setResults(await res.json())
    } catch (err) {
      if (err.name !== 'AbortError') setResults([])
    } finally {
      if (!ctrl.signal.aborted) setBusy(false)
    }
  }

  function choose(r) {
    setResults([])
    setQuery(r.display_name.split(',').slice(0, 2).join(', '))
    onChange({ name: r.display_name.split(',').slice(0, 2).join(', '), lat: +r.lat, lng: +r.lon })
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const { latitude: lat, longitude: lng } = pos.coords
        setQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
        onChange({ name: `My location (${lat.toFixed(3)}, ${lng.toFixed(3)})`, lat, lng })
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 }
    )
  }

  const hasPin = Number.isFinite(value.lat) && Number.isFinite(value.lng)

  return (
    <div className="picker">
      <label className="lbl">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>

      <div className="geo-row">
        <input
          className="input"
          placeholder="Type a place or pick on map…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!e.target.value) onChange({ name: '', lat: null, lng: null })
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), geocode())}
        />
        <button type="button" className={`btn ghost sm geo-btn`} title="Use my current location" onClick={useMyLocation}>
          {locating ? '…' : '📍'}
        </button>
        <button type="button" className="btn sm" onClick={geocode} disabled={busy} title="Search place">
          {busy ? <span className="spin">◌</span> : '🔍'}
        </button>
      </div>

      {results.length > 0 && (
        <ul className="geo-results">
          {results.map((r) => (
            <li key={r.place_id} onClick={() => choose(r)}>
              📌 {r.display_name}
            </li>
          ))}
        </ul>
      )}

      {hasPin ? (
        <p className="picked ok-text">📍 Pinned — {value.name}</p>
      ) : (
        <p className="picked">Pick a pin on the map, or search a place above</p>
      )}
    </div>
  )
}
