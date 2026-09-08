import { Router } from 'express'
import { db } from '../db.js'
import { auth } from './auth.js'
import { notify } from '../notify.js'
import { addCredit } from '../util.js'
import {
  buildGateway, PROVIDER, listEscrowsForUser, createEscrow, captureEscrowByOrderId,
  releaseEscrow, refundEscrow, autoReleaseForRide, verifyGatewayPayment,
} from '../payments.js'

const router = Router()

// ---------- my escrow holds ----------
router.get('/payments', auth, (req, res) => {
  // lazy housekeeping: complete rides auto-release old holds
  const completed = db
    .prepare("SELECT DISTINCT ride_id FROM escrow_payments WHERE ride_id IN (SELECT id FROM rides WHERE status='completed')")
    .all()
  for (const row of completed) autoReleaseForRide(row.ride_id)

  const rows = listEscrowsForUser(req.user.id)
  const payments = rows.map((e) => {
    const isPayer = e.payer_id === req.user.id
    const isPayee = e.payee_id === req.user.id
    const counterpart = isPayer ? e.payee_name : isPayee ? e.payer_name : null
    return {
      id: e.id,
      ride_id: e.ride_id,
      request_id: e.request_id,
      role: isPayer ? 'payer' : isPayee ? 'payee' : 'other',
      status: e.status,
      amount: e.amount_paise / 100,
      currency: e.currency,
      provider: e.provider,
      created_at: e.created_at,
      captured_at: e.captured_at,
      released_at: e.released_at,
      refunded_at: e.refunded_at,
      counterpart: { name: counterpart || '—' },
      ride: { from_name: e.from_name, to_name: e.to_name, depart_at: e.depart_at, status: e.ride_status },
    }
  })
  res.json({ payments })
})

function escrowPublic(e, userId) {
  const counterpart = e.payer_id === userId ? e.payee_name : e.payer_name
  return {
    id: e.id,
    ride_id: e.ride_id,
    request_id: e.request_id,
    role: e.payer_id === userId ? 'payer' : 'payee',
    status: e.status,
    amount: e.amount_paise / 100,
    currency: e.currency,
    provider: e.provider,
    order_id: e.provider_order_id,
    payment_id: e.provider_payment_id,
    created_at: e.created_at,
    captured_at: e.captured_at,
    released_at: e.released_at,
    refunded_at: e.refunded_at,
    counterpart: { name: counterpart || '—' },
    ride: { from_name: e.from_name, to_name: e.to_name, depart_at: e.depart_at, status: e.ride_status },
  }
}

// ---------- pay for an accepted booking (rider holds the fare in escrow) ----------
router.post('/payments/order', auth, async (req, res) => {
  const requestId = Number(req.body?.request_id)
  if (!Number.isInteger(requestId)) return res.status(400).json({ error: 'Select a booking to pay for' })

  const request = db.prepare('SELECT * FROM requests WHERE id=?').get(requestId)
  if (!request) return res.status(404).json({ error: 'Booking not found' })
  if (request.rider_id !== req.user.id) return res.status(403).json({ error: 'Not your booking' })
  if (request.status !== 'accepted') return res.status(400).json({ error: 'Only accepted bookings can be paid' })

  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(request.ride_id)
  if (!ride) return res.status(404).json({ error: 'Ride not found' })
  if (ride.status === 'cancelled' || ride.status === 'completed')
    return res.status(400).json({ error: 'This ride is no longer active' })
  if (new Date(ride.depart_at).getTime() < Date.now())
    return res.status(400).json({ error: 'This ride has already departed' })

  const amountPaise = Math.round(request.seats * ride.price * 100)
  if (amountPaise <= 0) return res.status(400).json({ error: 'This is a free ride — no payment needed' })

  try {
    const { existing, escrow } = await createEscrow({
      requestId: request.id,
      rideId: ride.id,
      payerId: req.user.id,
      payeeId: ride.user_id,
      amountPaise,
    })

    if (!existing) {
      notify(ride.user_id, {
        type: 'payment',
        title: 'Fare held in escrow 🛡️',
        body: `${req.user.name} paid ₹${(amountPaise / 100).toFixed(2)} for the ${ride.from_name} → ${ride.to_name} trip. Funds reach you after the trip.`,
        link: '/payments',
      })
    }

    res.status(existing ? 200 : 201).json({
      message: existing ? 'Booking already paid' : 'Fare held in escrow until the trip is completed',
      payment: escrowPublic(
        db.prepare(
          `SELECT e.*, uf.name AS payer_name, uo.name AS payee_name
           FROM escrow_payments e
           JOIN users uf ON uf.id=e.payer_id
           JOIN users uo ON uo.id=e.payee_id
           WHERE e.id=?`
        ).get(escrow.id),
        req.user.id
      ),
      // When using Razorpay, give the client what it needs to open the
      // Checkout modal for this order.
      razorpay: PROVIDER === 'razorpay'
        ? { keyId: process.env.PAY_RAZORPAY_KEY_ID, orderId: escrow.provider_order_id }
        : null,
    })
  } catch (err) {
    res.status(502).json({ error: err.message || 'Payment provider unavailable' })
  }
})

// ---------- rider refund (before capture / after cancel) ----------
router.post('/payments/:id/refund', auth, async (req, res) => {
  const escrow = db.prepare('SELECT * FROM escrow_payments WHERE id=?').get(Number(req.params.id))
  if (!escrow) return res.status(404).json({ error: 'Payment not found' })
  if (escrow.payer_id !== req.user.id) return res.status(403).json({ error: 'Only the payer can refund' })

  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(escrow.ride_id)
  if (ride?.status === 'completed') return res.status(400).json({ error: 'Ride completed — funds are being released' })
  if (escrow.status === 'created') {
    // never captured: cancel the order outright
    db.prepare("UPDATE escrow_payments SET status='cancelled' WHERE id=?").run(escrow.id)
    return res.json({ ok: true, message: 'Payment order cancelled' })
  }

  let updated
  try {
    updated = await refundEscrow(escrow.id)
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Refund failed at the payment gateway' })
  }
  if (updated.status !== 'refunded') return res.status(400).json({ error: 'Payment is not refundable' })

  notify(escrow.payee_id, {
    type: 'payment',
    title: 'Escrow refunded',
    body: `${req.user.name} got their ₹${(updated.amount_paise / 100).toFixed(2)} refunded.`,
    link: '/payments',
  })

  res.json({ ok: true, message: 'Fare refunded to your payment method' })
})

// ---------- owner release (payday after the trip) ----------
router.post('/payments/:id/release', auth, (req, res) => {
  const escrow = db.prepare('SELECT * FROM escrow_payments WHERE id=?').get(Number(req.params.id))
  if (!escrow) return res.status(404).json({ error: 'Payment not found' })
  if (escrow.payee_id !== req.user.id) return res.status(403).json({ error: 'Only the ride owner can release' })

  const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(escrow.ride_id)
  if (ride?.status !== 'completed') return res.status(400).json({ error: 'Funds release once the ride is marked completed' })

  const updated = releaseEscrow(escrow.id)
  if (updated.status !== 'released') return res.status(400).json({ error: 'Payment is not releasable' })

  // Credit the owner's platform wallet so they can withdraw. For the mock
  // provider the amount was never really moved; for Razorpay the platform
  // account holds the captured funds and this credit is what the owner
  // can settle. (Actual bank/UPI payout is a separate Razorpay Payout.)
  const amount = updated.amount_paise / 100
  addCredit(req.user.id, amount, `Ride payout #${escrow.id} (${ride.from_name} → ${ride.to_name})`)

  res.json({ ok: true, message: `₹${amount.toFixed(2)} credited to your wallet balance` })
})

// ---------- confirm payment after client checkout (razorpay) ----------
// The client opens Razorpay's modal with the order created above, then on
// success calls this endpoint with the returned payment id so we mark the
// hold captured without waiting for the webhook.
router.post('/payments/order/verify', auth, async (req, res) => {
  const orderId = String(req.body?.order_id || '')
  const paymentId = String(req.body?.payment_id || '')
  if (!orderId || !paymentId) return res.status(400).json({ error: 'order_id and payment_id required' })

  // Verify the caller owns this order (they created it as the payer)
  const escrow = db.prepare('SELECT * FROM escrow_payments WHERE provider_order_id=?').get(orderId)
  if (!escrow) return res.status(404).json({ error: 'Order not found' })
  if (escrow.payer_id !== req.user.id) return res.status(403).json({ error: 'Not your payment order' })

  const ok = await verifyGatewayPayment(orderId, paymentId)
  if (!ok) return res.status(400).json({ error: 'Payment could not be confirmed' })

  notify(escrow.payee_id, {
    type: 'payment',
    title: 'Fare held in escrow 🛡️',
    body: `A rider paid ₹${(escrow.amount_paise / 100).toFixed(2)} — funds reach you after the trip.`,
    link: '/payments',
  })

  res.json({ ok: true, message: 'Payment confirmed and held in escrow' })
})

export default router

// ---------- Razorpay webhook (mounted separately with raw body parsing) ----------
// Verifies the HMAC signature, then captures the hold for a matched order.
export async function paymentWebhook(req, res) {
  const gateway = buildGateway()
  const signature = req.headers['x-razorpay-signature']

  let json
  try {
    json = JSON.parse(req.body.toString('utf8'))
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid payload' })
  }

  let result = null
  if (gateway.provider === 'razorpay') {
    result = gateway.validateWebhook(json, signature, req.body.toString('utf8'))
    if (!result) return res.status(401).json({ ok: false, error: 'Invalid signature' })
  } else {
    result = gateway.validateWebhook(json)
  }

  if (json.event === 'payment.captured' && result) {
    const escrow = captureEscrowByOrderId(result.orderId, result.paymentId)
    if (escrow && escrow.status === 'captured') {
      notify(escrow.payee_id, {
        type: 'payment',
        title: 'Fare held in escrow 🛡️',
        body: `A rider paid ₹${(escrow.amount_paise / 100).toFixed(2)} — funds reach you after the trip.`,
        link: '/payments',
      })
    }
  }

  res.json({ ok: true })
}