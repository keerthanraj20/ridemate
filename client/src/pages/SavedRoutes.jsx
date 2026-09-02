import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import LocationPicker from '../components/LocationPicker.jsx'
import { useToast } from '../Toast.jsx'

export default function SavedRoutes() {
  const toast = useToast()
  const nav = useNavigate()
  const [routes, setRoutes] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: '', from: { name: '', lat: null, lng: null }, to: { name: '', lat: null, lng: null } })

  async function load() {
    try {
      const data = await api('/saved-routes')
      setRoutes(data.routes)
    } catch (err) {
      toast(err.message, 'bad')
    }
  }

  useEffect(() => { load() }, [])

  async function save(e) {
    e.preventDefault()
    if (!form.from.lat || !form.to.lat) return toast('Drop both pins or type places to save', 'bad')
    try {
      const data = await api('/saved-routes', {
        method: 'POST',
        body: {
          label: form.label,
          from_name: form.from.name,
          from_lat: form.from.lat,
          from_lng: form.from.lng,
          to_name: form.to.name,
          to_lat: form.to.lat,
          to_lng: form.to.lng,
        },
      })
      toast(data.message)
      setAdding(false)
      setForm({ label: '', from: { name: '', lat: null, lng: null }, to: { name: '', lat: null, lng: null } })
      load()
    } catch (err) {
      toast(err.message, 'bad')
    }
  }

  async function remove(id) {
    try {
      await api(`/saved-routes/${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      toast(err.message, 'bad')
    }
  }

  function offer(r) {
    nav('/offer', {
      state: {
        prefill: { from: { name: r.from_name, lat: r.from_lat, lng: r.from_lng }, to: { name: r.to_name, lat: r.to_lat, lng: r.to_lng } },
      },
    })
  }

  function find(r) {
    nav('/find', {
      state: { from: { name: r.from_name, lat: r.from_lat, lng: r.from_lng }, to: { name: r.to_name, lat: r.to_lat, lng: r.to_lng } },
    })
  }

  const loading = !routes

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>Saved Routes <span className="grad-text">⭐</span></h2>
        <p>Save your frequent routes for one-tap ride offering or finding.</p>
      </div>

      {!adding && (
        <button className="btn primary" onClick={() => setAdding(true)}>+ Save a new route</button>
      )}

      {adding && (
        <form className="card stack" onSubmit={save}>
          <label className="lbl">
            Label <span className="hint">(optional, e.g. "Office", "Home → Gym")</span>
            <input className="input" placeholder="e.g. Daily commute" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={60} />
          </label>
          <div className="grid-2 pickers">
            <LocationPicker label="🟢 From" value={form.from} onChange={(v) => setForm({ ...form, from: v })} />
            <LocationPicker label="🔴 To" value={form.to} onChange={(v) => setForm({ ...form, to: v })} />
          </div>
          <div className="row">
            <button className="btn primary" type="submit">💾 Save route</button>
            <button className="btn ghost" type="button" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card skel-card" style={{ marginTop: 12 }}><div className="skel-line w50" /><div className="skel-line w70" /><div className="skel-line w40" /></div>
      ) : routes.length === 0 ? (
        <div className="card empty" style={{ marginTop: 12 }}>
          <div className="empty-emoji">⭐</div>
          <p><b>No saved routes yet.</b></p>
          <p className="hint">Save the routes you travel often — like home to work — so you can offer or find a ride in one tap.</p>
        </div>
      ) : (
        <div className="stack-lg" style={{ marginTop: 12 }}>
          {routes.map((r) => (
            <div key={r.id} className="card ride-card hover-lift">
              <div className="ride-top">
                <span className="veh">⭐</span>
                <div className="ride-route">
                  <strong>{r.label ? `${r.label} — ` : ''}{r.from_name} <span className="arrow">→</span> {r.to_name}</strong>
                  <span className="sub">Saved route</span>
                </div>
              </div>
              <div className="row">
                <button className="btn sm primary" onClick={() => offer(r)}>🚗 Offer a ride</button>
                <button className="btn sm ghost" onClick={() => find(r)}>🔍 Find a ride</button>
                <button className="btn sm danger" onClick={() => remove(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
