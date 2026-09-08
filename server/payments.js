// ─── Payments / fare escrow service ───────────────────────────────────────────
//
// PAY_PROVIDER = "mock" (default) | "razorpay"
//
// Mock provider: money isn't moved anywhere; every order is "captured" as soon
// as it's created so the whole workflow (hold → release / refund) is testable
// and demoable without any credentials.
//
// Razorpay provider: creates a real Order via the Razorpay API and waits for
// a verified payment.captured webhook before marking the hold captured.
//
// Env (Razorpay):
//   PAY_RAZORPAY_KEY_ID, PAY_RAZORPAY_KEY_SECRET, PAY_RAZORPAY_WEBHOOK_SECRET

import crypto from 'node:crypto'
import { all, get, run } from './db.js'

export const PROVIDER = process.env.PAY_PROVIDER || 'mock'

export const RELEASE_GRACE =
  Number(process.env.PAY_RELEASE_GRACE_DAYS) || 3 // days after capture

// Whether the platform is running a live payment provider.
export const isLivePayments = () => PROVIDER === 'razorpay'

// ---------- gateway selection ----------

export function buildGateway() {
  if (PROVIDER === 'razorpay') return razorpayGateway()
  return mockGateway()
}

function mockGateway() {
  return {
    provider: 'mock',
    async createOrder({ amountPaise, receipt }) {
      // no real money — the hold appears captured immediately
      const orderId = 'mockord_' + crypto.randomBytes(8).toString('hex')
      const paymentId = 'mockpay_' + crypto.randomBytes(8).toString('hex')
      return { orderId, paymentId }
    },
    async validateWebhook(json) {
      const entity = json?.payload?.payment?.entity
      return entity?.order_id ? { orderId: entity.order_id, paymentId: entity.id } : null
    },
  }
}

function razorpayGateway() {
  const keyId = process.env.PAY_RAZORPAY_KEY_ID
  const keySecret = process.env.PAY_RAZORPAY_KEY_SECRET
  const webhookSecret = process.env.PAY_RAZORPAY_WEBHOOK_SECRET

  if (!keyId || !keySecret || !webhookSecret) {
    throw new Error('Razorpay selected but PAY_RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET missing')
  }

  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')

  return {
    provider: 'razorpay',
    async createOrder({ amountPaise, receipt }) {
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, payment_capture: 1 }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.description || 'Razorpay order creation failed')
      }
      const order = await res.json()
      return { orderId: order.id, paymentId: null }
    },
    validateWebhook(json, signature, rawBody) {
      // HMAC-SHA256 of the raw body signed with the webhook secret
      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(json))
        .digest()
      const supplied = Buffer.from(String(signature || ''), 'hex')
      if (expected.length !== supplied.length ||
          !crypto.timingSafeEqual(expected, supplied)) {
        return null
      }
      const entity = json?.payload?.payment?.entity
      return entity?.order_id ? { orderId: entity.order_id, paymentId: entity.id } : null
    },
  }
}

// ---------- escrow lifecycle ----------

export async function getEscrowByRequest(requestId) {
  return get('SELECT * FROM escrow_payments WHERE request_id=?', [requestId])
}

export async function listEscrowsForUser(userId) {
  return all(
    `SELECT e.*,
            r.from_name, r.to_name, r.depart_at, r.price, r.status AS ride_status,
            uf.name AS payer_name, uo.name AS payee_name
     FROM escrow_payments e
     JOIN rides r ON r.id = e.ride_id
     JOIN users uf ON uf.id = e.payer_id
     JOIN users uo ON uo.id = e.payee_id
     WHERE e.payer_id=? OR e.payee_id=?
     ORDER BY e.id DESC`,
    [userId, userId]
  )
}

// Create the escrow hold for an ACCEPTED booking. Idempotent per request.
export async function createEscrow({ requestId, rideId, payerId, payeeId, amountPaise }) {
  const existing = await getEscrowByRequest(requestId)
  if (existing) return { existing: true, escrow: existing }

  const receipt = `rm_${crypto.randomBytes(6).toString('hex')}`
  const gateway = buildGateway()

  const { orderId, paymentId } = await gateway.createOrder({ amountPaise, receipt })

  // Mock gateway "pays" immediately; Razorpay waits for the webhook.
  const status = paymentId ? 'captured' : 'created'

  const info = await run(
    `INSERT INTO escrow_payments
       (ride_id, request_id, payer_id, payee_id, amount_paise, currency, status,
        provider, provider_order_id, provider_payment_id, receipt,
        captured_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, ?)`,
    [
      rideId, requestId, payerId, payeeId,
      Math.round(amountPaise), 'INR', status,
      gateway.provider, orderId, paymentId || null, receipt,
      status === 'captured' ? new Date().toISOString() : null,
    ]
  )

  return { existing: false, escrow: await get('SELECT * FROM escrow_payments WHERE id=?', [Number(info.lastInsertRowid)]) }
}

// Mark a razorpay order as captured (called from the webhook handler).
export async function captureEscrowByOrderId(orderId, paymentId) {
  const escrow = await get('SELECT * FROM escrow_payments WHERE provider_order_id=?', [orderId])
  if (!escrow) return null
  if (escrow.status !== 'created') return escrow

  await run(
    "UPDATE escrow_payments SET status='captured', provider_payment_id=?, captured_at=? WHERE id=?",
    [paymentId || escrow.provider_payment_id, new Date().toISOString(), escrow.id]
  )

  return get('SELECT * FROM escrow_payments WHERE id=?', [escrow.id])
}

// Refund a captured hold back to the rider (booking/ride cancellation).
export async function refundEscrow(escrowId) {
  const escrow = await get('SELECT * FROM escrow_payments WHERE id=?', [escrowId])
  if (!escrow) return null
  if (escrow.status !== 'captured') return escrow

  // Live provider: actually move the money back via the gateway API first.
  if (escrow.provider === 'razorpay' && escrow.provider_payment_id) {
    const ok = await refundGatewayPayment(escrow.provider_payment_id, escrow.amount_paise)
    if (!ok) throw new Error('Refund at gateway failed — check payment details')
  }

  await run("UPDATE escrow_payments SET status='refunded', refunded_at=? WHERE id=?", [
    new Date().toISOString(), escrow.id,
  ])
  return get('SELECT * FROM escrow_payments WHERE id=?', [escrow.id])
}

// Issue a refund against a captured Razorpay payment.
export async function refundGatewayPayment(paymentId, amountPaise) {
  const keyId = process.env.PAY_RAZORPAY_KEY_ID
  const keySecret = process.env.PAY_RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return false

  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ amount: amountPaise }),
    })
    if (!res.ok) return false
    const data = await res.json()
    // A refund in 'processed'/'pending' status is accepted
    return ['processed', 'pending', 'created'].includes(data?.status)
  } catch {
    return false
  }
}

// Release a captured hold to the owner after the ride completes.
export async function releaseEscrow(escrowId) {
  const escrow = await get('SELECT * FROM escrow_payments WHERE id=?', [escrowId])
  if (!escrow) return null
  if (escrow.status !== 'captured') return escrow

  await run("UPDATE escrow_payments SET status='released', released_at=? WHERE id=?", [
    new Date().toISOString(), escrow.id,
  ])
  return get('SELECT * FROM escrow_payments WHERE id=?', [escrow.id])
}

// Auto-release: once a ride is completed, any hold captured more than
// RELEASE_GRACE days ago moves to the owner without manual action.
export async function autoReleaseForRide(rideId) {
  const graceMs = RELEASE_GRACE * 24 * 60 * 60 * 1000
  const now = Date.now()
  const rows = await all(
    `SELECT * FROM escrow_payments
     WHERE ride_id=? AND status='captured' AND released_at IS NULL`,
    [rideId]
  )

  for (const escrow of rows) {
    const captured = new Date(escrow.captured_at || escrow.created_at).getTime()
    if (now - captured >= graceMs) {
      await run("UPDATE escrow_payments SET status='released', released_at=? WHERE id=?", [
        new Date().toISOString(), escrow.id,
      ])
    }
  }
}

// On ride cancellation, refund every captured hold on that ride automatically.
export async function refundEscrowForRide(rideId) {
  const rows = await all("SELECT * FROM escrow_payments WHERE ride_id=? AND status='captured'", [rideId])
  for (const escrow of rows) await refundEscrow(escrow.id)
  return rows.map((r) => r.id)
}

// On an individual booking cancellation, refund that rider's hold.
export async function refundEscrowForRequest(requestId) {
  const escrow = await getEscrowByRequest(requestId)
  if (!escrow) return null
  return refundEscrow(escrow.id)
}

// Ask the gateway whether a specific payment id is captured, used to confirm a
// checkout immediately (webhooks can lag). Returns true once authorised.
export async function verifyGatewayPayment(orderId, paymentId) {
  const gateway = buildGateway()
  if (gateway.provider === 'mock') {
    // mock always "captures" immediately — escrow should already be captured
    const escrow = await get("SELECT * FROM escrow_payments WHERE provider_order_id=?", [orderId])
    return escrow?.status === 'captured'
  }

  const keyId = process.env.PAY_RAZORPAY_KEY_ID
  const keySecret = process.env.PAY_RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return false

  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: auth },
    })
    if (!res.ok) return false
    const pay = await res.json()
    // Authorised/captured payment → confirm the hold
    if (pay.captured === true || pay.status === 'captured') {
      const escrow = await captureEscrowByOrderId(orderId, paymentId)
      return Boolean(escrow && escrow.status === 'captured')
    }
    return false
  } catch {
    return false
  }
}