import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Bell, Car, UserPlus, CheckCircle2, XCircle, AlertTriangle, MessageSquare, LogOut } from 'lucide-react'
import { useAuth } from '../AuthContext.jsx'
import { useNotifications } from '../NotificationsContext.jsx'
import { initials, timeAgo, fmtDT } from '../utils.js'

const TYPE_ICON = {
  request: <UserPlus size={16} />,
  accept: <CheckCircle2 size={16} />,
  reject: <XCircle size={16} />,
  cancel: <AlertTriangle size={16} />,
  message: <MessageSquare size={16} />,
}

export default function Header() {
  const { user, logout } = useAuth()
  const { items, unread, markRead } = useNotifications()
  const nav = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  // close the dropdown when the route changes
  useEffect(() => setOpen(false), [location.pathname])

  // close on outside click
  useEffect(() => {
    function handler(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function openPanel() {
    setOpen((v) => !v)
    if (!open && unread > 0) markRead([])
  }

  return (
    <header className="topbar">
      <NavLink to={user ? '/find' : '/auth'} className="brand">
        <span className="brand-logo"><Car size={20} /></span> RideMate
      </NavLink>

      {user && (
        <>
          <nav className="nav">
            <NavLink to="/find">Find a ride</NavLink>
            <NavLink to="/offer">Offer a ride</NavLink>
            <NavLink to="/my-rides">My rides</NavLink>
            <NavLink to="/messages">Messages</NavLink>
            <NavLink to="/saved">Saved</NavLink>
            <NavLink to="/history">History</NavLink>
            <NavLink to="/profile">Profile</NavLink>
          </nav>
          <div className="userbox">
            <div className="notif-wrap" ref={boxRef}>
              <button className={`bell ${open ? 'active' : ''}`} onClick={openPanel} aria-label="Notifications">
                <Bell size={18} />
                {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
              </button>

              {open && (
                <div className="notif-panel card">
                  <div className="notif-head">
                    <b>Notifications</b>
                    {unread > 0 && <span className="hint">{unread} new</span>}
                  </div>
                  {items.length === 0 && <p className="hint center" style={{ padding: 12 }}>No notifications yet.</p>}
                  <div className="notif-list">
                    {items.slice(0, 15).map((n) => (
                      <button
                        key={n.id}
                        className={`notif-item ${n.read ? '' : 'unread'}`}
                        onClick={() => {
                          setOpen(false)
                          if (n.link) nav(n.link)
                        }}
                      >
                        <span className="notif-emoji">{TYPE_ICON[n.type] || <Bell size={16} />}</span>
                        <span className="notif-body">
                          <b>{n.title}</b>
                          {n.body && <span className="notif-msg">{n.body}</span>}
                          <span className="hint">{timeAgo(n.created_at)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="notif-foot">
                    <span className="hint">{fmtDT(new Date())}</span>
                  </div>
                </div>
              )}
            </div>

            <NavLink to="/profile" className="avatar-link">
              <span className="avatar">{initials(user.name)}</span>
            </NavLink>
            <button
              className="btn ghost sm"
              onClick={() => {
                logout()
                nav('/auth')
              }}
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </>
      )}
    </header>
  )
}
