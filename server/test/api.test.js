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
})
