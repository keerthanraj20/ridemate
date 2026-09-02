import { Link } from 'react-router-dom'

const sections = [
  {
    title: '1. Our service',
    body: 'RideMate is a peer-to-peer co-travel platform. Owners who are already traveling post their routes and seats; travelers request to join. RideMate does not transport anyone and is not a taxi or transport operator.',
  },
  {
    title: '2. Accounts',
    body: 'You must be at least 18 years old to use RideMate. You are responsible for keeping your login details safe and for everything that happens under your account. Please provide accurate personal details and keep them up to date so that co-travelers can reach you.',
  },
  {
    title: '3. Your responsibilities',
    body: 'By joining a trip you agree to show up at the agreed place and time, to behave respectfully, and to cover any cost you agreed with the owner (or to ride free, if offered). Impersonation, abuse, harassment, and illegal activity are grounds for removal.',
  },
  {
    title: '4. Booking & cancellation',
    body: 'Seats are only confirmed when an owner accepts a request. Either side may cancel before departure. Repeatedly failing to show up without notice lowers your trust level and may lead to account restriction.',
  },
  {
    title: '5. Costs',
    body: 'Owners may ask riders to share the fuel/expense for the trip. Prices are set by the owner and agreed before booking. RideMate does not handle or guarantee any payments between users.',
  },
  {
    title: '6. Acceptable use',
    body: 'Do not use RideMate to harass, threaten, or spam other users. We provide reporting and blocking tools and may suspend accounts that violate these terms. You may not buy or sell RideMate accounts.',
  },
  {
    title: '7. Content',
    body: 'You retain the rights to content you submit (messages, reviews, profile info) but grant RideMate a license to display it within the service so we can operate. We may remove content that violates these terms.',
  },
  {
    title: '8. Liability',
    body: 'RideMate connects independent travelers. We are not responsible for the actions of other users, for trip cancellations, or for loss, injury, or damage that occurs between co-travelers. Travel at your own risk and use good judgment when riding with others.',
  },
  {
    title: '9. Termination',
    body: 'You can delete your account at any time from the Profile page. We may suspend or close accounts that breach these terms. Deleting your account anonymizes your personal data while preserving ride history for other travelers.',
  },
  {
    title: '10. Changes',
    body: 'We may update these terms as the service evolves. Significant changes will be announced through the app. Continued use after changes means you accept the updated terms.',
  },
]

export default function Terms() {
  return (
    <div className="page fade-in legal-page">
      <div className="page-head">
        <h2>Terms of Service</h2>
      </div>
      <div className="card stack-lg">
        <p className="hint">Last updated: September 2026</p>
        {sections.map((s) => (
          <section key={s.title}>
            <h4 style={{ marginBottom: 4 }}>{s.title}</h4>
            <p style={{ marginTop: 0 }}>{s.body}</p>
          </section>
        ))}
        <p className="hint">
          Questions? Read our <Link to="/privacy">Privacy Policy</Link> or contact support.
        </p>
      </div>
    </div>
  )
}
