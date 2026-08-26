import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Duration, Effect, Schedule, Schema } from "effect";
import type { LatLng, Trail } from "../../shared/schema.ts";
import { OverpassUnavailable } from "./errors.ts";
import { minDistanceM, polylineLengthM } from "./geo.ts";

// Public Overpass mirrors, tried in order. overpass-api.de returns 521 when
// its origin is down/overloaded; falling through to the free mirrors keeps
// search working during those outages.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.tech-nakamura.jp/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
] as const;

export const buildQuery = (lat: number, lon: number, radiusM: number): string =>
  `[out:json][timeout:25];rel[route=hiking](around:${radiusM},${lat},${lon});out geom;`;

// --- Overpass JSON (loose — fields come and go) ---

const Point = Schema.Struct({ lat: Schema.Number, lon: Schema.Number });

const RawElement = Schema.Struct({
  id: Schema.Number,
  tags: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  members: Schema.optional(
    Schema.Array(Schema.Struct({ geometry: Schema.optional(Schema.Array(Point)) })),
  ),
});

const RawResponse = Schema.Struct({ elements: Schema.Array(RawElement) });
type RawElement = typeof RawElement.Type;

const NETWORKS = ["iwn", "nwn", "rwn", "lwn"] as const;

/** ponytail: ascent tag parsed leniently ("~"/"+250" forms); real elevation needs a DEM service */
function parseAscent(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toTrail(el: RawElement, point: LatLng): Trail | null {
  const paths = (el.members ?? [])
    .map((m) => m.geometry ?? [])
    .filter((g) => g.length > 1)
    .map((g) => g.map((p) => ({ lat: p.lat, lon: p.lon })));
  if (paths.length === 0) return null;

  const t = el.tags ?? {};
  return {
    id: el.id,
    name: t.name ?? null,
    pointDistanceM: Math.round(minDistanceM(point, paths)),
    lengthM: Math.round(paths.reduce((sum, p) => sum + polylineLengthM(p), 0)),
    ascentM: parseAscent(t.ascent),
    network: (NETWORKS as ReadonlyArray<string>).includes(t.network ?? "")
      ? ((t.network ?? null) as Trail["network"])
      : null,
    website: t.website ?? null,
    operator: t.operator ?? null,
    ref: t.ref ?? null,
    symbol: t.symbol ?? null,
    paths,
  };
}

const queryOne = (client: HttpClient.HttpClient, endpoint: string, body: string) =>
  client
    .execute(
      HttpClientRequest.post(endpoint).pipe(
        HttpClientRequest.bodyText(body),
        HttpClientRequest.setHeader("content-type", "text/plain"),
        // Overpass's fronting Apache 406s undici's default "node" user-agent
        HttpClientRequest.setHeader("user-agent", "TrailFinder/0.1 (effect-ts hiking search)"),
      ),
    )
    .pipe(
      Effect.timeout(Duration.seconds(20)),
      Effect.mapError(() => new OverpassUnavailable({ message: `Overpass ${endpoint} unreachable` })),
      Effect.filterOrFail(
        (res) => res.status === 200,
        (res) => new OverpassUnavailable({ message: `Overpass ${endpoint} responded ${res.status}` }),
      ),
      Effect.retry({ times: 2, schedule: Schedule.exponential(Duration.millis(300)) }),
    );

/**
 * Fetch hiking-route relations around a point. Tries each public mirror in
 * order; any transport/parse failure is absorbed into `OverpassUnavailable`
 * so handlers stay one-liners.
 */
export const fetchTrails = (
  point: LatLng,
  radiusM: number,
): Effect.Effect<Trail[], OverpassUnavailable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const body = buildQuery(point.lat, point.lon, radiusM);
    const response = yield* Effect.firstSuccessOf(ENDPOINTS.map((ep) => queryOne(client, ep, body)));
    const raw = yield* response.json.pipe(
      Effect.flatMap((json) => Schema.decodeUnknown(RawResponse)(json)),
      Effect.mapError(
        () => new OverpassUnavailable({ message: "Unexpected Overpass response shape" }),
      ),
    );

    const trails = raw.elements
      .map((el) => toTrail(el, point))
      .filter((t): t is Trail => t !== null)
      .sort((a, b) => a.pointDistanceM - b.pointDistanceM);
    return trails;
  });
