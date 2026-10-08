import { DISTANCE_EPSILON_M, destinationPoint, haversineM } from './geo'
import type { Rng } from './random'
import type { GoalPlan, LatLng, Route, RouteResult } from './types'

export interface GoalRules {
  minRadiusM: number
  maxRadiusM: number
  maxSnapDistanceM: number
  maxRouteLengthM: number
}

/** Random point in the ring [minM, maxM] around `center`, uniform by area (not biased to the centre). */
export function sampleInRing(center: LatLng, minM: number, maxM: number, rng: Rng): LatLng {
  const radius = Math.sqrt(rng() * (maxM ** 2 - minM ** 2) + minM ** 2)
  const bearing = rng() * 360
  return destinationPoint(center, bearing, radius)
}

/** Shortest candidate by distance (OSRM's primary route is optimal for its weight, not distance). */
export function selectShortestRoute(candidates: readonly Route[]): Route | undefined {
  let best: Route | undefined
  for (const route of candidates) {
    if (!best || route.distanceM < best.distanceM) best = route
  }
  return best
}

export type CandidateRejection = 'noCandidates' | 'snapTooFar' | 'outsideRing' | 'routeTooLong'

export type CandidateValidation = { ok: true; plan: GoalPlan } | { ok: false; reason: CandidateRejection }

/**
 * Validates a routed candidate. The goal is the SNAPPED destination, and the ring is measured
 * from the player's start position, so the final goal is guaranteed to be inside the radius.
 */
export function validateGoalCandidate(
  start: LatLng,
  result: RouteResult,
  rules: GoalRules,
): CandidateValidation {
  const route = selectShortestRoute(result.candidates)
  if (!route) return { ok: false, reason: 'noCandidates' }

  if (result.snappedTo.snapDistanceM > rules.maxSnapDistanceM + DISTANCE_EPSILON_M) {
    return { ok: false, reason: 'snapTooFar' }
  }

  const goal = result.snappedTo.location
  const goalDistanceM = haversineM(start, goal)
  if (
    goalDistanceM < rules.minRadiusM - DISTANCE_EPSILON_M ||
    goalDistanceM > rules.maxRadiusM + DISTANCE_EPSILON_M
  ) {
    return { ok: false, reason: 'outsideRing' }
  }

  if (route.distanceM > rules.maxRouteLengthM + DISTANCE_EPSILON_M) {
    return { ok: false, reason: 'routeTooLong' }
  }

  return { ok: true, plan: { goal, route, routeStart: result.snappedFrom.location } }
}
