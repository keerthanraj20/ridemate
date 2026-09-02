import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { api } from './api.js'
import { useAuth } from './AuthContext.jsx'

const Ctx = createContext(null)

// Lightweight in-app notification polling. Polls every 12s while logged in so
// the header badge stays fresh without needing WebSockets.
export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const timerRef = useRef(null)

  const load = useCallback(
    async (silent = true) => {
      if (!user) {
        setItems([])
        setUnread(0)
        return
      }
      try {
        const data = await api('/notifications')
        setItems(data.notifications || [])
        setUnread(data.count || 0)
      } catch (err) {
        if (!silent) throw err
      }
    },
    [user]
  )

  useEffect(() => {
    load()
    if (!user) return
    timerRef.current = setInterval(load, 12000)
    return () => clearInterval(timerRef.current)
  }, [user, load])

  const markRead = useCallback(
    async (ids) => {
      try {
        await api('/notifications/read', { method: 'POST', body: { ids } })
        setUnread(0)
        setItems((prev) => (Array.isArray(ids) && ids.length ? prev.map((n) => (ids.includes(n.id) ? { ...n, read: 1 } : n)) : prev.map((n) => ({ ...n, read: 1 }))))
      } catch {
        /* ignore */
      }
    },
    []
  )

  return <Ctx.Provider value={{ items, unread, load, markRead }}>{children}</Ctx.Provider>
}

export const useNotifications = () => useContext(Ctx)
