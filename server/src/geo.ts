import { haversineM, isClosedLoop, minDistanceM, polylineLengthM } from "../../shared/geo.ts";

export { haversineM, minDistanceM, polylineLengthM };

// --- self-check: npm run geo-check ---
if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1] ?? "").href) {
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

  // Loop detection: closed ring vs open path
  assert(
    isClosedLoop([
      [
        { lat: 0, lon: 0 },
        { lat: 0.001, lon: 0 },
        { lat: 0, lon: 0 },
      ],
    ]),
    "closed ring detected as loop",
  );
  assert(
    !isClosedLoop([
      [
        { lat: 0, lon: 0 },
        { lat: 0.05, lon: 0 },
      ],
    ]),
    "open path not a loop",
  );
}
