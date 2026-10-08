import { describe, expect, it, vi } from 'vitest'
import { haversineM } from '../domain/geo'
import { RoutingError, type RoutingProvider } from '../domain/ports'
import { createSeededRng } from '../domain/random'
import type { RouteResult } from '../domain/types'
import { LONDON, makeRouteResult } from '../test/factories'
import { generateGoal, type GenerateGoalOptions } from './generateGoal'

const OPTIONS: GenerateGoalOptions = {
  minRadiusM: 300,
  maxRadiusM: 800,
  maxSnapDistanceM: 150,
  maxRouteLengthM: 1_600,
  maxAttempts: 5,
  mode: 'walking',
}

/** Fake provider that replays one scripted response (result or error) per call. */
function scriptedProvider(script: Array<RouteResult | Error>) {
  const route = vi.fn<RoutingProvider['route']>(async () => {
    const next = script.shift()
    if (!next) throw new Error('script exhausted')
    if (next instanceof Error) throw next
    return next
  })
  return { route }
}

const run = (provider: RoutingProvider, signal = new AbortController().signal) =>
  generateGoal(LONDON, OPTIONS, provider, createSeededRng(1), signal)

describe('generateGoal', () => {
  it('returns the first valid candidate, using the snapped goal (U-14)', async () => {
    const valid = makeRouteResult(LONDON, { goalDistanceM: 550 })
    const provider = scriptedProvider([makeRouteResult(LONDON, { snapDistanceM: 400 }), valid])

    const outcome = await run(provider)

    expect(outcome).toEqual({
      kind: 'ready',
      attempts: 2,
      plan: { goal: valid.snappedTo.location, route: valid.candidates[0], routeStart: valid.snappedFrom.location },
    })
    expect(provider.route).toHaveBeenCalledTimes(2)
  })

  it('routes from the start to a candidate inside the ring, in walking mode, with the signal', async () => {
    const provider = scriptedProvider([makeRouteResult(LONDON)])
    const controller = new AbortController()
    await run(provider, controller.signal)

    const [from, to, mode, signal] = provider.route.mock.calls[0]
    expect(from).toEqual(LONDON)
    expect(haversineM(LONDON, to)).toBeGreaterThanOrEqual(300 - 1e-6)
    expect(haversineM(LONDON, to)).toBeLessThanOrEqual(800 + 1e-6)
    expect(mode).toBe('walking')
    expect(signal).toBe(controller.signal)
  })

  it('fails after exactly maxAttempts rejected candidates (U-15)', async () => {
    const provider = scriptedProvider([
      new RoutingError('noRoute'),
      makeRouteResult(LONDON, { snapDistanceM: 400 }),
      makeRouteResult(LONDON, { goalDistanceM: 900 }),
      makeRouteResult(LONDON, { routeDistancesM: [2_000] }),
      new RoutingError('noRoute'),
    ])

    const outcome = await run(provider)

    expect(outcome).toEqual({
      kind: 'failed',
      attempts: 5,
      rejections: ['noRoute', 'snapTooFar', 'outsideRing', 'routeTooLong', 'noRoute'],
    })
    expect(provider.route).toHaveBeenCalledTimes(5)
  })

  it.each(['unavailable', 'timeout', 'rateLimited', 'invalidInput'] as const)(
    'stops immediately when the provider fails with %s (U-16)',
    async (kind) => {
      const provider = scriptedProvider([new RoutingError(kind), makeRouteResult(LONDON)])
      expect(await run(provider)).toEqual({ kind: 'routingFailed', error: kind, attempts: 1 })
      expect(provider.route).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects without calling the provider when already aborted (U-17)', async () => {
    const provider = scriptedProvider([makeRouteResult(LONDON)])
    const controller = new AbortController()
    controller.abort()

    await expect(run(provider, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(provider.route).not.toHaveBeenCalled()
  })

  it('stops and rejects when aborted while a request is in flight (U-17)', async () => {
    const controller = new AbortController()
    const provider = {
      route: vi.fn<RoutingProvider['route']>(async () => {
        controller.abort()
        return makeRouteResult(LONDON, { snapDistanceM: 400 }) // invalid, so a retry would follow
      }),
    }

    await expect(run(provider, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(provider.route).toHaveBeenCalledTimes(1)
  })

  it('propagates unexpected (non-routing) errors', async () => {
    const provider = scriptedProvider([new TypeError('bug')])
    await expect(run(provider)).rejects.toThrow('bug')
  })
})
