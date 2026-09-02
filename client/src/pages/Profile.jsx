import { useEffect, useState } from 'react'
import { User, Mail, Phone, AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { initials, fmtDT, trustLevel, trustBadge } from '../utils.js'
import { useToast } from '../Toast.jsx'

function Stars({ count, size = 18 }) {
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

function TrustPill({ verification }) {
  const level = trustLevel(verification)
  const badge = trustBadge(level)
  return <span className={`chip trust trust-${badge.cls}`}>{level >= 3 ? '🛡️' : level >= 1 ? '🔓' : '🆕'} {badge.label}</span>
}

export default function Profile() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', bio: '' })
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [phoneStage, setPhoneStage] = useState('idle') // idle | sent | verifying
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  useEffect(() => {
    api('/profile').then(setData).catch((err) => {
      setLoadError(true)
      toast(err.message, 'bad')
    })
  }, [])

  useEffect(() => {
    if (data) setForm({ name: data.user.name, phone: data.user.phone, bio: data.user.bio || '' })
  }, [data])

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api('/profile', { method: 'PUT', body: form })
      updateUser(res.user)
      setData((d) => ({ ...d, user: res.user }))
      setEditing(false)
      toast('Profile updated!')
    } catch (err) {
      toast(err.message, 'bad')
    } finally {
      setSaving(false)
    }
  }

  if (!data) {
    return (
      <div className="page fade-in">
        {loadError ? (
          <div className="card empty">
            <div className="empty-emoji"><AlertTriangle size={40} /></div>
            <p><b>Failed to load profile.</b></p>
            <p className="hint">Please try refreshing the page.</p>
          </div>
        ) : (
          <div className="skel-card card"><div className="skel-line w40" /><div className="skel-line w70" /><div className="skel-line w50" /></div>
        )}
      </div>
    )
  }

  const { stats, recentRatings } = data

  function handleAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) return toast('Image must be under 1 MB', 'bad')
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await api('/profile/avatar', { method: 'PUT', body: { avatar: reader.result } })
        updateUser(res.user)
        setData((d) => ({ ...d, user: res.user }))
        toast('Avatar updated!')
      } catch (err) { toast(err.message, 'bad') }
    }
    reader.readAsDataURL(file)
  }

  async function sendVerify() {
    try {
      await api('/auth/verify-email', { method: 'POST' })
      toast('Verification email sent — check your inbox')
    } catch (err) { toast(err.message, 'bad') }
  }

  async function sendPhoneCode() {
    setPhoneBusy(true)
    try {
      await api('/phone/send-code', { method: 'POST' })
      setPhoneStage('sent')
      toast('Verification code sent to your email')
    } catch (err) { toast(err.message, 'bad') }
    finally { setPhoneBusy(false) }
  }

  async function verifyPhone() {
    setPhoneBusy(true)
    try {
      const res = await api('/phone/verify', { method: 'POST', body: { code: phoneCode } })
      updateUser(res.user)
      setData((d) => ({ ...d, user: res.user, verification: { ...d.verification, phoneVerified: true } }))
      setPhoneStage('idle')
      setPhoneCode('')
      toast('Phone verified!')
    } catch (err) { toast(err.message, 'bad') }
    finally { setPhoneBusy(false) }
  }

  async function deleteAccount() {
    setDeleteBusy(true)
    try {
      await api('/account', { method: 'DELETE' })
      toast('Account deleted. Goodbye!')
      window.location.href = '/'
    } catch (err) { toast(err.message, 'bad'); setConfirmingDelete(false) }
    finally { setDeleteBusy(false) }
  }

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>My Profile <span className="grad-text grad-icon"><User size={26} /></span></h2>
      </div>

      <div className="split">
        <div className="stack-lg">
          <div className="card profile-card">
            <div className="profile-top">
              {data.user.avatar ? (
                <label className="avatar lg" style={{ cursor: 'pointer', padding: 0, overflow: 'hidden', background: 'none' }}>
                  <img src={data.user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  <input type="file" accept="image/*" hidden onChange={handleAvatar} />
                </label>
              ) : (
                <label className="avatar lg" style={{ cursor: 'pointer', padding: 0 }}>
                  {initials(data.user.name)}
                  <input type="file" accept="image/*" hidden onChange={handleAvatar} />
                </label>
              )}
              <div>
                <h3 style={{ margin: 0 }}>{data.user.name}</h3>
                <span className="hint">{data.user.email}</span>
                <div style={{ marginTop: 6 }}>
                  <TrustPill verification={data.verification} />
                </div>
                {!data.user.email_verified ? (
                  <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={sendVerify}>
                    <Mail size={14} /> Send verification email
                  </button>
                ) : (
                  <span className="chip trust trust-ok" style={{ marginTop: 8 }}>✅ Email verified</span>
                )}
                <div style={{ marginTop: 8 }}>
                  {data.verification.phoneVerified ? (
                    <span className="chip trust trust-ok"><ShieldCheck size={13} /> Phone verified</span>
                  ) : phoneStage === 'idle' ? (
                    <button className="btn ghost sm" onClick={sendPhoneCode} disabled={phoneBusy}>
                      <ShieldCheck size={14} /> Verify phone
                    </button>
                  ) : (
                    <div className="row" style={{ gap: 8 }}>
                      <input
                        className="input sm"
                        style={{ width: 120 }}
                        placeholder="6-digit code"
                        value={phoneCode}
                        maxLength={6}
                        onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
                      />
                      <button className="btn primary sm" onClick={verifyPhone} disabled={phoneBusy || phoneCode.length !== 6}>
                        {phoneBusy ? 'Verifying...' : 'Confirm'}
                      </button>
                      <button className="btn ghost sm" onClick={() => setPhoneStage('idle')}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {editing ? (
              <form onSubmit={saveProfile} className="stack">
                <div>
                  <label className="lbl">Name</label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">Phone</label>
                  <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div>
                  <label className="lbl">About me <span className="hint">(shown to riders &amp; owners)</span></label>
                  <textarea className="input" rows={3} maxLength={300} placeholder="A little about yourself and your commuting habits…" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                </div>
                <div className="row">
                  <button className="btn primary sm" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                  <button className="btn ghost sm" type="button" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <p className="hint"><Phone size={13} /> {data.user.phone}</p>
                {data.user.bio && <p className="profile-bio">{data.user.bio}</p>}
                <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>Edit Profile</button>
              </>
            )}
          </div>

          <div className="card">
            <h4>Ride Stats</h4>
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-num">{stats.ridesOffered}</span>
                <span className="stat-label">Rides Offered</span>
              </div>
              <div className="stat-box">
                <span className="stat-num">{stats.ridesJoined}</span>
                <span className="stat-label">Rides Joined</span>
              </div>
              <div className="stat-box">
                <span className="stat-num">{stats.avgRating ?? '—'}</span>
                <span className="stat-label">Avg Rating ({stats.totalRatings})</span>
              </div>
            </div>
            {stats.avgRating && <div style={{ marginTop: 10 }}><Stars count={Math.round(stats.avgRating)} size={22} /></div>}
          </div>
        </div>

        <div className="card">
          <h4>Recent Reviews</h4>
          {recentRatings.length === 0 && <p className="hint">No ratings yet — complete a ride to get reviews!</p>}
          <div className="stack">
            {recentRatings.map((r) => (
              <div key={r.id} className="review-item">
                <div className="review-head">
                  <span className="avatar sm">{initials(r.from_name)}</span>
                  <b>{r.from_name}</b>
                  <Stars count={r.stars} size={14} />
                </div>
                {r.review && <p className="review-text">{r.review}</p>}
                <span className="hint">{fmtDT(r.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card danger-zone">
        <h4><Trash2 size={16} /> <span className="text-danger">Delete account</span></h4>
        <p className="hint">This permanently deletes your personal data. Your name, email and phone will be anonymized and you can no longer log in.</p>
        {!confirmingDelete ? (
          <button className="btn danger sm" onClick={() => setConfirmingDelete(true)}>
            <Trash2 size={14} /> Delete my account
          </button>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <span className="hint">Are you sure?</span>
            <button className="btn danger sm" onClick={deleteAccount} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting...' : 'Yes, delete'}
            </button>
            <button className="btn ghost sm" onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
