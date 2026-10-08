// Boundaries to the outside world. Adapters implement these; domain and services depend only on them.

import type { Fix, LatLng, RouteResult, TravelMode } from './types'

export type RoutingErrorKind = 'noRoute' | 'invalidInput' | 'unavailable' | 'timeout' | 'rateLimited'

export class RoutingError extends Error {
  readonly kind: RoutingErrorKind

  constructor(kind: RoutingErrorKind, message?: string) {
    super(message ?? kind)
    this.name = 'RoutingError'
    this.kind = kind
  }
}

export interface RoutingProvider {
  /**
   * Route between two points. Both ends are snapped to the network by the provider.
   * Rejects with RoutingError, or with an AbortError when `signal` is aborted.
   */
  route(from: LatLng, to: LatLng, mode: TravelMode, signal: AbortSignal): Promise<RouteResult>
}

export type LocationErrorKind = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export interface LocationError {
  kind: LocationErrorKind
  message?: string
}

export interface LocationProvider {
  /** Starts delivering fixes; returns an unsubscribe function that releases all resources. */
  subscribe(onFix: (fix: Fix) => void, onError: (error: LocationError) => void): () => void
}
