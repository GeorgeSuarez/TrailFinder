import { HttpApiBuilder, HttpServer } from "@effect/platform";
import { NodeHttpClient } from "@effect/platform-node";
import { Layer, Schema } from "effect";
import { MockAgent } from "undici";
import { afterEach, describe, expect, it } from "vitest";
import { GeocodeResult, TrailsResponse } from "../../shared/schema.ts";
import { ApiLive } from "./app.ts";
import { ENDPOINTS } from "./trails.ts";

// Faithful fakes of the third-party APIs, served over a real HTTP stack:
// the same undici HttpClient the Node server uses, pointed at a MockAgent.
// Keeps the public /api entrypoints testable without touching the network.

const OVERPASS_HOSTS = ENDPOINTS.map((u) => new URL(u).origin) as readonly string[];

const overpassBody = JSON.stringify({
  elements: [
    {
      id: 101,
      tags: { name: "Einsiedeln Rundweg", network: "lwn", ascent: "+250", ref: "44" },
      members: [
        {
          geometry: [
            { lat: 47.05, lon: 8 },
            { lat: 47.06, lon: 8 },
          ],
        },
      ],
    },
    {
      id: 102,
      tags: { name: "Alpstein", network: "nwn", ascent: "~" },
      members: [
        {
          geometry: [
            { lat: 47.1, lon: 8 },
            { lat: 47.12, lon: 8 },
          ],
        },
      ],
    },
    { id: 103 }, // no geometry -> dropped
    {
      id: 104,
      members: [
        {
          geometry: [
            { lat: 46.98, lon: 8 },
            { lat: 47.0, lon: 8.001 },
          ],
        },
      ],
    }, // untagged
  ],
});

const agents: Array<MockAgent> = [];

const newAgent = (): MockAgent => {
  const agent = new MockAgent();
  agent.disableNetConnect(); // fail loudly if a test ever hits the real network
  agents.push(agent);
  return agent;
};

afterEach(async () => {
  await Promise.all(agents.splice(0).map((a) => a.close()));
});

const mockJson = (
  agent: MockAgent,
  origin: string,
  method: "GET" | "POST",
  path: string | RegExp,
  status: number,
  body: string,
) =>
  agent
    .get(origin)
    .intercept({ method, path })
    .reply(status, body, { headers: { "content-type": "application/json" } })
    .persist();

const handler = (agent: MockAgent) =>
  HttpApiBuilder.toWebHandler(
    Layer.mergeAll(
      Layer.provide(
        ApiLive,
        NodeHttpClient.layerUndiciWithoutDispatcher.pipe(
          Layer.provide(Layer.sync(NodeHttpClient.Dispatcher, () => agent)),
        ),
      ),
      HttpServer.layerContext,
    ),
  ).handler;

describe("GET /api/trails", () => {
  it("decodes, computes and sorts trails; drops relations without geometry", async () => {
    const agent = newAgent();
    mockJson(agent, OVERPASS_HOSTS[0]!, "POST", "/api/interpreter", 200, overpassBody);

    const res = await handler(agent)(
      new Request("http://test/api/trails?lat=47&lon=8&radius=10000"),
    );
    expect(res.status).toBe(200);

    // decode through the shared schema: proves the wire contract, no cast
    const body = Schema.decodeUnknownSync(TrailsResponse)(await res.json());
    const byId = (id: number) => body.trails.find((t) => t.id === id);

    expect(body.trails.map((t) => t.id)).toEqual([104, 101, 102]); // sorted by pointDistanceM
    expect(byId(103)).toBeUndefined();
    expect(byId(101)?.name).toBe("Einsiedeln Rundweg");
    expect(byId(101)?.network).toBe("lwn");
    expect(byId(101)?.ascentM).toBe(250); // "+250" parses
    expect(byId(101)?.ref).toBe("44");
    expect(byId(102)?.ascentM).toBeNull(); // "~" does not parse
    expect(byId(102)?.network).toBe("nwn");
    expect(byId(104)?.name).toBeNull(); // untagged relation
    expect(byId(104)?.network).toBeNull();
    expect(byId(104)?.pointDistanceM).toBeLessThan(byId(101)?.pointDistanceM ?? Infinity);
    expect(byId(101)?.lengthM).toBeGreaterThan(1000); // 0.01 deg lat
    expect(byId(101)?.lengthM).toBeLessThan(1300);
  });

  it("falls back to the next mirror when the first returns 521", async () => {
    const agent = newAgent();
    mockJson(agent, OVERPASS_HOSTS[0]!, "POST", "/api/interpreter", 521, "Service Unavailable");
    mockJson(agent, OVERPASS_HOSTS[1]!, "POST", "/api/interpreter", 200, overpassBody);

    const res = await handler(agent)(
      new Request("http://test/api/trails?lat=47&lon=8&radius=10000"),
    );
    expect(res.status).toBe(200);
    const body = Schema.decodeUnknownSync(TrailsResponse)(await res.json());
    expect(body.trails.length).toBe(3);
  });

  it(
    "maps an unexpected Overpass shape to 503",
    { timeout: 20_000 }, // 5 mirrors × 3 retry attempts with exponential backoff
    async () => {
      const agent = newAgent();
      for (const host of OVERPASS_HOSTS) {
        mockJson(
          agent,
          host,
          "POST",
          "/api/interpreter",
          200,
          JSON.stringify({ elements: "nope" }),
        );
      }
      const res = await handler(agent)(
        new Request("http://test/api/trails?lat=47&lon=8&radius=10000"),
      );
      expect(res.status).toBe(503);
      // SAFETY: HttpApi error responses always carry a message field (HttpApiError schema)
      const body = (await res.json()) as { message?: unknown };
      expect(String(body.message)).toContain("Overpass");
    },
  );

  it("rejects an out-of-range radius with 400", async () => {
    const agent = newAgent();
    const res = await handler(agent)(new Request("http://test/api/trails?lat=47&lon=8&radius=1"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/geocode", () => {
  const NOMINATIM = "https://nominatim.openstreetmap.org";
  const nominatimBody = JSON.stringify([
    { display_name: "Zürich, Switzerland", lat: "47.3744", lon: "8.5417" },
  ]);

  it("parses Nominatim's string lat/lon into numbers", async () => {
    const agent = newAgent();
    mockJson(agent, NOMINATIM, "GET", /^\/search/, 200, nominatimBody);

    const res = await handler(agent)(new Request("http://test/api/geocode?q=zurich"));
    expect(res.status).toBe(200);
    const body = Schema.decodeUnknownSync(Schema.Array(GeocodeResult))(await res.json());
    expect(body[0]).toEqual({ label: "Zürich, Switzerland", lat: 47.3744, lon: 8.5417 });
  });

  it("maps a Nominatim failure to 502", async () => {
    const agent = newAgent();
    mockJson(agent, NOMINATIM, "GET", /^\/search/, 500, "boom");

    const res = await handler(agent)(new Request("http://test/api/geocode?q=zurich"));
    expect(res.status).toBe(502);
    // SAFETY: HttpApi error responses always carry a message field (HttpApiError schema)
    const body = (await res.json()) as { message?: unknown };
    expect(String(body.message)).toContain("Nominatim");
  });
});
