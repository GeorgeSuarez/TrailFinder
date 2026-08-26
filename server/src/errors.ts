import { HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

/** Tagged API errors — become typed HTTP error responses via HttpApi. */

export class OverpassUnavailable extends Schema.TaggedError<OverpassUnavailable>()(
  "OverpassUnavailable",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 503 }),
) {}

export class GeocodeFailed extends Schema.TaggedError<GeocodeFailed>()(
  "GeocodeFailed",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 502 }),
) {}
