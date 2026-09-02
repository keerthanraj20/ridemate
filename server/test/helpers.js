import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test as baseTest } from 'node:test'

// Create an isolated, empty SQLite DB for a clean test run.
// Must be called BEFORE importing ../db.js or any module that pulls it in.
export function freshDbPath() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ridemate-test-'))
  return path.join(dir, 'test.db')
}

// Reset the shared db singleton's tables between tests (keeps FK checks).
export function truncateAll(db) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM messages;
    DELETE FROM notifications;
    DELETE FROM saved_routes;
    DELETE FROM ratings;
    DELETE FROM requests;
    DELETE FROM rides;
    DELETE FROM reset_tokens;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
    PRAGMA foreign_keys = ON;
  `)
}
