import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Compass, MapPin, Search, SearchX, Sliders, CheckCircle2, Users, Clock, Calendar } from 'lucide-react'
import { api } from '../api.js'
import LocationPicker from '../components/LocationPicker.jsx'
import OSMMap from '../components/OSMMap.jsx'
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

  function handleMapPick([lat, lng]) {
    if (pickMode === 'from') {
      setFrom({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng })
    } else if (pickMode === 'to') {
      setTo({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng })
    }
  }

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
          <input className="input slim" type="date" name="date" min={isoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <button className="btn primary lg" disabled={loading}>
          {loading ? 'Searching…' : (<><Search size={16} /> Search trips</>)}
        </button>
      </form>

      <div className="card filter-bar">
        <span className="filter-label"><Sliders size={14} /> Filters</span>
        <select className="input slim" name="fVehicle" value={fVehicle} onChange={(e) => setFVehicle(e.target.value)} title="Vehicle type">
          {FILTER_VEHICLES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <select className="input slim" name="fRepeat" value={fRepeat} onChange={(e) => setFRepeat(e.target.value)} title="Repeat schedule">
          <option value="">Any schedule</option>
          <option value="none">One-time</option>
          <option value="weekdays">Weekdays</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <input
          className="input slim"
          type="number"
          name="fMaxPrice"
          min={0}
          placeholder="Max ₹/seat"
          value={fMaxPrice}
          onChange={(e) => setFMaxPrice(e.target.value)}
          title="Maximum price per seat"
        />
      </div>

      <div className="card map-tools">
        <div className="pick-mode-bar">
          <button
            type="button"
            className={`btn sm ${pickMode === 'from' ? 'primary' : 'ghost'}`}
            onClick={() => setPickMode(pickMode === 'from' ? null : 'from')}
          >
            <MapPin size={14} style={{ color: '#22c55e' }} /> Pick start
          </button>
          <button
            type="button"
            className={`btn sm ${pickMode === 'to' ? 'primary' : 'ghost'}`}
            onClick={() => setPickMode(pickMode === 'to' ? null : 'to')}
          >
            <MapPin size={14} style={{ color: '#ef4444' }} /> Pick end
          </button>
          {pickMode && <span className="hint pick-hint">Tap on the map to set it — or type in the boxes above</span>}
        </div>
        <OSMMap className="center-map" points={mapPoints} onPick={pickMode ? handleMapPick : undefined} />
      </div>

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
                  {/* Header: avatar + name + badges + price */}
                  <div className="rc-header">
                    <div className="rc-avatar" style={{ background: `hsl(${(r.owner_name || '').charCodeAt(0) * 7 % 360}, 55%, 48%)` }}>
                      {initials(r.owner_name)}
                    </div>
                    <div className="rc-header-info">
                      <div className="rc-name-row">
                        <span className="rc-name">{r.owner_name}</span>
                        {r.owner_verified && (
                          <span className="rc-verified"><CheckCircle2 size={11} /> Verified</span>
                        )}
                      </div>
                      <div className="rc-rating-row">
                        {r.owner_rating ? (
                          <span className="rc-rating" title={`${r.owner_ratings_count} rating(s)`}>⭐ {r.owner_rating}</span>
                        ) : null}
                        {r.owner_ratings_count != null && (
                          <span className="rc-trips">{r.owner_ratings_count} rides</span>
                        )}
                      </div>
                    </div>
                    <div className="rc-price">
                      <span className="rc-price-val">{priceLabel(r.price)}</span>
                      <span className="rc-price-sub">per seat</span>
                    </div>
                  </div>

                  {/* Route: vertical dots + from/to */}
                  <div className="rc-route">
                    <div className="rc-route-line">
                      <div className="rc-dot rc-dot-start" />
                      <div className="rc-dot-line" />
                      <MapPin size={12} className="rc-dot-end" />
                    </div>
                    <div className="rc-route-labels">
                      <div>
                        <div className="rc-route-from">{r.from_name}</div>
                      </div>
                      <div>
                        <div className="rc-route-to">{r.to_name}</div>
                      </div>
                    </div>
                  </div>

                  {/* Chips: time-unil + date/time */}
                  <div className="rc-chips">
                    <span className="chip soon"><Clock size={11} /> {timeUntil(r.depart_at)}</span>
                    <span className="rc-date-time"><Calendar size={11} /> {fmtDT(r.depart_at)}</span>
                    {r.repeat_every && r.repeat_every !== 'none' && (
                      <span className="chip repeat">{repeatLabel(r.repeat_every)}</span>
                    )}
                  </div>

                  {/* Bottom: vehicle + seats + CTA */}
                  <div className="rc-bottom">
                    <div className="rc-vehicle">
                      <span className="veh" title={vehicleLabel(r.vehicle_type)}>{vehicleEmoji(r.vehicle_type)}</span>
                      <div>
                        <div className="rc-vehicle-model">{vehicleLabel(r.vehicle_type)}{r.vehicle_model ? ` · ${r.vehicle_model}` : ''}</div>
                      </div>
                    </div>
                    <div className="rc-bottom-right">
                      <span className="rc-seats"><Users size={12} /> {free} left</span>
                      {r.my_status ? (
                        <span className={`chip ${statusClass(r.my_status)}`}>
                          {r.my_status === 'accepted' ? '✅ Accepted' : '⏳ Sent'}
                        </span>
                      ) : openForm === r.id ? (
                        <div className="req-form stack fade-in">
                          <div className="row">
                            <select className="input slim" name="seats" value={req.seats} onChange={(e) => setReq({ ...req, seats: +e.target.value })}>
                              {Array.from({ length: Math.min(4, free) }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{i + 1} seat{i ? 's' : ''}</option>
                              ))}
                            </select>
                            <button className="btn primary sm" onClick={() => sendRequest(r.id)}>Send request</button>
                            <button className="btn ghost sm" onClick={() => setOpenForm(null)}>Cancel</button>
                          </div>
                          <textarea
                            className="input"
                            name="message"
                            rows={2}
                            placeholder='Message (optional)'
                            value={req.message}
                            onChange={(e) => setReq({ ...req, message: e.target.value })}
                          />
                        </div>
                      ) : (
                        <button className="btn cta" onClick={() => { setOpenForm(r.id); setReq({ seats: 1, message: '' }) }}>
                          Request Seat
                        </button>
                      )}
                    </div>
                  </div>

                  {r.notes && <p className="notes">"{r.notes}"</p>}
                </div>
              )
            })}
        </div>
    </div>
  )
}
