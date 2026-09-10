// ─── Backup & export utilities ────────────────────────────────────────────────
//
//   node backup.js            => snapshot the live DB to server/backups/ and
//                                write CSV exports of users/rides/payments
//   RM_BACKUP_DIR=...          => override the backup folder
//
// Makes a consistent copy using better-sqlite3's online backup API (safe while
// the server is running).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { all, USE_POSTGRES, db } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

export function backupDir() {
  return process.env.RM_BACKUP_DIR || path.join(__dirname, 'backups')
}

export async function takeBackup() {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  if (USE_POSTGRES) {
    // better-sqlite3's online backup API only applies to SQLite files.
    console.log('💾 Postgres mode: skipping .db file backup (CSV exports still written)')
    return null
  }
  const file = path.join(dir, `saathyaan-${stamp}.db`)
  db.backup(file)
  return file
}

const CSV_ESCAPE = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCsv(table, columns, fromSql = '') {
  const rows = await all(`SELECT ${columns.join(',')} FROM ${table} ${fromSql}`)
  return [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => CSV_ESCAPE(r[c])).join(',')),
  ].join('\n')
}

export async function writeExports() {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  const exports = {
    'users.csv': await exportCsv('users', ['id', 'name', 'email', 'phone', 'id_verified', 'credit_balance', 'created_at']),
    'rides.csv': await exportCsv('rides', ['id', 'user_id', 'vehicle_type', 'from_name', 'to_name', 'depart_at', 'seats_total', 'price', 'status', 'created_at']),
    'payments.csv': await exportCsv('escrow_payments', ['id', 'ride_id', 'payer_id', 'payee_id', 'amount_paise', 'currency', 'status', 'provider', 'created_at']),
  }
  for (const [file, content] of Object.entries(exports)) {
    fs.writeFileSync(path.join(dir, file), content, 'utf8')
  }
  return Object.keys(exports)
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  takeBackup().then(async (file) => {
    const files = await writeExports()
    console.log(`📦 Backup written to ${file}`)
    console.log(`📄 Exports: ${files.join(', ')}`)
  })
}

export function startBackupScheduler() {
  if (!process.env.RM_BACKUP_DIR) return
  console.log(`💾 Daily backup scheduler enabled → ${backupDir()}`)
  const run = () => { Promise.all([takeBackup(), writeExports()]).catch((e) => console.error('backup failed', e)) }
  run()
  setInterval(run, 24 * 60 * 60 * 1000)
}