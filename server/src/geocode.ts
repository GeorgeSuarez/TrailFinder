import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Duration, Effect, Schema } from "effect";
import type { GeocodeResult } from "../../shared/schema.ts";
import { GeocodeFailed } from "./errors.ts";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

// Nominatim returns lat/lon as strings
const NomResult = Schema.Struct({
  display_name: Schema.String,
  lat: Schema.NumberFromString,
  lon: Schema.NumberFromString,
});

const NomResponse = Schema.Array(NomResult);

export const geocode = (
  q: string,
): Effect.Effect<Array<GeocodeResult>, GeocodeFailed, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const url = `${ENDPOINT}?${new URLSearchParams({ q, format: "jsonv2", limit: "5" })}`;
    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeader("User-Agent", "TrailFinder/0.1 (hiking trail search demo)"),
    );
    const response = yield* client.execute(request).pipe(
      Effect.timeout(Duration.seconds(10)),
      Effect.filterOrFail(
        (res) => res.status === 200,
        (res) => new GeocodeFailed({ message: `Nominatim responded ${res.status}` }),
      ),
      Effect.retry({ times: 2 }),
    );
    const raw = yield* response.json.pipe(
      Effect.flatMap((json) => Schema.decodeUnknown(NomResponse)(json)),
      Effect.mapError(() => new GeocodeFailed({ message: "Unexpected Nominatim response shape" })),
    );
    return raw.map((r) => ({ label: r.display_name, lat: r.lat, lon: r.lon }));
  }).pipe(
    Effect.catchAll((err) =>
      err instanceof GeocodeFailed
        ? Effect.fail(err)
        : Effect.fail(new GeocodeFailed({ message: `Nominatim request failed (${err._tag})` })),
    ),
  );
