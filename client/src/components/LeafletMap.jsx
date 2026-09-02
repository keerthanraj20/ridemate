import { useEffect, useRef } from 'react'
import L from 'leaflet'

// Leaflet's default marker images break with bundlers — point them at CDN
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const pin = (color) =>
  L.divIcon({
    className: '',
    html: `<div class="pin" style="--pin:${color}"><span class="pin-pulse"></span></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })

export default function LeafletMap({ center = [20.5937, 78.9629], zoom = 5, points = [], onPick, className = '' }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const pickRef = useRef(onPick)
  const pointsRef = useRef(points)
  pointsRef.current = points
  pickRef.current = onPick

  useEffect(() => {
    const map = L.map(elRef.current, { center, zoom, scrollWheelZoom: true, zoomControl: true })
    // CARTO's global CDN with {s} subdomains = 4 parallel connections, much
    // snappier than the single-threaded tile.openstreetmap.org queue
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
      detectRetina: true,
      keepBuffer: 3,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    map.on('click', (e) => pickRef.current && pickRef.current([e.latlng.lat, e.latlng.lng]))
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // fly to new center when it changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.flyTo(center, zoom, { duration: 0.8 })
  }, [JSON.stringify(center), zoom])

  // redraw markers whenever the serialized points change
  const key = JSON.stringify(points)
  useEffect(() => {
    const map = mapRef.current
    const lg = layerRef.current
    if (!map || !lg) return
    lg.clearLayers()
    const pts = pointsRef.current

    pts.forEach((p, i) =>
      L.marker(p.pos, { icon: pin(p.color || (i === 0 ? '#22c55e' : '#ef4444')), riseOnHover: true })
        .bindPopup(p.popup || '')
        .addTo(lg)
    )
    if (pts.length >= 2) {
      L.polyline(
        pts.map((p) => p.pos),
        { color: '#818cf8', weight: 3, dashArray: '6 8', opacity: 0.85 }
      ).addTo(lg)
      map.fitBounds(L.latLngBounds(pts.map((p) => p.pos)).pad(0.35), { animate: true })
    } else if (pts.length === 1) {
      map.flyTo(pts[0].pos, Math.max(map.getZoom(), 13), { duration: 0.6 })
    }
  }, [key])

  return <div ref={elRef} className={`map ${className}`} />
}
