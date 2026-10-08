// Game state machine (ARCHITECTURE.md §3). Pure: no I/O, no timers, no randomness.

import { isGoalReached } from './location'
import type { LocationErrorKind, RoutingErrorKind } from './ports'
import type { Fix, GoalPlan } from './types'

interface Session {
  sessionId: number
}

interface Started extends Session {
  start: Fix
  /** The start fix did not meet the accuracy target (shown as a warning). */
  lowAccuracy: boolean
}

interface Active extends Started {
  plan: GoalPlan
  position: Fix
}

export type GameState =
  | { phase: 'idle' }
  | ({ phase: 'acquiringLocation' } & Session)
  | ({ phase: 'generatingGoal' } & Started)
  | ({ phase: 'playing' } & Active)
  | ({ phase: 'won'; reachedAt: number } & Active)
  | ({ phase: 'locationError'; error: LocationErrorKind } & Session)
  | ({ phase: 'goalGenerationFailed'; attempts: number } & Session)
  | ({ phase: 'routingError'; error: RoutingErrorKind } & Session)

export type GameEvent =
  // Session-creating events carry the NEW session id.
  | { type: 'START'; sessionId: number }
  | { type: 'RETRY'; sessionId: number }
  | { type: 'RESTART'; sessionId: number }
  // Async results carry the session id they belong to; stale ones are dropped.
  | { type: 'START_FIX_SELECTED'; sessionId: number; fix: Fix; lowAccuracy: boolean }
  | { type: 'LOCATION_FAILED'; sessionId: number; error: LocationErrorKind }
  | { type: 'GOAL_READY'; sessionId: number; plan: GoalPlan }
  | { type: 'GOAL_FAILED'; sessionId: number; attempts: number }
  | { type: 'ROUTING_FAILED'; sessionId: number; error: RoutingErrorKind }
  | { type: 'POSITION_UPDATED'; sessionId: number; fix: Fix }

export const INITIAL_GAME_STATE: GameState = { phase: 'idle' }

export interface GameRules {
  goalThresholdM: number
}

/**
 * Creates the reducer. Unlisted (state, event) pairs return the same state object,
 * which also makes React skip re-rendering.
 */
export function createGameReducer(rules: GameRules) {
  return function gameReducer(state: GameState, event: GameEvent): GameState {
    switch (event.type) {
      case 'START':
        return state.phase === 'idle' ? { phase: 'acquiringLocation', sessionId: event.sessionId } : state

      case 'RETRY':
        return state.phase === 'locationError' ||
          state.phase === 'goalGenerationFailed' ||
          state.phase === 'routingError'
          ? { phase: 'acquiringLocation', sessionId: event.sessionId }
          : state

      case 'RESTART':
        return state.phase === 'playing' || state.phase === 'won'
          ? { phase: 'acquiringLocation', sessionId: event.sessionId }
          : state
    }

    // Every remaining event belongs to a session: ignore results from older sessions.
    if (state.phase === 'idle' || state.sessionId !== event.sessionId) return state

    switch (event.type) {
      case 'START_FIX_SELECTED':
        return state.phase === 'acquiringLocation'
          ? {
              phase: 'generatingGoal',
              sessionId: state.sessionId,
              start: event.fix,
              lowAccuracy: event.lowAccuracy,
            }
          : state

      case 'LOCATION_FAILED':
        return state.phase === 'acquiringLocation' || state.phase === 'playing'
          ? { phase: 'locationError', sessionId: state.sessionId, error: event.error }
          : state

      case 'GOAL_READY':
        return state.phase === 'generatingGoal'
          ? { ...state, phase: 'playing', plan: event.plan, position: state.start }
          : state

      case 'GOAL_FAILED':
        return state.phase === 'generatingGoal'
          ? { phase: 'goalGenerationFailed', sessionId: state.sessionId, attempts: event.attempts }
          : state

      case 'ROUTING_FAILED':
        return state.phase === 'generatingGoal'
          ? { phase: 'routingError', sessionId: state.sessionId, error: event.error }
          : state

      case 'POSITION_UPDATED': {
        // `won` is terminal for the session (latch); the goal is never modified here.
        if (state.phase !== 'playing') return state
        if (isGoalReached(event.fix.position, state.plan.goal, rules.goalThresholdM)) {
          return { ...state, phase: 'won', position: event.fix, reachedAt: event.fix.timestamp }
        }
        return { ...state, position: event.fix }
      }
    }
  }
}
