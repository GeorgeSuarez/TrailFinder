export interface SavedPlace {
  label: string;
  lat: number;
  lon: number;
}

export const FAVORITES_KEY = "trailfinder.favorites";
export const RECENTS_KEY = "trailfinder.recents";
const RECENTS_CAP = 6;

export const placeKey = (p: { lat: number; lon: number }) =>
  `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

export function loadPlaces(key: string): Array<SavedPlace> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is SavedPlace =>
        typeof p === "object" &&
        p !== null &&
        "label" in p &&
        typeof p.label === "string" &&
        "lat" in p &&
        typeof p.lat === "number" &&
        Number.isFinite(p.lat) &&
        "lon" in p &&
        typeof p.lon === "number" &&
        Number.isFinite(p.lon),
    );
  } catch {
    return [];
  }
}

export function savePlaces(key: string, places: Array<SavedPlace>): void {
  try {
    localStorage.setItem(key, JSON.stringify(places));
  } catch {
    // storage full/blocked — persistence is best-effort
  }
}

export function pushRecent(
  recents: ReadonlyArray<SavedPlace>,
  place: SavedPlace,
): Array<SavedPlace> {
  return [place, ...recents.filter((r) => placeKey(r) !== placeKey(place))].slice(0, RECENTS_CAP);
}
