import Database from 'better-sqlite3'
import pg from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Determine which database to use
const USE_POSTGRES = Boolean(process.env.DATABASE_URL)
const DB_PATH = process.env.RM_DB_PATH || path.join(__dirname, 'ridemate.db')

let db
let pgPool

if (USE_POSTGRES) {
  // PostgreSQL for production
  pgPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  })

  // node-postgres returns int8 (COUNT/SUM) and numeric (AVG) as strings by
  // default. Our routes do arithmetic on these values, so coerce them to JS
  // numbers so e.g. COUNT+cnt isn't turned into string concatenation.
  pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))) // int8
  pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))) // numeric

  // Test connection
  pgPool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err)
  })

  console.log('🐘 Using PostgreSQL database')
} else {
  // SQLite for development
  db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -8000')
  db.pragma('temp_store = MEMORY')
  db.pragma('mmap_size = 268435456')
  db.pragma('busy_timeout = 5000')
  console.log('🗃️  Using SQLite database (development)')
}

// ─── Unified Query Interface ──────────────────────────────────────────────────

// SQLite compatibility shim. Routes are written in PostgreSQL SQL ($N
// placeholders, NOW()). better-sqlite3 expects `?` anonymous params and has no
// NOW() function, so normalize here when running on SQLite.
function sqliteStmt(sql, params = []) {
  const converted = sql.replace(/\$(\d+)\b/g, '?').replace(/\bNOW\(\)/g, "datetime('now')")
  return { stmt: db.prepare(converted), params }
}

// Postgres compatibility shim. Most route SQL is written in SQLite flavour
// (`?` placeholders, datetime('now'), INSERT OR IGNORE). Normalize the same
// SQL text so it runs on PostgreSQL too.
function pgStmt(sql, params = []) {
  let s = sql
    .replace(/cast\(strftime\('%H',\s*([^)]+)\)\s*as\s+int(?:eger)?\)/gi, 'EXTRACT(HOUR FROM $1)::int')
    .replace(/\bdatetime\(\s*'now'\s*\)\b/gi, 'NOW()')
    // SQLite datetime('now','-30 minutes') modifiers → Postgres interval math
    .replace(/datetime\(\s*'now'\s*,\s*'([^']*)'\s*\)/gi, (m, mod) => {
      const mm = mod.trim()
      if (mm.startsWith('-')) return `NOW() - INTERVAL '${mm.slice(1).trim()}'`
      if (mm.startsWith('+')) return `NOW() + INTERVAL '${mm.slice(1).trim()}'`
      return `NOW() + INTERVAL '${mm}'`
    })
    // SQLite date(r.depart_at) → Postgres cast to date
    .replace(/\bdate\(([^)]+)\)/gi, '($1)::date')
    // SQLite substr(expr,1,10) on dates → Postgres text slice (PG has no
    // substr() for timestamp; ::text of a timestamp is 'YYYY-MM-DD HH:...')
    .replace(/\bsubstr\(\s*([^,]+?)\s*,\s*1\s*,\s*10\s*\)/gi, 'LEFT($1::text, 10)')

  if (/^insert\s+or\s+ignore\s+into\b/i.test(s)) {
    s = s.replace(/^insert\s+or\s+ignore\s+into\b/i, 'INSERT INTO')
    if (!/\bon\s+conflict\b/i.test(s)) s = s.trim().replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING'
  }

  // Anonymous `?` placeholders -> numbered $1..$n (only if not already numbered)
  if (!/\$\d/.test(s) && /\?/.test(s)) {
    let i = 0
    s = s.replace(/\?/g, () => `$${++i}`)
  }

  // INSERTs must RETURN the id so lastInsertRowid works on Postgres
  if (/^\s*insert\b/i.test(s) && !/\bRETURNING\b/i.test(s)) {
    s = s.trim().replace(/;?\s*$/, '') + ' RETURNING id'
  }

  return { sql: s, params }
}

/**
 * Execute a query and return all rows
 */
export async function all(sql, params = []) {
  if (USE_POSTGRES) {
    const client = await pgPool.connect()
    try {
      const { sql: q, params: p } = pgStmt(sql, params)
      const result = await client.query(q, p)
      return result.rows
    } finally {
      client.release()
    }
  } else {
    const { stmt, params: bind } = sqliteStmt(sql, params)
    return stmt.all(...bind)
  }
}

/**
 * Execute a query and return the first row
 */
export async function get(sql, params = []) {
  if (USE_POSTGRES) {
    const client = await pgPool.connect()
    try {
      const { sql: q, params: p } = pgStmt(sql, params)
      const result = await client.query(q, p)
      return result.rows[0] || null
    } finally {
      client.release()
    }
  } else {
    const { stmt, params: bind } = sqliteStmt(sql, params)
    return stmt.get(...bind)
  }
}

/**
 * Execute a query and return the last insert row id (SQLite) or INSERT ... RETURNING id (PostgreSQL)
 */
export async function run(sql, params = []) {
  if (USE_POSTGRES) {
    const client = await pgPool.connect()
    try {
      // For INSERT statements, we need to handle RETURNING
      const { sql: q, params: p } = pgStmt(sql, params)
      const result = await client.query(q, p)
      return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount }
    } finally {
      client.release()
    }
  } else {
    const { stmt, params: bind } = sqliteStmt(sql, params)
    const result = stmt.run(...bind)
    return { lastInsertRowid: result.lastInsertRowid, changes: result.changes }
  }
}

/**
 * Execute multiple statements in a transaction
 */
export async function transaction(fn) {
  if (USE_POSTGRES) {
    const client = await pgPool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn({
        all: (sql, params) => {
          const { sql: q, params: p } = pgStmt(sql, params)
          return client.query(q, p).then(r => r.rows)
        },
        get: (sql, params) => {
          const { sql: q, params: p } = pgStmt(sql, params)
          return client.query(q, p).then(r => r.rows[0] || null)
        },
        run: (sql, params) => {
          const { sql: q, params: p } = pgStmt(sql, params)
          return client.query(q, p).then(r => ({ lastInsertRowid: r.rows[0]?.id, changes: r.rowCount }))
        },
      })
      await client.query('COMMIT')
      return result
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  } else {
    const txn = db.transaction(fn)
    return txn({
      all: (sql, params) => {
        const { stmt, params: bind } = sqliteStmt(sql, params)
        return stmt.all(...bind)
      },
      get: (sql, params) => {
        const { stmt, params: bind } = sqliteStmt(sql, params)
        return stmt.get(...bind)
      },
      run: (sql, params) => {
        const { stmt, params: bind } = sqliteStmt(sql, params)
        const result = stmt.run(...bind)
        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes }
      },
    })
  }
}

/**
 * Execute raw SQL (for schema migrations)
 */
export async function exec(sql) {
  if (USE_POSTGRES) {
    const client = await pgPool.connect()
    try {
      const { sql: q } = pgStmt(sql)
      await client.query(q)
    } finally {
      client.release()
    }
  } else {
    db.exec(sql)
  }
}

/**
 * Close database connections (for tests)
 */
export async function close() {
  if (USE_POSTGRES) {
    await pgPool.end()
  } else {
    db.close()
  }
}

// ─── Schema Conversion Helpers ────────────────────────────────────────────────

/**
 * Convert SQLite schema to PostgreSQL schema
 */
function toPostgresSchema(sqliteSql) {
  return sqliteSql
    // Types
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/g, 'SERIAL PRIMARY KEY')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
    // Datetime defaults: SQLite datetime('now') → Postgres NOW()
    .replace(/TEXT NOT NULL DEFAULT \(datetime\('now'\)\)/g, 'TIMESTAMP NOT NULL DEFAULT NOW()')
    .replace(/TEXT DEFAULT \(datetime\('now'\)\)/g, 'TIMESTAMP DEFAULT NOW()')
    // Flag columns stay INTEGER 0/1 on Postgres too (matches how the routes
    // write them); no BOOLEAN conversion.
    .replace(/\bTEXT\b/g, 'TEXT')
    // Check constraints
    .replace(/CHECK \(([^)]+)\)/g, (match, check) => {
      // Convert boolean checks
      return match
        .replace(/IN \('([^']+)',\s*'([^']+)'\)/g, "IN ('$1', '$2')")
    })
    // Remove SQLite-specific pragmas/comments
    .replace(/--.*$/gm, '')
    .replace(/PRAGMA [^;]+;/g, '')
}

/**
 * Get the schema SQL for the current database
 */
function getSchemaSql() {
  const sqliteSchema = `
-- Core tables
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  phone             TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  bio               TEXT DEFAULT '',
  avatar            TEXT DEFAULT NULL,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  is_admin          INTEGER NOT NULL DEFAULT 0,
  is_suspended      INTEGER NOT NULL DEFAULT 0,
  phone_verified    INTEGER NOT NULL DEFAULT 0,
  id_verified       INTEGER NOT NULL DEFAULT 0,
  referral_code     TEXT DEFAULT NULL,
  referred_by       INTEGER DEFAULT NULL REFERENCES users(id),
  credit_balance    REAL NOT NULL DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reset_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  token      TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'reset' CHECK (type IN ('reset','verify')),
  expires_at TIMESTAMP NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rides (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  vehicle_type     TEXT NOT NULL CHECK (vehicle_type IN ('bike','car','auto','van','other')),
  vehicle_model    TEXT,
  from_name        TEXT NOT NULL,
  from_lat         REAL NOT NULL,
  from_lng         REAL NOT NULL,
  to_name          TEXT NOT NULL,
  to_lat           REAL NOT NULL,
  to_lng           REAL NOT NULL,
  depart_at        TIMESTAMP NOT NULL,
  seats_total      INTEGER NOT NULL DEFAULT 1,
  price            REAL NOT NULL DEFAULT 0,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','full','cancelled','completed')),
  repeat_every     TEXT CHECK (repeat_every IN ('none','daily','weekly','weekdays')) DEFAULT 'none',
  repeat_parent_id INTEGER DEFAULT NULL REFERENCES rides(id),
  repeat_child_on  DATE DEFAULT NULL,
  reminder_sent    INTEGER NOT NULL DEFAULT 0,
  cancel_reason    TEXT DEFAULT NULL,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id    INTEGER NOT NULL REFERENCES rides(id),
  rider_id   INTEGER NOT NULL REFERENCES users(id),
  seats      INTEGER NOT NULL DEFAULT 1,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  cancel_reason TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (ride_id, rider_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id       INTEGER NOT NULL REFERENCES rides(id),
  from_user_id  INTEGER NOT NULL REFERENCES users(id),
  to_user_id    INTEGER NOT NULL REFERENCES users(id),
  stars         INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  review        TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  UNIQUE (ride_id, from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id       INTEGER NOT NULL REFERENCES rides(id),
  sender_id     INTEGER NOT NULL REFERENCES users(id),
  recipient_id  INTEGER NOT NULL REFERENCES users(id),
  body          TEXT NOT NULL,
  read          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saved_routes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  label     TEXT,
  from_name TEXT NOT NULL,
  from_lat  REAL NOT NULL,
  from_lng  REAL NOT NULL,
  to_name   TEXT NOT NULL,
  to_lat    REAL NOT NULL,
  to_lng    REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_id, from_name, to_name)
);

-- Phone verification OTP codes
CREATE TABLE IF NOT EXISTS phone_verifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  code       TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- User reports
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  reported_id INTEGER NOT NULL REFERENCES users(id),
  ride_id     INTEGER REFERENCES rides(id),
  reason      TEXT NOT NULL,
  details     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','actioned','dismissed')),
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE (reporter_id, reported_id, ride_id)
);

-- User blocks
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id INTEGER NOT NULL REFERENCES users(id),
  blocked_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Fare escrow
CREATE TABLE IF NOT EXISTS escrow_payments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id             INTEGER NOT NULL REFERENCES rides(id),
  request_id          INTEGER NOT NULL REFERENCES requests(id),
  payer_id            INTEGER NOT NULL REFERENCES users(id),
  payee_id            INTEGER NOT NULL REFERENCES users(id),
  amount_paise        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','captured','released','refunded','cancelled')),
  provider            TEXT NOT NULL DEFAULT 'mock',
  provider_order_id   TEXT,
  provider_payment_id TEXT,
  receipt             TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  captured_at         TIMESTAMP,
  released_at         TIMESTAMP,
  refunded_at         TIMESTAMP,
  UNIQUE (request_id)
);

-- Live trip tracking
CREATE TABLE IF NOT EXISTS trips (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id    INTEGER NOT NULL REFERENCES rides(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','rider')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_at TEXT DEFAULT (datetime('now')),
  ended_at   TIMESTAMP,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (ride_id, user_id)
);

CREATE TABLE IF NOT EXISTS trip_locations (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  lat     REAL NOT NULL,
  lng     REAL NOT NULL,
  at      TEXT DEFAULT (datetime('now'))
);

-- SOS alerts
CREATE TABLE IF NOT EXISTS sos_alerts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  lat        REAL,
  lng        REAL,
  ride_id    INTEGER REFERENCES rides(id),
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Government ID verification (KYC)
CREATE TABLE IF NOT EXISTS id_verifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  doc_type     TEXT NOT NULL,
  doc_image    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note   TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  reviewed_at  TIMESTAMP
);

-- Follow a fellow owner
CREATE TABLE IF NOT EXISTS owner_follows (
  follower_id INTEGER NOT NULL REFERENCES users(id),
  followee_id INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, followee_id)
);

-- Referral credits ledger
CREATE TABLE IF NOT EXISTS credit_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  amount     REAL NOT NULL,
  reason     TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Key-value store for app metadata
CREATE TABLE IF NOT EXISTS __ridemate_kv (
  k TEXT PRIMARY KEY,
  v TEXT
);
`

  if (USE_POSTGRES) {
    return toPostgresSchema(sqliteSchema)
  }
  return sqliteSchema
}

// ─── Initialize Schema ────────────────────────────────────────────────────────

// Any schema created while flag columns were converted to BOOLEAN (older deploys)
// must be migrated back to INTEGER 0/1, since all route SQL writes plain 0/1.
// This is idempotent: it only touches columns that are actually BOOLEAN.
const PG_FLAG_COLS = ['email_verified', 'is_admin', 'is_suspended', 'phone_verified', 'id_verified', 'reminder_sent', 'used', 'read']

async function fixPgBooleanCols() {
  const cols = await all(
    "SELECT table_name, column_name FROM information_schema.columns WHERE data_type = 'boolean' AND column_name = ANY($1::text[])",
    [PG_FLAG_COLS]
  )
  for (const c of cols) {
    await exec(`ALTER TABLE ${c.table_name} ALTER COLUMN ${c.column_name} DROP DEFAULT`)
    await exec(`ALTER TABLE ${c.table_name} ALTER COLUMN ${c.column_name} TYPE INTEGER USING ${c.column_name}::integer`)
    await exec(`ALTER TABLE ${c.table_name} ALTER COLUMN ${c.column_name} SET DEFAULT 0`)
    console.log(`🔧 Migrated ${c.table_name}.${c.column_name} boolean → integer`)
  }
}

async function initSchema() {
  const schema = getSchemaSql()
  await exec(schema)

  // Create indexes
  const indexes = USE_POSTGRES ? postgresIndexes() : sqliteIndexes()
  for (const idx of indexes) {
    try {
      await exec(idx)
    } catch (e) {
      // Index might already exist
      if (!e.message.includes('already exists') && !e.message.includes('duplicate')) {
        console.warn('Index creation warning:', e.message)
      }
    }
  }

  // Run migrations for existing columns
  await runMigrations()

  // Postgres: migrate any BOOLEAN flag columns back to INTEGER (route SQL uses 0/1)
  if (USE_POSTGRES) {
    await fixPgBooleanCols()
  }
}

function sqliteIndexes() {
  return [
    'CREATE INDEX IF NOT EXISTS idx_rides_status_depart ON rides(status, depart_at)',
    'CREATE INDEX IF NOT EXISTS idx_requests_ride ON requests(ride_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_requests_rider ON requests(rider_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_to ON ratings(to_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_ride ON ratings(ride_id)',
    'CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read)',
    'CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(ride_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_routes(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_phone_verify_user ON phone_verifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)',
    'CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id)',
    'CREATE INDEX IF NOT EXISTS idx_blocked_blocked ON blocked_users(blocked_id)',
    'CREATE INDEX IF NOT EXISTS idx_escrow_ride ON escrow_payments(ride_id)',
    'CREATE INDEX IF NOT EXISTS idx_escrow_payer ON escrow_payments(payer_id)',
    'CREATE INDEX IF NOT EXISTS idx_escrow_payee ON escrow_payments(payee_id)',
    'CREATE INDEX IF NOT EXISTS idx_reset_user ON reset_tokens(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_rides_repeat ON rides(repeat_parent_id)',
    'CREATE INDEX IF NOT EXISTS idx_msg_recip ON messages(recipient_id, read)',
    'CREATE INDEX IF NOT EXISTS idx_rides_reminder ON rides(reminder_sent)',
    // Spatial indexes (partial for open rides)
    'CREATE INDEX IF NOT EXISTS idx_rides_from_coords ON rides(from_lat, from_lng) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_to_coords ON rides(to_lat, to_lng) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_depart_status ON rides(depart_at, status) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_vehicle ON rides(vehicle_type) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_price ON rides(price) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_requests_ride_status ON requests(ride_id, status) WHERE status IN (\'pending\', \'accepted\')',
    // Growth indexes
    'CREATE INDEX IF NOT EXISTS idx_follow_followee ON owner_follows(followee_id)',
    'CREATE INDEX IF NOT EXISTS idx_credit_user ON credit_ledger(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_trips_ride ON trips(ride_id)',
    'CREATE INDEX IF NOT EXISTS idx_trip_loc ON trip_locations(trip_id)',
    'CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_alerts(status)',
    'CREATE INDEX IF NOT EXISTS idx_id_verify_user ON id_verifications(user_id, status)',
  ]
}

function postgresIndexes() {
  return [
    'CREATE INDEX IF NOT EXISTS idx_rides_status_depart ON rides(status, depart_at)',
    'CREATE INDEX IF NOT EXISTS idx_requests_ride ON requests(ride_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_requests_rider ON requests(rider_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_to ON ratings(to_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ratings_ride ON ratings(ride_id)',
    'CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read)',
    'CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(ride_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_routes(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_phone_verify_user ON phone_verifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)',
    'CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id)',
    'CREATE INDEX IF NOT EXISTS idx_blocked_blocked ON blocked_users(blocked_id)',
    'CREATE INDEX IF NOT EXISTS idx_escrow_ride ON escrow_payments(ride_id)',
    'CREATE INDEX IF NOT EXISTS idx_escrow_payer ON escrow_payments(payer_id)',
    'CREATE INDEX IF NOT EXISTS idx_escrow_payee ON escrow_payments(payee_id)',
    'CREATE INDEX IF NOT EXISTS idx_reset_user ON reset_tokens(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_rides_repeat ON rides(repeat_parent_id)',
    'CREATE INDEX IF NOT EXISTS idx_msg_recip ON messages(recipient_id, read)',
    'CREATE INDEX IF NOT EXISTS idx_rides_reminder ON rides(reminder_sent)',
    // Spatial indexes (partial for open rides)
    'CREATE INDEX IF NOT EXISTS idx_rides_from_coords ON rides(from_lat, from_lng) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_to_coords ON rides(to_lat, to_lng) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_depart_status ON rides(depart_at, status) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_vehicle ON rides(vehicle_type) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_price ON rides(price) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_requests_ride_status ON requests(ride_id, status) WHERE status IN (\'pending\', \'accepted\')',
    // Growth indexes
    'CREATE INDEX IF NOT EXISTS idx_follow_followee ON owner_follows(followee_id)',
    'CREATE INDEX IF NOT EXISTS idx_credit_user ON credit_ledger(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_trips_ride ON trips(ride_id)',
    'CREATE INDEX IF NOT EXISTS idx_trip_loc ON trip_locations(trip_id)',
    'CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_alerts(status)',
    'CREATE INDEX IF NOT EXISTS idx_id_verify_user ON id_verifications(user_id, status)',
    // PostGIS spatial indexes (for PostGIS-enabled queries)
    'CREATE INDEX IF NOT EXISTS idx_rides_from_geom ON rides USING GIST (ST_MakePoint(from_lng, from_lat)) WHERE status = \'open\'',
    'CREATE INDEX IF NOT EXISTS idx_rides_to_geom ON rides USING GIST (ST_MakePoint(to_lng, to_lat)) WHERE status = \'open\'',
  ]
}

// ─── Lightweight Migrations ──────────────────────────────────────────────────

async function runMigrations() {
  // This function adds missing columns to existing tables
  const migrations = [
    // Users
    { table: 'users', column: 'bio', ddl: USE_POSTGRES ? "TEXT DEFAULT ''" : "TEXT DEFAULT ''" },
    { table: 'users', column: 'avatar', ddl: 'TEXT DEFAULT NULL' },
    { table: 'users', column: 'email_verified', ddl: USE_POSTGRES ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'users', column: 'is_admin', ddl: USE_POSTGRES ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'users', column: 'is_suspended', ddl: USE_POSTGRES ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'users', column: 'phone_verified', ddl: USE_POSTGRES ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'users', column: 'id_verified', ddl: USE_POSTGRES ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'users', column: 'referral_code', ddl: 'TEXT DEFAULT NULL' },
    { table: 'users', column: 'referred_by', ddl: 'INTEGER DEFAULT NULL' },
    { table: 'users', column: 'credit_balance', ddl: USE_POSTGRES ? 'REAL NOT NULL DEFAULT 0' : 'REAL NOT NULL DEFAULT 0' },

    // Rides
    { table: 'rides', column: 'repeat_every', ddl: USE_POSTGRES ? "TEXT DEFAULT 'none'" : "TEXT DEFAULT 'none'" },
    { table: 'rides', column: 'repeat_parent_id', ddl: 'INTEGER DEFAULT NULL' },
    { table: 'rides', column: 'repeat_child_on', ddl: 'DATE DEFAULT NULL' },
    { table: 'rides', column: 'reminder_sent', ddl: USE_POSTGRES ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0' },
    { table: 'rides', column: 'cancel_reason', ddl: 'TEXT DEFAULT NULL' },

    // Requests
    { table: 'requests', column: 'cancel_reason', ddl: 'TEXT DEFAULT NULL' },

    // Messages
    { table: 'messages', column: 'read', ddl: USE_POSTGRES ? 'INTEGER NOT NULL DEFAULT 0' : 'INTEGER NOT NULL DEFAULT 0' },

    // Reset tokens
    { table: 'reset_tokens', column: 'type', ddl: USE_POSTGRES ? "TEXT NOT NULL DEFAULT 'reset'" : "TEXT NOT NULL DEFAULT 'reset'" },

    // Phone verifications
    { table: 'phone_verifications', column: 'attempts', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  ]

  for (const m of migrations) {
    try {
      const cols = await all(
        USE_POSTGRES
          ? `SELECT column_name FROM information_schema.columns WHERE table_name = $1`
          : `PRAGMA table_info(${m.table})`,
        USE_POSTGRES ? [m.table] : []
      )
      const colNames = USE_POSTGRES ? cols.map(c => c.column_name) : cols.map(c => c.name)
      if (!colNames.includes(m.column)) {
        await exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.ddl}`)
        console.log(`Added column ${m.table}.${m.column}`)
      }
    } catch (e) {
      console.warn(`Migration warning for ${m.table}.${m.column}:`, e.message)
    }
  }
}

// Initialize on import
let initPromise = initSchema()

export async function ready() {
  await initPromise
}

// Export the underlying db/pool for advanced use
export { db, pgPool, USE_POSTGRES }