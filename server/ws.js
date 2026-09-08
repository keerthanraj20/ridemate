// ─── WebSocket hub (live chat push + instant notifications) ───────────────────
// A single WSS endpoint (/api/ws). Auth is done via ?token=<JWT> on the
// upgrade URL (browser WebSocket API can't send Authorization headers).
//
// Routes/tests talk to the REST API as before; the socket simply gets a fast
// push so clients can stop polling for chat.

import { WebSocketServer } from 'ws'
import jwt from 'jsonwebtoken'

// userId -> Set<WebSocket>
const clients = new Map()

function verifyToken(token) {
  if (!token) return null
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    return decoded?.id ? decoded : null
  } catch {
    return null
  }
}

function attachUser(userId, socket) {
  let set = clients.get(userId)
  if (!set) {
    set = new Set()
    clients.set(userId, set)
  }
  set.add(socket)
}

function detachUser(userId, socket) {
  const set = clients.get(userId)
  if (!set) return
  set.delete(socket)
  if (set.size === 0) clients.delete(userId)
}

function allSockets() {
  const out = []
  for (const set of clients.values()) for (const s of set) out.push(s)
  return out
}

export function attachWs(server) {
  const wss = new WebSocketServer({ server, path: '/api/ws' })

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, 'ws://localhost')
    const user = verifyToken(url.searchParams.get('token'))
    if (!user) {
      socket.close(4001, 'Unauthorized')
      return
    }

    attachUser(user.id, socket)
    socket.isAlive = true
    socket.on('pong', () => { socket.isAlive = true })
    socket.on('close', () => detachUser(user.id, socket))
    socket.on('error', () => { /* ignore transient errors */ })
  })

  // Heartbeat: drop dead connections so the client map stays lean.
  const heartbeat = setInterval(() => {
    for (const socket of allSockets()) {
      if (!socket.isAlive) {
        socket.terminate()
        continue
      }
      socket.isAlive = false
      socket.ping()
    }
  }, 30_000)
  wss.on('close', () => clearInterval(heartbeat))
}

// Send a JSON payload to every live connection of one user.
// payload shape: { event: 'message' | 'notification', ...fields }
export function pushToUser(userId, payload) {
  const set = clients.get(userId)
  if (!set) return
  const data = JSON.stringify(payload)
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) socket.send(data)
  }
}

export function pushToUsers(userIds, payload) {
  for (const id of userIds) pushToUser(id, payload)
}