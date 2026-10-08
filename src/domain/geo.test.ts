import { describe, expect, it } from 'vitest'
import { destinationPoint, haversineM } from './geo'

const LONDON = { lat: 51.5074, lng: -0.1278 }
const PARIS = { lat: 48.8566, lng: 2.3522 }
const NEW_YORK = { lat: 40.7128, lng: -74.006 }

describe('haversineM (U-01)', () => {
  it.each([
    ['London → Paris', LONDON, PARIS, 343_560],
    ['London → New York', LONDON, NEW_YORK, 5_570_220],
  ])('%s is within 0.5%% of the reference distance', (_, a, b, referenceM) => {
    const d = haversineM(a, b)
    expect(Math.abs(d - referenceM) / referenceM).toBeLessThan(0.005)
  })

  it('is symmetric', () => {
    expect(haversineM(LONDON, PARIS)).toBeCloseTo(haversineM(PARIS, LONDON), 6)
  })

  it('is 0 for identical points', () => {
    expect(haversineM(LONDON, LONDON)).toBe(0)
  })
})

describe('destinationPoint', () => {
  it.each([0, 45, 90, 180, 270, 359])('round-trips distance on bearing %i°', (bearing) => {
    const p = destinationPoint(LONDON, bearing, 650)
    expect(haversineM(LONDON, p)).toBeCloseTo(650, 6)
  })

  it('moves north when bearing is 0', () => {
    const p = destinationPoint(LONDON, 0, 1_000)
    expect(p.lat).toBeGreaterThan(LONDON.lat)
    expect(p.lng).toBeCloseTo(LONDON.lng, 9)
  })

  it('normalises longitude across the antimeridian', () => {
    const p = destinationPoint({ lat: 0, lng: 179.999 }, 90, 1_000)
    expect(p.lng).toBeGreaterThanOrEqual(-180)
    expect(p.lng).toBeLessThan(-179.99)
  })
})
