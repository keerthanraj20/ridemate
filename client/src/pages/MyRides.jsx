import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Car, MessageSquare, Phone, CalendarDays, Ticket, Bell, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '../api.js'
import OSMMap from '../components/OSMMap.jsx'
import { vehicleEmoji, vehicleLabel, fmtDT, timeUntil, priceLabel, initials, statusClass } from '../utils.js'
import { useToast } from '../Toast.jsx'

function RouteLine({ r }) {
  return (
    <>
      <strong>{r.from_name} <span className="arrow">→</span> {r.to_name}</strong>
      <span className="sub">
        {fmtDT(r.depart_at)} · {vehicleLabel(r.vehicle_type)}
        {r.vehicle_model ? ` (${r.vehicle_model})` : ''} · {priceLabel(r.price)} · ⏱ {timeUntil(r.depart_at)}
      </span>
    </>
  )
}

export default function MyRides() {
  const toast = useToast()
  const [tab, setTab] = useState('offered')
  const cacheRef = useRef(null)
  const [data, setData] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState(null)

  async function load(silent = false) {
    setRefreshing(true)
    try {
      const [a, b] = await Promise.all([api('/rides/mine'), api('/requests/mine')])
      const next = { offered: a.rides, booked: b.requests }
      cacheRef.current = next
      setData(next)
    } catch (err) {
      if (!(silent && cacheRef.current)) toast(err.message, 'bad')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load(true)
  }, [])

  async function act(path) {
    setBusyId(path)
    try {
      const res = await api(path, { method: 'POST' })
      toast(res.message)
      await load(true)
    } catch (err) {
      toast(err.message, 'bad')
    } finally {
      setBusyId(null)
    }
  }

  const loading = !data
  const offered = data?.offered ?? []
  const booked = data?.booked ?? []
  const current = tab === 'offered' ? offered : booked

  const pendingCount = offered.reduce((n, r) => n + r.requests.filter((q) => q.status === 'pending').length, 0)

  const mapPoints = current.flatMap((r) => [
    { pos: [r.from_lat, r.from_lng], popup: `▶ ${r.from_name}`, color: '#22c55e' },
    { pos: [r.to_lat, r.to_lng], popup: `🏁 ${r.to_name}`, color: '#ef4444' },
  ])

  if (loading)
    return (
      <div className="page fade-in">
        <div className="skel-card card"><div className="skel-line w40" /><div className="skel-line w70" /><div className="skel-line w50" /></div>
        <div className="skel-card card"><div className="skel-line w60" /><div className="skel-line w35" /></div>
      </div>
    )

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>
          My rides <span className="grad-text grad-icon"><Briefcase size={26} /></span>
        </h2>
        <p>Manage trips you offer and seats you've requested.</p>
      </div>

      <div className="tabs left">
        <button className={tab === 'offered' ? 'active' : ''} onClick={() => setTab('offered')}>
          <Car size={15} /> Trips I offer ({offered.length})
          {pendingCount > 0 && <span className="bubble">{pendingCount}</span>}
        </button>
        <button className={tab === 'booked' ? 'active' : ''} onClick={() => setTab('booked')}>
          <Ticket size={15} /> My bookings ({booked.length})
        </button>
      </div>

      <div className="stack-lg">
          {mapPoints.length > 0 && (
            <OSMMap className="tall-sm" points={mapPoints} />
          )}
          {tab === 'offered' && (
            <>
              {offered.length === 0 && (
                <div className="card empty">
                  <div className="empty-emoji"><CalendarDays size={40} /></div>
                  <p><b>You haven't offered any trips yet.</b></p>
                  <Link className="btn primary" to="/offer">Offer your first ride</Link>
                </div>
              )}

              {offered.map((r) => {
                const pending = r.requests.filter((q) => q.status === 'pending')
                return (
                  <div key={r.id} className="card ride-card hover-lift">
                    <div className="ride-top">
                      <span className="veh">{vehicleEmoji(r.vehicle_type)}</span>
                      <div className="ride-route"><RouteLine r={r} /></div>
                      <div className="ride-side">
                        <span className={`chip ${r.status === 'open' ? 'ok' : r.status === 'full' ? 'warn' : 'muted'}`}>{r.status}</span>
                        <span className="chip">{r.seats_taken}/{r.seats_total} seats taken</span>
                      </div>
                    </div>

                    <h4>{pending.length > 0 ? (<><Bell size={15} /> {pending.length} request{pending.length > 1 ? 's' : ''} waiting</>) : 'Requests'}</h4>
                    {r.requests.length === 0 && <p className="hint">No requests yet — travelers heading your way will appear here.</p>}
                    <ul className="req-list">
                      {r.requests.map((q) => (
                        <li key={q.id}>
                          <span className="avatar sm">{initials(q.rider_name)}</span>
                          <div className="req-info">
                            <span><b>{q.rider_name}</b> · {q.seats} seat{q.seats > 1 ? 's' : ''}</span>
                            {q.message && <em className="msg">"{q.message}"</em>}
                            {q.rider_phone && <span className="ok-text"><Phone size={13} /> {q.rider_phone}</span>}
                          </div>
                          <span className={`chip ${statusClass(q.status)}`}>{q.status}</span>
                          {q.status === 'pending' && (
                            <span className="row">
                              <button className="btn sm primary" disabled={busyId === `/requests/${q.id}/accept`} onClick={() => act(`/requests/${q.id}/accept`)}>Accept</button>
                              <button className="btn sm danger" disabled={busyId === `/requests/${q.id}/reject`} onClick={() => act(`/requests/${q.id}/reject`)}>Reject</button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>

                    {(r.status === 'open' || r.status === 'full') && (
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="btn sm primary" disabled={busyId === `/rides/${r.id}/complete`} onClick={() => act(`/rides/${r.id}/complete`)}>
                          <CheckCircle2 size={14} /> Mark as completed
                        </button>
                        <button className="btn sm danger" disabled={busyId === `/rides/${r.id}/cancel`} onClick={() => act(`/rides/${r.id}/cancel`)}>
                          <XCircle size={14} /> Cancel ride
                        </button>
                      </div>
                    )}
                    {r.requests.some((q) => q.status === 'accepted') && (
                      <Link className="btn sm ghost" style={{ marginTop: 8 }} to={`/messages/${r.id}`}><MessageSquare size={14} /> Chat with riders</Link>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {tab === 'booked' && (
            <>
              {booked.length === 0 && (
                <div className="card empty">
                  <div className="empty-emoji"><Ticket size={40} /></div>
                  <p><b>No bookings yet.</b></p>
                  <Link className="btn primary" to="/find">Find a ride</Link>
                </div>
              )}

              {booked.map((q) => (
                <div key={q.id} className="card ride-card hover-lift">
                  <div className="ride-top">
                    <span className="veh">{vehicleEmoji(q.vehicle_type)}</span>
                    <div className="ride-route"><RouteLine r={q} /></div>
                    <div className="ride-side">
                      <span className={`chip ${statusClass(q.status)}`}>{q.status}</span>
                      {q.ride_status === 'cancelled' && <span className="chip bad">trip cancelled</span>}
                    </div>
                  </div>

                  {q.message && <p className="notes">Your message: "{q.message}"</p>}
                  <div className="ride-meta">
                    <span className="avatar sm">{initials(q.owner_name)}</span>
                    <span><b>{q.owner_name}</b></span>
                    {q.owner_phone ? <span className="ok-text"><Phone size={13} /> {q.owner_phone}</span> : q.status !== 'cancelled' ? <span className="hint">(contact visible once accepted)</span> : null}
                  </div>

                  {(q.status === 'pending' || q.status === 'accepted') && (
                    <div className="row">
                      <button className="btn danger" disabled={busyId === `/requests/${q.id}/cancel`} onClick={() => act(`/requests/${q.id}/cancel`)}>
                        <XCircle size={14} /> Cancel booking
                      </button>
                      {q.status === 'accepted' && (
                        <Link className="btn ghost" to={`/messages/${q.ride_id}`}><MessageSquare size={15} /> Chat</Link>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
    </div>
  )
}
