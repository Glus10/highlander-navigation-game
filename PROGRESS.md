# Progress

_Last updated: 2026-10-08_

## Phase checklist
- [x] Discovery and decision gates 1–6 (`DECISIONS.md`)
- [x] Pre-work: hosted OSRM verification (read-only)
- [x] Planning docs: REQUIREMENTS, DESIGN, ARCHITECTURE, TEST_PLAN, PLAN, PROGRESS
- [ ] Phase 0 — Repository bootstrap (P0)
- [ ] Phase 1 — Domain logic (P0)
- [ ] Phase 2 — Adapters (P0)
- [ ] Phase 3 — Controller (P0)
- [ ] Phase 4 — UI (P0)
- [ ] Phase 5 — Docker + E2E on container (P0)
- [ ] Phase 6 — Hardening (P1)
- [ ] Phase 7 — Handoff (P1)
- [ ] Phase 8 — Bonus re-routing (P2, optional, not approved)

## Current status
Planning complete; **no application code, no tests, no commits yet.** `main` has no commits; all files are untracked. Awaiting approval to start Phase 0.

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
