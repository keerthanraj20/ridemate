import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import { useToast } from '../Toast.jsx'
import { vehicleEmoji, vehicleLabel, fmtDT, initials, repeatLabel } from '../utils.js'

function ChatView({ rideId }) {
  const { user } = useAuth()
  const toast = useToast()
  const [state, setState] = useState({ ride: null, messages: [], loading: true })
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    if (!rideId) {
      setState({ ride: null, messages: [], loading: false })
      return
    }
    try {
      const data = await api(`/rides/${rideId}/messages`)
      setState({ ride: data.ride, messages: data.messages, loading: false })
    } catch (err) {
      toast(err.message, 'bad')
      setState((s) => ({ ...s, loading: false }))
    }
  }, [rideId, toast])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, 4000)
    return () => clearInterval(pollRef.current)
  }, [load])

  // mark incoming as read
  useEffect(() => {
    if (rideId) api(`/rides/${rideId}/messages/read`, { method: 'POST' }).catch(() => {})
  }, [rideId, state.messages.length])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [state.messages.length])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending || !rideId) return
    setSending(true)
    setText('')
    try {
      const data = await api(`/rides/${rideId}/messages`, { method: 'POST', body: { body } })
      setState((s) => ({ ...s, messages: [...s.messages, data.message] }))
    } catch (err) {
      toast(err.message, 'bad')
    } finally {
      setSending(false)
    }
  }

  if (!rideId) {
    return (
      <div className="card chat-card chat-placeholder">
        <div className="empty-emoji">💬</div>
        <p><b>Select a conversation</b> to start chatting with your ride partner.</p>
      </div>
    )
  }

  if (state.loading)
    return (
      <div className="card chat-card">
        <div className="skel-line w40" />
        <div className="skel-line w75" />
        <div className="skel-line w55" />
      </div>
    )

  const ride = state.ride

  return (
    <div className="chat-layout">
      <div className="card chat-ride-bar">
        <span className="veh sm">{vehicleEmoji(ride.vehicle_type)}</span>
        <div className="ride-route">
          <strong>{ride.from_name} <span className="arrow">→</span> {ride.to_name}</strong>
          <span className="sub">{fmtDT(ride.depart_at)} · {vehicleLabel(ride.vehicle_type)}{repeatLabel(ride.repeat_every) ? ` · ${repeatLabel(ride.repeat_every)}` : ''}</span>
        </div>
      </div>

      <div className="card chat-card">
        <div className="chat-history" ref={listRef}>
          {state.messages.length === 0 && (
            <p className="hint center" style={{ padding: 20 }}>No messages yet — say hello 👋</p>
          )}
          {state.messages.map((m) => (
            <div key={m.id} className={`bubble ${m.sender_id === user.id ? 'mine' : ''}`}>
              <div className="bubble-text">{m.body}</div>
              <div className="bubble-time">{fmtDT(m.created_at)}</div>
            </div>
          ))}
        </div>

        <form className="chat-input" onSubmit={send}>
          <input
            className="input"
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button className="btn primary" disabled={sending || !text.trim()}>Send</button>
        </form>
      </div>
    </div>
  )
}

export default function Messages() {
  const { user } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const { rideId } = useParams()
  const convId = rideId ? Number(rideId) : null

  const [conversations, setConversations] = useState(null)
  const [active, setActive] = useState(convId)

  useEffect(() => {
    setActive(convId)
  }, [convId])

  async function load() {
    try {
      const data = await api('/messages')
      setConversations(data.conversations)
      if (!active && data.conversations.length > 0) {
        // first conversation auto-selects on desktop
      }
    } catch (err) {
      toast(err.message, 'bad')
    }
  }

  useEffect(() => { load() }, [])

  // refresh conversation list periodically (to update last message / unread)
  useEffect(() => {
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [])

  const loading = !conversations

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>Messages <span className="grad-text">💬</span></h2>
        <p>Chat directly with your ride partners after a seat is accepted.</p>
      </div>

      {loading ? (
        <div className="card chat-card"><div className="skel-line w40" /><div className="skel-line w70" /><div className="skel-line w60" /></div>
      ) : conversations.length === 0 ? (
        <div className="card empty">
          <div className="empty-emoji">💬</div>
          <p><b>No conversations yet.</b></p>
          <p className="hint">Once a ride owner accepts your request — or you accept a rider — you can chat here.</p>
          <div className="row center">
            <Link className="btn primary" to="/find">Find a ride</Link>
            <Link className="btn ghost" to="/offer">Offer a ride</Link>
          </div>
        </div>
      ) : (
        <div className="msg-grid">
          <aside className="conv-list card">
            {conversations.map((c) => (
              <button
                key={c.ride.id}
                className={`conv-item ${active === c.ride.id ? 'active' : ''}`}
                onClick={() => {
                  setActive(c.ride.id)
                  nav(`/messages/${c.ride.id}`)
                }}
              >
                <span className="conv-avatar avatar sm">{initials(c.counterpart.name)}</span>
                <span className="conv-main">
                  <span className="conv-name">
                    <b>{c.counterpart.name}</b>
                    <span className="hint">{fmtDT(c.lastAt)}</span>
                  </span>
                  <span className="conv-route">{c.ride.from_name} → {c.ride.to_name}</span>
                  <span className={`conv-last ${c.unread ? 'unread' : ''}`}>
                    {c.lastSenderMe ? 'You: ' : ''}{c.lastMessage || 'Say hello 👋'}
                  </span>
                </span>
                {c.unread > 0 && <span className="bubble">{c.unread}</span>}
              </button>
            ))}
          </aside>
          <ChatView key={active} rideId={active} />
        </div>
      )}
    </div>
  )
}
