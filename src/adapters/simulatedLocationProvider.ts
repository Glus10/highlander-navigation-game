// Simulation mode (?simulate=1): position is moved by the user, not the host. Always badged in the UI.

import { destinationPoint } from '../domain/geo'
import type { LocationError, LocationProvider } from '../domain/ports'
import type { Fix, LatLng } from '../domain/types'

export interface SimulatedLocationProviderOptions {
  /** Reported accuracy; small enough to pass the start-fix accuracy gate immediately. */
  accuracyM?: number
  now?: () => number
}

export class SimulatedLocationProvider implements LocationProvider {
  private position: LatLng
  private readonly accuracyM: number
  private readonly now: () => number
  private readonly listeners = new Set<(fix: Fix) => void>()

  constructor(start: LatLng, options: SimulatedLocationProviderOptions = {}) {
    this.position = start
    this.accuracyM = options.accuracyM ?? 5
    this.now = options.now ?? (() => Date.now())
  }

  subscribe(onFix: (fix: Fix) => void, _onError: (error: LocationError) => void): () => void {
    let active = true
    const listener = (fix: Fix) => {
      if (active) onFix(fix)
    }
    this.listeners.add(listener)
    // Deliver the current position asynchronously, like a real first fix.
    queueMicrotask(() => listener(this.currentFix()))
    return () => {
      active = false
      this.listeners.delete(listener)
    }
  }

  getPosition(): LatLng {
    return this.position
  }

  setPosition(position: LatLng): void {
    this.position = position
    const fix = this.currentFix()
    for (const listener of this.listeners) listener(fix)
  }

  /** Moves `distanceM` metres on `bearingDeg` (0 = north, 90 = east). */
  nudge(bearingDeg: number, distanceM: number): void {
    this.setPosition(destinationPoint(this.position, bearingDeg, distanceM))
  }

  private currentFix(): Fix {
    return { position: this.position, accuracyM: this.accuracyM, timestamp: this.now() }
  }
}
