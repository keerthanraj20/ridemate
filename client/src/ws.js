// ─── Shared WebSocket connection for live events ──────────────────────────────
// Single socket to /api/ws?token=<jwt> with auto-reconnect + backoff.
// Any module can subscribe with onWsEvent(fn) / clearWsEvent(fn).

import { getToken } from './api.js'

let socket = null
let timer = 0
let locked = false
const listeners = new Set()

function url() {
  const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
  return `${proto}${window.location.host}/api/ws?token=${encodeURIComponent(getToken() || '')}`
}

function cleanup() {
  if (socket) {
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
    try { socket.close() } catch { /* ignore */ }
    socket = null
  }
  clearTimeout(timer)
}

function connect() {
  if (locked) return
  const token = getToken()
  if (!token) {
    // logged out — drop anything left over
    if (socket) cleanup()
    return
  }

  let ws
  try { ws = new WebSocket(url()) } catch { schedule(); return }

  socket = ws

  ws.onopen = () => { /* ready */ }

  ws.onmessage = (raw) => {
    let data
    try { data = JSON.parse(raw.data) } catch { return }
    for (const fn of listeners) {
      try { fn(data) } catch { /* listener error is not fatal */ }
    }
  }

  ws.onclose = () => {
    socket = null
    schedule()
  }

  ws.onerror = () => {
    try { ws.close() } catch { /* ignore */ }
  }
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(connect, 4000)
}

// Call when the auth state changes (login / logout / token refresh).
export function syncSocket() {
  clearTimeout(timer)
  if (!getToken()) {
    locked = true
    cleanup()
    locked = false
    return
  }
  if (socket && socket.readyState === WebSocket.OPEN) return
  cleanup()
  connect()
}

export function onWsEvent(fn) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}