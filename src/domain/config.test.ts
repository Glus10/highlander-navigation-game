import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, validateConfig } from './config'

function errorFields(raw: Parameters<typeof validateConfig>[0]) {
  const result = validateConfig(raw)
  return result.ok ? [] : result.errors.map((e) => e.field)
}

describe('validateConfig (U-13)', () => {
  it('accepts the approved defaults when nothing is provided', () => {
    expect(validateConfig({})).toEqual({ ok: true, config: DEFAULT_CONFIG })
  })

  it('treats empty strings as missing and falls back to defaults', () => {
    expect(validateConfig({ goalThresholdM: '', osrmFootUrl: '  ' })).toEqual({ ok: true, config: DEFAULT_CONFIG })
  })

  it('parses string values (environment variables)', () => {
    const result = validateConfig({ goalMinRadiusM: '200', goalThresholdM: ' 30 ', simStartLat: '32.08' })
    expect(result.ok && result.config).toMatchObject({ goalMinRadiusM: 200, goalThresholdM: 30, simStart: { lat: 32.08 } })
  })

  it('rejects a threshold that is not smaller than the minimum radius', () => {
    expect(errorFields({ goalThresholdM: 300 })).toEqual(['goalThresholdM'])
  })

  it('rejects a minimum radius that is not smaller than the maximum radius', () => {
    expect(errorFields({ goalMinRadiusM: 800 })).toEqual(['goalMinRadiusM'])
  })

  it('rejects a max route length shorter than the max radius', () => {
    expect(errorFields({ maxRouteLengthM: 799 })).toEqual(['maxRouteLengthM'])
  })

  it.each([
    ['negative', -5],
    ['zero', 0],
  ])('rejects %s values', (_, value) => {
    expect(errorFields({ maxSnapDistanceM: value })).toEqual(['maxSnapDistanceM'])
  })

  it('rejects non-numeric values', () => {
    expect(errorFields({ routingTimeoutMs: 'soon' })).toEqual(['routingTimeoutMs'])
    expect(errorFields({ goalMaxRadiusM: Number.NaN })).toEqual(['goalMaxRadiusM'])
  })

  it('rejects a non-integer attempt count', () => {
    expect(errorFields({ maxGoalAttempts: 2.5 })).toEqual(['maxGoalAttempts'])
  })

  it('rejects a non-http(s) routing URL', () => {
    expect(errorFields({ osrmFootUrl: 'ftp://example.org' })).toEqual(['osrmFootUrl'])
  })

  it('rejects out-of-range simulation coordinates', () => {
    expect(errorFields({ simStartLat: 91, simStartLng: -181 })).toEqual(['simStartLat', 'simStartLng'])
  })

  it('reports every invalid field at once', () => {
    expect(errorFields({ goalThresholdM: -1, routingTimeoutMs: 'x' })).toEqual(['routingTimeoutMs', 'goalThresholdM'])
  })
})
