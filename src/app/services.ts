// Composition root: the only module that instantiates adapters.

import { BrowserLocationProvider } from '../adapters/browserLocationProvider'
import { OsrmRoutingProvider } from '../adapters/osrmRoutingProvider'
import { SimulatedLocationProvider } from '../adapters/simulatedLocationProvider'
import type { GameConfig } from '../domain/config'
import type { LocationProvider, RoutingProvider } from '../domain/ports'
import type { Rng } from '../domain/random'
import type { LatLng } from '../domain/types'

export interface GameServices {
  routing: RoutingProvider
  location: LocationProvider
  /** Present only in simulation mode; the UI uses it to move the ball. */
  simulator?: SimulatedLocationProvider
  rng: Rng
}

export type SimulationSettings = { enabled: false } | { enabled: true; start: LatLng }

const SIMULATE_ON = new Set(['1', 'true'])

/** Reads `?simulate=1[&lat=..&lng=..]`. Invalid or missing coordinates fall back to the configured start. */
export function parseSimulation(search: string, defaultStart: LatLng): SimulationSettings {
  const params = new URLSearchParams(search)
  if (!SIMULATE_ON.has(params.get('simulate') ?? '')) return { enabled: false }

  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  const valid =
    params.has('lat') &&
    params.has('lng') &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  return { enabled: true, start: valid ? { lat, lng } : defaultStart }
}

export function createServices(config: GameConfig, search: string): GameServices {
  const routing = new OsrmRoutingProvider({
    baseUrls: { walking: config.osrmFootUrl },
    timeoutMs: config.routingTimeoutMs,
  })
  const simulation = parseSimulation(search, config.simStart)

  if (simulation.enabled) {
    const simulator = new SimulatedLocationProvider(simulation.start)
    return { routing, location: simulator, simulator, rng: Math.random }
  }
  return {
    routing,
    location: new BrowserLocationProvider({ timeoutMs: config.geolocationTimeoutMs }),
    rng: Math.random,
  }
}
