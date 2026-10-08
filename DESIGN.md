# Design

How the approved decisions (`DECISIONS.md`) translate into module responsibilities. Diagrams are in `ARCHITECTURE.md`.

## Guiding idea
**Game rules are plain TypeScript; everything that touches the outside world sits behind an interface; React only renders and wires.** This keeps the critical logic deterministic and unit-testable, and keeps it portable to a server (Part 2).

## Layers and responsibilities

| Layer | Folder | Responsibility | Knows about | Must NOT know about |
|-------|--------|----------------|-------------|---------------------|
| Domain | `src/domain/` | Types (`LatLng`, `Fix`, `Route`, `TravelMode`, `GameState`), geo math (haversine, destination point), ring sampling, goal-validation rules, route selection (min distance), goal detection, start-fix selection, `gameReducer`, provider **interfaces** | Nothing outside itself | React, Leaflet, `fetch`, `navigator`, config source |
| Services | `src/services/` | Async use cases: `generateGoal(start, config, routing, rng, signal)` — the ring → snap → validate → retry loop | Domain + provider interfaces | Concrete adapters, React |
| Adapters | `src/adapters/` | `OsrmRoutingProvider` (URLs, JSON mapping, throttle, timeout, retry, error mapping), `BrowserLocationProvider` (`navigator.geolocation`), `SimulatedLocationProvider` | Domain interfaces, browser APIs | Game rules, React |
| App | `src/app/` | `loadConfig()` (read + validate `VITE_*`), composition root (choose real vs simulated provider), `useGameController` (owns reducer, effects, session id) | Services, domain, adapters (only at the composition root) | Leaflet rendering details |
| UI | `src/ui/` | `MapView`, `PlayerMarker`, `GoalMarker`, `RouteLine`, `ApproachLine`, `StatusPanel`, `ErrorPanel`, `SimulatedBadge`, `Attribution`, `ErrorBoundary` | Props + callbacks from the app layer | OSRM, geolocation, game rules |

**Dependency direction:** `ui → app → services → domain`, with `adapters → domain` (they implement domain interfaces). Only the composition root in `app/` instantiates adapters. Enforced by convention and reviewed in each diff.

## Key interfaces (domain-owned)

```ts
type TravelMode = 'walking';                 // extend: | 'cycling' | 'driving'

interface RoutingProvider {
  route(from: LatLng, to: LatLng, mode: TravelMode, signal: AbortSignal): Promise<RouteResult>;
}
// RouteResult = { candidates: Route[]; snappedFrom: Snap; snappedTo: Snap }
// Snap = { location: LatLng; snapDistanceM: number }
// Errors: RoutingError { kind: 'noRoute' | 'invalidInput' | 'unavailable' | 'timeout' | 'rateLimited' }

interface LocationProvider {
  subscribe(onFix: (fix: Fix) => void, onError: (e: LocationError) => void): () => void;
}
// LocationError { kind: 'denied' | 'unavailable' | 'timeout' | 'unsupported' }
```

`/route` with `alternatives=true` returns both the candidates and the snapped destination plus its snap distance, so **one request = one snap + one route** (verified; see DECISIONS D3a amendment).

## Pure functions (unit-test targets)
- `haversineM(a, b)`, `destinationPoint(origin, bearing, distanceM)`
- `sampleInRing(center, minM, maxM, rng)` — uniform by area (`r = √(u·(max²−min²)+min²)`)
- `validateGoalCandidate(start, result, config) → ok | reason` (snap distance, ring membership of the **snapped** goal, route length)
- `selectShortestRoute(candidates)` — min `distance`
- `selectStartFix(fixes, maxAccuracyM)` — best fix / threshold met
- `isGoalReached(position, goal, thresholdM)`
- `gameReducer(state, event)` — the state machine
- `validateConfig(raw) → Config | ConfigError[]`

Randomness and time are **injected** (`rng`, fake timers), so all of these are deterministic in tests.

## State ownership
- **Single source of truth:** `GameState` lives in `useGameController` (`useReducer`), mounted once in `App`. Components receive read-only props and callbacks (`onRestart`, `onRetry`, `onSimMove`).
- `GameState` is a discriminated union; each phase carries only valid data, e.g. `playing { session, start, position, goal, route, approach }`, `won { …, reachedAt }`. Impossible combinations (a goal without a route, `won` without a goal) cannot be represented.
- **The goal is immutable once set:** no event updates `goal` while in `playing`. Only `RESTART` leaves the session.
- **Position updates** (`POSITION_UPDATED`) only change `position` and may transition `playing → won`. `won` ignores further positions (latch).
- Simulated position state lives inside `SimulatedLocationProvider`, not React; the UI calls `sim.setPosition()`, and the provider emits fixes like the real one, so the controller can't tell the difference.

## Async orchestration (`useGameController`)
1. Mount → `START` (new `sessionId`, new `AbortController`).
2. `acquiringLocation`: subscribe to the provider; collect fixes; after ≤ 100 m or 10 s → `START_FIX_SELECTED`.
3. `generatingGoal`: `await generateGoal(...)` → `GOAL_READY { goal, route, approach }`, or `GOAL_FAILED`, or `ROUTING_FAILED`.
4. `playing`: each fix → `POSITION_UPDATED`; the reducer applies `isGoalReached`.
5. Restart/Retry → abort the controller, unsubscribe, bump `sessionId`, `START` again.
- Every dispatched async result carries its `sessionId`; the reducer **drops events from stale sessions**.
- The location subscription is cleaned up on unmount and on restart (`useEffect` cleanup).

## Approach line
The route is computed once from the **start position**, so the approach line is drawn **start position → route start (`snappedFrom`)** and is static. It is never part of the route or of distance calculations.

## Error handling

| Source | Mapped to | User sees |
|--------|-----------|-----------|
| Geolocation code 1/2/3, missing API | `LocationError.kind` | `locationError` panel with guidance + Retry |
| Start fix > 100 m after 10 s | warning flag on `playing` state | Low-accuracy banner (game continues) |
| OSRM `NoRoute` / validation fail | candidate rejected inside `generateGoal` | (transparent retry) |
| Attempts exhausted | `goalGenerationFailed` | Error + Retry |
| OSRM timeout / network / 5xx / 429 | `RoutingError` → `routingError` (after 1 retry, P1) | Error + Retry |
| OSRM `InvalidValue` | `RoutingError.invalidInput` (bug signal → logged) | Routing error + Retry |
| Invalid config | `ConfigError[]` at boot | Config error screen (no game) |
| Unexpected render error | `ErrorBoundary` | Fallback + Reload |

All errors go through `logger` (console today; the single seam for telemetry later).

## Coupling and cohesion
- OSRM specifics (URL shape, `routed-foot` path, JSON, `code` field, throttle) are confined to **one adapter**. Swapping to self-hosted OSRM = config change; to Google = a new adapter.
- Leaflet is confined to `src/ui/map/*`; the domain uses its own `LatLng` (`{lat, lng}`), and adapters convert OSRM's `[lng, lat]` order at the boundary.
- Each module has one reason to change (rules, provider protocol, rendering, wiring).

## Configuration
Build-time `VITE_*` variables (D6b) → `loadConfig()` → `validateConfig()` → typed `Config` passed down explicitly (no global imports of `import.meta.env` outside `app/config`). Defaults live in `.env.example`, all non-secret. Mode → base URL map: `{ walking: VITE_OSRM_FOOT_URL }`.

## Testability
- Domain: pure, so tests are plain table-driven Vitest.
- Services: fake `RoutingProvider` scripted per attempt + seeded `rng`.
- Adapters: stubbed `fetch` with recorded OSRM fixtures (including the verified `NoRoute`/`InvalidValue` shapes); fake `navigator.geolocation`.
- Controller: `renderHook` + fake providers + fake timers.
- UI and full flow: Playwright with the simulator, `setGeolocation`, permission denial and OSRM route interception.

## Tradeoffs (summary)
- Hook-based orchestration is idiomatic but needs effect discipline → mitigated by session ids and integration tests.
- Build-time config → simple, but a rebuild is needed per environment.
- The simulator ships in the production bundle → opt-in and badged; revisit for Part 2 (server must not trust clients).
- Public OSRM → zero setup, but no SLA; the throttle and explicit errors keep it honest.

## Part 2 evolution (not built)
The pure `gameReducer`, goal rules and `isGoalReached` can run in a Node server that owns the session and goal and arbitrates "first to goal". Clients would stream positions via WebSocket; `LocationProvider` stays client-side, and a new `GameTransport` boundary would replace the local controller. No Part 1 code needs to anticipate this beyond keeping the domain pure.
