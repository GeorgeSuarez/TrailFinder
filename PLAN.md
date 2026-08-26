# PLAN.md — TrailFinder: nearby hiking trails web app

## Context

Greenfield project (`~/Projects/TrailFinder`, empty dir). Goal: web app where the user gives
a location (typed place name, GPS button, or map click) and gets nearby hiking trails with
full OSM detail, shown as a list plus an interactive map. Tech choices locked in by user:

- **Architecture B**: Effect TS backend (`@effect/platform`) proxying Overpass/Nominatim + Vite/React frontend
- **Map + list** display (Leaflet)
- **All three** location input modes
- **Full details** per trail (length, ascent, scope, website, …)

## Data source facts (verified)

- Overpass endpoint `https://overpass-api.de/api/interpreter` — POST QL text, CORS ok, free, no key.
  Query: `[out:json][timeout:25];rel[route=hiking](around:${radius},${lat},${lon});out geom;`
  - `out geom` embeds member-way geometry on each relation → single request, no node recursion.
  - Relation tags used: `name`, `distance`, `ascent`, `network` (lwn/rwn/nwn/iwn), `symbol`,
    `osmc:symbol`, `operator`, `website`, `ref`.
- Nominatim geocoding: `https://nominatim.openstreetmap.org/search?q=…&format=json&limit=5`
  — requires a descriptive `User-Agent` header (e.g. `TrailFinder/0.1`). Free, no key.
- Current versions: `effect@3.x` (3.22), `@effect/platform@0.97`, `@effect/platform-node@0.108`.

## Approach

Monorepo-lite: **one `package.json`**, three source dirs (`server/`, `client/`, `shared/`).
Server = Effect HTTP API (two GET routes, Schema-validated, typed errors, retrying HttpClient).
Client = Vite + React SPA calling `/api/*`; Leaflet map. Server also serves `client/dist` in prod.

### Backend (Effect)

- `HttpApi` (declarative platform API) with two endpoints, request schemas validating
  lat ∈ [-90,90], lon ∈ [-180,180], radius ∈ [500m, 50km] (default 10 km):
  - `GET /api/geocode?q=<string>` → `[{ label, lat, lon }]` (Nominatim passthrough, trimmed)
  - `GET /api/trails?lat&lon&radius` → `{ trails: Trail[] }`
- Domain type (in `shared/`, imported by both sides):
  ```ts
  Trail = {
    id: number            // OSM relation id
    name: string | null
    pointDistanceM: number   // min haversine distance from search point
    lengthM: number          // computed from geometry (tags.distance often missing)
    ascentM: number | null   // ascent tag if present
    network: "lwn"|"rwn"|"nwn"|"iwn"|null  // local→international scope
    website: string | null
    operator: string | null
    paths: Array<Array<{ lat: number; lon: number }>> // member-way polylines, drawn as-is
  }
  ```
- Outbound calls via `@effect/platform` `HttpClient` with `.filterOrFail(statusCheck)`,
  `timeout("15 seconds")`, `retry` (exponential backoff ×3) — Overpass is famously flaky.
- Tagged errors: `OverpassUnavailable`, `GeocodeFailed`, `InvalidQuery` (auto-documented by HttpApi).
- Overpass JSON decoded with `Schema` (loose struct → transform to `Trail`; compute
  `pointDistanceM`/`lengthM` during transform).

### Frontend (Vite + React + TS + Leaflet)

- One page: search bar (place name → dropdown of geocode results), "use my location" button,
  click-anywhere-on-map to move the search point, radius selector (5/10/25 km).
- `react-leaflet` renders polylines per trail (each entry of `paths`); list beside map sorted by
  `pointDistanceM`; clicking a list item pans/zooms to that trail and highlights it.
- Detail line per trail: name • X.X km away • Y km long • ↗ ZZZ m ascent • scope chip (local/
  regional/national/international) • website link.
- Dev: Vite proxies `/api` → `localhost:3000`.

### Deliberate skips (ponytail)

- No DB/cache layer — every search hits Overpass live; add in-memory memoization if rate-limited.
- No `sac_scale` difficulty (lives on member ways → much heavier query); `network` scope stands in.
- Single Overpass mirror (main endpoint only); kumi.systems fallback only if 429s bite.
- Member-way polylines rendered unmerged (visual gap-free in practice; stitching is fiddly).

## Files to create

```
package.json              # deps: effect, @effect/platform, @effect/platform-node;
                          #      react, react-dom, react-leaflet, leaflet;
                          #      devDeps: typescript, vite, @vitejs/plugin-react, tsx, @types/*
tsconfig.json             # base; client uses bundler resolution
server/
  src/main.ts             # NodeHttpServer layer, HttpApiBuilder, serve API + static client/dist
  src/api.ts              # HttpApi definition (endpoints, schemas, errors)
  src/trails.ts           # Overpass client: build QL, fetch+decode+transform to Trail[]
  src/geocode.ts          # Nominatim client
  src/geo.ts              # haversine + polyline length (+ tiny assert self-check in __main__)
client/
  index.html
  vite.config.ts          # react plugin, /api proxy, root=client, build outDir dist
  src/main.tsx
  src/App.tsx             # state: point, radius, results; layout: sidebar list + map
  src/api.ts              # typed fetch wrappers using shared schemas
shared/
  schema.ts               # Trail, GeocodeResult, request params (Schema structs)
```

## Reuse

Nothing existing (empty repo) — reuse comes from libraries: `@effect/platform` HttpClient +
HttpApi + Schema on the server; `react-leaflet` for the map; no other custom infra.

## Steps

- [x] 1. Scaffold: `package.json`, `tsconfig.json`, install deps, `shared/schema.ts`.
      (+ oxlint 1.80 / oxfmt 0.65 configured per feedback — `npm run lint` / `npm run format`;
      `.gitignore` added so both tools stay out of `node_modules`.)
- [x] 2. `server/src/geo.ts` — haversine + polyline length + `assert` self-check block.
      (+ `server/src/errors.ts` for the tagged error classes.)
- [x] 3. `server/src/trails.ts` — Overpass query builder + fetch (timeout/retry) + Schema
      decode → `Trail[]`; same pattern in `geocode.ts` for Nominatim.
- [x] 4. `server/src/api.ts` + `main.ts` — HttpApi with 2 endpoints + error channels;
      serve static `client/dist` when present. Verified with `curl`.
      (Notes: `setUrlParams` is the current platform API name; query params decode via
      `Schema.NumberFromString`; group `.prefix("/api")` must come after `.add()` calls;
      Overpass 406s undici's default `node` user-agent — custom UA required; status check
      sits inside the retry pipe so HTTP errors retry.)
- [x] 5. Client scaffold: vite config, `index.html`, `main.tsx`, `App.tsx` with search bar +
      radius selector calling `/api/*`; results list.
- [x] 6. Map: react-leaflet with click-to-set-point, trail polylines, list↔map selection sync.
- [x] 7. Polish pass: loading/error states, empty results message, GPS button via
      `navigator.geolocation`.

## Verification

- [x] `curl 'localhost:3000/api/geocode?q=Zermatt'` returns labeled coords. (tested on :3999)
- [x] `curl 'localhost:3000/api/trails?lat=46.02&lon=7.75&radius=10000'` returns trails with
      non-empty `paths` (146 trails, sorted ascending, `lengthM > 0`, tags populated).
- [x] Error path: `radius=99999999` → 400 with per-field message; lat=123 → 400; short q → 400.
      Retry wraps transport errors _and_ non-200 statuses (verified via the 406 episode).
- [x] Browser E2E (agent-browser against the prod server on :3999): search "Interlaken" →
      5-way disambiguation → 439 trails listed + drawn; list click highlights trail red on map
      and zooms to it; map clicks move the pin and refetch; radius change refetches.
- [x] `npm run geo-check` passes all haversine asserts (Zürich→Bern ≈ 76 km, not 95 — fixed).
