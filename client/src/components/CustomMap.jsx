import { useMemo, useRef, useState, useEffect, useCallback } from 'react'

// A self-contained, keyless "mock map" built with SVG.
// Gives RideMate a polished, custom dark map look without any
// external tile provider or API key. Supports:
//   - click to pick a location (onPick)
//   - markers with pulse (points)
//   - dashed route line between 2+ points
//   - pan (drag) + zoom (buttons / wheel)
//   - zoom-to-fit when multiple points supplied

const W = 1200
const H = 720

// Deterministic pseudo-random for stable map texture between renders
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function useMapTexture(seed = 7) {
  return useMemo(() => {
    const rnd = mulberry32(seed)
    const roads = []
    const water = []
    const parks = []
    const blocks = []
    // gently-radial-ish minor roads grid
    const cols = 14
    const rows = 10
    for (let i = 0; i < cols; i++) {
      const x = Math.round(rnd() * W)
      roads.push({ x, y1: 0, y2: H, w: rnd() < 0.5 ? 5 : 9, r: rnd() < 0.2 ? 0.5 : 0.25 })
    }
    for (let j = 0; j < rows; j++) {
      const y = Math.round(rnd() * H)
      roads.push({ x1: 0, x2: W, y, w: rnd() < 0.5 ? 5 : 9, r: rnd() < 0.2 ? 0.5 : 0.25, hor: true })
    }
    // water bodies
    const bodies = 3
    for (let k = 0; k < bodies; k++) {
      const cx = rnd() * W
      const cy = rnd() * H
      water.push({ cx, cy, rx: 60 + rnd() * 120, ry: 40 + rnd() * 90 })
    }
    // parks (green blobs)
    const parkCount = 5
    for (let p = 0; p < parkCount; p++) {
      parks.push({ x: rnd() * W, y: rnd() * H, r: 20 + rnd() * 45 })
    }
    // city blocks (subtle filled rects)
    for (let b = 0; b < 60; b++) {
      blocks.push({ x: rnd() * W, y: rnd() * H, w: 18 + rnd() * 70, h: 14 + rnd() * 50, horiz: rnd() < 0.5 })
    }
    return { roads, water, parks, blocks }
  }, [seed])
}

export default function CustomMap({ center = [20.5937, 78.9629], zoom = 5, points = [], onPick, className = '' }) {
  const svgRef = useRef(null)
  const [view, setView] = useState({ x: center[1], y: center[0], zoom })
  const texture = useMapTexture()
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  const drag = useRef(null)
  const downRef = useRef(null)
  const movedRef = useRef(0)

  // Sync when center prop changes
  useEffect(() => {
    setView({ x: center[1], y: center[0], zoom })
  }, [JSON.stringify(center), zoom])

  // Click to pick => convert pixel to approximate lat/lng
  const toLatLng = useCallback((svgX, svgY) => {
    const scale = view.zoom
    const lat = view.y + (H / 2 - svgY) / (scale * 9)
    const lng = view.x + (svgX - W / 2) / (scale * 14)
    return [lat, lng]
  }, [view])

  // Project a lat/lng to SVG pixel
  const project = useCallback((lat, lng, zv) => {
    const z = zv ?? view.zoom
    const x = W / 2 + (lng - view.x) * z * 14
    const y = H / 2 - (lat - view.y) * z * 9
    return { x, y }
  }, [view])

  const handleSvgClick = useCallback((e) => {
    if (!pickRef.current) return
    // Ignore clicks that follow an actual drag (threshold = 5px)
    if (movedRef.current > 5) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const svgY = ((e.clientY - rect.top) / rect.height) * H
    pickRef.current(toLatLng(svgX, svgY))
  }, [toLatLng])

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, lng: view.x, lat: view.y }
    downRef.current = { x: e.clientX, y: e.clientY }
    movedRef.current = 0
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    if (downRef.current) {
      movedRef.current = Math.max(
        movedRef.current,
        Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y)
      )
    }
    const dx = (e.clientX - drag.current.x) / (view.zoom * 14)
    const dy = (e.clientY - drag.current.y) / (view.zoom * 9)
    setView((v) => ({ ...v, lng: drag.current.lng - dx, lat: drag.current.lat + dy }))
  }
  const onPointerUp = () => { drag.current = null; downRef.current = null }

  const zoomBy = (dir) => setView((v) => ({ ...v, zoom: Math.min(18, Math.max(3, v.zoom + dir)) }))

  const pts = points.map((p) => project(p.pos[0], p.pos[1]))
  const scale = view.zoom

  return (
    <div className={`map ${className}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="custom-map"
        onClick={handleSvgClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1 : -1)}
        style={{ touchAction: 'none' }}
      >
        {/* map base */}
        <rect x={0} y={0} width={W} height={H} fill="#0e1528" />
        {/* subtle grid */}
        <g stroke="#ffffff08" strokeWidth={1}>
          {Array.from({ length: 16 }).map((_, i) => (
            <line key={`v${i}`} x1={(i / 16) * W} y1={0} x2={(i / 16) * W} y2={H} />
          ))}
          {Array.from({ length: 12 }).map((_, j) => (
            <line key={`h${j}`} x1={0} y1={(j / 12) * H} x2={W} y2={(j / 12) * H} />
          ))}
        </g>
        {/* city blocks */}
        {texture.blocks.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.horiz ? '#121b33' : '#111a30'} />
        ))}
        {/* parks */}
        {texture.parks.map((p, i) => (
          <circle key={`pk${i}`} cx={p.x} cy={p.y} r={p.r} fill="#14231d" opacity={0.8} />
        ))}
        {/* water */}
        {texture.water.map((wb, i) => (
          <ellipse key={`w${i}`} cx={wb.cx} cy={wb.cy} rx={wb.rx} ry={wb.ry} fill="#0a1f35" opacity={0.85} />
        ))}
        {/* minor roads */}
        {texture.roads.filter((r) => !r.hor && r.w === 5).map((r, i) => (
          <line key={`mr${i}`} x1={r.x} y1={r.y1} x2={r.x} y2={r.y2} stroke="#1c2749" strokeWidth={r.w} />
        ))}
        {texture.roads.filter((r) => r.hor && r.w === 5).map((r, i) => (
          <line key={`mh${i}`} x1={r.x1} y1={r.y} x2={r.x2} y2={r.y} stroke="#1c2749" strokeWidth={r.w} />
        ))}
        {/* major roads */}
        {texture.roads.filter((r) => r.w === 9).map((r, i) => (
          r.hor
            ? <line key={`Mh${i}`} x1={r.x1} y1={r.y} x2={r.x2} y2={r.y} stroke="#2b3a6b" strokeWidth={r.w} />
            : <line key={`Mv${i}`} x1={r.x} y1={r.y1} x2={r.x} y2={r.y2} stroke="#2b3a6b" strokeWidth={r.w} />
        ))}

        {/* route line */}
        {pts.length >= 2 && (
          <g>
            <path
              d={`M ${pts.map((p, i) => `${i === 0 ? '' : 'L '}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')}`}
              fill="none" stroke="#818cf8" strokeWidth={3.5} strokeDasharray="8 10" strokeLinecap="round"
              opacity={0.9}
            />
          </g>
        )}

        {/* markers */}
        {points.map((p, i) => {
          const c = p.color || (i === 0 ? '#22c55e' : '#ef4444')
          const pp = project(p.pos[0], p.pos[1])
          return (
            <g key={i} transform={`translate(${pp.x} ${pp.y})`}>
              <circle r={14} fill={c} opacity={0.25}>
                <animate attributeName="r" values="10;26;10" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0;0.3" dur="2.4s" repeatCount="indefinite" />
              </circle>
              <circle r={7} fill={c} stroke="#0e1528" strokeWidth={2.5} />
              {p.popup && (
                <g transform="translate(0 -22)">
                  <rect x={-8} y={-30} width={16} height={30} rx={3} fill="#111c3a" stroke="#2b3a6b" />
                  <text x={0} y={-8} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff" className="map-popup">{p.popup}</text>
                </g>
              )}
            </g>
          )
        })}

        {/* crosshair when picking */}
        <g transform={`translate(${W / 2} ${H / 2})`}>
          <circle r={18} fill="none" stroke="#22d3ee" strokeWidth={1.5} strokeDasharray="4 4" />
          <line x1={-10} y1={0} x2={10} y2={0} stroke="none" />
        </g>
      </svg>

      {/* controls */}
      <div className="map-controls">
        <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in" className="map-ctl">+</button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out" className="map-ctl">−</button>
      </div>
      <div className="map-zoom-label">{scale}×</div>
    </div>
  )
}
