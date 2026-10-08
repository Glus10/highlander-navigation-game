import { describe, expect, it } from 'vitest'
import { LONDON, makeFix } from '../test/factories'
import { destinationPoint } from './geo'
import { isGoalReached, selectStartFix } from './location'

describe('isGoalReached (U-07)', () => {
  it.each([
    [24.9, true],
    [25, true],
    [25.1, false],
  ])('player %f m from the goal with a 25 m threshold → %s', (distanceM, expected) => {
    const player = destinationPoint(LONDON, 135, distanceM)
    expect(isGoalReached(player, LONDON, 25)).toBe(expected)
  })
})

describe('selectStartFix (U-08)', () => {
  const coarse = makeFix(LONDON, 1_500, 1)
  const medium = makeFix(LONDON, 400, 2)
  const good = makeFix(LONDON, 60, 3)
  const better = makeFix(LONDON, 20, 4)

  it('returns the first fix meeting the accuracy target, even before the deadline', () => {
    expect(selectStartFix([coarse, good, better], 100, false)).toEqual({ fix: good, lowAccuracy: false })
  })

  it('accepts a fix exactly at the target', () => {
    const exact = makeFix(LONDON, 100)
    expect(selectStartFix([exact], 100, false)).toEqual({ fix: exact, lowAccuracy: false })
  })

  it('keeps waiting while only coarse fixes exist and the deadline has not passed', () => {
    expect(selectStartFix([coarse, medium], 100, false)).toBeNull()
  })

  it('falls back to the most accurate fix with a warning once the deadline passes', () => {
    expect(selectStartFix([coarse, medium], 100, true)).toEqual({ fix: medium, lowAccuracy: true })
  })

  it('selects nothing when no fix has arrived', () => {
    expect(selectStartFix([], 100, false)).toBeNull()
    expect(selectStartFix([], 100, true)).toBeNull()
  })
})
