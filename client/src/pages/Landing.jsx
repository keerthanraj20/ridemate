import { Link } from 'react-router-dom'

const steps = [
  {
    icon: '🚗',
    title: 'Have a vehicle?',
    text: 'Post the trip you are already making — your route, timing, seats and price (or free).',
  },
  {
    icon: '🚶',
    title: 'On foot?',
    text: 'Pin where you are and where you want to go. We match trips starting near you.',
  },
  {
    icon: '🤝',
    title: 'Travel together',
    text: 'Owner accepts the request, contacts are shared, and both reach the same place — splitting costs.',
  },
]

export default function Landing() {
  return (
    <div className="landing">
      <section className="hero card">
        <span className="hero-badge">✨ No drivers · No commission · Just co-travelers</span>
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
            Get started — it’s free
          </Link>
        </div>
        <div className="hero-stats">
          <div>🏍️🚗 <b>bike or car</b></div>
          <div>📍 <b>map-based</b> matching</div>
          <div>💬 <b>in-app chat</b> once accepted</div>
          <div>🔁 <b>recurring</b> commutes</div>
          <div>💸 <b>split</b> the cost</div>
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
            <h4>🚕 Taxi apps</h4>
            <ul>
              <li>Professional drivers</li>
              <li>You pay full fare</li>
              <li>They drive for money</li>
            </ul>
          </div>
          <div className="vs-col highlight">
            <h4>🤝 RideMate</h4>
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
