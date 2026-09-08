// ─── SMS sender (provider-agnostic, env-configurable) ────────────────────────
//
// SMS_PROVIDER  — "twilio" | "textlocal" | "console"  (default: "console")
// Twilio:
//   SMS_TWILIO_ACCOUNT_SID, SMS_TWILIO_AUTH_TOKEN, SMS_TWILIO_FROM
// Textlocal.in (Indian provider):
//   SMS_TEXTLOCAL_API_KEY, SMS_TEXTLOCAL_SENDER
//
// In "console" mode (and whenever SMS_LOG=1), the message is always printed
// so the flow remains testable in dev without real credentials.

const PROVIDER = process.env.SMS_PROVIDER || 'console'

export async function sendSms(phone, message) {
  // Always log in dev or when explicitly asked
  if (PROVIDER === 'console' || process.env.SMS_LOG === '1') {
    console.log(`\n📱 [DEV SMS] To: ${phone}\n${message}\n`)
  }

  if (PROVIDER === 'twilio') {
    return sendViaTwilio(phone, message)
  }

  if (PROVIDER === 'textlocal') {
    return sendViaTextlocal(phone, message)
  }

  // "console" mode — no actual network call, just the log above
  return { ok: true, provider: 'console' }
}

// ─── Twilio ──────────────────────────────────────────────────────────────────

async function sendViaTwilio(phone, message) {
  const sid  = process.env.SMS_TWILIO_ACCOUNT_SID
  const token = process.env.SMS_TWILIO_AUTH_TOKEN
  const from = process.env.SMS_TWILIO_FROM

  if (!sid || !token || !from) {
    console.error('⚠️  Twilio SMS failed: SMS_TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM not set')
    return { ok: false, error: 'SMS provider not configured' }
  }

  try {
    const params = new URLSearchParams({
      To: phone,
      From: from,
      Body: message,
    })

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('⚠️  Twilio SMS failed:', err.message || res.status)
      return { ok: false, error: err.message || 'Twilio request failed' }
    }

    return { ok: true, provider: 'twilio' }
  } catch (e) {
    console.error('⚠️  Twilio SMS exception:', e.message)
    return { ok: false, error: e.message }
  }
}

// ─── Textlocal.in (Indian bulk-SMS / OTP provider) ───────────────────────────

async function sendViaTextlocal(phone, message) {
  const apiKey = process.env.SMS_TEXTLOCAL_API_KEY
  const sender = process.env.SMS_TEXTLOCAL_SENDER || 'RDMATE'

  if (!apiKey) {
    console.error('⚠️  Textlocal SMS failed: SMS_TEXTLOCAL_API_KEY not set')
    return { ok: false, error: 'SMS provider not configured' }
  }

  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      numbers: phone,
      message,
      sender,
    })

    const res = await fetch('https://api.textlocal.in/send/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('⚠️  Textlocal SMS failed:', err.errors || res.status)
      return { ok: false, error: err.errors?.[0]?.message || 'Textlocal request failed' }
    }

    const data = await res.json()
    if (data.status === 'success') {
      return { ok: true, provider: 'textlocal' }
    }

    console.error('⚠️  Textlocal SMS rejected:', data)
    return { ok: false, error: data.message || 'Textlocal send failed' }
  } catch (e) {
    console.error('⚠️  Textlocal SMS exception:', e.message)
    return { ok: false, error: e.message }
  }
}