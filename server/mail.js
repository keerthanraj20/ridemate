import nodemailer from 'nodemailer'

const FROM = process.env.MAIL_FROM || 'RideMate <ridemate@example.com>'

// Production: nodemailer transport (Gmail app password recommended).
// Dev: log every email to console instead of really sending.
export const MAIL_ENABLED =
  Boolean(process.env.MAIL_HOST) && Boolean(process.env.MAIL_USER) && Boolean(process.env.MAIL_PASS)

const transporter = MAIL_ENABLED
  ? nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT) || 587,
      secure: (Number(process.env.MAIL_PORT) || 587) === 465,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    })
  : null

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    // Dev mode — print so you can still use the flow
    console.log(`\n📧 [DEV MAIL] To: ${to} | Subject: ${subject}`)
    console.log(`${text}\n`)
    return { ok: true, dev: true }
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, text, html })
    return { ok: true }
  } catch (e) {
    console.error('Mail send failed:', e)
    return { ok: false, error: e.message }
  }
}