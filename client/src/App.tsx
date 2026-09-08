import { useState, useCallback, useEffect } from "react"
import { useAuth } from "./AuthContext.jsx"
import { useToast } from "./Toast.jsx"
import { syncSocket } from "./ws.js"
import { initials, hashColor } from "./lib.ts"
import { TopBar, BottomNav, RequestSheet } from "./components/ui.tsx"
import { HomeView } from "./views/HomeView.tsx"
import { FindRideView } from "./views/FindRideView.tsx"
import { OfferRideView } from "./views/OfferRideView.tsx"
import { MyRidesView } from "./views/MyRidesView.tsx"
import { MessagesView } from "./views/MessagesView.tsx"
import { ChatView } from "./views/ChatView.tsx"
import { SavedView } from "./views/SavedView.tsx"
import { HistoryView } from "./views/HistoryView.tsx"
import { PaymentView } from "./views/PaymentView.tsx"
import { RideDetailView } from "./views/RideDetailView.tsx"
import { AdminView } from "./views/AdminView.tsx"
import { AuthView } from "./views/AuthView.tsx"
import { ProfileView } from "./views/ProfileView.tsx"
import type { View, Conversation, Ride } from "./types.ts"

export default function App() {
  const { user, logout } = useAuth()
  const [view, setView] = useState<View>("home")
  const [prevView, setPrevView] = useState<View>("home")
  const [convo, setConvo] = useState<Conversation | null>(null)
  const [requestTarget, setRequestTarget] = useState<Ride | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const toast = useToast()

  const navigate = useCallback((v: View) => {
    setPrevView(view)
    setView(v)
  }, [view])

  // Keep the live socket in sync with the auth state (login / logout).
  useEffect(() => {
    syncSocket()
  }, [user])

  const goBack = () => {
    if (view === "chat" && convo) { setView("messages"); setConvo(null); return }
    setView(prevView)
  }

  const openChat = (rideId: number, name: string) => {
    setConvo({
      rideId, name: name || "Traveler", initial: initials(name || "T"), color: hashColor(name || "T"),
      route: "", time: "", unread: 0, lastMsg: "",
    })
    setView("chat")
  }

  const topBarConfig: Record<View, { title: React.ReactNode; back?: boolean }> = {
    home:        { title: null },
    find:        { title: <span className="font-display font-700 text-[17px] text-ink">Find a Ride</span> },
    offer:       { title: <span className="font-display font-700 text-[17px] text-ink">Offer a Ride</span> },
    rides:       { title: <span className="font-display font-700 text-[17px] text-ink">My Rides</span>, back: true },
    messages:    { title: <span className="font-display font-700 text-[17px] text-ink">Messages</span> },
    saved:       { title: <span className="font-display font-700 text-[17px] text-ink">Saved Routes</span>, back: true },
    history:     { title: <span className="font-display font-700 text-[17px] text-ink">History</span>, back: true },
    payments:    { title: <span className="font-display font-700 text-[17px] text-ink">Payments & Escrow</span>, back: true },
    detail:      { title: <span className="font-display font-700 text-[17px] text-ink">Ride details</span>, back: true },
    admin:       { title: <span className="font-display font-700 text-[17px] text-ink">Admin Console</span>, back: true },
    auth:        { title: null },
    profile:     { title: <span className="font-display font-700 text-[17px] text-ink">Profile</span> },
    chat:        { title: null },
  }

  const showBottomNav = !["auth", "chat"].includes(view)
  const showTopBar = !["home", "auth", "chat"].includes(view)

  const messageUnread = 0

  if (!user) {
    return (
      <div className="desktop-backdrop" style={{ height: "100%", fontFamily: "var(--font-body)" }}>
        <div
          className="flex flex-col bg-app"
          style={{ height: "100%", maxWidth: 430, margin: "0 auto", boxShadow: "0 0 60px rgba(0,0,0,0.25)" }}
        >
          <div className="flex-1 flex flex-col overflow-hidden">
            <div key="auth" className="flex-1 flex flex-col overflow-hidden">
              <AuthView />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="desktop-backdrop" style={{ height: "100%", fontFamily: "var(--font-body)" }}>
      <div
        className="flex flex-col bg-app"
        style={{ height: "100%", maxWidth: 430, margin: "0 auto", boxShadow: "0 0 60px rgba(0,0,0,0.25)" }}
      >
      {showTopBar && (
        <div className="view-enter">
          <TopBar title={topBarConfig[view.split("?")[0] as View]?.title} onBack={topBarConfig[view.split("?")[0] as View]?.back ? goBack : undefined} />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {view === "home" && (
          <div key={`home-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            <HomeView onNavigate={navigate} user={user} />
          </div>
        )}
        {view.startsWith("find") && (
          <div key={`find-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            {(() => {
              const qs = view.includes("?") ? view.split("?")[1] : ""
              const sp = new URLSearchParams(qs)
              return (
                <FindRideView
                  onNavigate={navigate}
                  onRequestRide={r => setRequestTarget(r)}
                  initialFrom={sp.get("from") || ""}
                  initialTo={sp.get("to") || ""}
                />
              )
            })()}
          </div>
        )}
        {view === "offer" && (
          <div key="offer" className="flex-1 flex flex-col overflow-hidden view-enter">
            <OfferRideView onDone={navigate} />
          </div>
        )}
        {view === "rides" && (
          <div key={`rides-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            <MyRidesView onNavigate={navigate} onOpenChat={openChat} />
          </div>
        )}
        {view === "messages" && (
          <div key={`messages-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            <MessagesView onSelectChat={c => { setConvo(c); setView("chat") }} />
          </div>
        )}
        {view === "chat" && convo && (
          <div key="chat" className="flex-1 flex flex-col overflow-hidden view-enter">
            <ChatView convo={convo} onBack={() => { setView("messages"); setConvo(null); setRefreshKey(k => k + 1) }} />
          </div>
        )}
        {view === "saved" && (
          <div key="saved" className="flex-1 flex flex-col overflow-hidden view-enter">
            <SavedView onNavigate={navigate} onUnsaved={() => {}} />
          </div>
        )}
        {view === "history" && (
          <div key="history" className="flex-1 flex flex-col overflow-hidden view-enter">
            <HistoryView />
          </div>
        )}
        {view === "payments" && (
          <div key="payments" className="flex-1 flex flex-col overflow-hidden view-enter">
            <PaymentView onNavigate={navigate} />
          </div>
        )}
        {view.startsWith("detail") && (
          <div key={`detail-${refreshKey}`} className="flex-1 flex flex-col overflow-hidden view-enter">
            {(() => {
              const sp = new URLSearchParams(view.includes("?") ? view.split("?")[1] : "")
              const id = Number(sp.get("ride"))
              return <RideDetailView rideId={id} onNavigate={navigate} onOpenChat={openChat} />
            })()}
          </div>
        )}
        {view.startsWith("admin") && (
          <div key="admin" className="flex-1 flex flex-col overflow-hidden view-enter">
            <AdminView />
          </div>
        )}
        {view === "profile" && (
          <div key="profile" className="flex-1 flex flex-col overflow-hidden view-enter">
            <ProfileView onNavigate={navigate} onLogout={() => { logout(); toast("Signed out") }} />
          </div>
        )}
      </div>

      {showBottomNav && (
        <BottomNav
          active={view}
          onNavigate={v => navigate(v)}
          messageUnread={messageUnread}
        />
      )}

      {requestTarget && (
        <RequestSheet
          ride={requestTarget}
          onClose={() => setRequestTarget(null)}
          onDone={() => { setRequestTarget(null); navigate("rides") }}
        />
      )}
      </div>
    </div>
  )
}