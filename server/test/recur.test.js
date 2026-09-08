import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { freshDbPath, truncateAll } from './helpers.js'

process.env.JWT_SECRET = 'test-secret-not-for-production'
process.env.RM_DB_PATH = freshDbPath()
process.env.RM_DISABLE_RATE_LIMIT = '1'
process.env.RM_ALLOW_WIPEDB = '1'
process.env.MAIL_HOST = ''
process.env.MAIL_USER = ''
process.env.MAIL_PASS = ''

const { db, run, all, exec, close, USE_POSTGRES } = await import('../db.js')
const { generateRecurringRides } = await import('../recur.js')

async function wipe() {
  await truncateAll(db, USE_POSTGRES, exec)
}

function tomorrowUtcStr() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().slice(0, 10)
}

function tomorrowDOW() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).getUTCDay()
}

function repeatChildOn(row) {
  return typeof row.repeat_child_on === 'string' ? row.repeat_child_on : row.repeat_child_on.toISOString().slice(0, 10)
}

// Insert a template ride directly, bypassing the API.
async function insertTemplate({ departAt, repeatEvery }) {
  return (await run(
    `INSERT INTO rides
     (user_id,vehicle_type,from_name,from_lat,from_lng,to_name,to_lat,to_lng,
      depart_at,seats_total,price,status,repeat_every)
     VALUES (?, 'car','A',0,0,'B',1,1,?,2,100,'open',?)`,
    [testUserId, departAt.toISOString(), repeatEvery]
  )).lastInsertRowid
}

async function childrenOf(templateId) {
  return all('SELECT * FROM rides WHERE repeat_parent_id=?', [templateId])
}

let testUserId

async function freshUser() {
  testUserId = (await run(
    "INSERT INTO users (name,email,phone,password_hash) VALUES ('T','t@test.com','1234567','x')"
  )).lastInsertRowid
}

describe('recurring ride generator', () => {
  before(async () => {
    await wipe()
    await freshUser()
  })
  after(async () => {
    await close()
  })

  it('generates a daily instance for tomorrow with the same time-of-day', async () => {
    await wipe()
    await freshUser()
    // a departure at a fixed local wall-clock time, chosen in the past so the
    // scheduler treats this row purely as a template
    const dep = new Date()
    dep.setUTCHours(9, 30, 0, 0)
    const id = await insertTemplate({ departAt: dep, repeatEvery: 'daily' })

    await generateRecurringRides()
    const kids = await childrenOf(id)
    assert.equal(kids.length, 1)
    assert.equal(repeatChildOn(kids[0]), tomorrowUtcStr())

    const kidDep = new Date(kids[0].depart_at)
    assert.equal(kidDep.getUTCHours(), 9)
    assert.equal(kidDep.getUTCMinutes(), 30)
  })

  it('weekly repeats on the departure weekday of the template, not creation day', async () => {
    await wipe()
    await freshUser()
    // Pick a departure whose weekday equals tomorrow => should generate.
    // Pick a different weekday for another template => should NOT generate.
    const tDOW = tomorrowDOW()
    const otherDOW = (tDOW + 3) % 7

    const base = new Date()
    const depMatch = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 1))
    // shift to target weekday relative to tomorrow
    depMatch.setUTCDate(depMatch.getUTCDate() + ((tDOW - depMatch.getUTCDay()) % 7 + 7) % 7)
    depMatch.setUTCHours(9, 0, 0, 0)

    const depOther = new Date(depMatch)
    depOther.setUTCDate(depOther.getUTCDate() + ((otherDOW - depOther.getUTCDay() + 7) % 7))

    const matchId = await insertTemplate({ departAt: depMatch, repeatEvery: 'weekly' })
    const otherId = await insertTemplate({ departAt: depOther, repeatEvery: 'weekly' })

    await generateRecurringRides()

    const matchKids = await childrenOf(matchId)
    const otherKids = await childrenOf(otherId)

    // The matching-weekday template generated; the other did not.
    assert.equal(matchKids.length, 1)
    assert.equal(otherKids.length, 0)
  })

  it('weekdays does not generate on Saturday or Sunday', async () => {
    await wipe()
    await freshUser()
    // Only meaningful if tomorrow is a weekend; otherwise skip.
    const dow = tomorrowDOW()
    if (dow >= 1 && dow <= 5) return // weekday tomorrow → not a weekend test

    const dep = new Date()
    dep.setUTCHours(8, 0, 0, 0)
    const id = await insertTemplate({ departAt: dep, repeatEvery: 'weekdays' })

    await generateRecurringRides()
    assert.equal((await childrenOf(id)).length, 0)
  })

  it('does not duplicate an instance already generated for tomorrow', async () => {
    await wipe()
    await freshUser()
    const dep = new Date()
    dep.setUTCHours(7, 0, 0, 0)
    const id = await insertTemplate({ departAt: dep, repeatEvery: 'daily' })

    await generateRecurringRides()
    const first = await childrenOf(id)
    assert.equal(first.length, 1)

    await generateRecurringRides()
    assert.equal((await childrenOf(id)).length, 1)
    assert.equal((await childrenOf(id))[0].id, first[0].id)
  })
})