import * as fc from "effect/FastCheck";
import { describe, expect, it } from "vitest";
import { haversineM, isClosedLoop, minDistanceM, polylineLengthM } from "./geo.ts";

// Coordinates as fixed decimals: lat in [-85, 85], lon in [-180, 180]
const lat = fc.integer({ min: -85_000_000, max: 85_000_000 }).map((v) => v / 1_000_000);
const lon = fc.integer({ min: -180_000_000, max: 180_000_000 }).map((v) => v / 1_000_000);
const ll = fc.record({ lat, lon });

describe("haversineM", () => {
  it("is zero for identical points", () => {
    expect(haversineM(47.3769, 8.5417, 47.3769, 8.5417)).toBe(0);
  });

  it("measures 1 degree of latitude as ~111.2 km anywhere", () => {
    const deg = haversineM(0, 0, 1, 0);
    expect(deg).toBeGreaterThan(110_000);
    expect(deg).toBeLessThan(112_500);
  });

  it("matches the great-circle distance Zürich HB -> Bern HB", () => {
    const zhBern = haversineM(47.3779, 8.2318, 46.9511, 7.4383);
    expect(zhBern).toBeGreaterThan(70_000);
    expect(zhBern).toBeLessThan(80_000);
  });

  it("is symmetric (property)", () => {
    fc.assert(
      fc.property(fc.tuple(ll, ll), ([a, b]) => {
        expect(haversineM(a.lat, a.lon, b.lat, b.lon)).toBe(haversineM(b.lat, b.lon, a.lat, a.lon));
      }),
    );
  });
});

describe("polylineLengthM", () => {
  it("is longer than a single leg for a triangle path", () => {
    const deg = haversineM(0, 0, 1, 0);
    const tri = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 0 },
      { lat: 1, lon: 1 },
    ];
    expect(polylineLengthM(tri)).toBeGreaterThan(deg);
  });

  it("is additive over concatenation (property)", () => {
    fc.assert(
      fc.property(fc.tuple(ll, ll, ll), ([a, b, c]) => {
        const path = [a, b, c];
        const left = polylineLengthM(path.slice(0, 2));
        const right = polylineLengthM(path.slice(1, 3));
        expect(polylineLengthM(path)).toBe(left + right);
      }),
    );
  });
});

describe("minDistanceM", () => {
  it("picks the nearest vertex across paths", () => {
    const near = minDistanceM({ lat: 0.5, lon: 0.5 }, [
      [{ lat: 10, lon: 10 }],
      [{ lat: 0.5, lon: 0.51 }],
    ]);
    expect(near).toBeLessThan(10_000);
  });

  it("never exceeds the distance to any path's first vertex (property)", () => {
    fc.assert(
      fc.property(
        ll,
        fc.array(fc.array(ll, { minLength: 1 }), { minLength: 1 }),
        (point, paths) => {
          const d = minDistanceM(point, paths);
          for (const path of paths) {
            const first = path[0];
            if (first === undefined) continue;
            expect(d).toBeLessThanOrEqual(haversineM(point.lat, point.lon, first.lat, first.lon));
          }
        },
      ),
    );
  });
});

describe("isClosedLoop", () => {
  it("detects a closed ring", () => {
    expect(
      isClosedLoop([
        [
          { lat: 0, lon: 0 },
          { lat: 0.001, lon: 0 },
          { lat: 0, lon: 0 },
        ],
      ]),
    ).toBe(true);
  });

  it("rejects an open path", () => {
    expect(
      isClosedLoop([
        [
          { lat: 0, lon: 0 },
          { lat: 0.05, lon: 0 },
        ],
      ]),
    ).toBe(false);
  });
});
