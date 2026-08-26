import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Duration, Effect, Schedule, Schema } from "effect";
import type { LatLng, Trail } from "../../shared/schema.ts";
import { OverpassUnavailable } from "./errors.ts";
import { minDistanceM, polylineLengthM } from "./geo.ts";

const ENDPOINT = "https://overpass-api.de/api/interpreter";

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

/**
 * Fetch hiking-route relations around a point. Any transport/parse failure is
 * absorbed into `OverpassUnavailable` so handlers stay one-liners.
 */
export const fetchTrails = (
  point: LatLng,
  radiusM: number,
): Effect.Effect<Trail[], OverpassUnavailable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const request = HttpClientRequest.post(ENDPOINT).pipe(
      HttpClientRequest.bodyText(buildQuery(point.lat, point.lon, radiusM)),
      HttpClientRequest.setHeader("content-type", "text/plain"),
      // Overpass's fronting Apache 406s undici's default "node" user-agent
      HttpClientRequest.setHeader("user-agent", "TrailFinder/0.1 (effect-ts hiking search)"),
    );
    // ponytail: single endpoint; add kumi.systems mirror fallback if 429s bite
    const response = yield* client.execute(request).pipe(
      Effect.timeout(Duration.seconds(20)),
      Effect.filterOrFail(
        (res) => res.status === 200,
        (res) => new OverpassUnavailable({ message: `Overpass responded ${res.status}` }),
      ),
      Effect.retry({ times: 3, schedule: Schedule.exponential(Duration.seconds(0.5)) }),
    );
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
  }).pipe(
    Effect.catchAll((err) =>
      err instanceof OverpassUnavailable
        ? Effect.fail(err)
        : Effect.fail(new OverpassUnavailable({ message: `${err._tag} talking to Overpass` })),
    ),
  );
