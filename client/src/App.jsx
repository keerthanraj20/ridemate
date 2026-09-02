import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import Header from './components/Header.jsx'

const Landing = lazy(() => import('./pages/Landing.jsx'))
const Auth = lazy(() => import('./pages/Auth.jsx'))
const FindRide = lazy(() => import('./pages/FindRide.jsx'))
const OfferRide = lazy(() => import('./pages/OfferRide.jsx'))
const MyRides = lazy(() => import('./pages/MyRides.jsx'))
const Messages = lazy(() => import('./pages/Messages.jsx'))
const SavedRoutes = lazy(() => import('./pages/SavedRoutes.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const RideHistory = lazy(() => import('./pages/RideHistory.jsx'))

function PageLoader() {
  return (
    <div className="page">
      <div className="skel-card card"><div className="skel-line w30" /><div className="skel-line w70" /><div className="skel-line w50" /></div>
      <div className="skel-card card"><div className="skel-line w60" /><div className="skel-line w40" /></div>
    </div>
  )
}

function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/auth" replace />
}

function GuestOnly({ children }) {
  const { user } = useAuth()
  return user ? <Navigate to="/find" replace /> : children
}

function Home() {
  const { user } = useAuth()
  return user ? <Navigate to="/find" replace /> : <Landing />
}

export default function App() {
  return (
    <>
      <Header />
      <main className="wrap">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/auth"
              element={
                <GuestOnly>
                  <Auth />
                </GuestOnly>
              }
            />
            <Route
              path="/find"
              element={
                <RequireAuth>
                  <FindRide />
                </RequireAuth>
              }
            />
            <Route
              path="/offer"
              element={
                <RequireAuth>
                  <OfferRide />
                </RequireAuth>
              }
            />
            <Route
              path="/my-rides"
              element={
                <RequireAuth>
                  <MyRides />
                </RequireAuth>
              }
            />
            <Route
              path="/messages"
              element={
                <RequireAuth>
                  <Messages />
                </RequireAuth>
              }
            />
            <Route
              path="/messages/:rideId"
              element={
                <RequireAuth>
                  <Messages />
                </RequireAuth>
              }
            />
            <Route
              path="/saved"
              element={
                <RequireAuth>
                  <SavedRoutes />
                </RequireAuth>
              }
            />
            <Route
              path="/history"
              element={
                <RequireAuth>
                  <RideHistory />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="foot">RideMate — no drivers, just travelers helping travelers 🤝</footer>
    </>
  )
}
