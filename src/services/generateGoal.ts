// Goal generation: ring → snap (via the route request) → validate → retry. See DECISIONS.md D3a.

import { sampleInRing, validateGoalCandidate, type CandidateRejection, type GoalRules } from '../domain/goal'
import { RoutingError, type RoutingErrorKind, type RoutingProvider } from '../domain/ports'
import type { Rng } from '../domain/random'
import type { GoalPlan, LatLng, TravelMode } from '../domain/types'

export interface GenerateGoalOptions extends GoalRules {
  maxAttempts: number
  mode: TravelMode
}

export type GoalOutcome =
  | { kind: 'ready'; plan: GoalPlan; attempts: number }
  /** No valid candidate within maxAttempts; `rejections` explains each attempt. */
  | { kind: 'failed'; attempts: number; rejections: Array<CandidateRejection | 'noRoute'> }
  /** The provider itself failed; trying more candidates would not help. */
  | { kind: 'routingFailed'; error: RoutingErrorKind; attempts: number }

/**
 * Resolves with an outcome; rejects only on abort (AbortError) or a non-routing bug.
 * One provider request per attempt.
 */
export async function generateGoal(
  start: LatLng,
  options: GenerateGoalOptions,
  routing: RoutingProvider,
  rng: Rng,
  signal: AbortSignal,
): Promise<GoalOutcome> {
  const rejections: Array<CandidateRejection | 'noRoute'> = []

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    signal.throwIfAborted()
    const candidate = sampleInRing(start, options.minRadiusM, options.maxRadiusM, rng)

    let result
    try {
      result = await routing.route(start, candidate, options.mode, signal)
    } catch (error) {
      if (error instanceof RoutingError) {
        if (error.kind === 'noRoute') {
          rejections.push('noRoute')
          continue
        }
        return { kind: 'routingFailed', error: error.kind, attempts: attempt }
      }
      throw error
    }
    signal.throwIfAborted()

    const validation = validateGoalCandidate(start, result, options)
    if (validation.ok) return { kind: 'ready', plan: validation.plan, attempts: attempt }
    rejections.push(validation.reason)
  }

  return { kind: 'failed', attempts: options.maxAttempts, rejections }
}
