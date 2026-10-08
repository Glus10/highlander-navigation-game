import { DISTANCE_EPSILON_M, haversineM } from './geo'
import type { Fix, LatLng } from './types'

export interface StartFixSelection {
  fix: Fix
  /** True when no fix met the accuracy target before the wait deadline. */
  lowAccuracy: boolean
}

/**
 * Chooses the start fix. Returns the first fix meeting `maxAccuracyM`; once the wait deadline
 * has passed, falls back to the most accurate fix seen. Returns null while still waiting.
 */
export function selectStartFix(
  fixes: readonly Fix[],
  maxAccuracyM: number,
  deadlineReached: boolean,
): StartFixSelection | null {
  const good = fixes.find((fix) => fix.accuracyM <= maxAccuracyM)
  if (good) return { fix: good, lowAccuracy: false }
  if (!deadlineReached || fixes.length === 0) return null

  const best = fixes.reduce((a, b) => (b.accuracyM < a.accuracyM ? b : a))
  return { fix: best, lowAccuracy: true }
}

/** Goal reached when the player is within the threshold (inclusive). */
export function isGoalReached(position: LatLng, goal: LatLng, thresholdM: number): boolean {
  return haversineM(position, goal) <= thresholdM + DISTANCE_EPSILON_M
}
