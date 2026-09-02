# RideMate 🚗

A **co-travel web app** — not Uber, not Rapido. There are **no drivers** here.

- **Vehicle owners** (car / bike / auto / van) post the trip they are *already* planning to make.
- **Travelers on foot** search for people going to the *same or nearby* destination and request a seat/lift.
- Both travel together, split the cost (or ride free). Everyone is just a traveler.

## How it works

1. **Register** with name, email & phone. Add a short bio to unlock **trust badges** on your profile.
2. Have a vehicle? → **Offer a Ride**: pick start & end points on the live map, set time, seats, price per seat (₹0 = free), and optionally mark it as a **recurring** trip (daily / weekdays / weekly).
3. Need to go somewhere? → **Find a Ride**: pick where you are & where you want to go; the app matches trips starting near you and ending near your destination (sorted by detour distance). Add filters (vehicle type, max price, schedule) and view results as a **list or on the map**.
4. Send a join request with number of seats + message.
5. The owner **accepts/rejects** from *My Rides*. Once accepted, **contact info is revealed** and you can **chat in-app** (Messages).
6. **Notifications** keep you updated on requests, acceptances, declines, cancellations and messages — with an unread bell in the top bar.
7. **Save routes** you travel often for one-tap offering or finding.
8. After a completed ride, **rate & review** your co-traveler; ratings build visible trust on profiles and in search results.

## Tech

| Layer   | Tech |
|---------|------|
| Backend | Node.js + Express 5, JWT auth, built-in `node:sqlite` database |
| Frontend| React 19 + Vite + React Router 7 |
| Maps    | Leaflet + OpenStreetMap tiles (free, no API key) + Nominatim place search |

## Run it

```bash
npm run setup     # installs root, server and client dependencies
npm run dev       # starts API (http://localhost:4000) + web app (http://localhost:5173)
```

Open **http://localhost:5173**

> Tip: open two browser windows, register two different users — one offers a ride, the other finds & books it.

## Project structure

```
ridemate/
├── server/            # Express API
│   ├── index.js       # app entry, routes mounting
│   ├── db.js          # SQLite schema + connection
│   ├── util.js        # password hashing, haversine distance
│   └── routes/
│       ├── auth.js    # register / login / me
│       └── rides.js   # rides CRUD, search/matching, join requests
└── client/            # React SPA
    └── src/
        ├── pages/     # Auth, FindRide, OfferRide, MyRides
        └── components/# MapView, LocationPicker, Header
```
