import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test as baseTest } from 'node:test'

// Create an isolated, empty SQLite DB for a clean test run.
// Must be called BEFORE importing ../db.js or any module that pulls it in.
export function freshDbPath() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'saathyaan-test-'))
  return path.join(dir, 'test.db')
}

// Wipe every table between tests so each case starts clean
// (keeps FK checks on SQLite; uses TRUNCATE ... CASCADE on Postgres).
//
// Safety: refuses to run unless RM_ALLOW_WIPEDB=1 set explicitly in the test
// entrypoint, so an accidental `npm test` against a production Postgres URL
// (e.g. one exported in the shell) can't destroy real data.
export async function truncateAll(db, USE_POSTGRES, exec) {
  if (process.env.RM_ALLOW_WIPEDB !== '1') {
    throw new Error('Refusing to wipe the test DB: set RM_ALLOW_WIPEDB=1 to allow destructive truncation')
  }
  if (USE_POSTGRES) {
    await exec(
      'TRUNCATE messages, notifications, saved_routes, ratings, escrow_payments, requests, rides, reset_tokens, phone_verifications, reports, blocked_users, trip_locations, trips, sos_alerts, id_verifications, owner_follows, credit_ledger, users RESTART IDENTITY CASCADE'
    )
    return
  }
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM messages;
    DELETE FROM notifications;
    DELETE FROM saved_routes;
    DELETE FROM ratings;
    DELETE FROM escrow_payments;
    DELETE FROM requests;
    DELETE FROM rides;
    DELETE FROM reset_tokens;
    DELETE FROM phone_verifications;
    DELETE FROM reports;
    DELETE FROM blocked_users;
    DELETE FROM trip_locations;
    DELETE FROM trips;
    DELETE FROM sos_alerts;
    DELETE FROM id_verifications;
    DELETE FROM owner_follows;
    DELETE FROM credit_ledger;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
    PRAGMA foreign_keys = ON;
  `)
}