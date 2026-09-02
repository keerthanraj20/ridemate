import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { api } from '../api.js'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!token) { setBusy(false); setError('No verification token provided'); return }
    api('/auth/verify-email/confirm', { method: 'POST', body: { token } })
      .then((res) => setMsg(res.message || 'Email verified!'))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false))
  }, [token])

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2>Email Verification 📧</h2>
        {busy && <p className="hint">Verifying your email…</p>}
        {msg && <p className="banner ok-text">{msg}</p>}
        {error && <p className="banner bad-text">{error}</p>}
        <p style={{ marginTop: 16 }}>
          <Link to="/profile" className="link" style={{ color: 'var(--accent)' }}>← Go to profile</Link>
        </p>
      </div>
    </div>
  )
}