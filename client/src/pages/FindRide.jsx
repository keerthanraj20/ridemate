import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Compass, List as ListIcon, Map as MapIcon, MapPin, Search, SearchX, Sliders } from 'lucide-react'
import { api } from '../api.js'
import MapView from '../components/MapView.jsx'
import LocationPicker from '../components/LocationPicker.jsx'
import { vehicleEmoji, vehicleLabel, fmtDT, timeUntil, priceLabel, initials, repeatLabel, statusClass } from '../utils.js'
import { useToast } from '../Toast.jsx'

const isoDate = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

const FILTER_VEHICLES = [
  { id: '', label: 'All vehicles' },
  { id: 'bike', label: '🏍️ Bike' },
  { id: 'car', label: '🚗 Car' },
  { id: 'auto', label: '🛺 Auto' },
  { id: 'van', label: '🚐 Van' },
  { id: 'other', label: '🚌 Other' },
]

function SkeletonCard() {
  return (
    <div className="card skel-card">
      <div className="skel-line w30" />
      <div className="skel-line w75" />
      <div className="skel-line w50" />
      <div className="skel-btn" />
    </div>
  )
}

export default function FindRide() {
  const toast = useToast()
  const location = useLocation()
  const prefill = location.state || {}
  const [from, setFrom] = useState(prefill.from || { name: '', lat: null, lng: null })
  const [to, setTo] = useState(prefill.to || { name: '', lat: null, lng: null })
  const [date, setDate] = useState('')
  const [fVehicle, setFVehicle] = useState('')
  const [fMaxPrice, setFMaxPrice] = useState('')
  const [fRepeat, setFRepeat] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [openForm, setOpenForm] = useState(null)
  const [req, setReq] = useState({ seats: 1, message: '' })
  const [pickMode, setPickMode] = useState(null)
  const [view, setView] = useState('list')
  const abortRef = useRef(null)

  async function run(params) {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    try {
      const qs = new URLSearchParams(Object.entries({ ...filters(), ...params }).filter(([, v]) => v !== '' && v != null)).toString()
      const data = await api(`/rides/search${qs ? `?${qs}` : ''}`, { signal: ctrl.signal })
      setResults(data.results)
    } catch (err) {
      if (err.name !== 'AbortError') toast(err.message, 'bad')
      return
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }

  function filters() {
    return {
      vehicle: fVehicle,
      max_price: fMaxPrice,
      repeat: fRepeat,
    }
  }

  useEffect(() => {
    run({})
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fVehicle, fMaxPrice, fRepeat])

  function search(e) {
    e?.preventDefault()
    setOpenForm(null)
    const hasPoints = Number.isFinite(from.lat) && Number.isFinite(to.lat)
    if (hasPoints) run({ from_lat: from.lat, from_lng: from.lng, to_lat: to.lat, to_lng: to.lng, date })
    else run({ from_text: from.name, to_text: to.name, date })
  }

  function quick(offset) {
    setDate(isoDate(offset))
    setOpenForm(null)
    const hasPoints = Number.isFinite(from.lat) && Number.isFinite(to.lat)
    if (hasPoints) run({ from_lat: from.lat, from_lng: from.lng, to_lat: to.lat, to_lng: to.lng, date: offset === null ? '' : isoDate(offset) })
    else run({ from_text: from.name, to_text: to.name, date: offset === null ? '' : isoDate(offset) })
  }

  async function sendRequest(rideId) {
    try {
      const data = await api(`/rides/${rideId}/request`, { method: 'POST', body: req })
      toast(data.message)
      setOpenForm(null)
      setReq({ seats: 1, message: '' })
      search()
    } catch (err) {
      toast(err.message, 'bad')
    }
  }

  const handleMapPick = useCallback(([lat, lng]) => {
    if (pickMode === 'from') {
      setFrom({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng })
    } else if (pickMode === 'to') {
      setTo({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng })
    }
  }, [pickMode])

  const hasFrom = Number.isFinite(from.lat) && Number.isFinite(from.lng)
  const hasTo = Number.isFinite(to.lat) && Number.isFinite(to.lng)

  const mapPoints = [
    ...(hasFrom ? [{ pos: [from.lat, from.lng], popup: `🟢 ${from.name || 'Start'}`, color: '#22c55e' }] : []),
    ...(hasTo ? [{ pos: [to.lat, to.lng], popup: `🔴 ${to.name || 'End'}`, color: '#ef4444' }] : []),
    ...(results?.flatMap((r) => [
      { pos: [r.from_lat, r.from_lng], popup: `▶ ${r.from_name}`, color: '#22c55e' },
      { pos: [r.to_lat, r.to_lng], popup: `🏁 ${r.to_name}`, color: '#ef4444' },
    ]) || []),
  ]

  const mapZoom = (hasFrom || hasTo) ? 10 : 5
  const mapCenter = hasFrom ? [from.lat, from.lng] : hasTo ? [to.lat, to.lng] : [20.5937, 78.9629]

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>
          Find a ride <span className="grad-text grad-icon"><Compass size={26} /></span>
        </h2>
        <p>Pin where you are & where you want to go — we'll find people already driving that way.</p>
      </div>

      <form className="card search-card" onSubmit={search}>
        <div className="grid-2">
          <LocationPicker label="🟢 I am at" value={from} onChange={setFrom} />
          <LocationPicker label="🔴 I want to go to" value={to} onChange={setTo} />
        </div>

        <div className="quick-row">
          {[
            ['All trips', null],
            ['Today', 0],
            ['Tomorrow', 1],
          ].map(([label, off]) => {
            const val = off === null ? '' : isoDate(off)
            return (
              <button
                type="button"
                key={label}
                className={`chip pick ${date === val && (off !== null || date === '') ? 'sel' : ''}`}
                onClick={() => quick(off)}
              >
                {label}
              </button>
            )
          })}
          <input className="input slim" type="date" min={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <button className="btn primary lg" disabled={loading}>
          {loading ? 'Searching…' : (<><Search size={16} /> Search trips</>)}
        </button>
      </form>

      <div className="card filter-bar">
        <span className="filter-label"><Sliders size={14} /> Filters</span>
        <select className="input slim" value={fVehicle} onChange={(e) => setFVehicle(e.target.value)} title="Vehicle type">
          {FILTER_VEHICLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <select className="input slim" value={fRepeat} onChange={(e) => setFRepeat(e.target.value)} title="Repeat schedule">
          <option value="">Any schedule</option>
          <option value="none">One-time</option>
          <option value="weekdays">Weekdays</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <input
          className="input slim"
          type="number"
          min={0}
          placeholder="Max ₹/seat"
          value={fMaxPrice}
          onChange={(e) => setFMaxPrice(e.target.value)}
          title="Maximum price per seat"
        />
        <div className="view-toggle">
          <button className={`btn sm ${view === 'list' ? 'primary' : 'ghost'}`} onClick={() => setView('list')}><List size={14} /> List</button>
          <button className={`btn sm ${view === 'map' ? 'primary' : 'ghost'}`} onClick={() => setView('map')}><MapIcon size={14} /> Map</button>
        </div>
      </div>

      <div className="split">
        <aside className="map-side">
          <div className="pick-mode-bar">
            <button type="button" className={`btn sm ${pickMode === 'from' ? 'primary' : 'ghost'}`} onClick={() => setPickMode(pickMode === 'from' ? null : 'from')}>
              <MapPin size={14} style={{ color: '#22c55e' }} /> Pick start
            </button>
            <button type="button" className={`btn sm ${pickMode === 'to' ? 'primary' : 'ghost'}`} onClick={() => setPickMode(pickMode === 'to' ? null : 'to')}>
              <MapPin size={14} style={{ color: '#ef4444' }} /> Pick end
            </button>
          </div>
          <MapView className={`tall center-map ${view === 'map' ? 'big' : ''}`} zoom={mapZoom} center={mapCenter} points={mapPoints} onPick={pickMode ? handleMapPick : undefined} />
          <p className="hint center">{pickMode === 'from' ? '🟢 Tap map to set start' : pickMode === 'to' ? '🔴 Tap map to set end' : '🟢 trip starts · 🔴 trip ends'}</p>
        </aside>

        <div className="stack-lg">
          <div className="results-head">
            <h3>{loading ? 'Finding trips…' : `${results?.length ?? 0} trip${results?.length === 1 ? '' : 's'} available`}</h3>
          </div>
          {loading && results == null && (
            <>
              <SkeletonCard /> <SkeletonCard /> <SkeletonCard />
            </>
          )}

          {results && results.length === 0 && !loading && (
            <div className="card empty">
              <div className="empty-emoji"><SearchX size={40} /></div>
              <p><b>No trips match right now.</b></p>
              <p className="hint">Try widening your pins, clearing the date filter, or check back soon.</p>
            </div>
          )}

          {results &&
            results.map((r, i) => {
              const free = r.seats_total - r.seats_taken
              return (
                <div key={r.id} className="card ride-card hover-lift" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
                  <div className="ride-top">
                    <span className="veh" title={vehicleLabel(r.vehicle_type)}>{vehicleEmoji(r.vehicle_type)}</span>
                    <div className="ride-route">
                      <strong>{r.from_name} <span className="arrow">→</span> {r.to_name}</strong>
                      <span className="sub">{fmtDT(r.depart_at)} · {vehicleLabel(r.vehicle_type)}{r.vehicle_model ? ` (${r.vehicle_model})` : ''}</span>
                    </div>
                    <div className="ride-side">
                      <span className="chip soon">⏱ {timeUntil(r.depart_at)}</span>
                      <span className="chip price">{priceLabel(r.price)}</span>
                    </div>
                  </div>

                  <div className="ride-meta">
                    <span className="avatar sm">{initials(r.owner_name)}</span>
                    <span>{r.owner_name}</span>
                    {r.owner_rating ? (
                      <span className="chip rating" title={`${r.owner_ratings_count} rating(s)`}>⭐ {r.owner_rating}</span>
                    ) : null}
                    <span className={`chip ${free <= 1 ? 'warn' : 'ok'}`}>{free} seat{free === 1 ? '' : 's'} left</span>
                    {r.repeat_every && r.repeat_every !== 'none' && (
                      <span className="chip repeat">{repeatLabel(r.repeat_every)}</span>
                    )}
                    {(r.dist_start != null || r.dist_end != null) && (
                      <span className="dist">· starts {r.dist_start} km away, drops you {r.dist_end} km from destination</span>
                    )}
                  </div>

                  {r.notes && <p className="notes">"{r.notes}"</p>}

                  {r.my_status ? (
                    <span className={`chip ${statusClass(r.my_status)}`}>
                      {r.my_status === 'accepted' ? '✅ Accepted — see My Rides for contact' : '⏳ Request sent'}
                    </span>
                  ) : openForm === r.id ? (
                    <div className="req-form stack fade-in">
                      <div className="row">
                        <select className="input slim" value={req.seats} onChange={(e) => setReq({ ...req, seats: +e.target.value })}>
                          {Array.from({ length: Math.min(4, free) }, (_, i) => (
                            <option key={i + 1} value={i + 1}>{i + 1} seat{i ? 's' : ''}</option>
                          ))}
                        </select>
                        <button className="btn primary" onClick={() => sendRequest(r.id)}>Send request</button>
                        <button className="btn ghost" onClick={() => setOpenForm(null)}>Cancel</button>
                      </div>
                      <textarea
                        className="input"
                        rows={2}
                        placeholder='Message (optional) — e.g. "Hi! Heading the same way, happy to share fuel cost."'
                        value={req.message}
                        onChange={(e) => setReq({ ...req, message: e.target.value })}
                      />
                    </div>
                  ) : (
                    <button className="btn primary" onClick={() => { setOpenForm(r.id); setReq({ seats: 1, message: '' }) }}>
                      Request seat →
                    </button>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
