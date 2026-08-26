import type { Trail } from "../../shared/schema.ts";

const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** One <trk> with a <trkseg> per member way (GPX 1.1). */
export function toGpx(trail: Trail): string {
  const segs = trail.paths
    .map(
      (seg) =>
        `      <trkseg>\n${seg
          .map((p) => `        <trkpt lat="${p.lat}" lon="${p.lon}"/>`)
          .join("\n")}\n      </trkseg>`,
    )
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="TrailFinder" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <trk>",
    `    <name>${esc(trail.name ?? `Route ${trail.id}`)}</name>`,
    segs,
    "  </trk>",
    "</gpx>",
    "",
  ].join("\n");
}

export function downloadGpx(trail: Trail): void {
  const blob = new Blob([toGpx(trail)], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = (trail.name ?? `route-${trail.id}`)
    .toLowerCase()
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  a.href = url;
  a.download = `${slug || "trail"}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}
