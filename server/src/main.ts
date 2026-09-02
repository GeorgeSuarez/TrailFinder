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
import { ApiLive } from "./app.ts";

// --- static file serving for the built client (production single-process mode) ---

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");

const serveStatic = (app: HttpApp.Default): HttpApp.Default<never, HttpPlatform> =>
  Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest;
    if (req.method !== "GET" || req.url.startsWith("/api")) return yield* app;

    let pathname: string;
    try {
      pathname = new URL(req.url, "http://localhost").pathname;
    } catch {
      return yield* app;
    }
    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(distDir, rel);
    if (!filePath.startsWith(distDir + path.sep)) return yield* app;

    // missing asset (has an extension) -> API's 404; extension-less path -> SPA deep link
    if (rel.includes(".")) {
      return yield* HttpServerResponse.file(filePath).pipe(Effect.catchAll(() => app));
    }
    return yield* HttpServerResponse.file(path.join(distDir, "index.html")).pipe(
      Effect.catchAll(() => app),
    );
  });

const port = Number(process.env.PORT ?? 3000);

const ServerLive = HttpApiBuilder.serve(serveStatic).pipe(
  Layer.provide(Layer.provide(ApiLive, NodeHttpClient.layerUndici)),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port })),
  Layer.launch,
);

NodeRuntime.runMain(ServerLive);
