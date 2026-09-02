import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api.js'
import LocationPicker from '../components/LocationPicker.jsx'
import { VEHICLES } from '../utils.js'
import { useToast } from '../Toast.jsx'

const empty = {
  vehicle_type: 'car',
  vehicle_model: '',
  from: { name: '', lat: null, lng: null },
  to: { name: '', lat: null, lng: null },
  depart_at: '',
  seats_total: 1,
  price: 0,
  notes: '',
  repeat_every: 'none',
}

const REPEAT_OPTIONS = [
  { id: 'none', label: 'One-time' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
]

export default function OfferRide() {
  const toast = useToast()
  const location = useLocation()
  const prefill = location.state?.prefill

  const [form, setForm] = useState(() => ({
    ...empty,
    from: prefill?.from || empty.from,
    to: prefill?.to || empty.to,
  }))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const data = await api('/rides', {
        method: 'POST',
        body: {
          vehicle_type: form.vehicle_type,
          vehicle_model: form.vehicle_model,
          from_name: form.from.name,
          from_lat: form.from.lat,
          from_lng: form.from.lng,
          to_name: form.to.name,
          to_lat: form.to.lat,
          to_lng: form.to.lng,
          depart_at: form.depart_at,
          seats_total: form.seats_total,
          price: form.price,
          notes: form.notes,
          repeat_every: form.repeat_every,
        },
      })
      toast('Trip published! 🎉')
      setDone(data.ride)
    } catch (err) {
      toast(err.message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="page narrow fade-in">
        <div className="card center-card success-card">
          <div className="empty-emoji bounce">🎉</div>
          <h2>Your trip is live!</h2>
          <p>
            <strong>{done.from_name} → {done.to_name}</strong> · {done.seats_total} seat(s) offered
          </p>
          <p className="hint">Travelers heading the same way will see your trip and can send you requests.</p>
          <div className="row center">
            <Link className="btn primary" to="/my-rides">View my trips</Link>
            <button className="btn ghost" onClick={() => { setDone(null); setForm(empty) }}>Offer another</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>
          Offer a ride <span className="grad-text">🚗</span>
        </h2>
        <p>You’re going there anyway — take someone along and share the cost. You approve who joins.</p>
      </div>

      <form className="card" onSubmit={submit}>
        <label className="lbl">Your vehicle</label>
        <div className="chips-row">
          {VEHICLES.map((v) => (
            <button
              type="button"
              key={v.id}
              className={`chip pick ${form.vehicle_type === v.id ? 'sel' : ''}`}
              onClick={() => setForm({ ...form, vehicle_type: v.id })}
            >
              {v.emoji} {v.label}
            </button>
          ))}
        </div>

        <div className="grid-2">
          <label className="lbl">
            Vehicle model / number <span className="hint">(optional)</span>
            <input className="input" placeholder="e.g. Honda Activa · KA-01-AB-1234" value={form.vehicle_model} onChange={set('vehicle_model')} />
          </label>
          <label className="lbl">
            Departure date & time *
            <input
              className="input"
              type="datetime-local"
              required
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              value={form.depart_at}
              onChange={set('depart_at')}
            />
          </label>
        </div>

        <label className="lbl" style={{ marginTop: 14 }}>How often is this trip?</label>
        <div className="chips-row">
          {REPEAT_OPTIONS.map((o) => (
            <button
              type="button"
              key={o.id}
              className={`chip pick ${form.repeat_every === o.id ? 'sel' : ''}`}
              onClick={() => setForm({ ...form, repeat_every: o.id })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="hint">Offering a recurring ride (e.g. a daily commute) helps regular travelers find you.</p>

        <div className="grid-2 pickers">
          <LocationPicker label="🟢 Starting from *" value={form.from} onChange={(v) => setForm({ ...form, from: v })} hint="(your route start)" />
          <LocationPicker label="🔴 Going to *" value={form.to} onChange={(v) => setForm({ ...form, to: v })} hint="(your final stop)" />
        </div>

        <div className="grid-3">
          <label className="lbl">
            Seats you can share *
            <input className="input" type="number" min={1} max={8} required value={form.seats_total} onChange={set('seats_total')} />
          </label>
          <label className="lbl">
            Price per seat ₹ <span className="hint">(0 = free)</span>
            <input className="input" type="number" min={0} step="10" value={form.price} onChange={set('price')} />
          </label>
          <label className="lbl">
            Note for travelers
            <input className="input" placeholder="e.g. Leaving after breakfast" value={form.notes} onChange={set('notes')} maxLength={300} />
          </label>
        </div>

        <button className="btn primary lg" disabled={busy}>
          {busy ? 'Publishing…' : '🚀 Publish my trip'}
        </button>
      </form>
    </div>
  )
}
