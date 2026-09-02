import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Whole-India framing
const INDIA_CENTER = [22.9734, 78.6569]
const INDIA_ZOOM = 5
// Keep the view on the Indian subcontinent (SW .. NE corners)
export const INDIA_BOUNDS = [
  [5.9, 67.9],
  [36.2, 98.0],
]

function dotIcon(color, size = 16) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 6px #000a;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Reusable OpenStreetMap map that always shows the whole of India.
 *
 * props:
 *  - className   extra classes for sizing (e.g. "center-map")
 *  - points      [{ pos:[lat,lng], popup?:string, color?:string }]
 *  - onPick      (latlng) => void — fired when the user taps/clicks the map
 *  - interactive disable scrolling/dragging (decorative use, e.g. Landing)
 */
export default function OSMMap({ className = '', points = [], onPick, interactive = true }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: INDIA_CENTER,
      zoom: INDIA_ZOOM,
      minZoom: 4.2,
      maxBounds: INDIA_BOUNDS,
      maxBoundsViscosity: 1,
      scrollWheelZoom: interactive,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      zoomControl: interactive,
      attributionControl: true,
    })
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    map.on('click', (e) => {
      if (onPickRef.current) onPickRef.current([e.latlng.lat, e.latlng.lng])
    })

    return () => {
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  // always (re)frame the whole country; when a point is chosen, keep country view
  useEffect(() => {
    mapRef.current?.setView(INDIA_CENTER, INDIA_ZOOM)
  }, [])

  // markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (layerRef.current) layerRef.current.clearLayers()
    const layer = L.layerGroup()
    layerRef.current = layer
    for (const p of points) {
      if (!Array.isArray(p.pos) || p.pos.length < 2) continue
      const m = L.marker([p.pos[0], p.pos[1]], { icon: dotIcon(p.color || '#6366f1') })
      if (p.popup) m.bindPopup(`<div class="map-popup">${p.popup}</div>`)
      layer.addLayer(m)
    }
    layer.addTo(map)
  }, [points])

  // re-measure after mount / container resize
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [className])

  return <div ref={containerRef} className={`osmap ${className}`} />
}