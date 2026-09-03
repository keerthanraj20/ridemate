import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import Header from './components/Header.jsx'

const Landing = lazy(() => import('./pages/Landing.jsx'))
const Auth = lazy(() => import('./pages/Auth.jsx'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail.jsx'))
const FindRide = lazy(() => import('./pages/FindRide.jsx'))
const OfferRide = lazy(() => import('./pages/OfferRide.jsx'))
const MyRides = lazy(() => import('./pages/MyRides.jsx'))
const Messages = lazy(() => import('./pages/Messages.jsx'))
const SavedRoutes = lazy(() => import('./pages/SavedRoutes.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const RideHistory = lazy(() => import('./pages/RideHistory.jsx'))
const Terms = lazy(() => import('./pages/Terms.jsx'))
const Privacy = lazy(() => import('./pages/Privacy.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))

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

function RequireAdmin({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/auth" replace />
  return user.is_admin ? children : <Navigate to="/find" replace />
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
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ForgotPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
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
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="foot">
        RideMate — no drivers, just travelers helping travelers 🤝
        <span className="foot-links">
          <Link className="foot-link" to="/terms">Terms</Link>
          <Link className="foot-link" to="/privacy">Privacy</Link>
        </span>
      </footer>
    </>
  )
}
