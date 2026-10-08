import type { LatLng } from './types'

/** IUGG mean Earth radius in metres. */
export const EARTH_RADIUS_M = 6_371_008.8

/**
 * Tolerance for inclusive distance comparisons, so a point generated at exactly N metres
 * is not rejected because of floating-point round-trip error.
 */
export const DISTANCE_EPSILON_M = 1e-6

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Point reached by travelling `distanceM` from `origin` on initial bearing `bearingDeg` (0 = north). */
export function destinationPoint(origin: LatLng, bearingDeg: number, distanceM: number): LatLng {
  const angular = distanceM / EARTH_RADIUS_M
  const bearing = toRad(bearingDeg)
  const lat1 = toRad(origin.lat)
  const lng1 = toRad(origin.lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    )

  // Normalise longitude to [-180, 180).
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 }
}
