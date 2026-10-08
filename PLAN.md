# Implementation Plan

Small, independently verifiable phases. **P0** = mandatory, **P1** = robustness / production readiness, **P2** = optional / bonus. P2 never blocks P0. Requirement IDs refer to `REQUIREMENTS.md`; test IDs to `TEST_PLAN.md`.

## Git workflow (every phase)

```
branch → implement → test → typecheck/lint/build → review diff → commit → push branch → merge to main → push main
```

**Verification gate before any merge:**
1. Phase tests pass (command + counts recorded in `PROGRESS.md`).
2. `npm run typecheck && npm run lint && npm run build` pass (from Phase 0 onward).
3. `git status` + `git diff` reviewed: no secrets, no `.env`, no `dist/`, `node_modules/`, test reports, or unrelated changes.
4. `PROGRESS.md` updated with the real results.

**Merge:** `git checkout main && git merge --no-ff phase/<name>` (keeps the phase visible in history) → `git push origin main`.
**If verification fails:** do not merge; fix on the branch or record the blocker.
**Never** force-push or rewrite pushed history.

---

## Phase 0 — Repository bootstrap (P0) · branch: `main` (initial setup)
- **Requirements:** NFR-3, NFR-9, NFR-10 (tooling), NFR-2 (skeleton)
- **Scope:**
  - `.gitignore` **first** (`node_modules`, `dist`, `.env*` except `.env.example`, `coverage`, `playwright-report`, `test-results`, `.DS_Store`).
  - Vite React-TS scaffold, strict TS, ESLint.
  - Vitest + jsdom + RTL setup; Playwright installed and configured (Chromium, `webServer` = `vite preview`).
  - npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:e2e`.
  - `.env.example` (non-secret defaults); README skeleton.
  - Folder skeleton `src/{domain,services,adapters,app,ui}`.
  - One trivial smoke unit test and one trivial E2E test (the page loads) to prove the toolchain.
  - Commit the planning docs and the original assets.
- **Tests:** smoke unit + smoke E2E.
- **Verify:** `npm ci && npm run typecheck && npm run lint && npm test && npm run build && npx playwright install chromium && npm run test:e2e`
- **Manual:** `npm run dev` shows the placeholder page.
- **Git:** commits on `main` (repo has no history yet): ① `chore: gitignore + planning docs + supplied assets`, ② `chore: scaffold Vite React TS with Vitest, RTL, Playwright`. Push `main`. All later work uses phase branches.

## Phase 1 — Domain logic (P0) · branch: `phase/01-domain`
- **Requirements:** FR-3, FR-4, FR-5 (selection), FR-7, FR-8 (session ids), NFR-8 (validation), NFR-9
- **Scope:**
  - Types and interfaces.
  - `haversineM`, `destinationPoint`, `sampleInRing`, `validateGoalCandidate`, `selectShortestRoute`, `selectStartFix`, `isGoalReached`.
  - `gameReducer` + events.
  - `validateConfig` + defaults.
  - `generateGoal` service (pure loop over the injected `RoutingProvider`).
  - Seeded rng helper.
- **Tests:** U-01 … U-17.
- **Verify:** `npm test && npm run typecheck && npm run lint && npm run build`
- **Manual:** none.
- **Git:** `phase/01-domain` → merge → push.

## Phase 2 — Adapters (P0) · branch: `phase/02-adapters`
- **Requirements:** FR-2, FR-9, FR-12 (provider), NFR-5, NFR-6
- **Scope:**
  - `OsrmRoutingProvider`: URL building, mapping, error mapping, ≥ 1 s throttle, 8 s timeout, abort.
  - `BrowserLocationProvider`.
  - `SimulatedLocationProvider` (`setPosition`, `nudge`).
  - OSRM fixtures recorded from verified responses.
- **Tests:** A-01 … A-05, A-07 … A-09.
- **Verify:** as Phase 1.
- **Manual:** none (the live OSRM was verified in pre-work).
- **Git:** `phase/02-adapters` → merge → push.

## Phase 3 — Controller (P0) · branch: `phase/03-controller`
- **Requirements:** FR-2, FR-3, FR-7, FR-8, FR-9, FR-10, FR-11, NFR-8
- **Scope:**
  - `loadConfig` (read `VITE_*` → `validateConfig`).
  - Composition root (real vs simulated provider from `?simulate=1`; sim start from `lat`/`lng` params or config default).
  - `useGameController`: reducer, location subscription + cleanup, start-fix window (10 s), `generateGoal` call, session id + `AbortController`, Retry/Restart.
- **Tests:** I-01 … I-05.
- **Verify:** as Phase 1.
- **Manual:** none (no UI yet).
- **Git:** `phase/03-controller` → merge → push.

## Phase 4 — UI (P0) · branch: `phase/04-ui`
- **Requirements:** FR-1, FR-4, FR-5, FR-6, FR-7, FR-9 … FR-12, FR-14, NFR-15
- **Scope:**
  - Asset cleanup → `public/assets/ball.png`, `goal.png` (originals untouched; steps documented). **Show the result to the user before committing.**
  - `MapView` (react-leaflet, OSM tiles), `PlayerMarker` (ball), `GoalMarker` (goal, `interactive:false`), `RouteLine`, dashed `ApproachLine`.
  - Status, error and won panels; `SimulatedBadge`; sim controls (map click, arrow keys); attribution (OSM, "fix the map", FOSSGIS OSRM).
- **Tests:** I-06, I-07; E2E E-01 … E-06 against `vite preview` with OSRM intercepted.
- **Verify:** `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
- **Manual:** M-01 (real location, real OSRM), M-02, M-03.
- **Git:** `phase/04-ui` → merge → push.

## Phase 5 — Docker + E2E on container (P0) · branch: `phase/05-docker-e2e`
- **Requirements:** NFR-1, NFR-2, NFR-12 (healthcheck, pinned images, non-root, cache headers), AC-1
- **Scope:**
  - Multi-stage `Dockerfile` (pinned `node` alpine → pinned `nginxinc/nginx-unprivileged` alpine).
  - `.dockerignore`, `nginx.conf` (SPA fallback, caching, gzip).
  - `docker-compose.yml` (`build.args` for `VITE_*`, `8080:8080`, healthcheck, restart policy).
  - Playwright config option to target `http://localhost:8080` (E-07 without headers yet).
  - README run instructions.
- **Tests:** E-01 … E-06 against the container; E-07 (load + health).
- **Verify:** `docker compose up -d --build && docker compose ps` (healthy) `&& BASE_URL=http://localhost:8080 npm run test:e2e && docker compose down`
- **Manual:** M-04 (fresh clone, README only).
- **Git:** `phase/05-docker-e2e` → merge → push. **After this phase, all P0 requirements are met.**

## Phase 6 — Hardening (P1) · branch: `phase/06-hardening`
- **Requirements:** FR-13, NFR-7, NFR-11, NFR-12 (rest), NFR-13, NFR-14
- **Scope:**
  - nginx security headers (CSP, nosniff, Referrer-Policy `strict-origin-when-cross-origin`).
  - OSRM one retry + backoff.
  - `ErrorBoundary`, `logger`.
  - Accuracy circle + low-accuracy banner.
  - README "Production considerations"; `npm audit` review.
- **Tests:** A-06, I-08, E-07 (headers + no CSP violations), full suite on the container.
- **Verify:** full suite + Docker E2E as in Phase 5.
- **Manual:** M-01 recheck with CSP active.
- **Git:** `phase/06-hardening` → merge → push.

## Phase 7 — Handoff (P1) · branch: `phase/07-handoff`
- **Scope:** `HANDOFF.md`, final docs consistency pass, M-05 secret check, final verification run, clean working tree.
- **Verify:** all commands from Phases 1–6; `git status` clean.
- **Git:** merge → push.

## Phase 8 — Bonus re-routing (P2, optional) · branch: `phase/08-reroute`
- Only if P0 and P1 are complete and time remains, and only with explicit approval (D5c currently says skip).
- Scope: throttled re-route (> 20 m and ≥ 5 s), abort stale requests, keep the old route on failure.

## Dependencies
Phase 0 → 1 → 2 → 3 → 4 → 5 (P0 complete) → 6 → 7 → (8 optional). Phases 1 and 2 are logically independent but kept sequential for clean merges.
