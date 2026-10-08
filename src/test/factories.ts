// Test data builders shared by unit tests.

import { destinationPoint } from '../domain/geo'
import type { Fix, GoalPlan, LatLng, Route, RouteResult } from '../domain/types'

export const LONDON: LatLng = { lat: 51.508, lng: -0.1281 }

export function makeFix(position: LatLng, accuracyM = 10, timestamp = 1_000): Fix {
  return { position, accuracyM, timestamp }
}

export function makeRoute(distanceM: number, geometry: LatLng[] = []): Route {
  return { distanceM, durationS: distanceM / 1.4, geometry }
}

/** A route result whose snapped goal is `goalDistanceM` east of `start`. */
export function makeRouteResult(
  start: LatLng,
  {
    goalDistanceM = 500,
    snapDistanceM = 10,
    routeDistancesM = [700],
  }: { goalDistanceM?: number; snapDistanceM?: number; routeDistancesM?: number[] } = {},
): RouteResult {
  return {
    candidates: routeDistancesM.map((d) => makeRoute(d)),
    snappedFrom: { location: start, snapDistanceM: 3 },
    snappedTo: { location: destinationPoint(start, 90, goalDistanceM), snapDistanceM },
  }
}

export function makePlan(start: LatLng, goalDistanceM = 500): GoalPlan {
  return { goal: destinationPoint(start, 90, goalDistanceM), route: makeRoute(700), routeStart: start }
}
