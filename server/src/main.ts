import {
  HttpApiBuilder,
  HttpApp,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import type { HttpPlatform } from "@effect/platform/HttpPlatform";
import { NodeHttpClient, NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const ApiLive = HttpApiBuilder.api(Api).pipe(
  Layer.provide(SearchLive),
  Layer.provide(NodeHttpClient.layerUndici),
);

// --- static file serving for the built client (production single-process mode) ---

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

// ponytail: no SPA history fallback — single-route app; add index.html fallback for deep links
const serveStatic = (app: HttpApp.Default): HttpApp.Default<never, HttpPlatform> =>
  Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest;
    const url = req.url.split("?")[0] ?? "/";
    if (req.method !== "GET" || url.startsWith("/api")) return yield* app;

    const rel = url === "/" ? "index.html" : decodeURIComponent(url).replace(/^\/+/, "");
    const filePath = path.resolve(distDir, rel);
    if (!filePath.startsWith(distDir + path.sep)) return yield* app;

    return yield* HttpServerResponse.file(filePath).pipe(Effect.catchAll(() => app));
  });

const port = Number(process.env.PORT ?? 3000);

const ServerLive = HttpApiBuilder.serve(serveStatic).pipe(
  Layer.provide(ApiLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port })),
  Layer.launch,
);

NodeRuntime.runMain(ServerLive);
