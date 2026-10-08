// Orchestrates one game session: location → start fix → goal generation → play. See DESIGN.md "Async orchestration".

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { GameConfig } from '../domain/config'
import { createGameReducer, INITIAL_GAME_STATE, type GameState } from '../domain/game'
import { selectStartFix } from '../domain/location'
import type { Fix } from '../domain/types'
import { generateGoal } from '../services/generateGoal'
import type { GameServices } from './services'

export interface GameController {
  state: GameState
  /** Leaves an error state and starts a new session. */
  retry: () => void
  /** Abandons the current game (playing or won) and starts a new session. */
  restart: () => void
}

export function useGameController(config: GameConfig, services: GameServices): GameController {
  const reducer = useMemo(() => createGameReducer({ goalThresholdM: config.goalThresholdM }), [config.goalThresholdM])
  const [state, dispatch] = useReducer(reducer, INITIAL_GAME_STATE)
  const lastSessionId = useRef(0)
  const nextSessionId = useCallback(() => ++lastSessionId.current, [])

  // "System going live": start the first session on mount (assumption A-1).
  useEffect(() => {
    dispatch({ type: 'START', sessionId: nextSessionId() })
  }, [nextSessionId])

  const sessionId = state.phase === 'idle' ? undefined : state.sessionId

  // One run of this effect = one session. Re-runs (new session, unmount, StrictMode) clean up the previous run.
  useEffect(() => {
    if (sessionId === undefined) return

    const abort = new AbortController()
    const fixes: Fix[] = []
    let stage: 'acquiring' | 'generating' | 'playing' | 'stopped' = 'acquiring'
    let deadlineReached = false
    let latestFix: Fix | undefined
    // Assigned once subscribed; a no-op until then so stop() is safe even for synchronous provider callbacks.
    let unsubscribe = () => {}
    // Read through a function: TypeScript doesn't track mutations made inside callbacks.
    const isStopped = () => stage === 'stopped'

    const stop = () => {
      stage = 'stopped'
      clearTimeout(deadlineTimer)
      unsubscribe()
    }

    const startGeneration = (start: Fix) => {
      stage = 'generating'
      clearTimeout(deadlineTimer)
      generateGoal(
        start.position,
        {
          minRadiusM: config.goalMinRadiusM,
          maxRadiusM: config.goalMaxRadiusM,
          maxSnapDistanceM: config.maxSnapDistanceM,
          maxRouteLengthM: config.maxRouteLengthM,
          maxAttempts: config.maxGoalAttempts,
          mode: 'walking',
        },
        services.routing,
        services.rng,
        abort.signal,
      ).then(
        (outcome) => {
          // generateGoal already rejects once aborted; this keeps the no-stale-dispatch invariant local and explicit.
          if (abort.signal.aborted) return
          if (outcome.kind === 'ready') {
            stage = 'playing'
            dispatch({ type: 'GOAL_READY', sessionId, plan: outcome.plan })
            // The player may have moved while the goal was being placed.
            if (latestFix && latestFix !== start) dispatch({ type: 'POSITION_UPDATED', sessionId, fix: latestFix })
          } else if (outcome.kind === 'failed') {
            stop()
            dispatch({ type: 'GOAL_FAILED', sessionId, attempts: outcome.attempts })
          } else {
            stop()
            dispatch({ type: 'ROUTING_FAILED', sessionId, error: outcome.error })
          }
        },
        (error: unknown) => {
          if (abort.signal.aborted) return
          console.error('Unexpected goal generation failure', error)
          stop()
          dispatch({ type: 'ROUTING_FAILED', sessionId, error: 'unavailable' })
        },
      )
    }

    const trySelectStartFix = () => {
      const selection = selectStartFix(fixes, config.startFixMaxAccuracyM, deadlineReached)
      if (!selection) return
      dispatch({ type: 'START_FIX_SELECTED', sessionId, fix: selection.fix, lowAccuracy: selection.lowAccuracy })
      startGeneration(selection.fix)
    }

    const deadlineTimer = setTimeout(() => {
      deadlineReached = true
      if (stage === 'acquiring') trySelectStartFix()
    }, config.startFixWaitMs)

    unsubscribe = services.location.subscribe(
      (fix) => {
        latestFix = fix
        if (stage === 'acquiring') {
          fixes.push(fix)
          trySelectStartFix()
        } else if (stage === 'playing') {
          dispatch({ type: 'POSITION_UPDATED', sessionId, fix })
        }
      },
      (error) => {
        // During goal generation the start fix is already chosen; transient errors are ignored there.
        if (stage === 'acquiring' || stage === 'playing') {
          stop()
          dispatch({ type: 'LOCATION_FAILED', sessionId, error: error.kind })
        }
      },
    )
    if (isStopped()) unsubscribe() // a provider reported an error synchronously

    return () => {
      abort.abort()
      stop()
    }
  }, [sessionId, config, services])

  const retry = useCallback(() => dispatch({ type: 'RETRY', sessionId: nextSessionId() }), [nextSessionId])
  const restart = useCallback(() => dispatch({ type: 'RESTART', sessionId: nextSessionId() }), [nextSessionId])

  return { state, retry, restart }
}
