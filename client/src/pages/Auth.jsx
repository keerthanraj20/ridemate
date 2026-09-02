import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'

export default function Auth() {
  const { user, login } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/find" replace />

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      login(data.token, data.user)
      nav('/find')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-hero">
          <h1>{mode === 'login' ? 'Welcome back' : 'Join RideMate'} <span style={{ color: 'var(--text)' }}>{mode === 'login' ? '👋' : ''}</span></h1>
          <p>Vehicle owners &amp; walkers — travel together to the same place. No drivers. No commissions.</p>
        </div>

        <div className="tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Register
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <>
              <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} required />
              <input className="input" placeholder="Phone number" value={form.phone} onChange={set('phone')} required />
            </>
          )}
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
          <input
            className="input"
            type="password"
            placeholder="Password (min 6 chars)"
            value={form.password}
            onChange={set('password')}
            minLength={6}
            required
          />

          {error && <p className="banner bad-text">{error}</p>}

          <button className="btn primary lg" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Create account'}
          </button>

          {mode === 'login' && (
            <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
              <a href="/forgot-password" className="link" style={{ color: 'var(--accent)' }}>Forgot your password?</a>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
