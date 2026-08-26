export interface SavedPlace {
  label: string;
  lat: number;
  lon: number;
}

const FAVORITES_KEY = "trailfinder.favorites";
const RECENTS_KEY = "trailfinder.recents";
const RECENTS_CAP = 6;

export const placeKey = (p: { lat: number; lon: number }) =>
  `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

function loadPlaces(key: string): Array<SavedPlace> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (p): p is SavedPlace =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as SavedPlace).label === "string" &&
        Number.isFinite((p as SavedPlace).lat) &&
        Number.isFinite((p as SavedPlace).lon),
    );
  } catch {
    return [];
  }
}

function savePlaces(key: string, places: Array<SavedPlace>): void {
  try {
    localStorage.setItem(key, JSON.stringify(places));
  } catch {
    // storage full/blocked — persistence is best-effort
  }
}

export const loadFavorites = (): Array<SavedPlace> => loadPlaces(FAVORITES_KEY);
export const saveFavorites = (places: Array<SavedPlace>): void => savePlaces(FAVORITES_KEY, places);
export const loadRecents = (): Array<SavedPlace> => loadPlaces(RECENTS_KEY);
export const saveRecents = (places: Array<SavedPlace>): void => savePlaces(RECENTS_KEY, places);

export function pushRecent(
  recents: ReadonlyArray<SavedPlace>,
  place: SavedPlace,
): Array<SavedPlace> {
  return [place, ...recents.filter((r) => placeKey(r) !== placeKey(place))].slice(0, RECENTS_CAP);
}
