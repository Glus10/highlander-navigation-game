# Progress

_Last updated: 2026-10-08_

## Phase checklist
- [x] Discovery and decision gates 1–6 (`DECISIONS.md`)
- [x] Pre-work: hosted OSRM verification (read-only)
- [x] Planning docs: REQUIREMENTS, DESIGN, ARCHITECTURE, TEST_PLAN, PLAN, PROGRESS
- [x] Phase 0 — Repository bootstrap (P0) — verified 2026-10-08
- [x] Phase 1 — Domain logic (P0) — verified 2026-10-08
- [x] Phase 2 — Adapters (P0) — verified 2026-10-08
- [ ] Phase 3 — Controller (P0)
- [ ] Phase 4 — UI (P0)
- [ ] Phase 5 — Docker + E2E on container (P0)
- [ ] Phase 6 — Hardening (P1)
- [ ] Phase 7 — Handoff (P1)
- [ ] Phase 8 — Bonus re-routing (P2, optional, not approved)

## Current status
Phase 2 complete: OSRM routing adapter, browser and simulated location adapters, all tested. No controller or UI yet. Awaiting approval to start Phase 3 (`phase/03-controller`).

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
- `watchPosition` timeout behaviour in Safari/Firefox is unverified (Chromium verified OK).
- Public OSRM and OSM tiles have no SLA (accepted, documented).
- Goal-image cleanup quality is unknown until Phase 4.
- The Mermaid diagrams in `ARCHITECTURE.md` have not been render-checked yet.

## Remaining work
Phases 0–7 per `PLAN.md`; Phase 8 only on explicit approval.
