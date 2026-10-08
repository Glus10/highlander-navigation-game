// Controllable fake providers for integration tests.

import type { LocationError, LocationProvider, RoutingProvider } from '../domain/ports'
import type { Fix, LatLng, RouteResult, TravelMode } from '../domain/types'

interface Subscription {
  onFix: (fix: Fix) => void
  onError: (error: LocationError) => void
  active: boolean
}

/** Location provider driven by the test. Late calls to stale subscriptions can be simulated with `emitTo`. */
export class FakeLocationProvider implements LocationProvider {
  readonly subscriptions: Subscription[] = []

  subscribe(onFix: (fix: Fix) => void, onError: (error: LocationError) => void): () => void {
    const subscription: Subscription = { onFix, onError, active: true }
    this.subscriptions.push(subscription)
    return () => {
      subscription.active = false
    }
  }

  get activeCount(): number {
    return this.subscriptions.filter((s) => s.active).length
  }

  /** Emits to active subscriptions only (like a real provider after clearWatch). */
  emitFix(fix: Fix): void {
    for (const s of this.subscriptions) if (s.active) s.onFix(fix)
  }

  emitError(error: LocationError): void {
    for (const s of this.subscriptions) if (s.active) s.onError(error)
  }

  /** Calls a specific (possibly unsubscribed) subscription — simulates a misbehaving/late provider. */
  emitTo(index: number, fix: Fix): void {
    this.subscriptions[index].onFix(fix)
  }
}

interface PendingRoute {
  from: LatLng
  to: LatLng
  mode: TravelMode
  signal: AbortSignal
  resolve: (result: RouteResult) => void
  reject: (error: unknown) => void
}

/** Routing provider whose requests stay pending until the test settles them. Ignores abort on purpose. */
export class DeferredRoutingProvider implements RoutingProvider {
  readonly requests: PendingRoute[] = []

  route(from: LatLng, to: LatLng, mode: TravelMode, signal: AbortSignal): Promise<RouteResult> {
    return new Promise((resolve, reject) => {
      this.requests.push({ from, to, mode, signal, resolve, reject })
    })
  }
}
