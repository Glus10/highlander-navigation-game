# Requirements — Part 1

Sources: `TASK.md` (primary), `DECISIONS.md` (approved interpretations). Priority: **P0** = mandatory, **P1** = robustness / production readiness, **P2** = optional / bonus.

## Functional requirements

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| FR-1 | Show the player as the **ball** marker at the player's live position; it updates as the position changes. | P0 | TASK §2.2 |
| FR-2 | Get the player's position from the **host machine** via the browser Geolocation API (host OS location services). Start position = first fix with accuracy ≤ 100 m within 10 s, otherwise the best fix seen, plus a warning. Then continuous `watchPosition`. | P0 | TASK §2.3, D4a |
| FR-3 | At game start, automatically generate **one** goal relative to the **start position**: snapped goal within **300–800 m** (straight-line) of the start, on the walkable network, snap ≤ 150 m, route ≤ 1,600 m, ≤ 5 attempts. | P0 | TASK §2.2–2.3, D3a/D3d |
| FR-4 | Show the goal as the **goal** marker. It stays **static** for the session. | P0 | TASK §2.2 |
| FR-5 | At game start, show the shortest valid **walking** route from start to goal, using permissible routes only (OSRM foot geometry). Among the routes OSRM returns, show the one with the **smallest distance**. Never draw a straight-line route. | P0 | TASK §2.2–2.3, D3b |
| FR-6 | Draw a dashed **approach line** from the start position to the snapped route start, styled distinctly as guidance only. | P0 | D3e |
| FR-7 | When the live distance to the goal is ≤ **25 m**, show "goal reached" feedback **exactly once** (latch → `won`). | P0 | TASK §2.2, D3c |
| FR-8 | **Restart** starts a new session: new start fix, new goal, new route. In-flight work is aborted; stale results are ignored. | P0 | D5b |
| FR-9 | Location **denied / unavailable / timeout** → stop with error-specific guidance and a **Retry** button. No default location. | P0 | D4b |
| FR-10 | No valid goal after max attempts → "couldn't place a goal" error + Retry. | P0 | D3a |
| FR-11 | Routing provider failure (network, timeout, 4xx/5xx) → routing error + Retry. No straight-line fallback. | P0 | D2 |
| FR-12 | **Simulation mode** behind the explicit `?simulate=1` flag, off by default: click the map to move the ball, arrow keys nudge it; permanent **"SIMULATED LOCATION"** badge. | P0 | D4c |
| FR-13 | Show position accuracy (circle around the ball) and a low-accuracy warning when the start fix exceeds 100 m. | P1 | D4a |
| FR-14 | Show attribution: "© OpenStreetMap contributors", a "fix the map" link, and routing credit (FOSSGIS/OSRM). | P0 | D2 (licence/usage policy) |

## Non-functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | **Runs with `docker compose up`** on a dev machine; app at `http://localhost:8080`. | **P0** |
| NFR-2 | README gives clear setup, run, test and config instructions. | P0 |
| NFR-3 | **No secrets** in the repo or history; `.gitignore` from the first commit; `.env.example` with non-secret defaults only. | P0 |
| NFR-4 | No cloud **accounts** or keys. External public services (OSM tiles, FOSSGIS OSRM) are documented as runtime dependencies. | P0 |
| NFR-5 | Respect the OSRM usage policy: client-side throttle of **≥ 1 s between requests**. | P0 |
| NFR-6 | Every OSRM request has a **timeout (~8 s)** and is cancellable (`AbortSignal`). | P0 |
| NFR-7 | One retry with backoff for transient OSRM failures (network / 5xx / 429 / timeout). | P1 |
| NFR-8 | All tunable values live in one config module (build-time `VITE_*`), **validated at startup**; invalid config → fail fast with a clear error. | P0 |
| NFR-9 | Layered, framework-independent domain logic; strict TypeScript; lint clean. | P0 |
| NFR-10 | Automated unit, integration and E2E tests per `TEST_PLAN.md`; typecheck and build pass. | P0 |
| NFR-11 | Security headers in nginx: CSP (connect-src = OSRM host, img-src = OSM tile host), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. | P1 |
| NFR-12 | Production serving: unprivileged nginx, pinned images, `.dockerignore`, healthcheck, restart policy, long cache for hashed assets, no-cache for `index.html`, compression. | P1 (healthcheck P0) |
| NFR-13 | React error boundary; `logger` module as the single telemetry seam. | P1 |
| NFR-14 | README "Production considerations" (CDN, self-hosted OSRM, rate limits, observability, Part 2 path). | P1 |
| NFR-15 | Clean assets: transparent `ball.png` / `goal.png` derived from the supplied files; originals untouched. | P0 |

## Constraints
- Stack: React + TypeScript + Vite, Leaflet/`react-leaflet`, Vitest + RTL + Playwright, Docker multi-stage → nginx (DECISIONS.md).
- Public GitHub repo; no API keys anywhere.
- Secure context required for geolocation → serve on `localhost`.
- Walking mode only; `TravelMode` union keeps cycling/driving open.

## Acceptance criteria (P0)
- **AC-1** A fresh clone + `docker compose up --build` serves the app on `http://localhost:8080`; the healthcheck becomes healthy.
- **AC-2** With location granted, the ball appears at the host's position, and the accuracy-gated start fix is used.
- **AC-3** A goal marker appears automatically; its distance from the start is within 300–800 m; it never moves during the session.
- **AC-4** A walking route (OSRM geometry, the shortest-distance candidate) is drawn from the start to the goal; the dashed approach line connects the start position to the route start.
- **AC-5** Moving within 25 m of the goal (real or simulated) shows "goal reached" once; further updates don't re-trigger it.
- **AC-6** Denied, unavailable and timed-out location each show a specific message and Retry; no map game starts with a fake location.
- **AC-7** An OSRM failure shows a routing error + Retry; no straight line is drawn.
- **AC-8** `?simulate=1` enables simulation with the visible badge; without the flag no simulation UI exists.
- **AC-9** Restart produces a fresh goal; results from the previous session never appear.
- **AC-10** No secrets, `.env` files, `node_modules` or `dist` are tracked; the README documents run, test and config.
- **AC-11** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the Playwright E2E suite all pass.

## Edge cases
| ID | Case | Expected handling |
|----|------|-------------------|
| EC-1 | Permission denied (code 1) | FR-9; guidance on browser/OS settings (can't re-prompt from code) |
| EC-2 | Position unavailable (code 2) / timeout (code 3) | FR-9 |
| EC-3 | First fix coarse (e.g. IP-based, km-level) | Wait ≤ 10 s for ≤ 100 m; else best fix + warning |
| EC-4 | Geolocation API missing / insecure context | Treated as unavailable with an explanatory message |
| EC-5 | Candidate in water/park → snapped far away (verified: `/nearest` returns points up to ~900 km away) | Rejected by `maxSnapDistance`; retry |
| EC-6 | Snapped goal falls outside the ring | Rejected; retry |
| EC-7 | Route very long (detours, **ferries** — verified foot profile uses them) | Rejected by `maxRouteLength`; retry |
| EC-8 | OSRM `NoRoute` | Candidate rejected; retry |
| EC-9 | All attempts fail (sparse/rural area) | FR-10 |
| EC-10 | OSRM 429/5xx/network/timeout/CORS failure | FR-11 (P1: one retry first) |
| EC-11 | Only one route returned (no alternative) | Use it |
| EC-12 | Restart while a request is in flight | Abort + session id; late result ignored |
| EC-13 | Position jitter around the threshold | Latch: fires once |
| EC-14 | Player starts within 25 m of the goal | Impossible by config validation (`threshold < minRadius`) |
| EC-15 | Invalid config values | Fail fast at startup with a config error screen |
| EC-16 | Start position snaps far from roads | Approach line shows the gap honestly |
| EC-17 | Watcher still active after unmount/restart | `clearWatch` / unsubscribe on cleanup |

## Explicit assumptions
- **A-1** "Game start (system going live)" = the app starts the game automatically on page load; Restart begins a new session.
- **A-2** "Host machine location" = the browser Geolocation API on the host (a container cannot read host location services).
- **A-3** "No additional cloud dependencies" = no cloud accounts, keys or deployed cloud services; public best-effort tiles and routing are accepted and documented.
- **A-4** "Shortest valid path" = the shortest-distance candidate among the OSRM foot routes returned (see the D3b wording); not a guaranteed global distance optimum.
- **A-5** "Within a defined radius" = straight-line distance from the start position to the snapped goal, in [300, 800] m.
- **A-6** The goal radius is anchored to the start position, not the live position.
- **A-7** The simulation start position = `lat`/`lng` URL params, or a documented configured default; always badged.

## Bonus (not mandatory)
- **B-1 (P2)** Dynamic route update when the player moves before reaching the goal. **Skipped by decision D5c**; documented design only (throttled re-route > 20 m and ≥ 5 s, abort stale requests, keep the old route on failure). It must not delay P0.

## Part 2 — out of implementation scope
Multi-user sessions, shared real-time map, first-to-goal arbitration, concurrency/conflict resolution, CI/CD pipeline and staging deployment are **not implemented** unless explicitly reopened. The architecture keeps the domain pure so it could move server-side (see `DESIGN.md`).
