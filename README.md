# Highlander Navigation Game

A web-based navigation game. The player (a ball) starts at the host machine's real location. A goal is generated automatically within a set radius, and the shortest walking route to it is drawn on an OpenStreetMap map. Getting within the goal threshold triggers "goal reached".

> **Status:** under construction. Phase 0 (repository bootstrap) is done; see [`PROGRESS.md`](PROGRESS.md).

## Tech stack
React + TypeScript + Vite · Leaflet + OpenStreetMap tiles · hosted OSRM walking routes (FOSSGIS) · Vitest + React Testing Library + Playwright · Docker Compose (nginx).

No API keys or accounts are required.

## Prerequisites
- Node.js 22+ and npm
- Docker + Docker Compose (from Phase 5)

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

## Run with Docker Compose
_Added in Phase 5._

## Project documents
[`TASK.md`](TASK.md) · [`DECISIONS.md`](DECISIONS.md) · [`REQUIREMENTS.md`](REQUIREMENTS.md) · [`DESIGN.md`](DESIGN.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`TEST_PLAN.md`](TEST_PLAN.md) · [`PLAN.md`](PLAN.md) · [`PROGRESS.md`](PROGRESS.md)

## Attribution
Map data © OpenStreetMap contributors (ODbL). Routing by OSRM on servers operated by FOSSGIS e.V.
