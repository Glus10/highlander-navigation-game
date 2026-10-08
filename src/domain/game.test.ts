import { describe, expect, it } from 'vitest'
import { LONDON, makeFix, makePlan } from '../test/factories'
import { createGameReducer, INITIAL_GAME_STATE, type GameEvent, type GameState } from './game'
import { destinationPoint } from './geo'

const reducer = createGameReducer({ goalThresholdM: 25 })
const SID = 1
const start = makeFix(LONDON, 20, 100)
const plan = makePlan(LONDON, 500)
const nearGoal = makeFix(destinationPoint(plan.goal, 0, 10), 10, 200)
const farFromGoal = makeFix(destinationPoint(LONDON, 0, 50), 10, 150)

const STATES: Record<GameState['phase'], GameState> = {
  idle: INITIAL_GAME_STATE,
  acquiringLocation: { phase: 'acquiringLocation', sessionId: SID },
  generatingGoal: { phase: 'generatingGoal', sessionId: SID, start, lowAccuracy: false },
  playing: { phase: 'playing', sessionId: SID, start, lowAccuracy: false, plan, position: start },
  won: { phase: 'won', sessionId: SID, start, lowAccuracy: false, plan, position: nearGoal, reachedAt: 200 },
  locationError: { phase: 'locationError', sessionId: SID, error: 'denied' },
  goalGenerationFailed: { phase: 'goalGenerationFailed', sessionId: SID, attempts: 5 },
  routingError: { phase: 'routingError', sessionId: SID, error: 'unavailable' },
}

const EVENTS: Record<GameEvent['type'], GameEvent> = {
  START: { type: 'START', sessionId: 2 },
  RETRY: { type: 'RETRY', sessionId: 2 },
  RESTART: { type: 'RESTART', sessionId: 2 },
  START_FIX_SELECTED: { type: 'START_FIX_SELECTED', sessionId: SID, fix: start, lowAccuracy: true },
  LOCATION_FAILED: { type: 'LOCATION_FAILED', sessionId: SID, error: 'timeout' },
  GOAL_READY: { type: 'GOAL_READY', sessionId: SID, plan },
  GOAL_FAILED: { type: 'GOAL_FAILED', sessionId: SID, attempts: 5 },
  ROUTING_FAILED: { type: 'ROUTING_FAILED', sessionId: SID, error: 'timeout' },
  POSITION_UPDATED: { type: 'POSITION_UPDATED', sessionId: SID, fix: farFromGoal },
}

/** ARCHITECTURE.md §3 — the only allowed transitions. Everything else must be ignored. */
const ALLOWED: Partial<Record<GameState['phase'], Partial<Record<GameEvent['type'], GameState['phase']>>>> = {
  idle: { START: 'acquiringLocation' },
  acquiringLocation: { START_FIX_SELECTED: 'generatingGoal', LOCATION_FAILED: 'locationError' },
  generatingGoal: { GOAL_READY: 'playing', GOAL_FAILED: 'goalGenerationFailed', ROUTING_FAILED: 'routingError' },
  playing: { POSITION_UPDATED: 'playing', LOCATION_FAILED: 'locationError', RESTART: 'acquiringLocation' },
  won: { RESTART: 'acquiringLocation' },
  locationError: { RETRY: 'acquiringLocation' },
  goalGenerationFailed: { RETRY: 'acquiringLocation' },
  routingError: { RETRY: 'acquiringLocation' },
}

describe('gameReducer transition table (U-12)', () => {
  for (const [phase, state] of Object.entries(STATES)) {
    for (const [type, event] of Object.entries(EVENTS)) {
      const expected = ALLOWED[phase as GameState['phase']]?.[type as GameEvent['type']]
      it(`${phase} + ${type} → ${expected ?? 'ignored'}`, () => {
        const next = reducer(state, event)
        if (expected) expect(next.phase).toBe(expected)
        else expect(next).toBe(state)
      })
    }
  }
})

describe('gameReducer behaviour', () => {
  it('starts a session with the provided id and carries start-fix data forward', () => {
    const acquiring = reducer(INITIAL_GAME_STATE, { type: 'START', sessionId: 7 })
    expect(acquiring).toEqual({ phase: 'acquiringLocation', sessionId: 7 })
    const generating = reducer(acquiring, { type: 'START_FIX_SELECTED', sessionId: 7, fix: start, lowAccuracy: true })
    expect(generating).toEqual({ phase: 'generatingGoal', sessionId: 7, start, lowAccuracy: true })
  })

  it('GOAL_READY enters playing with the plan and the start fix as the current position', () => {
    const next = reducer(STATES.generatingGoal, EVENTS.GOAL_READY)
    expect(next).toEqual({ phase: 'playing', sessionId: SID, start, lowAccuracy: false, plan, position: start })
  })

  it('moves playing → won when within the threshold (U-09)', () => {
    const next = reducer(STATES.playing, { type: 'POSITION_UPDATED', sessionId: SID, fix: nearGoal })
    expect(next).toMatchObject({ phase: 'won', position: nearGoal, reachedAt: nearGoal.timestamp })
  })

  it('latches: further positions after winning do not change state (U-09)', () => {
    const won = reducer(STATES.playing, { type: 'POSITION_UPDATED', sessionId: SID, fix: nearGoal })
    expect(reducer(won, { type: 'POSITION_UPDATED', sessionId: SID, fix: farFromGoal })).toBe(won)
    expect(reducer(won, { type: 'POSITION_UPDATED', sessionId: SID, fix: nearGoal })).toBe(won)
  })

  it('keeps the goal immutable while playing (U-10)', () => {
    let state = STATES.playing
    const events: GameEvent[] = [
      EVENTS.POSITION_UPDATED,
      EVENTS.GOAL_READY,
      { type: 'GOAL_READY', sessionId: SID, plan: makePlan(LONDON, 700) },
      EVENTS.START_FIX_SELECTED,
      EVENTS.GOAL_FAILED,
      EVENTS.ROUTING_FAILED,
      EVENTS.START,
      EVENTS.RETRY,
    ]
    for (const event of events) {
      state = reducer(state, event)
      expect(state.phase).toBe('playing')
      if (state.phase === 'playing') expect(state.plan).toBe(plan)
    }
  })

  it('updates the position while far from the goal', () => {
    const next = reducer(STATES.playing, EVENTS.POSITION_UPDATED)
    expect(next).toMatchObject({ phase: 'playing', position: farFromGoal, plan })
  })

  it('ignores events from a stale session in every session state (U-11)', () => {
    const stale: GameEvent[] = [
      { type: 'START_FIX_SELECTED', sessionId: 99, fix: start, lowAccuracy: false },
      { type: 'LOCATION_FAILED', sessionId: 99, error: 'denied' },
      { type: 'GOAL_READY', sessionId: 99, plan },
      { type: 'GOAL_FAILED', sessionId: 99, attempts: 5 },
      { type: 'ROUTING_FAILED', sessionId: 99, error: 'unavailable' },
      { type: 'POSITION_UPDATED', sessionId: 99, fix: nearGoal },
    ]
    for (const state of Object.values(STATES)) {
      for (const event of stale) expect(reducer(state, event)).toBe(state)
    }
  })

  it('RESTART and RETRY open a fresh session with the new id', () => {
    expect(reducer(STATES.won, { type: 'RESTART', sessionId: 5 })).toEqual({ phase: 'acquiringLocation', sessionId: 5 })
    expect(reducer(STATES.routingError, { type: 'RETRY', sessionId: 6 })).toEqual({
      phase: 'acquiringLocation',
      sessionId: 6,
    })
  })
})
