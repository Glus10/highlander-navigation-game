# Progress

_Last updated: 2026-10-08_

## Phase checklist
- [x] Discovery and decision gates 1–6 (`DECISIONS.md`)
- [x] Pre-work: hosted OSRM verification (read-only)
- [x] Planning docs: REQUIREMENTS, DESIGN, ARCHITECTURE, TEST_PLAN, PLAN, PROGRESS
- [x] Phase 0 — Repository bootstrap (P0) — verified 2026-10-08
- [x] Phase 1 — Domain logic (P0) — verified 2026-10-08
- [x] Phase 2 — Adapters (P0) — verified 2026-10-08
- [x] Phase 3 — Controller (P0) — verified 2026-10-08
- [x] Phase 4 + 5 — UI and Docker Compose, combined under time pressure (P0) — verified 2026-10-08
- [ ] Phase 6 — Hardening (P1) — **skipped** (time)
- [ ] Phase 7 — Handoff (P1) — **skipped** (time; this file + README serve as the handoff)
- [ ] Phase 8 — Bonus re-routing (P2) — **not implemented** (D5c)

## Current status
**All Part 1 P0 requirements are implemented and merged to `main`.**
- **Implemented:**
  - Real-location mode (default).
  - Goal generation on the walkable network (ring → snap → validate → retry).
  - Shortest walking route among OSRM's candidates, with a dashed approach line.
  - Live ball marker; 25 m goal detection with latch.
  - Loading, error and won screens.
  - Simulation mode behind `?simulate=1` — for testing/demo only, not an assignment requirement.
  - Docker Compose delivery on `http://localhost:8080`.
- **Remaining:** P1 hardening and P2 bonus were skipped (see "Skipped scope").
- **Not done yet:** manual real-location check M-01 in a real browser (see "Manual verification pending").

## Phase 4 + 5 — verification results (2026-10-08, branch `phase/04-05-ui-docker`)
| Command | Result |
|---|---|
| `npm test` | Exit 0 — 15 files, **209 passed**, 0 failed, 0 skipped (adds StatusPanel I-06, badge I-07, App) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Exit 0 / exit 0, no findings / exit 0 |
| `npm run test:e2e` (vite preview, tiles blocked, OSRM stubbed with a recorded fixture) | **5 passed**: smoke; E-01 simulated walk → goal reached → play again; E-02 real browser geolocation path (`setGeolocation`); E-03 permission denied; E-04 routing HTTP 500 |
| `docker compose up -d --build` | Built; container **healthy**; `/healthz` → `ok`; `/` → 200 (`Cache-Control: no-cache`); SPA deep link → 200; runs as uid 101 (`nginx`); image 82.2 MB |
| `BASE_URL=http://localhost:8080 npx playwright test` | **5 passed** against the container |
| Manual scripted check against the container, live tiles + live FOSSGIS OSRM, `?simulate=1` | Route 452 m drawn; clicking the goal → "Goal reached!"; 0 console errors; screenshots reviewed |
| After merge on `main` | 209 passed; typecheck, lint, build exit 0 |

Merges: `phase/03-controller` → `main` as `3f7e9af`; `phase/04-05-ui-docker` (commits `4ef7e03`, `d80d9ab`) → `main` as `f13044a`; all pushed.

**Implementation notes:**
- **Marker assets:** they are JPEGs with a painted checkerboard, and no image library was available, so they are shown with the agreed CSS fallback (crop/mask). Copies with a correct `.jpg` extension live in `src/ui/assets/` (content-hashed by Vite); the originals in `public/assets/` are untouched.
- **react-leaflet `className`:** `Polyline` `className` must be a prop (not inside `pathOptions`), otherwise Leaflet ignores it.
- **E-01 restart assertion:** E-01 only checks that "Play again" leaves the won state. With a fixed fixture, a new goal from the goal position is correctly rejected (0 m from the start).

## Skipped scope (decided under time pressure)
- **P1 (Phase 6):**
  - nginx security headers / CSP (NFR-11)
  - OSRM one retry with backoff (NFR-7)
  - React error boundary + `logger` module (NFR-13)
  - accuracy circle on the map (FR-13 — the low-accuracy text warning **is** implemented)
  - README "Production considerations" (NFR-14)
  - E-07 (headers/CSP check), A-06, I-08
- **P1 (Phase 7):** `HANDOFF.md`.
- **P2:** dynamic route re-calculation bonus (B-1 / D5c) and the optional live-OSRM E2E (E-08).
- **Asset cleanup to true transparent PNGs** (D6e option B) — CSS fallback used instead.

## Manual verification pending (must be done by a person)
- **M-01:** real host location in Chrome and Safari on macOS (allow location; OS Location Services must allow the browser).
- **M-02:** block location → guidance → re-allow → Retry.
- **M-03:** visual check of the markers. The goal shows the checkerboard; this is a known limitation.

## Phase 3 — verification results (2026-10-08, branch `phase/03-controller`)
| Command | Result |
|---|---|
| `npx vitest run` | Exit 0 — 13 files, **199 passed**, 0 failed, 0 skipped (+30: controller I-01…I-05 plus extra cases, `loadConfig`, `parseSimulation`/`createServices`) |
| Mutation check 1 (one run: removed the success-path abort check, the `onFix` stopped check, and `clearTimeout` in `stop`) | Only the `clearTimeout` removal was detected (1 failure, I-05 timer). The other two were **not detected** — both guards were redundant (`generateGoal` already rejects after abort; the stage checks already ignore a stopped run). The `onFix` check was removed as duplicate logic; the abort check is kept as an explicit one-line invariant (commented) |
| Mutation check 2 (session-effect cleanup removed entirely) | 6 tests failed as expected (I-04 ×4, I-05 ×2); 199/199 after restoring |
| `npm run typecheck` / `npm run lint` / `npm run build` | Exit 0 / exit 0, no findings / exit 0 |
| `npm run test:e2e` | Exit 0 — 1 passed (smoke test, regression check) |
| `grep import.meta src` (non-test) | Only `src/app/config.ts` |

**Implementation notes:**
- **One session per effect run:** the session effect is keyed on `sessionId` plus `config` and `services`. Cleanup aborts in-flight generation, unsubscribes location and clears the start-fix timer.
- **Stale-result protection** comes from three layers:
  1. the reducer's session-id check,
  2. the per-run stage/abort guards,
  3. `generateGoal`'s abort check.
- **Location errors while generating the goal are ignored** (the start fix is already chosen); this matches the approved state machine, which has no such transition.
- **Failure releases location:** goal-generation or routing failure unsubscribes from location until Retry.
- **Late position:** a fix received during generation is applied immediately after `GOAL_READY`.
- **StrictMode:** double-mounting dispatches START twice; the second is ignored, so there is exactly one session.
- **`.env.example` sync check:** `.env.example` is verified against `DEFAULT_CONFIG` in a test. Vite refuses to serve `.env*` files, so the test reads it via `node:fs`.

## Phase 2 — merge result
`phase/02-adapters` pushed; merged into `main` with `--no-ff` as `eb14ede`; `main` pushed; 169/169 tests, typecheck and lint re-verified on `main`.

## Phase 2 — verification results (2026-10-08, branch `phase/02-adapters`)
| Command | Result |
|---|---|
| `npx vitest run` | Exit 0 — 10 files, **169 passed**, 0 failed, 0 skipped (adds A-01…A-05, A-07…A-09: 30 tests) |
| Mutation check (removed throttle wait, timeout mapping, `clearWatch`; then restored) | 3 tests failed as expected (A-04, A-05, A-08); 169/169 after restoring |
| `npm run typecheck` / `npm run lint` / `npm run build` | Exit 0 / exit 0, no findings / exit 0 |
| `npm run test:e2e` | Exit 0 — 1 passed (smoke test, regression check) |
| Purity grep on `src/domain`, `src/services` | Still no React/Leaflet/`fetch`/`navigator`/`import.meta` |
| One-off live check (temporary test, not committed): real `OsrmRoutingProvider` + `generateGoal` from London (51.508, -0.1281) | `ready` on attempt 1 in 249 ms; snapped goal 699.8 m from start; shortest route 869.3 m, 91 points |
| Fixture recording: 4 `curl` calls to FOSSGIS (≥1 s apart) | `osrm-route-two-routes.json` (1286.8/1272.5 m), `osrm-route-one-route.json` (488.1 m), `osrm-no-route.json` (HTTP 400), `osrm-invalid-value.json` (HTTP 400). Geometry trimmed to 3 points; hints removed |

**watchPosition timeout question — investigated:**
- **Experiment:** Playwright Chromium with an emulated position, `watchPosition({ timeout: 2000 })` held for 9 s, recorded in a scratch script.
- **Result:** exactly **one fix and no TIMEOUT errors** after it.
- **Conclusion:** the hypothesis is **not confirmed in Chromium**, so the approved behaviour stays (location error during play → `locationError`).
- **Still untested:** Safari, Firefox and real (non-emulated) providers. Re-check during manual test M-01.

**Implementation notes:**
- **OSRM `NoSegment`:** a coordinate that can't be snapped is mapped to `noRoute`, the same as `NoRoute`, so it is treated as a bad candidate and generation retries.
- **Throttle:** request starts are serialised through a queue. A request cancelled while waiting releases its slot to the next caller.
- **Timeout:** implemented with `setTimeout` plus an internal `AbortController`, so it is testable with fake timers. A caller abort surfaces as `AbortError`, never as a `RoutingError`.
- **Insecure context:** in an insecure context (non-localhost http), the browser adapter reports `unsupported` without calling the API.
- **Simulator:** its fixes report 5 m accuracy, so they pass the start-fix gate immediately.
- **No custom request headers:** they would trigger CORS preflights. The browser supplies User-Agent and Referer, as the FOSSGIS policy requires.

## Phase 1 — merge result
`phase/01-domain` pushed; merged into `main` with `--no-ff` as `e5efe17`; `main` pushed; 139/139 tests and typecheck re-verified on `main`.

## Phase 1 — verification results (2026-10-08, branch `phase/01-domain`)
| Command | Result |
|---|---|
| `npx vitest run` | Exit 0 — 7 files, **139 passed**, 0 failed, 0 skipped (U-01…U-17 + the existing smoke test; U-12 alone = 72 state×event cases) |
| Mutation check (temporarily broke `selectShortestRoute` and the `won` latch, then restored) | 4 tests failed as expected; 139/139 after restoring — the tests detect real regressions |
| `npm run typecheck` | Exit 0 |
| `npm run lint` | Exit 0, no findings |
| `npm run build` | Exit 0 (domain code not yet imported by the app, so bundle unchanged) |
| `npm run test:e2e` | Exit 0 — 1 passed (smoke test, regression check) |
| `grep` for React/Leaflet/`fetch`/`navigator`/`import.meta` in `src/domain`, `src/services` | None — layers are pure |

**Implementation notes:**
- **Snap mechanism:** goal snapping uses the `/route` response (D3a amendment), so there is one provider call per attempt.
- **Distance tolerance:** inclusive distance checks use a 1e-6 m tolerance (`DISTANCE_EPSILON_M`), so points generated at exactly 300/800/25 m are not rejected by floating-point error.
- **Missing config values:** missing or empty config values fall back to the approved defaults; present-but-invalid values are errors.
- **Provider errors in `generateGoal`:**
  - `noRoute` → try the next candidate.
  - Any other `RoutingError` (including `invalidInput`) → `routingFailed` immediately.
  - Abort → rejects with `AbortError`.

## Phase 0 — push result
`git push -u origin main` → exit 0, `origin/main` = `8f7873a`.

## Phase 0 — verification results (2026-10-08)
| Command | Result |
|---|---|
| `npm ci` (from an empty `node_modules`) | Exit 0, 0 vulnerabilities |
| `npm run typecheck` (`tsc -b`, strict) | Exit 0 |
| `npm run lint` (oxlint) | Exit 0, no findings |
| `npm test` (Vitest) | Exit 0 — 1 file, **1 passed**, 0 failed, 0 skipped |
| `npm run build` | Exit 0 — `dist/assets/index-*.js` 219.59 kB (gzip 68.60 kB) |
| `npx playwright install chromium` | Exit 0 — Chrome Headless Shell 156.0.8078.4 |
| `npm run test:e2e` (Playwright vs `vite preview` of the production build) | Exit 0 — **1 passed** (`app shell loads`) |
| `npm run dev` + `curl localhost:5199` (manual smoke check) | Served the page with title "Highlander Navigation Game" |

Commits on `main`: `0bd75f1` (gitignore + docs + assets), followed by the scaffold commit. The push result is recorded at the start of Phase 1.

**Deviations from plan:**
- **Lint tool:** oxlint (the current Vite scaffold default) instead of ESLint. Same purpose, fewer dependencies; `react/rules-of-hooks` is enabled.
- **`strict` setting:** the scaffold's tsconfig did not set `"strict": true`; it was added to both tsconfigs.

**Versions:**
- Runtime: Vite 8.3, React 19.2, TypeScript 6.0.
- Tests: Vitest 5.0.3, Playwright 1.64.0, jsdom 30.

## Commands actually executed
| Command (summarised) | Result |
|---|---|
| `file public/assets/*` | Both `.png` files are **JPEG** (224×225, 224×224, 3 channels — no alpha) |
| `node -v`, `docker --version`, `docker compose version` | Node v22.23.2, Docker 29.5.3, Compose v5.1.4 |
| `curl …/routed-foot/route/v1/foot/{A};{B}?alternatives=true&overview=full&geometries=geojson` (Tel Aviv, Berlin, London) | HTTP 200, `code: Ok`, 2 routes each, `weight_name: "routability"` |
| `curl …/routed-foot/route/v1/foot/…?alternatives=3` | Still only 2 routes returned |
| `curl …/routed-foot/nearest/v1/foot/{p}?number=1` | `code: Ok`, snapped `location` + `distance` (m) |
| `curl …/nearest` for a sea point / mid-Atlantic | Snapped 1,076 m / **891,745 m** away — the snap-distance check is essential |
| `curl …/route/v1/driving/…` on `routed-foot` | Works: the profile is chosen by the path prefix, the URL profile segment is ignored |
| `curl -H "Origin: http://localhost:8080" …` | `access-control-allow-origin: *` |
| Tel Aviv → New York route | HTTP **400**, `{"code":"NoRoute","message":"Impossible route between points"}` |
| Tel Aviv → Cyprus route | `Ok`, 1,090 km (foot profile includes ferries) |
| Invalid coordinate | HTTP 400, `{"code":"InvalidValue"}` |
| `routed-bike`, `routed-car` | HTTP 200 (future travel modes available) |
| `curl https://routing.openstreetmap.de/about.html` | Usage policy: **max 1 req/s**, attribution + "fix the map" link, valid UA/referrer, no heavy use; custom foot profile; OSRM v5.27.1; hints disabled; worldwide; data updated ~every 2 days |
| `curl tile.openstreetmap.org/15/19533/13307.png` (with/without Referer) | HTTP 200 both |

## Verified findings
- The hosted OSRM supports everything the approved design needs (foot routing, alternatives, snapped waypoints with snap distance, CORS).
- `weight_name` is **"routability"**, not duration. Verified case: primary route 1,286.8 m vs alternative 1,272.5 m → the primary route is not always the shortest by distance. This confirms the "choose the minimum-distance candidate" rule and the hedged "shortest" wording.
- No decision was invalidated. Two refinements were recorded in `DECISIONS.md`:
  1. Snap via the `/route` response instead of `/nearest` (1 request per attempt, due to the 1 req/s policy).
  2. The `routing` phase merged into `generatingGoal`.
- Supplied assets have fake (painted) transparency.

## Blockers
None.

## Known issues / risks
- **Goal marker:** the goal asset still shows its painted checkerboard background inside the net (CSS crop fallback); the marker is also fairly small.
- **watchPosition timeouts:** behaviour in Safari/Firefox is unverified (Chromium verified OK).
- **No SLA on public services:** public OSRM (max 1 req/s) and OSM tiles have no SLA and need internet access (accepted, documented).
- **Config needs a rebuild:** config is build-time, so changing it requires `docker compose up -d --build`.
- **Mermaid diagrams:** the diagrams in `ARCHITECTURE.md` have not been render-checked.

## Remaining work
- Manual checks M-01…M-03.
- Optionally: the skipped P1 items above. P2 only on explicit approval.
