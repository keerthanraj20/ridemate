import { before, after, describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { freshDbPath, truncateAll } from './helpers.js'

// Set up an isolated DB before any module that uses ../db.js is imported.
process.env.JWT_SECRET = 'test-secret-not-for-production'
process.env.RM_DB_PATH = freshDbPath()
process.env.RM_DISABLE_RATE_LIMIT = '1'
process.env.MAIL_HOST = ''
process.env.MAIL_USER = ''
process.env.MAIL_PASS = ''

const { app } = await import('../index.js')
const { db } = await import('../db.js')

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

describe('RideMate API', () => {
  before(() => {
    truncateAll(db)
  })

  after(() => {
    db.close()
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

    it('requires a password of at least 6 chars', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'No', email: 'no@test.com', phone: '9876500003', password: '123' })
      assert.equal(res.status, 400)
    })

    it('logs in with correct credentials', async () => {
      await register({ email: 'login@test.com', password: 'rightpass' })
      const ok = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'rightpass' })
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

      const row = db
        .prepare("SELECT token FROM reset_tokens WHERE type='verify' ORDER BY id DESC LIMIT 1")
        .get()
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

      const row = db
        .prepare("SELECT token FROM reset_tokens WHERE type='reset' ORDER BY id DESC LIMIT 1")
        .get()
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
    beforeEach(() => {
      truncateAll(db)
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
    beforeEach(() => {
      truncateAll(db)
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
      truncateAll(db)
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
    beforeEach(() => {
      truncateAll(db)
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

      const code = db.prepare("SELECT code FROM phone_verifications WHERE used=0 ORDER BY id DESC LIMIT 1").get().code
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

      const row = db.prepare('SELECT * FROM users WHERE id=?').get(userId)
      assert.equal(row.name, 'Deleted User')
      assert.match(row.email, /@deleted\.ridemate\.local/)
      assert.equal(row.is_suspended, 1)
    })

    it('admin can view reports and suspend a reported user', async () => {
      const { a, b } = await users()
      const meB = await request(app).get('/api/auth/me').set(authHeaders(b))
      const report = await request(app).post(`/api/users/${meB.body.user.id}/report`).set(authHeaders(a)).send({ reason: 'Spam' })
      assert.equal(report.status, 200)

      // promote b to admin (via db) and re-login so the token carries the flag
      db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(meB.body.user.id)
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
})
