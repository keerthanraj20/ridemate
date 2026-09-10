import { Router } from 'express'
import rateLimit from 'express-rate-limit'

const router = Router()

// ── Geocoder selection ──────────────────────────────────────────────────────
// GEOCODER = "nominatim" (free, no key — default) | "google" | "mapmyindia"
// The local Hyderabad dictionary is ALWAYS checked first (instant, offline-safe),
// then the active provider. If the selected provider's key is missing we fall
// back to Nominatim so the app still works.
const GEOCODER = process.env.GEOCODER || 'nominatim'

function geocoderAvailable(name) {
  if (name === 'google') return Boolean(process.env.GOOGLE_MAPS_API_KEY)
  if (name === 'mapmyindia') return Boolean(process.env.MAPMYINDIA_API_KEY)
  return true
}

function activeProvider() {
  if (GEOCODER !== 'nominatim' && geocoderAvailable(GEOCODER)) return GEOCODER
  return 'nominatim'
}

// Covers all of India (and a buffer for cross-border routes)
const INDIA_VIEWBOX = '68,37,98,6'
const INDIA_BOUNDS = { south: 6.7, west: 68.0, north: 37.1, east: 97.4 }

// Local dictionary of high-traffic places so the most common searches resolve
// instantly and never depend on Nominatim availability.
const LOCAL_PLACES = [
  // Hyderabad metro — launch market
  { name: 'Madhapur', aliases: ['madhapur'], lat: 17.4409, lng: 78.3916, region: 'Hyderabad, Telangana' },
  { name: 'Gachibowli', aliases: ['gachibowli'], lat: 17.4436, lng: 78.3520, region: 'Hyderabad, Telangana' },
  { name: 'HITEC City, Hyderabad', aliases: ['hitec', 'hitech', 'hitec city', 'hitech city'], lat: 17.4439, lng: 78.3710, region: 'Hyderabad, Telangana' },
  { name: 'Financial District, Hyderabad', aliases: ['financial district', 'fin district'], lat: 17.4076, lng: 78.3120, region: 'Hyderabad, Telangana' },
  { name: 'Jubilee Hills, Hyderabad', aliases: ['jubilee hills', 'jubilee'], lat: 17.4318, lng: 78.4065, region: 'Hyderabad, Telangana' },
  { name: 'Banjara Hills, Hyderabad', aliases: ['banjara hills', 'banjara'], lat: 17.4021, lng: 78.4380, region: 'Hyderabad, Telangana' },
  { name: 'Kukatpally, Hyderabad', aliases: ['kukatpally'], lat: 17.4849, lng: 78.4125, region: 'Hyderabad, Telangana' },
  { name: 'Miyapur, Hyderabad', aliases: ['miyapur'], lat: 17.4962, lng: 78.3625, region: 'Hyderabad, Telangana' },
  { name: 'Begumpet, Hyderabad', aliases: ['begumpet'], lat: 17.4447, lng: 78.4723, region: 'Hyderabad, Telangana' },
  { name: 'Secunderabad', aliases: ['secunderabad'], lat: 17.4397, lng: 78.4983, region: 'Hyderabad, Telangana' },
  { name: 'Uppal, Hyderabad', aliases: ['uppal'], lat: 17.4057, lng: 78.5654, region: 'Hyderabad, Telangana' },
  { name: 'Kondapur, Hyderabad', aliases: ['kondapur'], lat: 17.4662, lng: 78.3178, region: 'Hyderabad, Telangana' },
  { name: 'Manikonda, Hyderabad', aliases: ['manikonda'], lat: 17.3916, lng: 78.3692, region: 'Hyderabad, Telangana' },
  { name: 'Ameerpet, Hyderabad', aliases: ['ameerpet'], lat: 17.4375, lng: 78.4430, region: 'Hyderabad, Telangana' },
  { name: 'Dilsukhnagar, Hyderabad', aliases: ['dilsukhnagar', 'dilu'], lat: 17.3686, lng: 78.5250, region: 'Hyderabad, Telangana' },
  { name: 'Shamshabad Airport', aliases: ['shamshabad', 'airport', 'hyderabad airport', 'rgia'], lat: 17.2403, lng: 78.4294, region: 'Hyderabad, Telangana' },
  { name: 'Hyderabad', aliases: ['hyderabad', 'hyd'], lat: 17.3850, lng: 78.4867, region: 'Telangana' },
  // Other major cities
  { name: 'Bengaluru', aliases: ['bengaluru', 'bangalore', 'blr'], lat: 12.9716, lng: 77.5946, region: 'Karnataka' },
  { name: 'Mumbai', aliases: ['mumbai', 'bombay'], lat: 19.0760, lng: 72.8777, region: 'Maharashtra' },
  { name: 'Delhi', aliases: ['delhi', 'new delhi'], lat: 28.7041, lng: 77.1025, region: 'Delhi NCR' },
  { name: 'Chennai', aliases: ['chennai', 'madras'], lat: 13.0827, lng: 80.2707, region: 'Tamil Nadu' },
  { name: 'Kolkata', aliases: ['kolkata', 'calcutta'], lat: 22.5726, lng: 88.3639, region: 'West Bengal' },
  { name: 'Pune', aliases: ['pune'], lat: 18.5204, lng: 73.8567, region: 'Maharashtra' },
  { name: 'Vijayawada', aliases: ['vijayawada'], lat: 16.5062, lng: 80.6480, region: 'Andhra Pradesh' },
  { name: 'Warangal', aliases: ['warangal'], lat: 17.9689, lng: 79.5941, region: 'Telangana' },
  { name: 'Nizamabad', aliases: ['nizamabad'], lat: 18.6725, lng: 78.0941, region: 'Telangana' },
  { name: 'Karimnagar', aliases: ['karimnagar'], lat: 18.4387, lng: 79.1288, region: 'Telangana' },
  { name: 'Visakhapatnam', aliases: ['visakhapatnam', 'vizag'], lat: 17.6868, lng: 83.2185, region: 'Andhra Pradesh' },
  { name: 'Nagpur', aliases: ['nagpur'], lat: 21.1458, lng: 79.0882, region: 'Maharashtra' },
  { name: 'Jaipur', aliases: ['jaipur'], lat: 26.9124, lng: 75.7873, region: 'Rajasthan' },
  { name: 'Ahmedabad', aliases: ['ahmedabad'], lat: 23.0225, lng: 72.5714, region: 'Gujarat' },
]

function localMatch(q) {
  const needle = String(q).toLowerCase().trim()
  if (!needle) return []
  return LOCAL_PLACES.filter(
    (p) => p.aliases.some((a) => a === needle || a.includes(needle) || needle.includes(a))
  ).map((p) => ({
    name: p.name,
    display_name: `${p.name}, ${p.region}, India`,
    lat: p.lat,
    lng: p.lng,
    region: `${p.region}, India`,
    type: 'city',
  }))
}

// ── Google Places / Geocoding resolver ─────────────────────────────────────
// Uses the Places Autocomplete endpoint for text search + Geocoding for the
// picked place's coordinates + Reverse Geocoding for lat/lng → name.
async function googleGeocode(q, limit) {
  const key = process.env.GOOGLE_MAPS_API_KEY
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', q)
  url.searchParams.set('key', key)
  url.searchParams.set('components', 'country:IN')
  url.searchParams.set('types', 'geocode')
  url.searchParams.set('sessiontoken', 'saathyaan-static')
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  if (data.status !== 'OK') return []

  const out = []
  for (const p of (data.predictions || []).slice(0, limit)) {
    const geo = await googlePlaceDetails(p.place_id)
    if (!geo) continue
    out.push({
      name: formatName(p.description || p.structured_formatting?.main_text || ''),
      display_name: p.description || '',
      lat: geo.lat,
      lng: geo.lng,
      region: p.structured_formatting?.secondary_text || '',
      type: 'place',
    })
  }
  return out
}

// Get lat/lng for a Google place_id via the Place Details (fields=geometry).
async function googlePlaceDetails(placeId) {
  const key = process.env.GOOGLE_MAPS_API_KEY
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('key', key)
  url.searchParams.set('fields', 'geometry')
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const loc = data?.result?.geometry?.location
  return loc ? { lat: loc.lat, lng: loc.lng } : null
}

async function googleReverse(lat, lng) {
  const key = process.env.GOOGLE_MAPS_API_KEY
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('latlng', `${lat},${lng}`)
  url.searchParams.set('key', key)
  url.searchParams.set('result_type', 'locality|sublocality|route|street_address')
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const r = data?.results?.[0]
  if (!r) return null
  const addr = r.address_components || []
  const region = [addr.find((c) => c.types.includes('locality'))?.long_name,
                  addr.find((c) => c.types.includes('administrative_area_level_1'))?.long_name]
    .filter(Boolean).join(', ')
  return {
    name: formatName(r.formatted_address || ''),
    display_name: r.formatted_address || '',
    region: region || '',
    source: 'remote',
  }
}

// ── MapMyIndia (India-native) resolver ──────────────────────────────────────
async function mapmyindiaGeocode(q, limit) {
  const key = process.env.MAPMYINDIA_API_KEY
  const url = new URL('https://atlas.mapmyindia.com/api/places/search/json')
  url.searchParams.set('query', q)
  url.searchParams.set('region', 'IND')
  url.searchParams.set('pod', 'industrial-hub,metrostation,neighborhood,locality,tehsil,city,village,pincode')
  url.searchParams.set('pageSize', String(limit))
  const res = await fetch(url, { headers: { Authorization: key } })
  if (!res.ok) return []
  const data = await res.json()
  return (data?.suggestedLocations || []).slice(0, limit).map((r) => ({
    name: formatName(r.placeName || r.placeAddress || ''),
    display_name: r.placeAddress || r.placeName || '',
    lat: r.latitude,
    lng: r.longitude,
    region: r.placeAddress || '',
    type: 'place',
  }))
}

async function mapmyindiaReverse(lat, lng) {
  const key = process.env.MAPMYINDIA_API_KEY
  const url = new URL('https://atlas.mapmyindia.com/api/places/revgeocode/json')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lng', String(lng))
  const res = await fetch(url, { headers: { Authorization: key } })
  if (!res.ok) return null
  const data = await res.json()
  const r = data?.results?.[0]
  if (!r) return null
  return {
    name: formatName(r.formatted_address || r.address || ''),
    display_name: r.formatted_address || r.address || '',
    region: [r.city, r.state].filter(Boolean).join(', ') || '',
    source: 'remote',
  }
}

// Use the free geocoding.nominatim.org (no key). Rate-limit to protect it.
const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many location searches, try again shortly' },
})

function inIndia(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= INDIA_BOUNDS.south && lat <= INDIA_BOUNDS.north &&
    lng >= INDIA_BOUNDS.west && lng <= INDIA_BOUNDS.east
  )
}

// Geocode a text query → list of {name, lat, lng, country, region}
// Checks the local dictionary first (instant, offline-safe), then falls back
// to Nominatim server-side with an India viewbox + country filter.
router.get('/geocode', geocodeLimiter, async (req, res) => {
  const q = String(req.query.q || '').trim()
  const limit = Math.min(8, Math.max(1, Number(req.query.limit) || 5))
  if (!q) return res.status(400).json({ error: 'Missing q' })

  const local = localMatch(q)
  if (local.length > 0) {
    const merged = mergeLocalAndRemote(local, [])
    return res.json({ results: merged.slice(0, limit), source: 'local' })
  }

  try {
    const provider = activeProvider()

    let remote = []
    if (provider === 'google') {
      remote = await googleGeocode(q, Math.min(limit, 5)) || []
    } else if (provider === 'mapmyindia') {
      remote = await mapmyindiaGeocode(q, Math.min(limit, 5)) || []
    } else {
      remote = await nominatimGeocode(q, Math.min(limit, 5)) || []
    }

    // Provider returned nothing → fall back to the local dictionary only
    if (remote.length > 0) {
      const merged = mergeLocalAndRemote(localMatch(q), remote)
      res.json({ results: merged.slice(0, limit), source: provider === 'nominatim' ? 'remote' : provider })
    } else {
      res.json({ results: localMatch(q).slice(0, limit), source: 'local' })
    }
  } catch (err) {
    // Provider unreachable — fall back to the local dictionary only
    res.json({ results: localMatch(q).slice(0, limit), source: 'local' })
  }
})

// Geocode via the free Nominatim service (server-side, India-biased).
async function nominatimGeocode(q, limit) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('q', q)
  url.searchParams.set('countrycodes', 'in')
  url.searchParams.set('viewbox', INDIA_VIEWBOX)
  url.searchParams.set('bounded', '0') // search whole country but prefer the viewbox
  url.searchParams.set('addressdetails', '1')

  const res2 = await fetch(url, {
    headers: {
      // Nominatim blocks non-browser UAs; use a standard browser UA (server-side
      // it still carries our rate limiting + country bias).
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en',
    },
  })
  if (!res2.ok) return []

  const rows = await res2.json()
  const remote = []
  for (const r of rows || []) {
    const lat = Number(r.lat)
    const lng = Number(r.lon)
    if (!inIndia(lat, lng)) continue
    const addr = r.address || {}
    const region = [addr.city, addr.state, addr.country].filter(Boolean).join(', ')
    remote.push({
      name: formatName(r.display_name || region),
      display_name: r.display_name || '',
      lat,
      lng,
      region: region || '',
      type: r.type || 'place',
    })
  }
  return remote
}

// Dedupe local + remote results by distance (< 1km considered the same place).
function mergeLocalAndRemote(local, remote) {
  const out = []
  const seen = []
  for (const p of [...local, ...remote]) {
    const dup = seen.some(
      (s) => distanceKm(s.lat, s.lng, p.lat, p.lng) < 1
    )
    if (!dup) {
      seen.push(p)
      out.push(p)
    }
  }
  return out
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Shorten a long OSM display_name to a friendly 2–3 part label.
function formatName(displayName) {
  const parts = String(displayName).split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length <= 3) return parts.join(', ')
  return parts.slice(0, 3).join(', ')
}

// Reverse geocode lat/lng → friendly place name (Nominatim, India-biased)
const reverseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many location lookups, try again shortly' },
})

router.get('/geocode/reverse', reverseLimiter, async (req, res) => {
  const lat = Number.parseFloat(String(req.query.lat))
  const lng = Number.parseFloat(String(req.query.lng))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inIndia(lat, lng)) {
    return res.status(400).json({ error: 'Coordinates are outside India' })
  }

  // Check the local dictionary first (~1.5km radius)
  const local = LOCAL_PLACES
    .map((p) => ({ ...p, d: distanceKm(lat, lng, p.lat, p.lng) }))
    .filter((p) => p.d < 1.5)
    .sort((a, b) => a.d - b.d)
  if (local.length > 0) {
    const p = local[0]
    return res.json({
      name: p.name,
      display_name: `${p.name}, ${p.region}, India`,
      lat,
      lng,
      region: `${p.region}, India`,
      source: 'local',
    })
  }

  try {
    const provider = activeProvider()

    let result = null
    if (provider === 'google') result = await googleReverse(lat, lng)
    else if (provider === 'mapmyindia') result = await mapmyindiaReverse(lat, lng)
    else result = await nominatimReverse(lat, lng)

    if (result) return res.json({ ...result, lat, lng })

    return res.json({ name: `My location (${lat.toFixed(3)}, ${lng.toFixed(3)})`, lat, lng, source: 'local' })
  } catch {
    res.json({ name: `My location (${lat.toFixed(3)}, ${lng.toFixed(3)})`, lat, lng, source: 'local' })
  }
})

// Reverse geocode via Nominatim (India-biased).
async function nominatimReverse(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '14')

  const res2 = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en',
    },
  })
  if (!res2.ok) return null
  const data = await res2.json()
  if (!data.display_name) return null
  return {
    name: formatName(data.display_name),
    display_name: data.display_name || '',
    region: data.address ? [data.address.city, data.address.state].filter(Boolean).join(', ') : '',
    source: 'remote',
  }
}

export default router
