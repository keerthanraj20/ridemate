import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { vehicleEmoji, vehicleLabel, fmtDT, priceLabel, initials, statusClass } from '../utils.js'
import { useToast } from '../Toast.jsx'

function Stars({ count, size = 16 }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ fontSize: size, color: i <= count ? '#fbbf24' : '#263156' }}>★</span>
      ))}
    </span>
  )
}

function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <span className="star-input">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="star-btn"
          style={{ fontSize: 26, color: i <= (hover || value) ? '#fbbf24' : '#263156', cursor: 'pointer' }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
        >
          ★
        </span>
      ))}
    </span>
  )
}

function RatingModal({ ride, onClose, onRated }) {
  const toast = useToast()
  const [stars, setStars] = useState(0)
  const [review, setReview] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedRider, setSelectedRider] = useState(ride._acceptedRiders?.[0] || null)

  const isOwner = ride._role === 'owner'
  const targetName = isOwner ? (selectedRider?.name || 'a rider') : ride.owner_name

  async function submit() {
    if (!stars) return toast('Select a star rating', 'bad')
    if (isOwner && !selectedRider) return toast('Select a rider to rate', 'bad')
    setSaving(true)
    try {
      const body = { stars, review }
      if (isOwner) body.to_user_id = selectedRider.id
      await api(`/rides/${ride.id}/rate`, { method: 'POST', body })
      toast('Rating submitted!')
      onRated()
    } catch (err) {
      toast(err.message, 'bad')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>Rate {isOwner ? 'Rider' : 'Driver'}</h3>
        {isOwner && ride._acceptedRiders?.length > 1 && (
          <div style={{ margin: '10px 0' }}>
            <label className="lbl">Which rider?</label>
            <select className="input" value={selectedRider?.id || ''} onChange={(e) => {
              const r = ride._acceptedRiders.find((x) => x.id === Number(e.target.value))
              setSelectedRider(r || null)
            }}>
              {ride._acceptedRiders.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}
        <p className="hint">How was your experience with <b>{targetName}</b>?</p>
        <div style={{ margin: '14px 0' }}><StarInput value={stars} onChange={setStars} /></div>
        <textarea
          className="input"
          rows={3}
          placeholder="Write a review (optional)"
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn primary sm" onClick={submit} disabled={saving}>{saving ? 'Submitting...' : 'Submit'}</button>
          <button className="btn ghost sm" onClick={onClose}>Skip</button>
        </div>
      </div>
    </div>
  )
}

function RideCard({ ride, role, onRate }) {
  const canRate = ride.status === 'completed' && !ride.myRating
  const statusLabel = role === 'owner'
    ? ride.status
    : ride.my_status || ride.status

  return (
    <div className="card ride-card hover-lift">
      <div className="ride-top">
        <span className="veh">{vehicleEmoji(ride.vehicle_type)}</span>
        <div className="ride-route">
          <strong>
            {ride.from_name} <span className="arrow">→</span> {ride.to_name}
          </strong>
          <span className="sub">
            {fmtDT(ride.depart_at)} · {vehicleLabel(ride.vehicle_type)}
            {ride.vehicle_model ? ` (${ride.vehicle_model})` : ''} · {priceLabel(ride.price)}
          </span>
        </div>
        <div className="ride-side">
          <span className={`chip ${statusClass(statusLabel)}`}>{statusLabel}</span>
        </div>
      </div>

      <div className="ride-meta">
        <span className="avatar sm">{initials(ride.owner_name)}</span>
        <span><b>{ride.owner_name}</b></span>
        {role === 'owner' && ride._riderName && (
          <span className="hint">· Rider: {ride._riderName}</span>
        )}
      </div>

      <div className="ride-bottom">
        {ride.myRating ? (
          <div className="rated-badge">
            <Stars count={ride.myRating.stars} size={14} />
            <span className="hint">You rated this ride</span>
          </div>
        ) : canRate ? (
          <button className="btn primary sm" onClick={() => onRate(ride)}>⭐ Rate this ride</button>
        ) : null}
      </div>
    </div>
  )
}

export default function RideHistory() {
  const toast = useToast()
  const [tab, setTab] = useState('offered')
  const [data, setData] = useState(null)
  const [ratingRide, setRatingRide] = useState(null)

  async function load() {
    try {
      const res = await api('/rides/history')
      setData(res)
    } catch (err) {
      toast(err.message, 'bad')
    }
  }

  useEffect(() => { load() }, [])

  const loading = !data
  const offered = data?.offered ?? []
  const joined = data?.joined ?? []
  const current = tab === 'offered' ? offered : joined

  if (loading) {
    return (
      <div className="page fade-in">
        <div className="skel-card card"><div className="skel-line w40" /><div className="skel-line w70" /><div className="skel-line w50" /></div>
        <div className="skel-card card"><div className="skel-line w60" /><div className="skel-line w35" /></div>
      </div>
    )
  }

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>Ride History <span className="grad-text">📜</span></h2>
        <p>Your past trips as a driver or traveler.</p>
      </div>

      <div className="tabs left">
        <button className={tab === 'offered' ? 'active' : ''} onClick={() => setTab('offered')}>
          🚗 Offered ({offered.length})
        </button>
        <button className={tab === 'joined' ? 'active' : ''} onClick={() => setTab('joined')}>
          🎟️ Joined ({joined.length})
        </button>
      </div>

      <div className="stack-lg">
        {current.length === 0 && (
          <div className="card empty">
            <div className="empty-emoji">{tab === 'offered' ? '🛣️' : '🎟️'}</div>
            <p><b>No {tab === 'offered' ? 'offered' : 'joined'} rides yet.</b></p>
            <Link className="btn primary" to={tab === 'offered' ? '/offer' : '/find'}>
              {tab === 'offered' ? 'Offer a ride' : 'Find a ride'}
            </Link>
          </div>
        )}

        {current.map((r) => (
          <RideCard
            key={r.id}
            ride={r}
            role={tab === 'offered' ? 'owner' : 'rider'}
            onRate={(ride) => setRatingRide({ ...ride, _role: tab === 'offered' ? 'owner' : 'rider' })}
          />
        ))}
      </div>

      {ratingRide && (
        <RatingModal
          ride={ratingRide}
          onClose={() => setRatingRide(null)}
          onRated={() => { setRatingRide(null); load() }}
        />
      )}
    </div>
  )
}
