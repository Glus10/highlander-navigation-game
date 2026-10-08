// OSRM HTTP adapter. The only module that knows OSRM URLs, JSON shape and error codes.

import { RoutingError, type RoutingProvider } from '../domain/ports'
import type { LatLng, Route, RouteResult, Snap, TravelMode } from '../domain/types'

export interface OsrmRoutingProviderOptions {
  /** One base URL per travel mode, e.g. { walking: 'https://routing.openstreetmap.de/routed-foot' }. */
  baseUrls: Record<TravelMode, string>
  timeoutMs: number
  /** Minimum spacing between request starts (FOSSGIS usage policy: max 1 request/second). */
  minIntervalMs?: number
  fetchFn?: typeof fetch
  now?: () => number
}

/** OSRM profile path segment per mode. routed-* servers pick the profile from the base URL instead. */
const PROFILE: Record<TravelMode, string> = { walking: 'foot' }

/** OSRM codes that mean "this pair of points can't be routed" — try another candidate. */
const NO_ROUTE_CODES = new Set(['NoRoute', 'NoSegment'])
const INVALID_INPUT_CODES = new Set(['InvalidValue', 'InvalidQuery', 'InvalidOptions', 'InvalidUrl', 'InvalidService'])

type OsrmCoordinate = [lng: number, lat: number]

interface OsrmRouteResponse {
  code: string
  routes?: Array<{ distance: number; duration: number; geometry: { coordinates: OsrmCoordinate[] } }>
  waypoints?: Array<{ location: OsrmCoordinate; distance: number }>
}

const toLatLng = ([lng, lat]: OsrmCoordinate): LatLng => ({ lat, lng })
const formatCoordinate = ({ lat, lng }: LatLng) => `${lng.toFixed(6)},${lat.toFixed(6)}`

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError')
}

/** setTimeout-based delay (works with fake timers), cancellable via `signal`. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError(signal))
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class OsrmRoutingProvider implements RoutingProvider {
  private readonly baseUrls: Record<TravelMode, string>
  private readonly timeoutMs: number
  private readonly minIntervalMs: number
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private lastRequestAt = Number.NEGATIVE_INFINITY
  /** Serialises throttle slots so concurrent callers queue instead of bursting. */
  private queue: Promise<void> = Promise.resolve()

  constructor(options: OsrmRoutingProviderOptions) {
    this.baseUrls = options.baseUrls
    this.timeoutMs = options.timeoutMs
    this.minIntervalMs = options.minIntervalMs ?? 1_000
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
    this.now = options.now ?? (() => Date.now())
  }

  buildRouteUrl(from: LatLng, to: LatLng, mode: TravelMode): string {
    const base = this.baseUrls[mode].replace(/\/+$/, '')
    const coordinates = `${formatCoordinate(from)};${formatCoordinate(to)}`
    return `${base}/route/v1/${PROFILE[mode]}/${coordinates}?alternatives=true&overview=full&geometries=geojson`
  }

  async route(from: LatLng, to: LatLng, mode: TravelMode, signal: AbortSignal): Promise<RouteResult> {
    await this.acquireSlot(signal)

    const timeout = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      timeout.abort()
    }, this.timeoutMs)
    const onAbort = () => timeout.abort()
    signal.addEventListener('abort', onAbort, { once: true })

    try {
      const response = await this.fetchFn(this.buildRouteUrl(from, to, mode), { signal: timeout.signal })
      const body = await this.readJson(response)
      return this.toRouteResult(response.status, body)
    } catch (error) {
      if (signal.aborted) throw abortError(signal)
      if (timedOut) throw new RoutingError('timeout', `OSRM did not respond within ${this.timeoutMs} ms`)
      if (error instanceof RoutingError) throw error
      throw new RoutingError('unavailable', error instanceof Error ? error.message : String(error))
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }

  private acquireSlot(signal: AbortSignal): Promise<void> {
    const turn = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - this.now()
      if (wait > 0) await delay(wait, signal)
      signal.throwIfAborted()
      this.lastRequestAt = this.now()
    })
    // A cancelled caller must not block the ones queued behind it.
    this.queue = turn.catch(() => undefined)
    return turn
  }

  private async readJson(response: Response): Promise<OsrmRouteResponse | undefined> {
    try {
      return (await response.json()) as OsrmRouteResponse
    } catch {
      return undefined
    }
  }

  private toRouteResult(status: number, body: OsrmRouteResponse | undefined): RouteResult {
    if (status === 429) throw new RoutingError('rateLimited', 'OSRM rate limit reached')
    if (status >= 500) throw new RoutingError('unavailable', `OSRM responded with HTTP ${status}`)

    const code = body?.code
    if (code && NO_ROUTE_CODES.has(code)) throw new RoutingError('noRoute', code)
    if (code && INVALID_INPUT_CODES.has(code)) throw new RoutingError('invalidInput', code)
    if (code !== 'Ok' || status < 200 || status >= 300) {
      throw new RoutingError('unavailable', `Unexpected OSRM response (HTTP ${status}, code ${code ?? 'none'})`)
    }

    const routes = body?.routes
    const waypoints = body?.waypoints
    if (!routes || !waypoints || waypoints.length < 2) {
      throw new RoutingError('unavailable', 'Malformed OSRM response')
    }

    const candidates: Route[] = routes.map((route) => ({
      distanceM: route.distance,
      durationS: route.duration,
      geometry: route.geometry.coordinates.map(toLatLng),
    }))
    const toSnap = (waypoint: { location: OsrmCoordinate; distance: number }): Snap => ({
      location: toLatLng(waypoint.location),
      snapDistanceM: waypoint.distance,
    })

    return { candidates, snappedFrom: toSnap(waypoints[0]), snappedTo: toSnap(waypoints[waypoints.length - 1]) }
  }
}
