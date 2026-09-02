import { Suspense, lazy } from 'react'

// Leaflet (~150 KB) is code-split away from the main bundle so the
// first page paint stays fast. It loads in the background on demand.
const LeafletMap = lazy(() => import('./LeafletMap.jsx'))

/**
 * points : [{ pos:[lat,lng], popup?, color? }] — markers + route line
 * onPick : ([lat,lng]) => void                 — fired on map click
 */
export default function MapView(props) {
  return (
    <Suspense fallback={<div className={`map skeleton ${props.className || ''}`} />}>
      <LeafletMap {...props} />
    </Suspense>
  )
}
