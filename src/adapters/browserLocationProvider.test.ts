import { describe, expect, it, vi } from 'vitest'
import type { LocationError } from '../domain/ports'
import type { Fix } from '../domain/types'
import { BrowserLocationProvider } from './browserLocationProvider'

/** Minimal fake of the Geolocation API that lets tests drive callbacks. */
function fakeGeolocation() {
  let success: PositionCallback | undefined
  let failure: PositionErrorCallback | null | undefined
  const geolocation = {
    watchPosition: vi.fn<Geolocation['watchPosition']>((onSuccess, onError) => {
      success = onSuccess
      failure = onError
      return 42
    }),
    clearWatch: vi.fn<Geolocation['clearWatch']>(),
    getCurrentPosition: vi.fn<Geolocation['getCurrentPosition']>(),
  }
  return {
    geolocation: geolocation as Geolocation,
    mock: geolocation,
    emitPosition: (lat: number, lng: number, accuracy: number, timestamp: number) =>
      success?.({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp } as GeolocationPosition),
    emitError: (code: number) => failure?.({ code, message: `code ${code}` } as GeolocationPositionError),
  }
}

function subscribe(provider: BrowserLocationProvider) {
  const fixes: Fix[] = []
  const errors: LocationError[] = []
  const unsubscribe = provider.subscribe(
    (fix) => fixes.push(fix),
    (error) => errors.push(error),
  )
  return { fixes, errors, unsubscribe }
}

describe('BrowserLocationProvider', () => {
  it('watches with high accuracy, no cached positions and the configured timeout', () => {
    const fake = fakeGeolocation()
    subscribe(new BrowserLocationProvider({ geolocation: fake.geolocation, isSecureContext: true, timeoutMs: 15_000 }))
    expect(fake.mock.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    })
  })

  it('maps positions to fixes', () => {
    const fake = fakeGeolocation()
    const { fixes } = subscribe(
      new BrowserLocationProvider({ geolocation: fake.geolocation, isSecureContext: true, timeoutMs: 1 }),
    )
    fake.emitPosition(51.5, -0.12, 35, 1234)
    expect(fixes).toEqual([{ position: { lat: 51.5, lng: -0.12 }, accuracyM: 35, timestamp: 1234 }])
  })

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
    [99, 'unavailable'],
  ] as const)('maps error code %i to %s (A-07)', (code, kind) => {
    const fake = fakeGeolocation()
    const { errors } = subscribe(
      new BrowserLocationProvider({ geolocation: fake.geolocation, isSecureContext: true, timeoutMs: 1 }),
    )
    fake.emitError(code)
    expect(errors).toEqual([{ kind, message: `code ${code}` }])
  })

  it('reports unsupported when the API is missing (A-07, EC-4)', async () => {
    const { errors } = subscribe(
      new BrowserLocationProvider({ geolocation: undefined, isSecureContext: true, timeoutMs: 1 }),
    )
    expect(errors).toEqual([]) // asynchronous, like the real API
    await Promise.resolve()
    expect(errors).toEqual([{ kind: 'unsupported', message: 'This browser does not support geolocation.' }])
  })

  it('reports unsupported in an insecure context without calling the API (EC-4)', async () => {
    const fake = fakeGeolocation()
    const { errors } = subscribe(
      new BrowserLocationProvider({ geolocation: fake.geolocation, isSecureContext: false, timeoutMs: 1 }),
    )
    await Promise.resolve()
    expect(errors[0].kind).toBe('unsupported')
    expect(fake.mock.watchPosition).not.toHaveBeenCalled()
  })

  it('clears the watch and ignores late callbacks after unsubscribe (A-08)', () => {
    const fake = fakeGeolocation()
    const { fixes, errors, unsubscribe } = subscribe(
      new BrowserLocationProvider({ geolocation: fake.geolocation, isSecureContext: true, timeoutMs: 1 }),
    )
    unsubscribe()
    expect(fake.mock.clearWatch).toHaveBeenCalledWith(42)
    fake.emitPosition(1, 2, 3, 4)
    fake.emitError(1)
    expect(fixes).toEqual([])
    expect(errors).toEqual([])
  })
})
