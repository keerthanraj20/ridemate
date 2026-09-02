import { Link } from 'react-router-dom'

const sections = [
  {
    title: '1. What we collect',
    body: 'When you create an account we collect your name, email address, phone number, and a password. When you use the service we collect your location (for matching routes), the trips you post or join, messages you send to co-travelers, and ratings or reviews you leave.',
  },
  {
    title: '2. Why we use it',
    body: 'We use your data to operate the co-travel matching service: to let owners and travelers find and contact each other, to show your trust profile, to send account and verification emails, and to keep the community safe by responding to reports of abuse.',
  },
  {
    title: '3. Geolocation',
    body: 'Your trip locations and, where relevant, your approximate position are used to match you with rides near you. Live location is only used while you interact with the matching features and is not continuously tracked.',
  },
  {
    title: '4. Sharing',
    body: 'We only share the information needed for co-travel: your profile name, bio, rating, verification status, and contact details are visible to the person you ride with once a trip is accepted. We do not sell your personal data.',
  },
  {
    title: '5. Verification',
    body: 'We may send a one-time code to your phone (by email or SMS) to confirm your contact details. Verification codes are stored as and only used to prove you control the contact.', 
  },
  {
    title: '6. Storage & security',
    body: 'Your data is stored with reasonable security measures and protected access. Passwords are stored as hashes and are never visible to us. We retain data only as long as needed to operate the service.',
  },
  {
    title: '7. Your controls',
    body: 'You can edit your profile, delete your account at any time, block other users, and report abuse. Contact us to access, correct, or export a copy of the personal data we hold about you.',
  },
  {
    title: '8. Deletion',
    body: 'When you delete your account we anonymize your personal data (name, email, phone, bio, avatar) so you can no longer be identified, while preserving trip records and ratings that other travelers rely on. You can do this from the Profile page.',
  },
  {
    title: '9. Children',
    body: 'RideMate is not intended for children under 18, and we do not knowingly collect their personal data.',
  },
  {
    title: '10. Contact',
    body: 'For any privacy request or question, contact support through the app. We will respond within a reasonable time.',
  },
]

export default function Privacy() {
  return (
    <div className="page fade-in legal-page">
      <div className="page-head">
        <h2>Privacy Policy</h2>
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
          Also see our <Link to="/terms">Terms of Service</Link>.
        </p>
      </div>
    </div>
  )
}
