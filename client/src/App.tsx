import { useEffect, useMemo, useState } from "react";
import { isClosedLoop } from "../../shared/geo.ts";
import type { GeocodeResult, Trail } from "../../shared/schema.ts";
import { geocode, getTrails, type Point } from "./api";
import { downloadGpx } from "./gpx";
import {
  FAVORITES_KEY,
  RECENTS_KEY,
  loadPlaces,
  placeKey,
  pushRecent,
  savePlaces,
  type SavedPlace,
} from "./storage";
import { TrailMap } from "./map";

const SCOPE = {
  lwn: "local",
  rwn: "regional",
  nwn: "national",
  iwn: "international",
} as const;
type Scope = keyof typeof SCOPE;
const SCOPES = Object.keys(SCOPE) as Scope[];
type ScopeFilter = "all" | Scope;
type SortBy = "distance" | "length" | "ascent";

const without = (places: SavedPlace[], place: SavedPlace) =>
  places.filter((p) => placeKey(p) !== placeKey(place));

const km = (m: number) => (m / 1000).toFixed(m >= 10_000 ? 0 : 1);

function TrailDetail({ trail, onClose }: { trail: Trail; onClose: () => void }) {
  return (
    <section className="detail" aria-label="Selected trail details">
      <div className="detail-head">
        <strong>{trail.name ?? `Route ${trail.id}`}</strong>
        <button onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <div className="chips">
        <span className="chip">{isClosedLoop(trail.paths) ? "loop" : "out & back"}</span>
        {trail.ref && <span className="chip">{trail.ref}</span>}
        {trail.symbol && <span className="chip">{trail.symbol}</span>}
        {trail.network && <span className="chip">{SCOPE[trail.network as Scope]}</span>}
      </div>
      <p className="meta">
        {km(trail.lengthM)} km · {km(trail.pointDistanceM)} km away
        {trail.ascentM != null ? ` · ↗ ${Math.round(trail.ascentM)} m` : ""}
      </p>
      {trail.operator && <p className="meta">Operator: {trail.operator}</p>}
      <div className="row detail-actions">
        <button onClick={() => downloadGpx(trail)}>⬇ GPX</button>
        {trail.website && (
          <a href={trail.website} target="_blank" rel="noreferrer">
            website
          </a>
        )}
        <a
          href={`https://www.openstreetmap.org/relation/${trail.id}`}
          target="_blank"
          rel="noreferrer"
        >
          OSM ↗
        </a>
      </div>
    </section>
  );
}

function PlaceRow(props: { place: SavedPlace; onGo: () => void; onRemove?: () => void }) {
  return (
    <div className="place">
      <button className="goto" onClick={props.onGo}>
        {props.place.label}
      </button>
      {props.onRemove && (
        <button
          className="remove"
          onClick={props.onRemove}
          aria-label={`Remove ${props.place.label}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function App() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Array<GeocodeResult> | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [pointLabel, setPointLabel] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(10);
  const [trails, setTrails] = useState<Array<Trail> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterText, setFilterText] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("distance");
  const [favorites, setFavorites] = useState<Array<SavedPlace>>(() => loadPlaces(FAVORITES_KEY));
  const [recents, setRecents] = useState<Array<SavedPlace>>(() => loadPlaces(RECENTS_KEY));

  // restore state from a shared deep link (?lat&lon&rkm&trail) once on mount
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const lat = Number.parseFloat(sp.get("lat") ?? "");
    const lon = Number.parseFloat(sp.get("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;

    const place: SavedPlace = { label: "Shared location", lat, lon };
    setPoint({ lat, lon });
    setPointLabel(place.label);
    setRecents((rs) => pushRecent(rs, place));
    const rkm = Number.parseFloat(sp.get("rkm") ?? "");
    if (rkm === 5 || rkm === 10 || rkm === 25) setRadiusKm(rkm);
    const trailId = Number.parseInt(sp.get("trail") ?? "");
    if (Number.isInteger(trailId) && trailId > 0) setSelectedId(trailId);
  }, []);

  // keep the URL in sync so any view can be shared or bookmarked
  useEffect(() => {
    const sp = new URLSearchParams();
    if (point) {
      sp.set("lat", point.lat.toFixed(5));
      sp.set("lon", point.lon.toFixed(5));
      sp.set("rkm", String(radiusKm));
      if (selectedId != null && trails?.some((t) => t.id === selectedId))
        sp.set("trail", String(selectedId));
    }
    window.history.replaceState(null, "", sp.size > 0 ? `/?${sp}` : "/");
  }, [point, radiusKm, selectedId, trails]);

  useEffect(() => savePlaces(FAVORITES_KEY, favorites), [favorites]);
  useEffect(() => savePlaces(RECENTS_KEY, recents), [recents]);

  // fetch trails whenever point/radius changes (selection survives refetches)
  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    getTrails(point, radiusKm * 1000, ctl.signal)
      .then((t) => {
        setTrails(t);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : String(e));
        setTrails(null);
        setLoading(false);
      });
    return () => ctl.abort();
  }, [point, radiusKm]); // oxlint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    if (!trails) return null;
    let list = trails;
    const q = filterText.trim().toLowerCase();
    if (q) list = list.filter((t) => (t.name ?? "").toLowerCase().includes(q));
    if (scopeFilter !== "all") list = list.filter((t) => t.network === scopeFilter);
    if (sortBy === "length") list = [...list].sort((a, b) => b.lengthM - a.lengthM);
    else if (sortBy === "ascent")
      list = [...list].sort((a, b) => (b.ascentM ?? -1) - (a.ascentM ?? -1));
    return list;
  }, [trails, filterText, scopeFilter, sortBy]);

  const selectedTrail = trails?.find((t) => t.id === selectedId) ?? null;

  /** Move the search point and remember it under Recent. */
  function goTo(place: SavedPlace) {
    setPoint({ lat: place.lat, lon: place.lon });
    setPointLabel(place.label);
    setSelectedId(null);
    setRecents((rs) => pushRecent(rs, place));
  }

  function pick(result: GeocodeResult) {
    setMatches(null);
    setQuery("");
    goTo({
      // city name only; the full display_name is often 100+ chars for the recents list
      label: (result.label.split(",")[0] ?? result.label).slice(0, 60),
      lat: result.lat,
      lon: result.lon,
    });
  }

  async function search(q: string) {
    setError(null);
    try {
      const results = await geocode(q.trim());
      if (results.length === 0) setError(`No place found for “${q}”`);
      else if (results.length === 1) {
        const only = results[0];
        if (only !== undefined) pick(only);
      } else setMatches(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function useMyLocation() {
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        goTo({
          label: "Your location",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      (err) => setError(`Location failed: ${err.message}`),
      { timeout: 10_000 },
    );
  }

  const currentKey = point ? placeKey(point) : null;
  const isFavorite = currentKey != null && favorites.some((f) => placeKey(f) === currentKey);

  function toggleFavorite() {
    if (!point || !currentKey) return;
    setFavorites((fs) =>
      fs.some((f) => placeKey(f) === currentKey)
        ? fs.filter((f) => placeKey(f) !== currentKey)
        : [
            {
              label: pointLabel ?? `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`,
              lat: point.lat,
              lon: point.lon,
            },
            ...fs,
          ],
    );
  }

  return (
    <div className="app">
      <aside>
        <h1>TrailFinder</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
          className="row"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place…"
            aria-label="Search a place"
          />
          <button type="submit" disabled={query.trim().length < 2}>
            Search
          </button>
        </form>
        <div className="row">
          <button onClick={useMyLocation}>📍 Use my location</button>
          <label className="radius">
            within
            <select
              value={radiusKm}
              onChange={(e) => {
                setSelectedId(null);
                setRadiusKm(Number(e.target.value));
              }}
              aria-label="Search radius"
            >
              <option value={5}>5 km</option>
              <option value={10}>10 km</option>
              <option value={25}>25 km</option>
            </select>
          </label>
        </div>

        {(favorites.length > 0 || recents.length > 0) && (
          <div className="places">
            {favorites.length > 0 && (
              <>
                <p className="hint">★ Favorites</p>
                {favorites.map((f) => (
                  <PlaceRow
                    key={placeKey(f)}
                    place={f}
                    onGo={() => goTo(f)}
                    onRemove={() => setFavorites((fs) => without(fs, f))}
                  />
                ))}
              </>
            )}
            {recents.length > 0 && (
              <>
                <p className="hint">Recent</p>
                {recents.slice(0, 4).map((r) => (
                  <PlaceRow
                    key={placeKey(r)}
                    place={r}
                    onGo={() => goTo(r)}
                    onRemove={() => setRecents((rs) => without(rs, r))}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {matches && (
          <div className="matches">
            <p>Multiple matches — pick one:</p>
            {matches.map((m) => (
              <button key={`${m.lat},${m.lon}`} className="match" onClick={() => pick(m)}>
                {m.label}
              </button>
            ))}
          </div>
        )}

        {!point && !error && (
          <p className="hint">Search a place, drop a pin on the map, or use your location.</p>
        )}
        {pointLabel && (
          <p className="hint">
            Hiking trails near <strong>{pointLabel}</strong>
            {point && (
              <button
                className="star"
                onClick={toggleFavorite}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                {isFavorite ? "★" : "☆"}
              </button>
            )}
          </p>
        )}
        {loading && <p role="status">Loading trails from OpenStreetMap…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        {trails && trails.length > 0 && visible && (
          <>
            <div className="row filters">
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter by name…"
                aria-label="Filter trails by name"
              />
              <select
                value={scopeFilter}
                // SAFETY: the select renders exactly the SCOPES options, so the change value is one of them
                onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
                aria-label="Filter by scope"
              >
                <option value="all">any scope</option>
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE[s]}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                // SAFETY: the select renders exactly the SortBy options, so the change value is one of them
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                aria-label="Sort by"
              >
                <option value="distance">nearby first</option>
                <option value="length">longest first</option>
                <option value="ascent">highest climb</option>
              </select>
            </div>

            {visible.length === 0 ? (
              <p>No routes match these filters.</p>
            ) : (
              <>
                <p className="count">
                  {visible.length} route{visible.length === 1 ? "" : "s"}
                  {visible.length !== trails.length ? ` of ${trails.length}` : ""} · click one to
                  zoom
                </p>
                {selectedTrail && (
                  <TrailDetail trail={selectedTrail} onClose={() => setSelectedId(null)} />
                )}
                <ul className="list">
                  {visible.map((t) => (
                    <li
                      key={t.id}
                      className={t.id === selectedId ? "selected" : ""}
                      onClick={() => setSelectedId(t.id)}
                    >
                      <span className="name">{t.name ?? `Route ${t.id}`}</span>
                      <span className="meta">
                        {km(t.pointDistanceM)} km away · {km(t.lengthM)} km long
                        {t.ascentM != null ? ` · ↗ ${Math.round(t.ascentM)} m` : ""}
                        {t.network ? ` · ${SCOPE[t.network as Scope]}` : ""}
                      </span>
                      {t.website && (
                        <a
                          href={t.website}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          website
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {trails && trails.length === 0 && (
          <p>No hiking routes found within {radiusKm} km. Try a bigger radius.</p>
        )}
      </aside>
      <TrailMap
        point={point}
        trails={trails}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onPick={(p) => goTo({ label: "Dropped pin", lat: p.lat, lon: p.lon })}
      />
    </div>
  );
}
