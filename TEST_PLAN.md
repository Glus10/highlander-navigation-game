# Test Plan

Stack: **Vitest** (unit + integration, jsdom), **React Testing Library**, **Playwright** (E2E, Chromium). No test exists yet; nothing below is claimed to pass. Status is tracked in `PROGRESS.md`.

## Strategy

| Level | Scope | Doubles |
|-------|-------|---------|
| Unit | `src/domain/*`, `validateConfig`, `generateGoal` loop | Seeded `rng`; scripted fake `RoutingProvider` |
| Adapter (unit) | `OsrmRoutingProvider`, `BrowserLocationProvider`, `SimulatedLocationProvider` | Stubbed `fetch` + recorded OSRM JSON fixtures; fake `navigator.geolocation`; fake timers |
| Integration | `useGameController` (`renderHook`), panels/badge rendering from `GameState` | Fake providers, fake timers. Leaflet visuals are **not** asserted in jsdom |
| E2E | Production build (`vite preview` locally, the Docker image in phase 5) | Playwright `grantPermissions`/`setGeolocation`, `page.route()` intercepting OSRM with fixtures; simulator via `?simulate=1` |
| Manual | Real host location, real OSRM, visual quality | — |

**Fixtures:** recorded from the verified OSRM responses (Ok with 2 routes, Ok with 1 route, `NoRoute`, `InvalidValue`), trimmed. E2E never hits the live OSRM except the opt-in `@live` test.

**Commands (planned):** `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run test:e2e -- --grep @live` (opt-in), `npm run typecheck`, `npm run lint`, `npm run build`.

## Traceability

| Test ID | Requirement | Scenario | Level | Expected result |
|---------|-------------|----------|-------|-----------------|
| U-01 | FR-3 | `haversineM` known city pairs, identical points | Unit | Within 0.5 % of the reference; 0 for identical points |
| U-02 | FR-3 | `sampleInRing` × 10k with seeded rng | Unit | All points within [300, 800] m; uniform-by-area distribution (radius median ≈ √((300²+800²)/2) ≈ 604 m) |
| U-03 | FR-3, EC-5 | `validateGoalCandidate` snap 151 m | Unit | Rejected: `snapTooFar` |
| U-04 | FR-3, EC-6 | Snapped goal at 299 m / 801 m / 300 m / 800 m | Unit | Reject / reject / accept / accept (inclusive bounds) |
| U-05 | FR-3, EC-7 | Shortest candidate 1,601 m | Unit | Rejected: `routeTooLong` |
| U-06 | FR-5, EC-11 | `selectShortestRoute` with [1286.8, 1272.5] (verified real case) and with one route | Unit | Picks 1272.5; single route returned as-is |
| U-07 | FR-7 | `isGoalReached` at 24.9 / 25 / 25.1 m | Unit | true / true / false |
| U-08 | FR-2, EC-3 | `selectStartFix` — good fix arrives; only coarse fixes; none | Unit | First ≤ 100 m fix; best (lowest accuracy) fix + warning flag; none → not selected |
| U-09 | FR-7, EC-13 | Reducer: `playing` + position ≤ 25 m → `won`; `won` + further positions | Unit | Transitions once; `won` unchanged afterwards |
| U-10 | FR-4 | Reducer: any event in `playing` other than RESTART/LOCATION_FAILED | Unit | `goal` reference unchanged |
| U-11 | FR-8, EC-12 | Reducer: event with stale `sessionId` | Unit | State unchanged |
| U-12 | — | Reducer: every state × every event | Unit | Only the transitions in ARCHITECTURE §3; others ignored |
| U-13 | NFR-8, EC-14/15 | `validateConfig`: threshold ≥ minRadius, min ≥ max, route < max radius, negative, zero, NaN, non-integer attempts, bad URL, out-of-range sim coords; missing/empty values | Unit | Specific `ConfigError`s for every invalid field; missing/empty values fall back to the approved defaults |
| U-14 | FR-3 | `generateGoal`: attempt 1 invalid, attempt 2 valid | Unit | Returns attempt 2 goal = `snappedTo`; 2 provider calls |
| U-15 | FR-10, EC-8/9 | `generateGoal`: 5 × NoRoute / invalid | Unit | `GOAL_FAILED` after exactly 5 calls |
| U-16 | FR-11 | `generateGoal`: provider `unavailable` | Unit | Stops immediately with a routing failure (no new candidates) |
| U-17 | FR-8 | `generateGoal` with aborted signal | Unit | Rejects with abort; no further calls |
| A-01 | FR-5 | OSRM adapter maps an Ok fixture | Adapter | `[lng,lat]` → `{lat,lng}`; candidates, snaps, distances correct |
| A-02 | FR-5 | Request URL | Adapter | `/routed-foot/route/v1/foot/{lng,lat};{lng,lat}?alternatives=true&overview=full&geometries=geojson` |
| A-03 | EC-8 | `NoRoute` fixture (HTTP 400 body) | Adapter | `RoutingError(noRoute)` |
| A-04 | EC-10 | 500 / 429 / network error / >8 s | Adapter | `unavailable` / `rateLimited` / `unavailable` / `timeout` |
| A-05 | NFR-5 | Three rapid calls (fake timers) | Adapter | Requests ≥ 1,000 ms apart |
| A-06 | NFR-7 (P1) | First call 503, second Ok | Adapter | One retry with backoff → success |
| A-07 | FR-9, EC-1/2/4 | Browser provider: codes 1/2/3; no `navigator.geolocation` | Adapter | `denied` / `unavailable` / `timeout` / `unsupported` |
| A-08 | EC-17 | Browser provider unsubscribe | Adapter | `clearWatch(id)` called |
| A-09 | FR-12 | Simulated provider `setPosition`/nudge | Adapter | Emits a `Fix` to subscribers; nudge moves ~N m on the correct bearing |
| I-01 | FR-2/3/5 | Controller happy path (fake providers) | Integration | idle → acquiring → generating → playing with goal + route |
| I-02 | FR-2, EC-3 | Only coarse fixes for 10 s (fake timers) | Integration | Proceeds with the best fix + warning |
| I-03 | FR-9 | Location denied → Retry | Integration | `locationError(denied)` → re-subscribes on Retry |
| I-04 | FR-8, EC-12 | Restart while `generateGoal` is pending; old result resolves late | Integration | Old result ignored; new session goal shown |
| I-05 | EC-17 | Unmount during play | Integration | Location unsubscribed; request aborted |
| I-06 | FR-9/10/11, FR-7 | Panels render for each error kind and for `won` | Integration (RTL) | Correct message, Retry/Restart buttons accessible by role |
| I-07 | FR-12, AC-8 | Badge with sim on / off | Integration (RTL) | "SIMULATED LOCATION" present only with the flag |
| I-08 | NFR-13 (P1) | Child throws | Integration (RTL) | ErrorBoundary fallback shown |
| E-01 | AC-2/3/4/5, FR-1/4/5/6/7 | `?simulate=1`, OSRM intercepted: ball, goal, route, approach line visible; move to goal | E2E | "Goal reached" appears once |
| E-02 | FR-2, AC-2 | Real browser provider: `grantPermissions` + `setGeolocation`, then a new geolocation | E2E | Ball renders at the start; position update moves the ball |
| E-03 | FR-9, AC-6 | Permission not granted | E2E | Denied panel + Retry; no goal marker |
| E-04 | FR-11, AC-7 | OSRM intercepted → 500 / abort | E2E | Routing error panel; no route polyline |
| E-05 | FR-8, AC-9 | Restart after win | E2E | New session; goal shown again; no "goal reached" |
| E-06 | FR-14 | Attribution | E2E | OSM attribution + "fix the map" link + routing credit visible |
| E-07 | NFR-1/11/12, AC-1 | Against the **Docker** container: page loads, healthcheck OK, security headers present, no CSP violations in the console during E-01 | E2E | Pass |
| E-08 | FR-5 (@live, opt-in) | Real OSRM, real goal generation near a fixed sim start | E2E | Goal + route rendered (network-dependent; not in the default run) |
| M-01 | FR-2, AC-2 | Real host location in Chrome/Safari on macOS | Manual | Ball near the true position; accuracy circle plausible |
| M-02 | FR-9 | Block location in browser settings, then re-enable + Retry | Manual | Guidance accurate; Retry works |
| M-03 | NFR-15 | Visual check of cleaned ball/goal on light and dark tiles | Manual | No checkerboard artefacts |
| M-04 | NFR-1/2, AC-1 | Fresh clone → follow README only → `docker compose up --build` | Manual | Runs without extra steps |
| M-05 | AC-10, NFR-3 | `git ls-files` + grep for secrets/.env before final push | Manual | Nothing sensitive tracked |

## Not automated (and why)
- Real GPS movement outdoors — physical; covered by the simulator (E-01) plus M-01.
- Live OSRM availability — external; E-08 is opt-in, and manual smoke testing happens before submission.
- Pixel-perfect map rendering — low value; E2E asserts presence and attributes of Leaflet elements instead.
