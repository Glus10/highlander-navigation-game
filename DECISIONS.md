# Engineering Decisions

Decisions made before implementation for the High Lander navigation game (Part 1 only).
Source of truth for requirements: `TASK.md`.

## Constraints that shaped every decision

- **Scope:** Part 1 is the implementation target. Part 2 (multiplayer, CI/CD) is analysed, not built.
- **Docker Compose is mandatory** (P0 acceptance requirement).
- **Public repository:** no API keys, credentials or secrets may ever be committed.
- **"Runs locally without additional cloud dependencies"** (TASK.md §2.4).
- **Supplied assets** (`public/assets` ball and goal) must be used.

## Summary

| # | Gate | Decision |
|---|------|----------|
| 1 | Frontend stack | React + TypeScript + Vite (SPA) |
| 2 | Map + routing | Leaflet + OSM tiles + hosted keyless OSRM (configurable base URL) |
| 3 | Game logic | Ring → snap → validate → retry; walking only; 300–800 m ring, 25 m threshold; plain threshold + latch; dashed approach line |
| 4 | Location | Accuracy-gated start fix, then `watchPosition`; hard stop on denial; flag-gated simulator |
| 5 | Architecture/state | Pure reducer state machine + `useGameController` hook; bonus re-routing skipped |
| 6 | Testing/Docker/security/ops | Vitest + RTL + Playwright; nginx with build-time config; security headers; pragmatic prod-readiness; cleaned assets |

---

## D1 — Frontend stack

**Chosen:** React + TypeScript + Vite single-page app.

**Alternatives considered**
- Vanilla TypeScript + Vite — rejected: hand-written DOM/state sync gets verbose across 5+ UI states; weaker maintainability story.
- Next.js — rejected: SSR/RSC adds nothing (maps and geolocation are browser-only); a Node runtime is heavier than static files. Its main advantage (server routes to hide keys) became irrelevant after D2.

**Rationale:** The problem is client-side (browser geolocation, map rendering). Static production build, strong test tooling, and existing familiarity reduce delivery risk.

**Tradeoffs:** React effect pitfalls (stale closures, cleanup of watchers) must be handled deliberately.

**Consequences:** Game logic lives in framework-free TypeScript modules; React is only the UI and wiring layer. Production artifact = static files.

---

## D2 — Map + routing architecture

**Chosen:** Leaflet (`react-leaflet`) + OpenStreetMap tiles + hosted, keyless OSRM routing (`routing.openstreetmap.de`, foot profile). Routing base URL is configuration.

**Alternatives considered**
- **Google Maps Platform — a serious alternative, rejected for this assignment** because of:
  - the mandatory Google Cloud billing account,
  - API-key management (a browser key is public by design and must be restricted and quota-capped),
  - extra setup and security overhead in a public repo — every reviewer would need their own key to run it.
  - It also conflicts with "no additional cloud dependencies" and optimises for travel time without a shortest-distance option.
  - **In a different production context** where billing and key management are acceptable, Google Maps could be the better choice: its reliability/SLA, routing quality and ecosystem may justify the tradeoff.
- Self-hosted OSRM in Docker Compose — rejected as the default: heavy first run (download + preprocessing, GBs of RAM), region-locked map extract (reviewers elsewhere get "no route"), +3–5 h. Kept as the documented upgrade path.

**Rationale:** Zero secrets, zero account setup, clone-and-run works; OSRM's snapping (the `/route` waypoints, plus `/nearest`) directly supports the goal-reachability guarantee; fastest to deliver.

**Tradeoffs**
- Tiles and routing depend on **public best-effort services** with no SLA and fair-use limits (~1 req/s). This is our documented interpretation of the "no cloud dependencies" requirement: no cloud *account* or deployed cloud service, but not offline.
- Required attribution: "© OpenStreetMap contributors" (ODbL); must respect the OSM tile usage policy (sends Referer).
- **Verified FOSSGIS usage policy** (routing.openstreetmap.de/about.html):
  - **max 1 request/second**,
  - display attribution plus a "fix the map" link,
  - send a valid user agent and referrer,
  - no heavy use.
- The service sends `Access-Control-Allow-Origin: *`, so direct browser calls work. Coverage is worldwide; data is updated roughly every 2 days.

**Consequences**
- Routing sits behind a `RoutingProvider` interface; the OSRM adapter is the only module that knows OSRM URLs/JSON.
- The OSRM adapter enforces **≥ 1 s spacing between requests** (client-side throttle).
- The profile is chosen by **base URL path** (`/routed-foot`, `/routed-bike`, `/routed-car`); the profile segment inside the URL is ignored by this server.
- Because self-hosted OSRM speaks the same HTTP API, removing the cloud routing dependency later = change the base URL + add a Compose service. No app code change.
- Routing failures must be explicit, user-visible error states with retry.

---

## D3 — Game logic and goal generation

### D3a — Goal generation algorithm

**Chosen:** Random point in a ring → snap to the walkable network (via the OSRM `/route` response; see amendment) → validate → retry (bounded).

Validation rules (all pure functions):
- the **snapped** goal is within `[minRadius, maxRadius]` of the **start position** (straight-line, haversine),
- the snap moved the candidate ≤ `maxSnapDistance`,
- a walking route exists and its length ≤ `maxRouteLength`.

After `maxAttempts` failures the game shows an explicit "couldn't place a goal" error with retry.

**Alternatives considered**
- Random point used as-is — **rejected due to reachability risk:** the goal can land in water, buildings or private land; OSRM silently routes to the nearest road, so the player may never get within the threshold.
- Route-first (place goal X m along a route) — **rejected as unnecessary complexity:** polyline-walking geometry, road bias, harder to explain, for little extra value.

**Rationale:** Reachability guaranteed by construction; maps directly to "within a defined radius"; every step independently testable.

**Tradeoffs:** Retries add latency and load on the public server. Straight-line radius ≠ route length (handled by the route-length cap).

**Amendment after OSRM verification (2026-10-08):** The hosted server allows **max 1 request/second**. A separate `/nearest` call per attempt would double the request count. The `/route` response already returns the **snapped destination** (`waypoints[1].location`) and its **snap distance** (`waypoints[1].distance`). So snapping is done by the route request itself: **one request per attempt** (≤ 5 total), and that route becomes the game route. The algorithm is unchanged: ring → snap → validate → retry. Only the mechanism of the snap step changed. `/nearest` was verified to work and remains available if ever needed.

### D3b — Travel mode and "shortest"

**Chosen:** **Walking only** for the initial implementation. Request `alternatives=true` and display the alternative with the smallest `distance`.

**Why walking:** Fits a ball-to-goal game played on foot; uses footpaths; car routes are odd (one-way streets), unsafe to play, and time ≠ distance on motorways.

**Extensibility:** Cycling and driving are **intentionally left as future extensions** via the routing abstraction: `TravelMode` is a union type (today `'walking'`), and the OSRM adapter maps mode → profile URL. Game logic and UI only pass `mode` through.

**What "shortest" precisely means — do not overclaim:**
- OSRM returns the route that is **optimal for its profile's weight** over its OSM graph. Its algorithms (CH/MLD) are exact for that weight.
- **Verified:** the hosted foot profile is a FOSSGIS-customised profile (it differs from upstream OSRM) and reports `weight_name: "routability"`. That is a **preference score**, neither duration nor distance. **Verified example:** for one Tel Aviv query, OSRM's primary route was 1,286.8 m, while its alternative was 1,272.5 m. The primary route is therefore **not** always the shortest by distance, which justifies the minimum-distance selection rule.
- Alternatives are not guaranteed: up to 2 were returned in tests, even with `alternatives=3`. The foot profile also uses ferries, so routes can be very long (handled by `maxRouteLength`).
- Data is only as current as the server's OSM snapshot; the route starts at the *snapped* start point.
- **Defensible claim:** *"OSRM returns the optimal walking route according to its foot profile's 'routability' weight, plus up to one alternative. We display the candidate with the shortest distance. This approximates, but does not guarantee, the mathematically shortest walking distance."*

### D3c — Goal-reached detection

**Chosen:** Plain threshold + latch: `haversine(player, goal) ≤ threshold` fires once, then the game moves to a terminal `won` state.

**Alternative rejected:** Accuracy-aware threshold (ignore low-accuracy fixes / require consecutive hits) — more robust on real GPS, but may **never fire on a desktop** with 50–100 m Wi-Fi accuracy. Documented as a future option.

**Tradeoff:** A very noisy fix could trigger a false positive. Accuracy is shown in the UI as information only.

### D3d — Radius and threshold values

**Chosen: Preset B**, centralised in one config module and validated at startup.

| Parameter | Value |
|---|---|
| Ring min / max radius | 300 m / 800 m |
| Goal threshold | 25 m |
| Max snap distance | 150 m |
| Max route length | 1,600 m (2 × max radius) |
| Max generation attempts | 5 |

**Rationale:** Meaningful but walkable (~5–15 min); threshold above typical outdoor GPS noise; few retries in urban areas.

**Rejected:** Compact (100–400 m) — the goal can fall inside desktop position uncertainty and feels trivial. Large (500–1,500 m) — 20+ min walks, hard to test, more fragile on the public server.

**Tradeoffs:** Occasional retries in sparse rural networks; desktop fixes can be coarser than the threshold (mitigated by the simulator, D4c).

**Config validation rules:** `threshold < minRadius`, `minRadius < maxRadius`, `maxRouteLength ≥ maxRadius`, all values > 0. Invalid config fails fast with a clear error.

### D3e — Start gap rendering

**Chosen:** A thin **dashed "approach" line** from the ball to the snapped route start.

**Rationale:** OSRM snaps the start to the nearest walkable way (often 5–50 m away); without the line the route appears disconnected from the player.

**Tradeoff / guardrail:** It is a straight segment, so it is styled distinctly and is **visual guidance only — never the gameplay route**. The gameplay path is always the OSRM geometry; if routing fails, we show an error, never a straight-line fallback.

### Invariants (apply to all of D3)
- The goal is generated **once**, at game start, relative to the **start position**, and remains **static** for the session. Only an explicit restart creates a new goal.
- The gameplay route always follows permissible map routes (OSRM geometry). No aerial path.

---

## D4 — Location strategy

All location access goes through a `LocationProvider` interface (`subscribe(onFix, onError) → unsubscribe`). Game logic never touches `navigator`. The browser Geolocation API reads the **host OS location services**, satisfying "retrieved directly from the host machine". It requires a secure context — `http://localhost` qualifies.

### D4a — Acquisition
**Chosen:** Accuracy-gated start fix, then `watchPosition`.
- Wait up to ~10 s for a fix with accuracy ≤ ~100 m; otherwise use the best fix seen and show a low-accuracy warning.
- Then `watchPosition` with `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 15 s`.
- Ball shows an accuracy circle. Values may be adjusted if implementation constraints require.

**Rejected:** One-shot `getCurrentPosition` (no live marker — fails FR1). `watchPosition` only (first fix is often coarse/IP-based, so the goal ring is anchored to a bad position).

**Tradeoff:** Extra states (acquiring, low-accuracy warning) and a short start delay.

### D4b — Denied / unavailable location
**Chosen:** Hard stop with per-error guidance (denied / unavailable / timeout) and a retry button. No silent default location.

**Rejected:** "Pick start on map" manual mode — departs from FR5 and isn't needed for P0.

**Tradeoff:** A reviewer with location blocked sees only the error screen. Note: `PERMISSION_DENIED` cannot be re-prompted from code; guidance must explain browser/OS settings.

### D4c — Movement simulation
**Chosen:** `SimulatedLocationProvider` behind an explicit flag (e.g. `?simulate=1`), **off by default**, with a permanent, clearly visible **"SIMULATED LOCATION"** indicator.

**Rationale:** Desktops don't move; this makes goal detection demoable in the exact production build reviewers run via Docker, and enables deterministic E2E tests.

**Rejected:** No simulator (DevTools-only demos are clunky). Dev-build-only simulator (Docker runs the production build, so reviewers couldn't demo).

**Tradeoff:** Debug functionality ships in the production bundle. Acceptable in Part 1 because it is client-only, opt-in, visibly labelled and affects only the user's own view. **Must be revisited in Part 2:** a multiplayer server must never trust client-reported positions blindly.

---

## D5 — Application architecture and state management

### D5a — State model
**Chosen:** `useReducer` with a **pure reducer as an explicit state machine**. Phases are a discriminated union, each carrying only the data valid in that phase:

```
idle → acquiringLocation → generatingGoal → playing → won
             ↓                   ↓
      locationError     goalGenerationFailed | routingError   (retry/restart)
```

(Amended after OSRM verification: goal and route are produced by the same request, so the separate `routing` phase was merged into `generatingGoal`. `routingError` = provider unavailable; `goalGenerationFailed` = no valid candidate within `maxAttempts`.)

**Rejected:** Zustand (state-machine discipline is optional; impossible states creep in; extra dependency). XState (steep curve, heavy for ~8 states, harder to defend quickly).

**Rationale:** No dependency; impossible states are unrepresentable; TypeScript enforces exhaustive handling; the reducer is plain TS and could run server-side in Part 2. State lives in the top-level game screen and flows down as props.

### D5b — Async orchestration
**Chosen:** A `useGameController` hook owns the reducer, subscribes to the `LocationProvider`, calls async services and dispatches events.
- Services are plain functions with injected dependencies (e.g. `generateGoal(start, config, routing, rng)`).
- Every request takes an `AbortSignal`; restart aborts in-flight work and bumps a **session id**, so late responses can never overwrite a new game.

**Rejected:** Framework-free `GameController` class + `useSyncExternalStore` — more code, a less familiar pattern, for benefits only Part 2 would use.

**Tradeoff:** Effect dependencies and stale closures need care; mitigated by session-id tagging and integration tests.

### D5c — Bonus: dynamic re-routing
**Chosen: Skipped.** The route is computed once at game start. `watchPosition` still drives the live ball marker and goal detection.

**Rationale:** Protects P0 delivery; avoids extra load on the public routing server.

**Documented extension (not built):** Throttled re-route when the player moved > 20 m and ≥ 5 s since the last request; abort stale requests; keep the previous route on failure. Off-route detection + route trimming was considered and judged overkill.

### Module layout

```
src/domain/    geo math, goal rules, detection, gameReducer   (pure, no I/O)
src/services/  goal generation, route fetching                (pure + injected interfaces)
src/adapters/  osrmRoutingProvider, browserLocationProvider, simulatedLocationProvider
src/app/       useGameController, config loading/validation
src/ui/        MapView, markers, route/approach lines, status panels, SimulatedBadge
```

Dependencies point one way: `ui → app → services → domain`. Adapters implement interfaces owned by `domain`/`services`.

---

## D6 — Testing, Docker, security, production readiness

### D6a — Testing stack
**Chosen:** Vitest + React Testing Library + Playwright.
- **Unit:** geo math, seeded ring sampling, goal validation, detection + latch, reducer transitions, config validation, start-fix selection.
- **Adapter:** stubbed `fetch` + recorded OSRM JSON fixtures (no MSW — interfaces make faking simple).
- **Integration:** `useGameController` with fake providers and fake timers; status panels.
- **E2E (Playwright):** happy path via simulator; real browser provider via `setGeolocation`; permission denied; OSRM failure (intercepted 500/timeout). Optional `@live` OSRM smoke test, excluded by default.
- Map visuals are covered by E2E only (Leaflet doesn't render meaningfully in jsdom).

**Rejected:** Vitest + RTL only (no automated proof of the critical flow). Jest + Cypress (extra Vite transform config; clunkier geolocation faking).

**Tradeoff:** Playwright browser downloads (dev-only, not in the image).

### D6b — Docker shape and configuration
**Chosen:** Multi-stage build (Node builds → unprivileged nginx serves static files) with **build-time configuration** (`VITE_*` values passed as Compose build args).
- Pinned image tags, `.dockerignore`, Compose healthcheck and restart policy.
- Long-cache headers for hashed assets; no-cache for `index.html`.
- `docker compose up` → `http://localhost:8080` (localhost keeps geolocation's secure context).

**Rejected:** Runtime config injection (`config.json` written at container start) — cleaner "build once, deploy many", but ~1 h extra; deferred to Part 2 CI/CD where it pays off. Single Node container (`vite preview` is not meant for production; larger attack surface).

**Tradeoffs / consequences**
- Any config change (radius, OSRM URL) requires an image rebuild; one image per environment.
- Config values are visible in the bundle — acceptable because none are secret.
- The app still validates config at startup and fails fast with a clear error.
- The CSP `connect-src` (D6c) must stay in sync with the configured OSRM host.

### D6c — Security and secret hygiene
**Chosen:** Baseline + security headers.
- `.gitignore` from the first commit (`.env*` except `.env.example`, `node_modules`, `dist`, test reports); `.env.example` with non-secret defaults.
- GitHub secret-scanning push protection enabled; `npm audit` before submission.
- nginx headers: Content-Security-Policy (`connect-src` limited to the OSRM host, `img-src` to the OSM tile host), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

**Rejected:** Baseline only (no defence-in-depth). Gitleaks/pre-commit hooks — skipped as more tooling than value when no secrets exist.

**Tradeoff / gotcha:** A CSP mistake silently breaks tiles or routing — covered by E2E. `no-referrer` must **not** be used: the OSM tile policy requires a Referer.

### D6d — Production-readiness scope
**Chosen:** Pragmatic.
- React error boundary; explicit error states.
- OSRM request timeout (~8 s) with one retry + backoff for idempotent requests.
- Compose healthcheck; caching and compression headers; OSM attribution.
- Small `logger` module (single seam for future telemetry).
- README "Production considerations": static hosting on a CDN, self-hosted OSRM, rate limits, observability.

**Rejected:** Minimal (too thin for "production-ready"). Extensive — Sentry, CI pipeline, service worker, metrics — scope creep overlapping Part 2; listed as future work.

### D6e — Assets
**Verified issue:** both supplied `.png` files are actually **JPEGs** with the transparency checkerboard painted into the pixels; filenames contain spaces ("Copy of …").

**Chosen:** One-off cleanup into true transparent PNGs (`ball.png`, `goal.png`). Originals kept untouched; processing steps documented.
- Ball: circular alpha mask.
- Goal: colour-key removal of the checkerboard; the net interior is itself checkered, so the result needs visual review. **Fallback:** CSS mitigation for the goal if cleanup quality is poor.

**Rejected:** Use as-is (grey checkered squares on the map look broken). CSS-only (goal still looks wrong).

---

## Open verification items (hypotheses to confirm during implementation)

- ~~OSRM URL format, `/nearest`, `weight_name`, rate limit~~ — verified 2026-10-08; see `PROGRESS.md`.
- Quality of the automated goal-image cleanup.
- Real desktop geolocation accuracy on the demo machine (affects the 100 m start-fix gate).

## Out of scope for Part 1 (documented, not built)

- Bonus dynamic re-routing (D5c).
- Cycling/driving modes (D3b).
- Self-hosted OSRM Compose profile (D2).
- Runtime config injection (D6b).
- Part 2: multiplayer, server authority over positions, CI/CD pipeline, staging deployment.
