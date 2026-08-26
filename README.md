# TrailFinder

Find hiking trails near any location. Search a place name, use your GPS location, or click
a point on the map — TrailFinder queries OpenStreetMap for hiking route relations within
5–25 km and shows them as an interactive map overlay plus a distance-sorted list with
length, ascent, and route scope.

![stack](https://img.shields.io/badge/Effect_TS-3.x-blue) ![data](https://img.shields.io/badge/data-OpenStreetMap-green)

## How it works

1. **Resolve a location** — type a place name (geocoded via Nominatim, with disambiguation
   when multiple matches), hit 📍 _Use my location_, or click anywhere on the map.
2. **Query Overpass** — one query fetches every OSM hiking route around that point:
   `[out:json][timeout:25];rel[route=hiking](around:RADIUS,LAT,LON);out geom;`
3. **Serve + display** — the Effect backend decodes the response into a typed `Trail` list
   (computing point-distance and route length from geometry), and the React client draws
   each route on a Leaflet map next to a sortable list. Click a list item to highlight and
   zoom to that trail; click a trail to select it.

## Stack

| Layer   | Tech                                                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | [Effect TS](https://effect.website) — `HttpApi`, `Schema`, `HttpClient` with timeout + exponential retry                                       |
| Data    | [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) (trails) + [Nominatim](https://nominatim.org) (geocoding) — free, no API keys |
| Client  | Vite · React 19 · react-leaflet / Leaflet                                                                                                      |
| Tooling | TypeScript (tsc), oxlint, oxfmt, tsx                                                                                                           |

## Getting started

```bash
npm install

# dev — two terminals
npm run dev:server   # Effect API on :3000
npm run dev:client   # Vite on :5173, proxies /api → :3000

# or production mode — one process serving API + built client on :3000
npm run build && npm start
```

## API

| Endpoint           | Params                               | Notes                                                  |
| ------------------ | ------------------------------------ | ------------------------------------------------------ |
| `GET /api/geocode` | `q` (min 2 chars)                    | Top-5 Nominatim matches as `{ label, lat, lon }`       |
| `GET /api/trails`  | `lat`, `lon`, `radius` (500–50000 m) | Hiking routes sorted by distance; invalid params → 400 |

Errors are typed and tagged: `OverpassUnavailable` (503) and `GeocodeFailed` (502) surface
after retries are exhausted; request validation failures return 400 with per-field messages.

## Project structure

```
server/src/
  main.ts      Node HTTP server, HttpApi wiring, static file serving
  api.ts       Endpoint definitions (params, success/error schemas)
  trails.ts    Overpass client: query builder, fetch+retry, decode → Trail[]
  geocode.ts   Nominatim client
  geo.ts       Haversine + polyline math (self-check: npm run geo-check)
  errors.ts    Tagged API errors
shared/
  schema.ts    Trail / GeocodeResult types shared by server and client
client/src/
  App.tsx      Search, radius, results list, state
  map.tsx      Leaflet map: polylines, pin, click handling, fit-to-trail
  api.ts       Typed fetch wrappers
```

## Scripts

| Script                      | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `dev:server` / `dev:client` | Run API / frontend in watch mode          |
| `build`                     | Typecheck + build client to `client/dist` |
| `start`                     | Serve API + built client on one port      |
| `lint` / `format`           | oxlint / oxfmt                            |
| `geo-check`                 | Runnable asserts for the geo math         |

## Notes & limits

- Trail data is live from OpenStreetMap on every search (no cache) — be kind to the free
  Overpass instance; radius is capped at 50 km for that reason.
- Route "scope" comes from the OSM `network` tag (local / regional / national /
  international); per-way `sac_scale` difficulty would need a heavier query.
- Ascent is shown only where mappers tagged it; OSM has no elevation model.

Data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
