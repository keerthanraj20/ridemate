# RideMate 🚗

A **co-travel web app for India** — not Uber, not Rapido. There are **no drivers** here.

- **Vehicle owners** (car / bike / auto / van) post the trip they are *already* planning to make.
- **Travelers** search for people going to the *same or nearby* destination and request a seat/lift.
- Both travel together and split the cost (or ride free — ₹0 is allowed). Everyone is just a traveler.

## How it works

1. **Register** with name, email & phone. Passwords are `scrypt`-hashed; JWT sessions last 7 days.
2. **Verify your identity** — the app issues a **phone OTP** and an **email verification link** so riders can trust you. Verification makes **trust badges** visible on your profile and in search results.
3. Have a vehicle? → **Offer a Ride**: drop start & end pins on the live map, set time, seats, price per seat (₹0 = free), and optionally mark it as a **recurring** trip (daily / weekdays / weekly) — a scheduler generates each future instance automatically.
4. Need to go somewhere? → **Find a Ride**: pick where you are & where you're going; the app matches trips starting within ~15 km of you and ending near your destination, sorted by total detour distance. Filter by date, vehicle type, max price and repeat schedule.
5. Send a **join request** with seats + message. Seat capacity is enforced atomically — concurrent bookings can never overbook a ride.
6. The owner **accepts / rejects** from *My Rides*. Once accepted, **contact details are revealed** and you can **chat in-app** about pickup points, luggage, etc. — live instant delivery over **WebSockets**.
7. **Notifications** (unread bell) keep you updated on requests, acceptances, declines, cancellations and messages; chat messages arrive instantly, the badge refreshes via light 12s polling.
8. **Save routes** you travel often for one-tap offering or finding.
9. **Safety toolkit**: report abusive users, block users (prevents messaging & ride requests), and delete your account (anonymizes your PII while keeping ride history intact). **Admins** can review reports and suspend accounts.
10. After a completed ride, **rate & review** your co-traveler (1–5 stars); averages build visible trust on profiles and search results.
11. **Ride details** — tap any ride card for a full screen: owner (with **follow** for new-ride alerts), fare-split explainer, group members, **live trip location sharing** (start/stop GPS, only visible to trip participants) and an in-trip **SOS** button that pings every admin instantly.
12. **Growth**: **referral codes** (₹50 wallet credit for both sides), **favorite owners** via follow, a **leaderboard** (week/month/all-time trips), **weekly streaks**, and a tracked **✕ km logged**.
13. **Admin Console** (admins only, from Profile): platform stats, a live **SOS queue**, **ID-verification review** (approve/reject with a note that flips the user's KYC badge), and one-click **CSV exports** (users / rides / payments) plus a daily **DB backup**.
14. **Pre-departure reminders** — the API auto-pings the owner and every confirmed rider 1–3 h before a trip leaves.
15. **Offer flow** upgrades: **round trips** (one form auto-creates the return leg) and a **fare calculator** ("same as car/bike cost per km ÷ seats — no driver fee").
16. **Cancellations** capture a **reason** and show a clear **refund policy** (paid riders refunded in full on pre-departure cancellation). Search gets **filters**: vehicle type, max price, min seats and departure-time windows, and ID verification (see #12) is applied to driver trust badges.

## Tech stack

| Layer      | Tech |
|------------|------|
| Backend    | Node.js + Express 5 (ESM), JWT auth, `express-rate-limit`, `better-sqlite3` (synchronous SQLite) |
| Frontend   | React 19 + Vite 7 + TypeScript + Tailwind CSS v4, mobile-first SPA (430px shell) |
| Maps       | Leaflet + OpenStreetMap tiles (free, no API key) + Nominatim place search |
| Email      | Nodemailer (Gmail SMTP app password; logs to console in dev when unconfigured) |
| SMS        | Provider-agnostic OTP sender — Twilio or Textlocal.in via env vars, or "console" mode for dev |
| Realtime   | WebSockets (`ws`) at `/api/ws` pushing new chat messages to the recipient instantly |
| Payments   | Fare escrow — mock provider by default, pluggable Razorpay (Order API + verified `payment.captured` webhook) |
| Tests      | Node's built-in `node:test` + `supertest` (isolated temp DBs) |
| Deploy     | Render (see `render.yaml`) |

> Note: `react-router-dom` is installed but the active app uses in-file view switching in `App.tsx`.

## API overview

All routes under `/api`. Auth via `Authorization: Bearer <jwt>`.

| Module | Routes |
|---|---|
| `routes/auth.js` | register, login, /me, forgot/reset password, email verify |
| `routes/rides.js` | create, search/matching, join requests, accept/reject, cancel, complete, rate |
| `routes/profile.js` | profile get/put, avatar upload (base64, PNG/JPEG/WebP/GIF only) |
| `routes/notifications.js` | notifications, ride chat (messages), saved routes |
| `routes/safety.js` | phone OTP, reports, blocks, account deletion, admin moderation + stats/CSV exports |
| `routes/payments.js` | fare escrow: pay-hold, refund, release, gateway webhook |
| `routes/growth.js` | referrals & wallet credit, follow owners, leaderboard, personal stats/streaks |
| `routes/trips.js` | live trip location sharing, SOS alerts + admin queue |
| `routes/verifications.js` | ID-document upload + admin approval (KYC badge) |
| `reminders.js` | pre-departure reminder scheduler (owner + riders) |
| `backup.js` | daily SQLite snapshot + CSV exports (CLI: `node server/backup.js`) |

## Run it locally

```bash
npm run setup     # installs root, server and client dependencies
npm run dev       # starts API (http://localhost:4000) + web app (http://localhost:5173)
```

Open **http://localhost:5173**

> Tip: open two browser windows, register two different users — one offers a ride, the other finds & books it.

### Run tests

```bash
npm test          # server tests (isolated temp SQLite, resets between runs)
```

### Environment variables (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `JWT_SECRET` | ✅ | Long random string for signing auth tokens |
| `CLIENT_URL` | ❌ | Base URL for links inside emails (reset/verify) |
| `CORS_ORIGINS` | ❌ | Comma-separated allowed browser origins |
| `MAIL_HOST/PORT/USER/PASS/FROM` | ❌ | SMTP for emails; without them email prints to the console |
| `RM_TRUST_PROXY` | ❌ | `1` to trust a reverse proxy (needed behind nginx/Render) |
| `RM_DB_PATH` | ❌ | Override the SQLite file location (used by tests) |
| `RM_DISABLE_RATE_LIMIT` | ❌ | `1` to skip rate limits (tests only) |
| `RM_DISABLE_LOG` | ❌ | `1` to silence request logging |
| `PAY_PROVIDER` | ❌ | `mock` (default) or `razorpay` |
| `PAY_RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | ❌ | Required only when `PAY_PROVIDER=razorpay` |
| `PAY_RELEASE_GRACE_DAYS` | ❌ | Days after capture before auto-release to owner (default 3) |
| `RM_BACKUP_DIR` | ❌ | Folder for daily DB snapshot + CSV exports (e.g. `server/backups`) |

## Project structure

```
ridemate/
├── server/                 # Express API
│   ├── index.js            # app entry: middleware, rate limits, route mounting, SPA serve
│   ├── db.js               # SQLite schema, indexes, lightweight migrations
│   ├── util.js             # scrypt password hashing, haversine, block helpers
│   ├── mail.js             # nodemailer transport (dev console fallback)
│   ├── notify.js           # in-app notification helper
│   ├── recur.js            # recurring-ride scheduler (hourly)
│   ├── reminders.js        # pre-departure reminder scheduler (every 20 min)
│   ├── backup.js           # DB snapshot + CSV export utilities / scheduler
│   ├── routes/
│   │   ├── auth.js         # register / login / me / password / email verify
│   │   ├── rides.js        # rides CRUD, search/matching, requests, ratings, history, detail
│   │   ├── profile.js      # profile + avatar upload
│   │   ├── notifications.js# notifications, chat, saved routes (WS push on messages)
│   │   ├── safety.js       # phone OTP (email + SMS), reports, blocks, admin moderation + exports
│   │   ├── growth.js       # referrals, wallet credit, follows, leaderboard, stats
│   │   ├── trips.js        # live trip sharing + SOS
│   │   └── verifications.js# ID-document upload + admin KYC review
│   ├── sms.js              # SMS provider abstraction (twilio / textlocal / console)
│   ├── ws.js               # WebSocket hub — live message push to online users
│   └── test/               # node:test + supertest suites
└── client/                 # React SPA
    ├── vite.config.ts      # /api proxy → :4000 (with WS upgrade), @ alias
    └── src/
        ├── main.tsx        # Auth → Toast → Notifications providers → App
        ├── App.tsx         # thin shell: view switch, TopBar/BottomNav, RequestSheet
        ├── ws.js           # auto-reconnecting WebSocket client (event subscription)
        ├── api.js          # fetch wrapper (JWT header, 401 auto-logout)
        ├── AuthContext.jsx       # localStorage session state
        ├── NotificationsContext.jsx  # 12s unread polling
        ├── views/          # Home, Find, Offer, MyRides, Messages, Chat, Saved, History, Auth, Profile, RideDetail, Admin
        ├── components/     # ui.tsx (TopBar/BottomNav/RideCard/RequestSheet), MapPicker.tsx
        └── types.ts, lib.ts # shared types & formatting helpers
```

## Security notes

- Passwords: min 8 chars with letters & numbers, `scrypt`-hashed with per-user salt.
- Suspension is re-checked on **every** authenticated request (bans apply instantly).
- Seat booking uses atomic SQLite writes — no overbooking even under concurrent requests.
- OTP codes: 6 digits, 10-min expiry, max 5 attempts each; sending and verifying are rate-limited. Delivered by **SMS** in production and mirrored to email / console in dev.
- Chat messages push over WebSocket only to the **recipient** of an accepted trip (never broadcast); sockets require a valid JWT.
- Avatars reject SVG (XSS vector) and are capped at ~1 MB.
- Push `.env` **never** — it contains live secrets (JWT secret, SMTP password).

## Known limitations / roadmap

- Search does its proximity match in **memory** over the latest 200 open rides — fine at small scale, not built for thousands.
- Payments run in **mock escrow** mode by default (no real money). Set `PAY_PROVIDER=razorpay` + the `PAY_RAZORPAY_*` keys to go live; a verified `payment.captured` webhook then captures real holds.
- WebSockets require a reverse proxy / host that supports the upgrade (Render supports it; the built-in vite dev proxy has `ws: true`).
- Daily backups are opt-in via `RM_BACKUP_DIR`; running `node server/backup.js` takes an immediate snapshots + exports.
- Live location sharing stores the last 50 points per participant in SQLite — fine for in-trip updates, not a high-frequency telemetry store.