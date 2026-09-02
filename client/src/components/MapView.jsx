import { Suspense, lazy } from 'react'

// The self-contained custom map (SVG) is code-split so the initial
// paint stays snappy; it loads on demand when a map is shown.
const CustomMap = lazy(() => import('./CustomMap.jsx'))

/**
 * points : [{ pos:[lat,lng], popup?, color? }] — markers + route line
 * onPick : ([lat,lng]) => void                 — fired on map click
 */
export default function MapView(props) {
  return (
    <Suspense fallback={<div className={`map skeleton ${props.className || ''}`} />}>
      <CustomMap {...props} />
    </Suspense>
  )
}
