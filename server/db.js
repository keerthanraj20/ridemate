import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.RM_DB_PATH || path.join(__dirname, 'ridemate.db')
export const db = new Database(DB_PATH)
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  phone             TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  bio               TEXT DEFAULT '',
  avatar            TEXT DEFAULT NULL,
  email_verified    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT DEFAULT (datetime('now'))
);

-- password reset tokens
CREATE TABLE IF NOT EXISTS reset_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  token      TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rides (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  vehicle_type  TEXT NOT NULL CHECK (vehicle_type IN ('bike','car','auto','van','other')),
  vehicle_model TEXT,
  from_name     TEXT NOT NULL,
  from_lat      REAL NOT NULL,
  from_lng      REAL NOT NULL,
  to_name       TEXT NOT NULL,
  to_lat        REAL NOT NULL,
  to_lng        REAL NOT NULL,
  depart_at     TEXT NOT NULL,
  seats_total   INTEGER NOT NULL DEFAULT 1,
  price         REAL NOT NULL DEFAULT 0,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','full','cancelled','completed')),
  repeat_every  TEXT CHECK (repeat_every IN ('none','daily','weekly','weekdays')) DEFAULT 'none',
  repeat_parent_id INTEGER DEFAULT NULL REFERENCES rides(id),
  repeat_child_on  TEXT DEFAULT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id    INTEGER NOT NULL REFERENCES rides(id),
  rider_id   INTEGER NOT NULL REFERENCES users(id),
  seats      INTEGER NOT NULL DEFAULT 1,
  message    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
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

-- in-app notifications
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

-- direct messaging between two users (owner <-> rider after acceptance)
CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ride_id      INTEGER NOT NULL REFERENCES rides(id),
  sender_id    INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL,
  read         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

-- saved / favorite routes for one-tap offering & finding
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

CREATE INDEX IF NOT EXISTS idx_rides_status_depart ON rides(status, depart_at);
CREATE INDEX IF NOT EXISTS idx_requests_ride ON requests(ride_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_rider ON requests(rider_id);
CREATE INDEX IF NOT EXISTS idx_ratings_to ON ratings(to_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ride ON ratings(ride_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(ride_id, created_at);
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_routes(user_id);
`)

// ---------- lightweight migrations for pre-existing databases ----------
// New columns added to tables that already exist won't appear via
// CREATE TABLE IF NOT EXISTS, so add them here when missing.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(column)) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
    } catch {
      /* already exists or not applicable */
    }
  }
}
ensureColumn('users', 'bio', "TEXT DEFAULT ''")
ensureColumn('users', 'avatar', "TEXT DEFAULT NULL")
ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('rides', 'repeat_every', "TEXT DEFAULT 'none'")
ensureColumn('rides', 'repeat_parent_id', 'INTEGER DEFAULT NULL')
ensureColumn('rides', 'repeat_child_on', "TEXT DEFAULT NULL")
ensureColumn('messages', 'read', 'INTEGER NOT NULL DEFAULT 0')

db.exec(`CREATE INDEX IF NOT EXISTS idx_reset_user ON reset_tokens(user_id)`)
db.exec(`CREATE INDEX IF NOT EXISTS idx_rides_repeat ON rides(repeat_parent_id)`)

// index on the newly-migrated messages.read column (depends on migration above)
db.exec(`CREATE INDEX IF NOT EXISTS idx_msg_recip ON messages(recipient_id, read)`)
