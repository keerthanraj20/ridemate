import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api.js'

export default function ForgotPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const isReset = Boolean(token)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function requestReset(e) {
    e.preventDefault()
    setMsg(''); setError(''); setBusy(true)
    try {
      const res = await api('/auth/forgot-password', { method: 'POST', body: { email } })
      setMsg(res.message || 'Check your email for a reset link')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function doReset(e) {
    e.preventDefault()
    setMsg(''); setError(''); setBusy(true)
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } })
      setMsg('Password updated! You can now log in.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ maxWidth: 440 }}>
        <h2 className="grad-icon-head"><KeyRound size={24} /> {isReset ? 'Reset Password' : 'Forgot Password?'}</h2>
        <p className="hint">{isReset ? 'Enter your new password below.' : "Enter your email and we'll send you a reset link."}</p>

        {!isReset ? (
          <form onSubmit={requestReset} className="stack">
            <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {msg && <p className="banner ok-text">{msg}</p>}
            {error && <p className="banner bad-text">{error}</p>}
            <button className="btn primary lg" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </form>
        ) : (
          <form onSubmit={doReset} className="stack">
            <input className="input" type="password" placeholder="New password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            {msg && <p className="banner ok-text">{msg}</p>}
            {error && <p className="banner bad-text">{error}</p>}
            <button className="btn primary lg" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/auth" className="link" style={{ color: 'var(--accent)' }}>← Back to login</Link>
        </p>
      </div>
    </div>
  )
}