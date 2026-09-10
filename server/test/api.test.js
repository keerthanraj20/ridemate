import { before, after, describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { freshDbPath, truncateAll } from './helpers.js'

// Set up an isolated DB before any module that uses ../db.js is imported.
process.env.JWT_SECRET = 'test-secret-not-for-production'
process.env.RM_DB_PATH = freshDbPath()
process.env.RM_DISABLE_RATE_LIMIT = '1'
process.env.RM_ALLOW_WIPEDB = '1'
process.env.MAIL_HOST = ''
process.env.MAIL_USER = ''
process.env.MAIL_PASS = ''

const { app } = await import('../index.js')
const { db, get, run, exec, close, USE_POSTGRES } = await import('../db.js')

async function wipe() {
  await truncateAll(db, USE_POSTGRES, exec)
}

let owner
let rider

async function register(over = {}) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: over.name || 'Test User',
      email: over.email || `user-${Math.random().toString(36).slice(2)}@test.com`,
      phone: over.phone || '9876543210',
      password: over.password || 'secret123',
    })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return res.body
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` }
}

async function offerRide(token, over = {}) {
  const res = await request(app)
    .post('/api/rides')
    .set(authHeaders(token))
    .send({
      vehicle_type: 'car',
      from_name: 'Chennai',
      from_lat: 13.0827,
      from_lng: 80.2707,
      to_name: 'Pondicherry',
      to_lat: 11.9416,
      to_lng: 79.8083,
      depart_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      seats_total: 3,
      price: 200,
      repeat_every: 'none',
      ...over,
    })
  return res
}

describe('SaathYaan API', () => {
  before(async () => {
    await wipe()
  })

  after(async () => {
    await close()
  })

  describe('auth', () => {
    it('registers a new user and returns a token + user', async () => {
      const { token, user } = await register({ name: 'Alice', email: 'alice@test.com', phone: '9876500001' })
      assert.ok(token)
      assert.equal(user.name, 'Alice')
      assert.equal(user.email, 'alice@test.com')
    })

    it('rejects duplicate email', async () => {
      await register({ email: 'dupe@test.com' })
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Dup', email: 'DUPE@test.com', phone: '9876500002', password: 'secret123' })
      assert.equal(res.status, 409)
    })

    it('requires a password of at least 8 chars with mixed letters & numbers', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'No', email: 'no@test.com', phone: '9876500003', password: '123' })
      assert.equal(res.status, 400)

      const lettersOnly = await request(app)
        .post('/api/auth/register')
        .send({ name: 'No', email: 'nodig@test.com', phone: '9876500004', password: 'abcdefgh' })
      assert.equal(lettersOnly.status, 400)
    })

    it('logs in with correct credentials', async () => {
      await register({ email: 'login@test.com', password: 'rightpass1' })
      const ok = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'rightpass1' })
      assert.equal(ok.status, 200)
      assert.ok(ok.body.token)

      const bad = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'wrongpass' })
      assert.equal(bad.status, 401)
    })

    it('rejects requests without a valid token on /me', async () => {
      const res = await request(app).get('/api/auth/me')
      assert.equal(res.status, 401)
    })

    it('does not let a verify token be used as a password reset token', async () => {
      const { token } = await register({ email: 'purposes@test.com' })
      // issue an email-verify token for this user
      const verifyRes = await request(app)
        .post('/api/auth/verify-email')
        .set(authHeaders(token))
      assert.equal(verifyRes.status, 200)

      const row = await get("SELECT token FROM reset_tokens WHERE type='verify' ORDER BY id DESC LIMIT 1")
      assert.ok(row, 'a verify token should exist')

      // redeeming the verify token at /reset-password must fail
      const reset = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: row.token, password: 'newpassword1' })
      assert.equal(reset.status, 400)

      // redeeming it at /verify-email/confirm must succeed
      const confirm = await request(app)
        .post('/api/auth/verify-email/confirm')
        .send({ token: row.token })
      assert.equal(confirm.status, 200)
    })

    it('does not let a password reset token verify an email', async () => {
      const { token } = await register({ email: 'purposes2@test.com' })
      const forgot = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'purposes2@test.com' })
      assert.equal(forgot.status, 200)

      const row = await get("SELECT token FROM reset_tokens WHERE type='reset' ORDER BY id DESC LIMIT 1")
      assert.ok(row, 'a reset token should exist')

      // redeeming the reset token at /verify-email/confirm must fail
      const confirm = await request(app)
        .post('/api/auth/verify-email/confirm')
        .send({ token: row.token })
      assert.equal(confirm.status, 400)

      // redeeming it at /reset-password must succeed
      const reset = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: row.token, password: 'newpassword2' })
      assert.equal(reset.status, 200)
    })
  })

  describe('rides', () => {
    beforeEach(async () => {
      await wipe()
    })

    it('owner can create a ride', async () => {
      owner = (await register({ email: 'owner@test.com' })).token
      const res = await offerRide(owner)
      assert.equal(res.status, 200)
      assert.equal(res.body.ride.vehicle_type, 'car')
      assert.equal(res.body.ride.status, 'open')
      assert.equal(res.body.ride.seats_total, 3)
    })

    it('rejects a ride in the past', async () => {
      owner = (await register({ email: 'owner2@test.com' })).token
      const res = await offerRide(owner, { depart_at: new Date(Date.now() - 3600 * 1000).toISOString() })
      assert.equal(res.status, 400)
    })

    it('rejects invalid seat count', async () => {
      owner = (await register({ email: 'owner3@test.com' })).token
      const res = await offerRide(owner, { seats_total: 0 })
      assert.equal(res.status, 400)
    })
  })

  describe('booking (seat atomicity)', () => {
    beforeEach(async () => {
      await wipe()
    })

    async function makeRide({ seats = 2 } = {}) {
      owner = (await register({ email: 'owner-b@test.com' })).token
      const res = await offerRide(owner, { seats_total: seats })
      return res.body.ride
    }

    it('rider can book seats on an open ride', async () => {
      const ride = await makeRide({ seats: 2 })
      rider = (await register({ email: 'rider1@test.com' })).token
      const res = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(rider))
        .send({ seats: 1, message: 'Happy to join' })
      assert.equal(res.status, 200)
    })

    it('rejects a duplicate active request for the same ride', async () => {
      const ride = await makeRide({ seats: 2 })
      rider = (await register({ email: 'rider2@test.com' })).token
      const first = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(rider))
        .send({ seats: 1 })
      assert.equal(first.status, 200)

      const second = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(rider))
        .send({ seats: 1 })
      assert.equal(second.status, 409)
    })

    it('allows multiple pending requests but enforces capacity on accept', async () => {
      const ride = await makeRide({ seats: 1 })
      const r1 = (await register({ email: 'r-a@test.com' })).token
      const r2 = (await register({ email: 'r-b@test.com' })).token

      const a = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(r1))
        .send({ seats: 1 })
      assert.equal(a.status, 200)

      // Pending requests don't consume capacity, so a second request is allowed.
      // Capacity is enforced at ACCEPT time (covered by a separate test).
      const b = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(r2))
        .send({ seats: 1 })
      assert.equal(b.status, 200)
    })

    it('rejects booking seats directly on your own ride', async () => {
      const ride = await makeRide({ seats: 3 })
      const res = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(owner))
        .send({ seats: 1 })
      assert.equal(res.status, 400)
    })

    it('owner can accept a pending request and seat is marked taken', async () => {
      const ride = await makeRide({ seats: 2 })
      rider = (await register({ email: 'r-accept@test.com' })).token
      await request(app).post(`/api/rides/${ride.id}/request`).set(authHeaders(rider)).send({ seats: 1 })

      const mine = await request(app).get('/api/rides/mine').set(authHeaders(owner))
      const req = mine.body.rides[0].requests[0]
      assert.equal(req.status, 'pending')

      const accept = await request(app).post(`/api/requests/${req.id}/accept`).set(authHeaders(owner))
      assert.equal(accept.status, 200)

      const after = await request(app).get('/api/rides/mine').set(authHeaders(owner))
      assert.equal(after.body.rides[0].requests[0].status, 'accepted')
    })

    it('only the owner can accept a request', async () => {
      const ride = await makeRide({ seats: 2 })
      rider = (await register({ email: 'x1@test.com' })).token
      await request(app).post(`/api/rides/${ride.id}/request`).set(authHeaders(rider)).send({ seats: 1 })
      const intruder = (await register({ email: 'intruder@test.com' })).token

      const mine = await request(app).get('/api/rides/mine').set(authHeaders(owner))
      const req = mine.body.rides[0].requests[0]
      const res = await request(app)
        .post(`/api/requests/${req.id}/accept`)
        .set(authHeaders(intruder))
      assert.equal(res.status, 403)
    })

    it('does not allow overbooking with concurrent-style single accepts', async () => {
      const ride = await makeRide({ seats: 1 })
      const r1 = (await register({ email: 'c1@test.com' })).token
      const r2 = (await register({ email: 'c2@test.com' })).token

      await request(app).post(`/api/rides/${ride.id}/request`).set(authHeaders(r1)).send({ seats: 1 })
      await request(app).post(`/api/rides/${ride.id}/request`).set(authHeaders(r2)).send({ seats: 1 })

      const mine = await request(app).get('/api/rides/mine').set(authHeaders(owner))
      const [req1, req2] = mine.body.rides[0].requests

      const accept1 = await request(app).post(`/api/requests/${req1.id}/accept`).set(authHeaders(owner))
      assert.equal(accept1.status, 200)

      const accept2 = await request(app).post(`/api/requests/${req2.id}/accept`).set(authHeaders(owner))
      // only 1 seat, so the second accept must fail
      assert.equal(accept2.status, 400)
    })
  })

  describe('ratings auth', () => {
    it('rejects unauthenticated access to a user ratings endpoint', async () => {
      await wipe()
      owner = (await register({ email: 'rate-owner@test.com' })).token
      const me = await request(app).get('/api/auth/me').set(authHeaders(owner))
      const res = await request(app).get(`/api/users/${me.body.user.id}/ratings`)
      assert.equal(res.status, 401)
    })

    it('allows authenticated access', async () => {
      owner = (await register({ email: 'rate-owner2@test.com' })).token
      const me = await request(app).get('/api/auth/me').set(authHeaders(owner))
      const res = await request(app).get(`/api/users/${me.body.user.id}/ratings`).set(authHeaders(owner))
      assert.equal(res.status, 200)
      assert.equal(res.body.totalRatings, 0)
    })
  })

  describe('safety (phone, reports, blocks, account deletion)', () => {
    beforeEach(async () => {
      await wipe()
    })

    async function users() {
      const a = (await register({ email: 'safe-a@test.com' })).token
      const b = (await register({ email: 'safe-b@test.com' })).token
      return { a, b }
    }

    it('verifies a phone via OTP issued to the account', async () => {
      const { a } = await users()
      const send = await request(app).post('/api/phone/send-code').set(authHeaders(a)).send({ phone: '9876543210' })
      assert.equal(send.status, 200)

      const code = (await get("SELECT code FROM phone_verifications WHERE used=0 ORDER BY id DESC LIMIT 1")).code
      const verify = await request(app).post('/api/phone/verify').set(authHeaders(a)).send({ code })
      assert.equal(verify.status, 200)
      assert.equal(verify.body.user.phone_verified, 1)
    })

    it('rejects a wrong OTP', async () => {
      const { a } = await users()
      await request(app).post('/api/phone/send-code').set(authHeaders(a)).send({ phone: '9876543210' })
      const verify = await request(app).post('/api/phone/verify').set(authHeaders(a)).send({ code: '000000' })
      assert.equal(verify.status, 400)
      assert.equal(verify.body.user, undefined)
    })

    it('locks the OTP after too many wrong attempts', async () => {
      const { a } = await users()
      await request(app).post('/api/phone/send-code').set(authHeaders(a)).send({ phone: '9876543210' })
      for (let i = 0; i < 5; i++) {
        const wrong = await request(app).post('/api/phone/verify').set(authHeaders(a)).send({ code: '000000' })
        assert.equal(wrong.status, 400)
      }
      // the code is now consumed, so the *correct* code must also fail
      const code = (await get("SELECT code FROM phone_verifications WHERE used=1 ORDER BY id DESC LIMIT 1")).code
      const verify = await request(app).post('/api/phone/verify').set(authHeaders(a)).send({ code })
      assert.equal(verify.status, 400)
    })

    it('allows reporting a user and blocks duplicate reports', async () => {
      const { a, b } = await users()
      const me = await request(app).get('/api/auth/me').set(authHeaders(b))
      const reportedId = me.body.user.id

      const r = await request(app).post(`/api/users/${reportedId}/report`).set(authHeaders(a)).send({ reason: 'Harassment' })
      assert.equal(r.status, 200)

      const dup = await request(app).post(`/api/users/${reportedId}/report`).set(authHeaders(a)).send({ reason: 'Harassment' })
      assert.equal(dup.status, 409)
    })

    it('blocks a user and blocks them from requesting a ride', async () => {
      const { a, b } = await users()
      // a is owner of a ride; b blocks a
      const ride = await offerRide(a)
      const meA = await request(app).get('/api/auth/me').set(authHeaders(a))

      const block = await request(app).post(`/api/users/${meA.body.user.id}/block`).set(authHeaders(b))
      assert.equal(block.status, 200)

      const reqRide = await request(app).post(`/api/rides/${ride.body.ride.id}/request`).set(authHeaders(b)).send({ seats: 1 })
      assert.equal(reqRide.status, 403)
    })

    it('anonymizes the account on deletion but keeps the row', async () => {
      const { a } = await users()
      const me = await request(app).get('/api/auth/me').set(authHeaders(a))
      const userId = me.body.user.id

      const del = await request(app).delete('/api/account').set(authHeaders(a))
      assert.equal(del.status, 200)

      const row = await get('SELECT * FROM users WHERE id=?', [userId])
      assert.equal(row.name, 'Deleted User')
      assert.match(row.email, /@deleted\.saathyaan\.local/)
      assert.equal(row.is_suspended, 1)
    })

    it('admin can view reports and suspend a reported user', async () => {
      const { a, b } = await users()
      const meB = await request(app).get('/api/auth/me').set(authHeaders(b))
      const report = await request(app).post(`/api/users/${meB.body.user.id}/report`).set(authHeaders(a)).send({ reason: 'Spam' })
      assert.equal(report.status, 200)

      // promote b to admin (via db) and re-login so the token carries the flag
      await run('UPDATE users SET is_admin=1 WHERE id=?', [meB.body.user.id])
      const admin = (await request(app).post('/api/auth/login').send({ email: 'safe-b@test.com', password: 'secret123' })).body.token

      const list = await request(app).get('/api/admin/reports').set(authHeaders(admin))
      assert.equal(list.status, 200)
      assert.equal(list.body.reports.length, 1)

      const reportId = list.body.reports[0].id
      const action = await request(app).post(`/api/admin/reports/${reportId}/action`).set(authHeaders(admin)).send({ action: 'suspend' })
      assert.equal(action.status, 200)

      // suspended user can no longer act
      const suspended = await request(app).get('/api/auth/me').set(authHeaders(b))
      assert.equal(suspended.status, 403)
    })
  })

  describe('payments / escrow', () => {
    beforeEach(async () => {
      await wipe()
    })

    async function setupAccepted({ seats = 1, price = 200 } = {}) {
      const ownerRes = await register({ email: 'pay-owner@test.com' })
      const ownerTok = ownerRes.token
      const ride = (await offerRide(ownerTok, { seats_total: 2, price })).body.ride
      const riderRes = await register({ email: 'pay-rider@test.com' })
      const riderTok = riderRes.token
      const reqRes = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(riderTok))
        .send({ seats, message: 'Pay test' })
      assert.equal(reqRes.status, 200)
      const requestId = (await get(
        'SELECT id FROM requests WHERE ride_id=? AND rider_id=? ORDER BY id DESC LIMIT 1',
        [ride.id, riderRes.user.id]
      )).id
      const accept = await request(app)
        .post(`/api/requests/${requestId}/accept`)
        .set(authHeaders(ownerTok))
      assert.equal(accept.status, 200)
      return { ownerTok, riderTok, ride, requestId }
    }

    it('holds the fare in escrow after an accepted booking (mock, captured)', async () => {
      const { riderTok, requestId, ride } = await setupAccepted({ seats: 1, price: 200 })
      const res = await request(app)
        .post('/api/payments/order')
        .set(authHeaders(riderTok))
        .send({ request_id: requestId })
      assert.equal(res.status, 201)
      assert.equal(res.body.payment.status, 'captured')
      assert.equal(res.body.payment.amount, 200)
      assert.equal(res.body.payment.provider, 'mock')
      assert.equal(res.body.payment.ride_id, ride.id)
      assert.equal(res.body.payment.role, 'payer')
    })

    it('rejects paying for a booking that is not accepted', async () => {
      const { riderTok, requestId } = await setupAccepted()
      // mark the request rejected out-of-band so it is no longer accepted
      await run("UPDATE requests SET status='rejected' WHERE id=?", [requestId])
      const res = await request(app)
        .post('/api/payments/order')
        .set(authHeaders(riderTok))
        .send({ request_id: requestId })
      assert.equal(res.status, 400)
    })

    it('is idempotent on a duplicate pay request', async () => {
      const { riderTok, requestId } = await setupAccepted()
      const first = await request(app)
        .post('/api/payments/order')
        .set(authHeaders(riderTok))
        .send({ request_id: requestId })
      assert.equal(first.status, 201)
      const again = await request(app)
        .post('/api/payments/order')
        .set(authHeaders(riderTok))
        .send({ request_id: requestId })
      assert.equal(again.status, 200)
      assert.equal(again.body.message, 'Booking already paid')
    })

    it('lists only the user’s own escrows with the correct side', async () => {
      const { ownerTok, riderTok, requestId } = await setupAccepted()
      await request(app)
        .post('/api/payments/order')
        .set(authHeaders(riderTok))
        .send({ request_id: requestId })
      const riderList = await request(app).get('/api/payments').set(authHeaders(riderTok))
      assert.equal(riderList.status, 200)
      assert.equal(riderList.body.payments.length, 1)
      assert.equal(riderList.body.payments[0].role, 'payer')

      const ownerList = await request(app).get('/api/payments').set(authHeaders(ownerTok))
      assert.equal(ownerList.body.payments.length, 1)
      assert.equal(ownerList.body.payments[0].role, 'payee')
    })

    it('lets the rider refund before the ride completes, and the owner cannot', async () => {
      const { ownerTok, riderTok, requestId } = await setupAccepted()
      const pay = await request(app)
        .post('/api/payments/order')
        .set(authHeaders(riderTok))
        .send({ request_id: requestId })
      const escrowId = pay.body.payment.id
      assert.equal(pay.body.payment.status, 'captured')

      // the ride owner cannot refund the rider’s money
      const wrongRefund = await request(app)
        .post(`/api/payments/${escrowId}/refund`)
        .set(authHeaders(ownerTok))
        .send({})
      assert.equal(wrongRefund.status, 403)

      const refund = await request(app)
        .post(`/api/payments/${escrowId}/refund`)
        .set(authHeaders(riderTok))
        .send({})
      assert.equal(refund.status, 200)

      const list = await request(app).get('/api/payments').set(authHeaders(riderTok))
      assert.equal(list.body.payments[0].status, 'refunded')
    })

    it('does not release to the owner until the ride is completed', async () => {
      const { ownerTok, riderTok, requestId } = await setupAccepted()
      const pay = await request(app)
        .post('/api/payments/order')
        .set(authHeaders(riderTok))
        .send({ request_id: requestId })
      const escrowId = pay.body.payment.id

      const early = await request(app)
        .post(`/api/payments/${escrowId}/release`)
        .set(authHeaders(ownerTok))
        .send({})
      assert.equal(early.status, 400)

      const complete = await request(app)
        .post(`/api/rides/${pay.body.payment.ride_id}/complete`)
        .set(authHeaders(ownerTok))
      assert.equal(complete.status, 200)

      const release = await request(app)
        .post(`/api/payments/${escrowId}/release`)
        .set(authHeaders(ownerTok))
        .send({})
      assert.equal(release.status, 200)

      const list = await request(app).get('/api/payments').set(authHeaders(ownerTok))
      assert.equal(list.body.payments[0].status, 'released')
    })
  })

  describe('growth (referrals, follows, leaderboard)', () => {
    beforeEach(async () => {
      await wipe()
    })

    async function acceptedRide(tokens) {
      const make = await offerRide(tokens.ownerTok)
      assert.equal(make.status, 200, JSON.stringify(make.body))
      const ride = make.body.ride
      const reqRes = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(tokens.riderTok))
        .send({ seats: 1, message: 'growth test' })
      assert.equal(reqRes.status, 200)
      const requestId = (await get(
        'SELECT id FROM requests WHERE ride_id=? AND rider_id=? ORDER BY id DESC LIMIT 1',
        [ride.id, tokens.rider.id]
      )).id
      await request(app).post(`/api/requests/${requestId}/accept`).set(authHeaders(tokens.ownerTok))
      return { ride, requestId }
    }

    it('assigns every new user a referral code', async () => {
      const { user } = await register({ name: 'Code Guy', email: 'codeguy@test.com' })
      assert.ok(user.referral_code && user.referral_code.length >= 6)
    })

    it('redeems a code and credits both users exactly once', async () => {
      const a = await register({ name: 'Referrer', email: 'refa@test.com' })
      const b = await register({ name: 'Recruit', email: 'refb@test.com' })

      const mine = await request(app).get('/api/referral').set(authHeaders(a.token))
      assert.equal(mine.status, 200)
      const code = mine.body.code

      const redeem = await request(app)
        .post('/api/referral/redeem')
        .set(authHeaders(b.token))
        .send({ code })
      assert.equal(redeem.status, 200)

      const aStats = await request(app).get('/api/me/stats').set(authHeaders(a.token))
      assert.equal(aStats.body.credit, 50)
      const bStats = await request(app).get('/api/me/stats').set(authHeaders(b.token))
      assert.equal(bStats.body.credit, 50)

      const again = await request(app)
        .post('/api/referral/redeem')
        .set(authHeaders(b.token))
        .send({ code })
      assert.equal(again.status, 400)

      const selfRef = await request(app)
        .post('/api/referral/redeem')
        .set(authHeaders(a.token))
        .send({ code })
      assert.equal(selfRef.status, 400)
    })

    it('notifies followers when a favorite owner posts a ride', async () => {
      const owner = await register({ name: 'Star Owner', email: 'star@test.com' })
      const fan = await register({ name: 'Fan', email: 'fan@test.com' })
      const follow = await request(app)
        .post(`/api/users/${owner.user.id}/follow`)
        .set(authHeaders(fan.token))
      assert.equal(follow.status, 200)

      await offerRide(owner.token)
      const row = await get('SELECT COUNT(*) AS c FROM notifications WHERE user_id=?', [fan.user.id])
      assert.equal(row.c, 1)

      const list = await request(app)
        .get('/api/users/1/following')
        .set(authHeaders(fan.token))
      assert.ok(list.body.following.some((u) => u.id === owner.user.id))
    })

    it('leaderboard and stats include rides offered and joined', async () => {
      const owner = await register({ name: 'Busy Owner', email: 'busy@test.com' })
      const rider = await register({ name: 'Frequent Rider', email: 'freq@test.com' })
      const ownerTok = owner.token
      const riderTok = rider.token
      const { ride } = await acceptedRide({ ownerTok, riderTok, rider: rider.user })
      await request(app).post(`/api/rides/${ride.id}/complete`).set(authHeaders(ownerTok))

      const board = await request(app).get('/api/leaderboard?period=all')
      assert.equal(board.status, 200)
      assert.ok(board.body.leaderboard.some((e) => e.id === owner.user.id && e.completed >= 1))
      assert.ok(board.body.leaderboard.some((e) => e.id === rider.user.id && e.completed >= 1))

      const ownerStats = await request(app).get('/api/me/stats').set(authHeaders(ownerTok))
      assert.equal(ownerStats.body.completed, 1)
      const riderStats = await request(app).get('/api/me/stats').set(authHeaders(riderTok))
      assert.equal(riderStats.body.completed, 1)
    })
  })

  describe('trips + safety (live tracking, SOS)', () => {
    beforeEach(async () => {
      await wipe()
    })

    async function setupTripper() {
      const owner = await register({ email: 'trip-owner@test.com' })
      const rider = await register({ email: 'trip-rider@test.com' })
      const ownerTok = owner.token
      const riderTok = rider.token
      const ride = (await offerRide(ownerTok, { seats_total: 2 })).body.ride
      const reqRes = await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(riderTok))
        .send({ seats: 1 })
      const requestId = (await get(
        'SELECT id FROM requests WHERE ride_id=? AND rider_id=? ORDER BY id DESC LIMIT 1',
        [ride.id, rider.user.id]
      )).id
      await request(app).post(`/api/requests/${requestId}/accept`).set(authHeaders(ownerTok))
      return { ownerTok, riderTok, ride }
    }

    it('lets a participant share live location and keeps outsiders out', async () => {
      const { riderTok, ride } = await setupTripper()
      const stranger = await register({ email: 'outsider@test.com' })

      const start = await request(app)
        .post('/api/trips/start')
        .set(authHeaders(riderTok))
        .send({ ride_id: ride.id })
      assert.equal(start.status, 200)
      const tripId = start.body.trip.id

      const loc = await request(app)
        .post(`/api/trips/${tripId}/location`)
        .set(authHeaders(riderTok))
        .send({ lat: 13.1, lng: 80.3 })
      assert.equal(loc.status, 200)

      const live = await request(app)
        .get(`/api/trips/ride/${ride.id}`)
        .set(authHeaders(riderTok))
      assert.equal(live.body.locations.length, 1)
      assert.ok(live.body.locations[0].lat !== null)

      const forbidden = await request(app)
        .get(`/api/trips/ride/${ride.id}`)
        .set(authHeaders(stranger.token))
      assert.equal(forbidden.status, 403)
    })

    it('raises SOS and lets an admin close it', async () => {
      const user = await register({ email: 'sos-user@test.com' })
      const alarm = await request(app)
        .post('/api/safety/sos')
        .set(authHeaders(user.token))
        .send({ lat: 12.9, lng: 80.1, message: 'emergency!' })
      assert.equal(alarm.status, 200)

      // promote a second account to admin and a non-admin is rejected
      const sosRow = await get('SELECT id FROM sos_alerts ORDER BY id DESC LIMIT 1')
      const admin = await register({ email: 'sos-admin@test.com' })
      await run('UPDATE users SET is_admin=1 WHERE id=?', [admin.user.id])

      const denied = await request(app).get('/api/admin/sos').set(authHeaders(user.token))
      assert.equal(denied.status, 403)

      const queue = await request(app).get('/api/admin/sos').set(authHeaders(admin.token))
      assert.equal(queue.status, 200)
      assert.equal(queue.body.alerts[0].status, 'open')

      const close = await request(app)
        .post(`/api/admin/sos/${sosRow.id}/close`)
        .set(authHeaders(admin.token))
      assert.equal(close.status, 200)
      assert.equal((await get('SELECT status FROM sos_alerts WHERE id=?', [sosRow.id])).status, 'closed')
    })
  })

  describe('id verification', () => {
    beforeEach(async () => {
      await wipe()
    })

    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    it('submits a doc, enqueues for review, and admin approves it', async () => {
      const user = await register({ email: 'verify-user@test.com' })
      const admin = await register({ email: 'verify-admin@test.com' })
      await run('UPDATE users SET is_admin=1 WHERE id=?', [admin.user.id])

      const badMime = await request(app)
        .post('/api/verifications')
        .set(authHeaders(user.token))
        .send({ doc_type: 'aadhaar', doc_image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })
      assert.equal(badMime.status, 400)

      const submit = await request(app)
        .post('/api/verifications')
        .set(authHeaders(user.token))
        .send({ doc_type: 'aadhaar', doc_image: PNG })
      assert.equal(submit.status, 201)

      const dup = await request(app)
        .post('/api/verifications')
        .set(authHeaders(user.token))
        .send({ doc_type: 'driving_license', doc_image: PNG })
      assert.equal(dup.status, 400)

      const queue = await request(app)
        .get('/api/admin/verifications')
        .set(authHeaders(admin.token))
      assert.equal(queue.body.verifications.length, 1)
      assert.equal(queue.body.verifications[0].status, 'pending')

      const approve = await request(app)
        .post(`/api/admin/verifications/${queue.body.verifications[0].id}/action`)
        .set(authHeaders(admin.token))
        .send({ action: 'approve' })
      assert.equal(approve.status, 200)

      const me = await request(app).get('/api/auth/me').set(authHeaders(user.token))
      assert.equal(me.body.user.id_verified, 1)
    })
  })

  describe('rides v2 (detail, round trip, cancel reason, filters)', () => {
    beforeEach(async () => {
      await wipe()
    })

    it('returns ride detail with owner, seats, and my request status', async () => {
      const owner = await register({ email: 'detail-owner@test.com' })
      const rider = await register({ email: 'detail-rider@test.com' })
      const ride = (await offerRide(owner.token, { seats_total: 2 })).body.ride
      await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(rider.token))
        .send({ seats: 1 })
      const requestId = (await get(
        'SELECT id FROM requests WHERE ride_id=? AND rider_id=? ORDER BY id DESC LIMIT 1',
        [ride.id, rider.user.id]
      )).id
      await request(app).post(`/api/requests/${requestId}/accept`).set(authHeaders(owner.token))

      const detail = await request(app)
        .get(`/api/rides/${ride.id}`)
        .set(authHeaders(rider.token))
      assert.equal(detail.status, 200)
      assert.equal(detail.body.owner.name, 'Test User')
      assert.equal(detail.body.ride.seats_taken, 1)
      assert.equal(detail.body.ride.seats_left, 1)
      assert.equal(detail.body.my_request.status, 'accepted')
      assert.equal(detail.body.is_participant, true)

      const notFound = await request(app).get('/api/rides/999999')
      assert.equal(notFound.status, 404)
    })

    it('creates a return leg when return_depart_at is provided', async () => {
      const owner = await register({ email: 'roundtrip@test.com' })
      const res = await offerRide(owner.token, {
        from_name: 'Chennai', to_name: 'Pondicherry',
        return_depart_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      })
      assert.equal(res.status, 200)
      assert.ok(res.body.returnRide)
      assert.equal(res.body.returnRide.to_name, 'Chennai')
      assert.equal(res.body.returnRide.from_name, 'Pondicherry')
    })

    it('records the cancel reason on rider and owner cancellations', async () => {
      const owner = await register({ email: 'cancel-owner@test.com' })
      const rider = await register({ email: 'cancel-rider@test.com' })
      const ride = (await offerRide(owner.token, { seats_total: 2 })).body.ride
      await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(rider.token))
        .send({ seats: 1 })
      const requestId = (await get(
        'SELECT id FROM requests WHERE ride_id=? AND rider_id=? ORDER BY id DESC LIMIT 1',
        [ride.id, rider.user.id]
      )).id
      await request(app).post(`/api/requests/${requestId}/accept`).set(authHeaders(owner.token))

      const riderCancel = await request(app)
        .post(`/api/requests/${requestId}/cancel`)
        .set(authHeaders(rider.token))
        .send({ reason: 'Plans changed' })
      assert.equal(riderCancel.status, 200)
      assert.equal((await get('SELECT cancel_reason FROM requests WHERE id=?', [requestId])).cancel_reason, 'Plans changed')

      const rideCancel = await request(app)
        .post(`/api/rides/${ride.id}/cancel`)
        .set(authHeaders(owner.token))
        .send({ reason: 'Vehicle broke down' })
      assert.equal(rideCancel.status, 200)
      assert.equal((await get('SELECT cancel_reason FROM rides WHERE id=?', [ride.id])).cancel_reason, 'Vehicle broke down')
    })

    it('excludes rides without enough free seats for the requested count', async () => {
      const owner = await register({ email: 'filter-owner@test.com' })
      const rider = await register({ email: 'filter-rider@test.com' })
      const ride = (await offerRide(owner.token, { seats_total: 3 })).body.ride
      await request(app)
        .post(`/api/rides/${ride.id}/request`)
        .set(authHeaders(rider.token))
        .send({ seats: 2 })
      const requestId = (await get(
        'SELECT id FROM requests WHERE ride_id=? AND rider_id=? ORDER BY id DESC LIMIT 1',
        [ride.id, rider.user.id]
      )).id
      await request(app).post(`/api/requests/${requestId}/accept`).set(authHeaders(owner.token))

      const need3 = await request(app).get('/api/rides/search?min_seats=3').set(authHeaders(rider.token))
      assert.equal(need3.status, 200, JSON.stringify(need3.body))
      assert.ok(!need3.body.results.some((r) => r.id === ride.id))

      const need1 = await request(app).get('/api/rides/search?min_seats=1').set(authHeaders(rider.token))
      assert.equal(need1.status, 200, JSON.stringify(need1.body))
      assert.ok(need1.body.results.some((r) => r.id === ride.id))
    })
  })
})
