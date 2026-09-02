import { Link } from 'react-router-dom'
import { Car, Footprints, Handshake, MapPin, MessageCircle, Repeat, Wallet, Star, Navigation } from 'lucide-react'

const steps = [
  {
    icon: <Car size={26} />,
    title: 'Have a vehicle?',
    text: 'Post the trip you are already making — your route, timing, seats and price (or free).',
  },
  {
    icon: <Footprints size={26} />,
    title: 'On foot?',
    text: 'Pin where you are and where you want to go. We match trips starting near you.',
  },
  {
    icon: <Handshake size={26} />,
    title: 'Travel together',
    text: 'Owner accepts the request, contacts are shared, and both reach the same place — splitting costs.',
  },
]

export default function Landing() {
  return (
    <div className="landing">
      <section className="hero card">
        <span className="hero-badge"><Star size={13} fill="currentColor" /> No drivers · No commission · Just co-travelers</span>
        <h1>
          Going somewhere?
          <br />
          <span className="grad-text">Someone already is.</span>
        </h1>
        <p className="hero-sub">
          RideMate connects people <strong>driving</strong> to a place with people who want to go to the{' '}
          <strong>same or nearby place</strong>. Like carpooling with strangers going your way — you choose who joins.
        </p>
        <div className="row center hero-cta">
          <Link to="/auth" className="btn primary lg cta">
            <Navigation size={18} /> Get started — it’s free
          </Link>
        </div>

        {/* ---- product mockup ---- */}
        <div className="hero-mock" aria-hidden="true">
          <div className="mock-browser">
            <div className="mock-bar">
              <span className="mock-dot red" /><span className="mock-dot yel" /><span className="mock-dot grn" />
              <span className="mock-url"><Car size={12} /> ridemate.app / find</span>
            </div>
            <div className="mock-body">
              <div className="mock-side">
                <div className="mock-findcard">
                  <div className="mock-pin from"><b>A</b><span>Koramangala</span></div>
                  <div className="mock-line" />
                  <div className="mock-pin to"><b>B</b><span>HSR Layout</span></div>
                  <div className="mock-search"><span>Search rides</span></div>
                </div>
                <div className="mock-ride">
                  <div className="mock-avatar"><Car size={13} /></div>
                  <div className="mock-rideinfo">
                    <div className="mock-ridetop"><b>Priya</b><span className="mock-rating"><Star size={11} fill="currentColor" />4.9</span></div>
                    <div className="mock-route"><MapPin size={10} /> Koramangala → HSR Layout</div>
                    <div className="mock-meta">· Car · 3 seats · ₹40</div>
                  </div>
                  <span className="mock-ridebtn">Join</span>
                </div>
              </div>
              <div className="mock-map">
                <svg viewBox="0 0 200 190" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%' }}>
                  <rect width="200" height="190" fill="#0e1528" />
                  {[30, 70, 110, 150].map((x) => <rect key={x} x={x} y={0} width={2} height={190} fill="#ffffff0d" />)}
                  {[30, 70, 110, 150].map((y) => <rect key={y} x={0} y={y} width={200} height={2} fill="#ffffff0d" />)}
                  <ellipse cx={160} cy={40} rx={35} ry={26} fill="#0a1f35" opacity={0.9} />
                  <ellipse cx={40} cy={150} rx={30} ry={20} fill="#0a1f35" opacity={0.9} />
                  <circle cx={90} cy={90} r={22} fill="#14231d" opacity={0.8} />
                  <line x1={20} y1={0} x2={20} y2={190} stroke="#263156" strokeWidth={4} />
                  <line x1={140} y1={0} x2={140} y2={190} stroke="#263156" strokeWidth={4} />
                  <line x1={0} y1={120} x2={200} y2={120} stroke="#2b3a6b" strokeWidth={6} />
                  <line x1={0} y1={60} x2={200} y2={60} stroke="#2b3a6b" strokeWidth={6} />
                  {/* route */}
                  <path d="M 40 150 L 120 90" fill="none" stroke="#818cf8" strokeWidth={2.5} strokeDasharray="5 6" />
                  <circle cx={40} cy={150} r={7} fill="#ef4444" stroke="#0e1528" strokeWidth={2} />
                  <circle cx={120} cy={90} r={7} fill="#22c55e" stroke="#0e1528" strokeWidth={2} />
                </svg>
                <div className="mock-map-float">
                  <Car size={13} /> 4 rides found
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-stats">
          <div><Car size={14} /> <b>bike or car</b></div>
          <div><MapPin size={14} /> <b>map-based</b> matching</div>
          <div><MessageCircle size={14} /> <b>in-app chat</b> once accepted</div>
          <div><Repeat size={14} /> <b>recurring</b> commutes</div>
          <div><Wallet size={14} /> <b>split</b> the cost</div>
        </div>
      </section>

      <section className="steps grid-3">
        {steps.map((s, i) => (
          <div key={i} className="card step-card" style={{ animationDelay: `${i * 90}ms` }}>
            <div className="step-icon">{s.icon}</div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </section>

      <section className="card how-card">
        <h3>How is this different from Uber / Rapido?</h3>
        <div className="vs-grid">
          <div className="vs-col">
            <h4><Car size={16} /> Taxi apps</h4>
            <ul>
              <li>Professional drivers</li>
              <li>You pay full fare</li>
              <li>They drive for money</li>
            </ul>
          </div>
          <div className="vs-col highlight">
            <h4><Handshake size={16} /> RideMate</h4>
            <ul>
              <li>Real people already traveling there</li>
              <li>Share only fuel cost — or ride free</li>
              <li>Fellow travelers, same destination</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
