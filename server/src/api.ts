import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { GeocodeResult, TrailsResponse } from "../../shared/schema.ts";
import { GeocodeFailed, OverpassUnavailable } from "./errors.ts";

/**
 * URL params arrive as strings — NumberFromString decodes and lets us range-check
 * in the same schema. Out-of-range input gets a built-in 400 before any handler runs.
 */

const LatLonRadius = Schema.Struct({
  lat: Schema.NumberFromString.pipe(Schema.between(-90, 90)),
  lon: Schema.NumberFromString.pipe(Schema.between(-180, 180)),
  /** meters; 50km ceiling keeps Overpass queries snappy */
  radius: Schema.NumberFromString.pipe(Schema.int(), Schema.between(500, 50000)),
});

export class SearchGroup extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.get("geocode", "/geocode")
      .setUrlParams(
        Schema.Struct({
          q: Schema.String.pipe(Schema.minLength(2), Schema.maxLength(200)),
        }),
      )
      .addSuccess(Schema.Array(GeocodeResult))
      .addError(GeocodeFailed),
  )
  .add(
    HttpApiEndpoint.get("trails", "/trails")
      .setUrlParams(LatLonRadius)
      .addSuccess(TrailsResponse)
      .addError(OverpassUnavailable),
  )
  .prefix("/api") {}

export class Api extends HttpApi.make("trailfinder").add(SearchGroup) {}
