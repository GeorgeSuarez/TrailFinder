import { Schema } from "effect";

/** Domain types shared between server and client. */

export const LatLng = Schema.Struct({ lat: Schema.Number, lon: Schema.Number });
export type LatLng = typeof LatLng.Type;

export const Trail = Schema.Struct({
  /** OSM relation id */
  id: Schema.Number,
  name: Schema.NullOr(Schema.String),
  /** straight-line distance from the search point to the closest trail vertex */
  pointDistanceM: Schema.Number,
  /** route length computed from geometry (tags.distance is often missing) */
  lengthM: Schema.Number,
  /** ascent tag if OSM has one */
  ascentM: Schema.NullOr(Schema.Number),
  /** route scope: lwn=local rwn=regional nwn=national iwn=international */
  network: Schema.NullOr(Schema.Literal("lwn", "rwn", "nwn", "iwn")),
  website: Schema.NullOr(Schema.String),
  operator: Schema.NullOr(Schema.String),
  /** one polyline per member way, drawn as-is (unmerged) */
  paths: Schema.Array(Schema.Array(LatLng)),
});
export type Trail = typeof Trail.Type;

export const TrailsResponse = Schema.Struct({ trails: Schema.Array(Trail) });
export type TrailsResponse = typeof TrailsResponse.Type;

export const GeocodeResult = Schema.Struct({
  label: Schema.String,
  lat: Schema.Number,
  lon: Schema.Number,
});
export type GeocodeResult = typeof GeocodeResult.Type;
