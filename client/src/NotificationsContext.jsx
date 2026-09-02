import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from './api.js'
import { useAuth } from './AuthContext.jsx'

const Ctx = createContext(null)

// Lightweight in-app notification polling. Polls every 12s while logged in so
// the header badge stays fresh without needing WebSockets.
export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)

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

    let interval = null
    const visible = () => document.visibilityState === 'visible'
    const start = () => {
      if (visible()) {
        load()
        interval = setInterval(load, 12000)
      }
    }
    const stop = () => {
      clearInterval(interval)
      interval = null
    }
    const onVis = () => (visible() ? start() : stop())

    start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [user, load])

  const markRead = useCallback(
    async (ids) => {
      try {
        await api('/notifications/read', { method: 'POST', body: { ids } })
        const fresh = await api('/notifications').catch(() => null)
        if (fresh) {
          setItems(fresh.notifications || [])
          setUnread(fresh.count || 0)
        } else {
          setItems((prev) => prev.map((n) => ({ ...n, read: 1 })))
        }
      } catch {
        /* ignore */
      }
    },
    []
  )

  return <Ctx.Provider value={{ items, unread, load, markRead }}>{children}</Ctx.Provider>
}

export const useNotifications = () => useContext(Ctx)
