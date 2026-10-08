import { describe, expect, it } from 'vitest'
import { LONDON, makeRoute, makeRouteResult } from '../test/factories'
import { haversineM } from './geo'
import { sampleInRing, selectShortestRoute, validateGoalCandidate, type GoalRules } from './goal'
import { createSeededRng } from './random'

const RULES: GoalRules = { minRadiusM: 300, maxRadiusM: 800, maxSnapDistanceM: 150, maxRouteLengthM: 1_600 }

describe('sampleInRing (U-02)', () => {
  const rng = createSeededRng(42)
  const distances = Array.from({ length: 10_000 }, () => haversineM(LONDON, sampleInRing(LONDON, 300, 800, rng)))

  it('keeps every sample inside [300, 800] m', () => {
    expect(Math.min(...distances)).toBeGreaterThanOrEqual(300 - 1e-6)
    expect(Math.max(...distances)).toBeLessThanOrEqual(800 + 1e-6)
  })

  it('is uniform by area: median radius ≈ √((300² + 800²) / 2) ≈ 604 m', () => {
    const sorted = [...distances].sort((a, b) => a - b)
    const median = sorted[sorted.length / 2]
    const expected = Math.sqrt((300 ** 2 + 800 ** 2) / 2)
    expect(Math.abs(median - expected) / expected).toBeLessThan(0.02)
  })

  it('is deterministic for a given seed', () => {
    const a = sampleInRing(LONDON, 300, 800, createSeededRng(7))
    const b = sampleInRing(LONDON, 300, 800, createSeededRng(7))
    expect(a).toEqual(b)
  })
})

describe('validateGoalCandidate', () => {
  it('accepts a valid candidate and uses the SNAPPED goal and route start', () => {
    const result = makeRouteResult(LONDON, { goalDistanceM: 500 })
    const validation = validateGoalCandidate(LONDON, result, RULES)
    expect(validation).toEqual({
      ok: true,
      plan: { goal: result.snappedTo.location, route: result.candidates[0], routeStart: result.snappedFrom.location },
    })
  })

  it('rejects a snap further than maxSnapDistanceM (U-03)', () => {
    expect(validateGoalCandidate(LONDON, makeRouteResult(LONDON, { snapDistanceM: 151 }), RULES)).toEqual({
      ok: false,
      reason: 'snapTooFar',
    })
    expect(validateGoalCandidate(LONDON, makeRouteResult(LONDON, { snapDistanceM: 150 }), RULES).ok).toBe(true)
  })

  it.each([
    [299, false],
    [300, true],
    [800, true],
    [801, false],
  ])('snapped goal at %i m from start → accepted: %s (U-04, inclusive bounds)', (goalDistanceM, accepted) => {
    const validation = validateGoalCandidate(LONDON, makeRouteResult(LONDON, { goalDistanceM }), RULES)
    expect(validation.ok).toBe(accepted)
    if (!validation.ok) expect(validation.reason).toBe('outsideRing')
  })

  it('rejects when the shortest candidate exceeds maxRouteLengthM (U-05)', () => {
    expect(validateGoalCandidate(LONDON, makeRouteResult(LONDON, { routeDistancesM: [1_601] }), RULES)).toEqual({
      ok: false,
      reason: 'routeTooLong',
    })
    expect(validateGoalCandidate(LONDON, makeRouteResult(LONDON, { routeDistancesM: [1_600] }), RULES).ok).toBe(true)
  })

  it('judges route length by the shortest candidate', () => {
    const result = makeRouteResult(LONDON, { routeDistancesM: [1_700, 1_500] })
    const validation = validateGoalCandidate(LONDON, result, RULES)
    expect(validation.ok && validation.plan.route.distanceM).toBe(1_500)
  })

  it('rejects a result with no candidates', () => {
    expect(validateGoalCandidate(LONDON, makeRouteResult(LONDON, { routeDistancesM: [] }), RULES)).toEqual({
      ok: false,
      reason: 'noCandidates',
    })
  })
})

describe('selectShortestRoute (U-06)', () => {
  it('picks the shorter alternative (verified real OSRM case: 1286.8 m primary vs 1272.5 m)', () => {
    const primary = makeRoute(1_286.8)
    const alternative = makeRoute(1_272.5)
    expect(selectShortestRoute([primary, alternative])).toBe(alternative)
  })

  it('returns the only route as-is', () => {
    const only = makeRoute(900)
    expect(selectShortestRoute([only])).toBe(only)
  })

  it('keeps the first route on a tie, and returns undefined for no routes', () => {
    const a = makeRoute(900)
    expect(selectShortestRoute([a, makeRoute(900)])).toBe(a)
    expect(selectShortestRoute([])).toBeUndefined()
  })
})
