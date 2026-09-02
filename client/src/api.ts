import { Schema } from "effect";
import {
  GeocodeResult,
  TrailsResponse,
  type GeocodeResult as GeocodeResultT,
  type Trail,
} from "../../shared/schema.ts";

export type Point = { lat: number; lon: number };

async function getJson<T>(url: string, schema: Schema.Schema<T>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, signal ? { signal } : {});
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return Schema.decodeUnknownPromise(schema)(body);
}

export async function geocode(q: string): Promise<Array<GeocodeResultT>> {
  const r = await getJson(`/api/geocode?q=${encodeURIComponent(q)}`, Schema.Array(GeocodeResult));
  return r as Array<GeocodeResultT>;
}

export async function getTrails(
  point: Point,
  radiusM: number,
  signal?: AbortSignal,
): Promise<Array<Trail>> {
  const r = await getJson(
    `/api/trails?lat=${point.lat}&lon=${point.lon}&radius=${radiusM}`,
    TrailsResponse,
    signal,
  );
  return r.trails as Array<Trail>;
}
