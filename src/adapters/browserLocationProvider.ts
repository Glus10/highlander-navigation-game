// Host location via the browser Geolocation API (reads the host OS location services).

import type { LocationError, LocationErrorKind, LocationProvider } from '../domain/ports'
import type { Fix } from '../domain/types'

export interface BrowserLocationProviderOptions {
  /** Defaults to navigator.geolocation; undefined means the API is not available. */
  geolocation?: Geolocation
  /** Geolocation is only available in secure contexts (https or localhost). */
  isSecureContext?: boolean
  timeoutMs: number
}

const ERROR_KINDS: Record<number, LocationErrorKind> = {
  1: 'denied', // PERMISSION_DENIED
  2: 'unavailable', // POSITION_UNAVAILABLE
  3: 'timeout', // TIMEOUT
}

export class BrowserLocationProvider implements LocationProvider {
  private readonly geolocation: Geolocation | undefined
  private readonly isSecureContext: boolean
  private readonly timeoutMs: number

  constructor(options: BrowserLocationProviderOptions) {
    this.geolocation =
      'geolocation' in options ? options.geolocation : globalThis.navigator?.geolocation
    this.isSecureContext = options.isSecureContext ?? globalThis.isSecureContext ?? true
    this.timeoutMs = options.timeoutMs
  }

  subscribe(onFix: (fix: Fix) => void, onError: (error: LocationError) => void): () => void {
    let active = true

    if (!this.geolocation || !this.isSecureContext) {
      const message = this.geolocation
        ? 'Location requires a secure context (https or localhost).'
        : 'This browser does not support geolocation.'
      // Report asynchronously, like the real API, so callers can finish subscribing first.
      queueMicrotask(() => {
        if (active) onError({ kind: 'unsupported', message })
      })
      return () => {
        active = false
      }
    }

    const geolocation = this.geolocation
    const watchId = geolocation.watchPosition(
      (position) => {
        if (!active) return
        onFix({
          position: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracyM: position.coords.accuracy,
          timestamp: position.timestamp,
        })
      },
      (error) => {
        if (!active) return
        onError({ kind: ERROR_KINDS[error.code] ?? 'unavailable', message: error.message })
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: this.timeoutMs },
    )

    return () => {
      active = false
      geolocation.clearWatch(watchId)
    }
  }
}
