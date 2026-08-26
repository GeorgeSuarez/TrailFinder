import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { Api } from "./api.ts";
import { geocode } from "./geocode.ts";
import { fetchTrails } from "./trails.ts";

const SearchLive = HttpApiBuilder.group(Api, "search", (handlers) =>
  handlers
    .handle("geocode", ({ urlParams }) => geocode(urlParams.q.trim()))
    .handle("trails", ({ urlParams }) =>
      fetchTrails({ lat: urlParams.lat, lon: urlParams.lon }, urlParams.radius).pipe(
        Effect.map((trails) => ({ trails })),
      ),
    ),
);

/**
 * API app with no runtime bindings — callers provide their own HttpClient layer
 * (undici on Node, global fetch on Workers).
 */
export const ApiLive = HttpApiBuilder.api(Api).pipe(Layer.provide(SearchLive));
