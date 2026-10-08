# Progress

_Last updated: 2026-10-08_

## Phase checklist
- [x] Discovery and decision gates 1–6 (`DECISIONS.md`)
- [x] Pre-work: hosted OSRM verification (read-only)
- [x] Planning docs: REQUIREMENTS, DESIGN, ARCHITECTURE, TEST_PLAN, PLAN, PROGRESS
- [x] Phase 0 — Repository bootstrap (P0) — verified 2026-10-08
- [ ] Phase 1 — Domain logic (P0)
- [ ] Phase 2 — Adapters (P0)
- [ ] Phase 3 — Controller (P0)
- [ ] Phase 4 — UI (P0)
- [ ] Phase 5 — Docker + E2E on container (P0)
- [ ] Phase 6 — Hardening (P1)
- [ ] Phase 7 — Handoff (P1)
- [ ] Phase 8 — Bonus re-routing (P2, optional, not approved)

## Current status
Phase 0 complete on `main`; no game functionality yet. Awaiting approval to start Phase 1 (`phase/01-domain`).

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
- Public OSRM and OSM tiles have no SLA (accepted, documented).
- Goal-image cleanup quality is unknown until Phase 4.
- The Mermaid diagrams in `ARCHITECTURE.md` have not been render-checked yet.

## Remaining work
Phases 0–7 per `PLAN.md`; Phase 8 only on explicit approval.
