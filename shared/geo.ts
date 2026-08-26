/**
 * Geo math for trail distances.
 * Mean Earth radius + spherical haversine — accurate to ~0.5% at hiking scale,
 * plenty for sorting and display. Shared by server (distance computation)
 * and client (loop detection).
 */

export interface LL {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6371008.8;
const RAD = Math.PI / 180;

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

/**
 * A trail whose geometry ends where it starts (±tolerance) is a loop.
 * Unmerged member ways make this a heuristic; 150 m absorbs typical gaps.
 */
export function isClosedLoop(paths: ReadonlyArray<ReadonlyArray<LL>>, toleranceM = 150): boolean {
  const start = paths[0]?.[0];
  const end = paths.at(-1)?.at(-1);
  if (!start || !end) return false;
  return haversineM(start.lat, start.lon, end.lat, end.lon) <= toleranceM;
}
