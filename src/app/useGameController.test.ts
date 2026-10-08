import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type GameConfig } from '../domain/config'
import { destinationPoint } from '../domain/geo'
import { RoutingError } from '../domain/ports'
import { createSeededRng } from '../domain/random'
import { DeferredRoutingProvider, FakeLocationProvider } from '../test/fakes'
import { LONDON, makeFix, makeRouteResult } from '../test/factories'
import type { GameServices } from './services'
import { useGameController } from './useGameController'

const CONFIG: GameConfig = DEFAULT_CONFIG

function setup(options: { strict?: boolean } = {}) {
  const location = new FakeLocationProvider()
  const routing = new DeferredRoutingProvider()
  const services: GameServices = { location, routing, rng: createSeededRng(1) }
  const hook = renderHook(() => useGameController(CONFIG, services), {
    wrapper: options.strict ? StrictMode : undefined,
  })
  return { location, routing, hook, state: () => hook.result.current.state }
}

const goodFix = makeFix(LONDON, 20, 1_000)

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useGameController', () => {
  it('runs the happy path: acquiring → generating → playing → won (I-01)', async () => {
    const { location, routing, state } = setup()
    expect(state()).toEqual({ phase: 'acquiringLocation', sessionId: 1 })
    expect(location.activeCount).toBe(1)

    act(() => location.emitFix(goodFix))
    expect(state()).toMatchObject({ phase: 'generatingGoal', start: goodFix, lowAccuracy: false })
    expect(routing.requests).toHaveLength(1)
    expect(routing.requests[0].from).toEqual(LONDON)
    expect(routing.requests[0].mode).toBe('walking')

    const result = makeRouteResult(LONDON, { goalDistanceM: 500 })
    await act(async () => routing.requests[0].resolve(result))
    const playing = state()
    expect(playing).toMatchObject({ phase: 'playing', position: goodFix })
    if (playing.phase !== 'playing') throw new Error('expected playing')
    expect(playing.plan.goal).toEqual(result.snappedTo.location)

    const far = makeFix(destinationPoint(LONDON, 90, 200), 10, 2_000)
    act(() => location.emitFix(far))
    expect(state()).toMatchObject({ phase: 'playing', position: far })

    const atGoal = makeFix(destinationPoint(playing.plan.goal, 0, 10), 10, 3_000)
    act(() => location.emitFix(atGoal))
    expect(state()).toMatchObject({ phase: 'won', reachedAt: 3_000 })
  })

  it('waits for an accurate fix, then falls back to the best coarse fix with a warning (I-02)', async () => {
    const { location, routing, state } = setup()
    const coarse = makeFix(LONDON, 900, 1)
    const lessCoarse = makeFix(LONDON, 250, 2)

    act(() => {
      location.emitFix(coarse)
      location.emitFix(lessCoarse)
    })
    expect(state().phase).toBe('acquiringLocation')
    expect(routing.requests).toHaveLength(0)

    await act(async () => vi.advanceTimersByTimeAsync(CONFIG.startFixWaitMs))
    expect(state()).toMatchObject({ phase: 'generatingGoal', start: lessCoarse, lowAccuracy: true })
    expect(routing.requests).toHaveLength(1)
  })

  it('selects the first fix that arrives after the deadline when none arrived before it', async () => {
    const { location, state } = setup()
    await act(async () => vi.advanceTimersByTimeAsync(CONFIG.startFixWaitMs))
    expect(state().phase).toBe('acquiringLocation')

    const coarse = makeFix(LONDON, 500)
    act(() => location.emitFix(coarse))
    expect(state()).toMatchObject({ phase: 'generatingGoal', start: coarse, lowAccuracy: true })
  })

  it('stops on location denial and starts a fresh session on retry (I-03)', () => {
    const { location, hook, state } = setup()

    act(() => location.emitError({ kind: 'denied' }))
    expect(state()).toEqual({ phase: 'locationError', sessionId: 1, error: 'denied' })
    expect(location.activeCount).toBe(0)

    act(() => hook.result.current.retry())
    expect(state()).toEqual({ phase: 'acquiringLocation', sessionId: 2 })
    expect(location.subscriptions).toHaveLength(2)
    expect(location.activeCount).toBe(1)
  })

  it('handles a provider that reports an error synchronously during subscribe', () => {
    let unsubscribed = false
    const services: GameServices = {
      location: {
        subscribe: (_onFix, onError) => {
          onError({ kind: 'unsupported' })
          return () => {
            unsubscribed = true
          }
        },
      },
      routing: new DeferredRoutingProvider(),
      rng: createSeededRng(1),
    }
    const { result } = renderHook(() => useGameController(CONFIG, services))
    expect(result.current.state).toEqual({ phase: 'locationError', sessionId: 1, error: 'unsupported' })
    expect(unsubscribed).toBe(true)
  })

  it('reports goal-generation failure and routing failure, releasing the location watch', async () => {
    const failing = setup()
    act(() => failing.location.emitFix(goodFix))
    for (let i = 0; i < CONFIG.maxGoalAttempts; i++) {
      await act(async () => failing.routing.requests[i].reject(new RoutingError('noRoute')))
    }
    expect(failing.state()).toEqual({ phase: 'goalGenerationFailed', sessionId: 1, attempts: 5 })
    expect(failing.location.activeCount).toBe(0)

    const down = setup()
    act(() => down.location.emitFix(goodFix))
    await act(async () => down.routing.requests[0].reject(new RoutingError('unavailable')))
    expect(down.state()).toEqual({ phase: 'routingError', sessionId: 1, error: 'unavailable' })
    expect(down.location.activeCount).toBe(0)
  })

  it('applies a position received while the goal was being generated', async () => {
    const { location, routing, state } = setup()
    act(() => location.emitFix(goodFix))
    const moved = makeFix(destinationPoint(LONDON, 0, 30), 10, 1_500)
    act(() => location.emitFix(moved))
    expect(state().phase).toBe('generatingGoal')

    await act(async () => routing.requests[0].resolve(makeRouteResult(LONDON)))
    expect(state()).toMatchObject({ phase: 'playing', position: moved })
  })

  describe('stale results (I-04)', () => {
    it('creates exactly one session under StrictMode double-mounting', () => {
      const { location, state } = setup({ strict: true })
      // The START effect runs twice; the second START is ignored because the game is no longer idle.
      expect(state()).toEqual({ phase: 'acquiringLocation', sessionId: 1 })
      expect(location.activeCount).toBe(1)
    })

    it('ignores a goal result that resolves after its run was aborted', async () => {
      const { location, routing, hook, state } = setup()
      act(() => location.emitFix(goodFix))
      const stale = routing.requests[0]

      hook.unmount()
      expect(stale.signal.aborted).toBe(true)
      await act(async () => stale.resolve(makeRouteResult(LONDON)))
      expect(state().phase).toBe('generatingGoal') // last rendered state; nothing applied after abort
    })

    /** Re-running the session effect (services/config changed) keeps the session id, so only abort/stop guards protect it. */
    function setupWithRerun() {
      const first = { location: new FakeLocationProvider(), routing: new DeferredRoutingProvider() }
      const second = { location: new FakeLocationProvider(), routing: new DeferredRoutingProvider() }
      const toServices = (s: typeof first): GameServices => ({ ...s, rng: createSeededRng(1) })
      const hook = renderHook(({ services }) => useGameController(CONFIG, services), {
        initialProps: { services: toServices(first) },
      })
      const rerun = () => hook.rerender({ services: toServices(second) })
      return { first, second, hook, rerun, state: () => hook.result.current.state }
    }

    it('ignores a late goal result from a run that was re-run with new services', async () => {
      const { first, second, rerun, state } = setupWithRerun()
      act(() => first.location.emitFix(goodFix))
      const stale = first.routing.requests[0]

      rerun()
      expect(stale.signal.aborted).toBe(true)
      expect(first.location.activeCount).toBe(0)
      expect(second.location.activeCount).toBe(1)

      await act(async () => stale.resolve(makeRouteResult(LONDON)))
      expect(state().phase).toBe('generatingGoal')
    })

    it('ignores fixes delivered late to the subscription of a re-run session', () => {
      const { first, second, rerun, state } = setupWithRerun()
      rerun()

      act(() => first.location.emitTo(0, goodFix)) // misbehaving provider calls after unsubscribe
      expect(state().phase).toBe('acquiringLocation')
      expect(first.routing.requests).toHaveLength(0)
      expect(second.routing.requests).toHaveLength(0)
    })

    it('ignores fixes from the previous session after restart', async () => {
      const { location, routing, hook, state } = setup()
      act(() => location.emitFix(goodFix))
      await act(async () => routing.requests[0].resolve(makeRouteResult(LONDON)))
      expect(state().phase).toBe('playing')

      act(() => hook.result.current.restart())
      expect(state()).toEqual({ phase: 'acquiringLocation', sessionId: 2 })
      expect(location.activeCount).toBe(1)

      act(() => location.emitTo(0, makeFix(LONDON, 5, 9_999))) // old session's subscription
      expect(state()).toEqual({ phase: 'acquiringLocation', sessionId: 2 })
      expect(routing.requests).toHaveLength(1)
    })
  })

  it('cleans up on unmount: unsubscribes, aborts and clears timers (I-05)', () => {
    const { location, routing, hook } = setup()
    act(() => location.emitFix(goodFix))
    expect(vi.getTimerCount()).toBe(0) // deadline timer cleared once the start fix was chosen

    hook.unmount()
    expect(location.activeCount).toBe(0)
    expect(routing.requests[0].signal.aborted).toBe(true)
  })

  it('clears the start-fix timer on unmount while still acquiring (I-05)', () => {
    const { location, hook } = setup()
    expect(vi.getTimerCount()).toBe(1)
    hook.unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(location.activeCount).toBe(0)
  })
})
