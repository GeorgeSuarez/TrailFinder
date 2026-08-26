import { FetchHttpClient, HttpApiBuilder, HttpServer } from "@effect/platform";
import { Layer } from "effect";
import { ApiLive } from "../server/src/app.ts";

// Same API as server/src/main.ts, on Cloudflare Workers: global fetch instead of
// undici; static files are served by Workers Assets (see wrangler.jsonc).
const WorkerLive = Layer.mergeAll(
  Layer.provide(ApiLive, FetchHttpClient.layer),
  HttpServer.layerContext,
);

export default {
  fetch: HttpApiBuilder.toWebHandler(WorkerLive).handler,
};
