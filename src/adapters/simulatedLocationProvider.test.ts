import { describe, expect, it } from 'vitest'
import { haversineM } from '../domain/geo'
import type { Fix } from '../domain/types'
import { LONDON } from '../test/factories'
import { SimulatedLocationProvider } from './simulatedLocationProvider'

const noError = () => {
  throw new Error('simulated provider never reports errors')
}

function subscribe(provider: SimulatedLocationProvider) {
  const fixes: Fix[] = []
  const unsubscribe = provider.subscribe((fix) => fixes.push(fix), noError)
  return { fixes, unsubscribe }
}

describe('SimulatedLocationProvider (A-09)', () => {
  it('delivers the start position asynchronously with a small accuracy', async () => {
    const { fixes } = subscribe(new SimulatedLocationProvider(LONDON, { now: () => 7 }))
    expect(fixes).toEqual([])
    await Promise.resolve()
    expect(fixes).toEqual([{ position: LONDON, accuracyM: 5, timestamp: 7 }])
  })

  it('emits a fix to every subscriber on setPosition', async () => {
    const provider = new SimulatedLocationProvider(LONDON)
    const a = subscribe(provider)
    const b = subscribe(provider)
    await Promise.resolve()
    const target = { lat: 51.51, lng: -0.12 }

    provider.setPosition(target)

    expect(a.fixes.at(-1)?.position).toEqual(target)
    expect(b.fixes.at(-1)?.position).toEqual(target)
    expect(provider.getPosition()).toEqual(target)
  })

  it.each([
    [0, 'north'],
    [90, 'east'],
  ])('nudges ~20 m on bearing %i° (%s)', (bearing) => {
    const provider = new SimulatedLocationProvider(LONDON)
    provider.nudge(bearing, 20)
    const moved = provider.getPosition()
    expect(haversineM(LONDON, moved)).toBeCloseTo(20, 6)
    if (bearing === 0) expect(moved.lat).toBeGreaterThan(LONDON.lat)
    else expect(moved.lng).toBeGreaterThan(LONDON.lng)
  })

  it('stops delivering after unsubscribe, including the pending first fix', async () => {
    const provider = new SimulatedLocationProvider(LONDON)
    const { fixes, unsubscribe } = subscribe(provider)
    unsubscribe()
    await Promise.resolve()
    provider.setPosition({ lat: 1, lng: 1 })
    expect(fixes).toEqual([])
  })
})
