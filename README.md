# Highlander Navigation Game

A web-based navigation game. The player (a ball) starts at the host machine's real location. A goal is generated automatically within a set radius, and the shortest walking route to it is drawn on an OpenStreetMap map. Getting within the goal threshold triggers "goal reached".

> **Status:** All Part 1 mandatory (P0) functionality is implemented and verified (209 unit/integration tests, 5 E2E tests, Docker healthy). Some P1/P2 items were skipped; see [Known limitations and skipped scope](#known-limitations-and-skipped-scope) and [`PROGRESS.md`](PROGRESS.md).

## Tech stack
React + TypeScript + Vite · Leaflet + OpenStreetMap tiles · hosted OSRM walking routes (FOSSGIS) · Vitest + React Testing Library + Playwright · Docker Compose (nginx).

No API keys or accounts are required.

## Quick start (Docker Compose)
Requires Docker with Docker Compose. No API keys or accounts are needed.

```bash
docker compose up -d --build
```

Open **http://localhost:8080** and allow location access when the browser asks.

**Real-location mode is the default.** The player position comes from the host machine's location services via the browser Geolocation API. On macOS, the browser must also be allowed under System Settings → Privacy & Security → Location Services.

- Stop: `docker compose down`
- Health: `curl http://localhost:8080/healthz` → `ok`
- Use `localhost`, not a LAN IP. Browsers only allow geolocation on secure origins (https or localhost).

### Simulation mode (testing/demo only)
Open **http://localhost:8080/?simulate=1** (optionally `&lat=51.508&lng=-0.1281`).

This mode is **only for testing and demos** on a stationary computer; it is **not part of the assignment requirements**. It is off unless the URL flag is present.
- A red **SIMULATED LOCATION** badge is shown.
- Click the map to move the ball there, or use the arrow keys to move it 10 m.
- Click the goal to reach it.

## How it plays
1. The app reads your position from the host's location services (browser Geolocation API).
2. It waits up to 10 s for a fix accurate to ≤100 m, otherwise it uses the best fix with a warning.
3. A goal is placed 300–800 m away (straight line) on the walkable network.
4. The shortest walking route returned by OSRM (FOSSGIS foot profile) is drawn. The dashed line connects your position to where the route starts.
5. Get within 25 m of the goal and **Goal reached!** appears.

## Prerequisites (development)
- Node.js 22+ and npm

## Development
```bash
npm ci
npm run dev          # http://localhost:5173
```

## Quality checks
```bash
npm run typecheck
npm run lint
npm test                              # unit + integration (Vitest)
npx playwright install chromium       # first time only
npm run test:e2e                      # E2E (Playwright, against a production build)
npm run build
```

## Configuration
Non-secret build-time settings are listed in [`.env.example`](.env.example). Copy it to `.env` to override them.

Docker builds read the same variables from a local `.env` file (build args in `docker-compose.yml`). Change a value, then rebuild with `docker compose up -d --build`.

## Known limitations and skipped scope
- **Goal marker asset:** the supplied ball/goal "PNG" files are actually JPEGs with a painted transparency checkerboard. They are cropped with CSS; the ball looks clean, but **the goal marker still shows the checkerboard background inside the net**.
- **External services:** map tiles (tile.openstreetmap.org) and routing (routing.openstreetmap.de, FOSSGIS) are public best-effort services. They need internet access, and routing is limited to 1 request/second.
- **"Shortest" route:** it is the shortest by distance among the routes OSRM returns. OSRM's own weighting is a "routability" score, so this is not a guaranteed shortest walking distance (see `DECISIONS.md` D3b).
- **Build-time config:** configuration is applied at build time; rebuild after changing `.env`.
- **Skipped P1 items (robustness/production readiness):**
  - security headers / CSP in nginx
  - one automatic retry for routing failures
  - React error boundary and logger module
  - accuracy circle on the map (a low-accuracy text warning is shown)
  - `HANDOFF.md`
- **Skipped P2 (bonus):** the route does **not** update dynamically as the player moves; it is calculated once at game start.
- **Part 2** (multiplayer, CI/CD) is not implemented.

## Project documents
[`TASK.md`](TASK.md) · [`DECISIONS.md`](DECISIONS.md) · [`REQUIREMENTS.md`](REQUIREMENTS.md) · [`DESIGN.md`](DESIGN.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`TEST_PLAN.md`](TEST_PLAN.md) · [`PLAN.md`](PLAN.md) · [`PROGRESS.md`](PROGRESS.md)

## Attribution
Map data © OpenStreetMap contributors (ODbL). Routing by OSRM on servers operated by FOSSGIS e.V.
