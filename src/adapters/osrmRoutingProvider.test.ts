import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoutingError } from '../domain/ports'
import invalidValue from './__fixtures__/osrm-invalid-value.json'
import noRoute from './__fixtures__/osrm-no-route.json'
import oneRoute from './__fixtures__/osrm-route-one-route.json'
import twoRoutes from './__fixtures__/osrm-route-two-routes.json'
import { OsrmRoutingProvider } from './osrmRoutingProvider'

const BASE = 'https://routing.openstreetmap.de/routed-foot'
const FROM = { lat: 32.0853, lng: 34.7818 }
const TO = { lat: 32.091, lng: 34.774 }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function makeProvider(fetchFn: typeof fetch, overrides: { minIntervalMs?: number; timeoutMs?: number } = {}) {
  return new OsrmRoutingProvider({
    baseUrls: { walking: BASE },
    timeoutMs: overrides.timeoutMs ?? 8_000,
    minIntervalMs: overrides.minIntervalMs ?? 0,
    fetchFn,
  })
}

const route = (provider: OsrmRoutingProvider, signal = new AbortController().signal) =>
  provider.route(FROM, TO, 'walking', signal)

async function expectRoutingError(promise: Promise<unknown>, kind: RoutingError['kind']) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(RoutingError)
  expect((error as RoutingError).kind).toBe(kind)
}

describe('OsrmRoutingProvider mapping (A-01)', () => {
  it('maps the recorded two-route response, converting [lng, lat] to {lat, lng}', async () => {
    const result = await route(makeProvider(async () => json(twoRoutes)))

    expect(result.candidates.map((c) => c.distanceM)).toEqual([1286.8, 1272.5])
    expect(result.candidates[0].durationS).toBe(twoRoutes.routes[0].duration)
    const [lng, lat] = twoRoutes.routes[0].geometry.coordinates[0]
    expect(result.candidates[0].geometry[0]).toEqual({ lat, lng })
    expect(result.candidates[0].geometry).toHaveLength(twoRoutes.routes[0].geometry.coordinates.length)

    const [fromWp, toWp] = twoRoutes.waypoints
    expect(result.snappedFrom).toEqual({
      location: { lat: fromWp.location[1], lng: fromWp.location[0] },
      snapDistanceM: fromWp.distance,
    })
    expect(result.snappedTo).toEqual({
      location: { lat: toWp.location[1], lng: toWp.location[0] },
      snapDistanceM: toWp.distance,
    })
  })

  it('maps a single-route response', async () => {
    const result = await route(makeProvider(async () => json(oneRoute)))
    expect(result.candidates.map((c) => c.distanceM)).toEqual([488.1])
  })
})

describe('OsrmRoutingProvider request (A-02)', () => {
  it('requests foot routing with alternatives and full GeoJSON geometry, in lng,lat order', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json(twoRoutes))
    await route(makeProvider(fetchFn))

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${BASE}/route/v1/foot/34.781800,32.085300;34.774000,32.091000?alternatives=true&overview=full&geometries=geojson`,
    )
  })

  it('tolerates a trailing slash on the base URL', () => {
    const provider = new OsrmRoutingProvider({ baseUrls: { walking: `${BASE}/` }, timeoutMs: 1 })
    expect(provider.buildRouteUrl(FROM, TO, 'walking')).toContain('/routed-foot/route/v1/foot/')
  })
})

describe('OsrmRoutingProvider errors (A-03, A-04)', () => {
  it('maps NoRoute (HTTP 400) to noRoute', async () => {
    await expectRoutingError(route(makeProvider(async () => json(noRoute, 400))), 'noRoute')
  })

  it('maps NoSegment to noRoute', async () => {
    await expectRoutingError(route(makeProvider(async () => json({ code: 'NoSegment' }, 400))), 'noRoute')
  })

  it('maps InvalidValue (HTTP 400) to invalidInput', async () => {
    await expectRoutingError(route(makeProvider(async () => json(invalidValue, 400))), 'invalidInput')
  })

  it.each([
    [500, 'unavailable'],
    [503, 'unavailable'],
    [429, 'rateLimited'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    await expectRoutingError(route(makeProvider(async () => new Response('error', { status }))), kind)
  })

  it('maps a network failure to unavailable', async () => {
    await expectRoutingError(
      route(
        makeProvider(async () => {
          throw new TypeError('Failed to fetch')
        }),
      ),
      'unavailable',
    )
  })

  it('maps a non-JSON or malformed OK response to unavailable', async () => {
    await expectRoutingError(route(makeProvider(async () => new Response('<html>', { status: 200 }))), 'unavailable')
    await expectRoutingError(route(makeProvider(async () => json({ code: 'Ok', routes: [] }))), 'unavailable')
  })
})

describe('OsrmRoutingProvider timing (A-04, A-05)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** fetch that only settles when its signal aborts. */
  const hangingFetch: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })

  it('times out after timeoutMs (A-04)', async () => {
    const pending = route(makeProvider(hangingFetch, { timeoutMs: 8_000 }))
    const assertion = expectRoutingError(pending, 'timeout')
    await vi.advanceTimersByTimeAsync(8_000)
    await assertion
  })

  it('rejects with AbortError (not a RoutingError) when the caller aborts', async () => {
    const controller = new AbortController()
    const pending = route(makeProvider(hangingFetch), controller.signal)
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('spaces request starts at least 1000 ms apart (A-05)', async () => {
    const startedAt: number[] = []
    const fetchFn = vi.fn<typeof fetch>(async () => {
      startedAt.push(Date.now())
      return json(oneRoute)
    })
    const provider = makeProvider(fetchFn, { minIntervalMs: 1_000 })

    const all = Promise.all([route(provider), route(provider), route(provider)])
    await vi.advanceTimersByTimeAsync(5_000)
    await all

    expect(startedAt).toHaveLength(3)
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(1_000)
    expect(startedAt[2] - startedAt[1]).toBeGreaterThanOrEqual(1_000)
  })

  it('does not let a request aborted while queued block the next one', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json(oneRoute))
    const provider = makeProvider(fetchFn, { minIntervalMs: 1_000 })
    const controller = new AbortController()

    const first = route(provider)
    const cancelled = route(provider, controller.signal)
    const third = route(provider)
    controller.abort()

    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(Promise.all([first, third])).resolves.toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
