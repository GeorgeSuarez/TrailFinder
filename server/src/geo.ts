/**
 * Geo math for trail distances.
 * Mean Earth radius + spherical haversine — accurate to ~0.5% at hiking scale,
 * plenty for sorting and display.
 */
const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;

interface LL {
  lat: number;
  lon: number;
}

export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

export function polylineLengthM(path: ReadonlyArray<LL>): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineM(path[i - 1]!.lat, path[i - 1]!.lon, path[i]!.lat, path[i]!.lon);
  }
  return total;
}

/** Closest approach of any trail vertex to the search point. */
export function minDistanceM(point: LL, paths: ReadonlyArray<ReadonlyArray<LL>>): number {
  let min = Infinity;
  for (const path of paths) {
    for (const p of path) {
      const d = haversineM(point.lat, point.lon, p.lat, p.lon);
      if (d < min) min = d;
    }
  }
  return min;
}

// --- self-check: npm run geo-check ---
if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]!).href) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`FAIL: ${msg}`);
      process.exit(1);
    }
    console.log(`ok: ${msg}`);
  };

  // Same point -> 0
  assert(haversineM(47.3769, 8.5417, 47.3769, 8.5417) === 0, "zero distance");

  // 1 degree of latitude ≈ 111.2 km anywhere
  const deg = haversineM(0, 0, 1, 0);
  assert(deg > 110_000 && deg < 112_500, `one degree lat ≈ ${(deg / 1000).toFixed(1)} km`);

  // Zürich HB -> Bern HB, great-circle ≈ 95 km
  const zhBern = haversineM(47.3779, 8.2318, 46.9511, 7.4383);
  assert(zhBern > 70_000 && zhBern < 80_000, `Zürich->Bern ≈ ${(zhBern / 1000).toFixed(0)} km`);

  // Triangle path length = sum of legs
  const tri = [
    { lat: 0, lon: 0 },
    { lat: 1, lon: 0 },
    { lat: 1, lon: 1 },
  ];
  assert(polylineLengthM(tri) > deg, "triangle path longer than one leg");

  // Min over multiple paths picks nearest vertex
  const near = minDistanceM({ lat: 0.5, lon: 0.5 }, [
    [{ lat: 10, lon: 10 }],
    [{ lat: 0.5, lon: 0.51 }],
  ]);
  assert(near < 10_000, `min distance across paths ≈ ${(near / 1000).toFixed(1)} km`);
}
