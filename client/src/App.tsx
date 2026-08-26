import { useEffect, useState } from "react";
import type { GeocodeResult, Trail } from "../../shared/schema.ts";
import { geocode, getTrails, type Point } from "./api";
import { TrailMap } from "./map";

const SCOPE: Record<string, string> = {
  lwn: "local",
  rwn: "regional",
  nwn: "national",
  iwn: "international",
};

const km = (m: number) => (m / 1000).toFixed(m >= 10_000 ? 0 : 1);

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

  // fetch trails whenever point/radius changes
  useEffect(() => {
    if (!point) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    setSelectedId(null);
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

  function pick(result: GeocodeResult) {
    setMatches(null);
    setQuery("");
    setPoint({ lat: result.lat, lon: result.lon });
    setPointLabel(
      result.label.split(",")[0]! + result.label.slice(result.label.indexOf(",")).slice(0, 60),
    );
  }

  async function search(q: string) {
    setError(null);
    try {
      const results = await geocode(q.trim());
      if (results.length === 0) setError(`No place found for “${q}”`);
      else if (results.length === 1) pick(results[0]!);
      else setMatches(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function useMyLocation() {
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setPointLabel("Your location");
      },
      (err) => setError(`Location failed: ${err.message}`),
      { timeout: 10_000 },
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
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              aria-label="Search radius"
            >
              <option value={5}>5 km</option>
              <option value={10}>10 km</option>
              <option value={25}>25 km</option>
            </select>
          </label>
        </div>

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
          </p>
        )}
        {loading && <p role="status">Loading trails from OpenStreetMap…</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        {trails && trails.length === 0 && (
          <p>No hiking routes found within {radiusKm} km. Try a bigger radius.</p>
        )}

        {trails && trails.length > 0 && (
          <>
            <p className="count">
              {trails.length} route{trails.length === 1 ? "" : "s"} · click one to zoom
            </p>
            <ul className="list">
              {trails.map((t) => (
                <li
                  key={t.id}
                  className={t.id === selectedId ? "selected" : ""}
                  onClick={() => setSelectedId(t.id)}
                >
                  <span className="name">{t.name ?? `Route ${t.id}`}</span>
                  <span className="meta">
                    {km(t.pointDistanceM)} km away · {km(t.lengthM)} km long
                    {t.ascentM != null ? ` · ↗ ${Math.round(t.ascentM)} m` : ""}
                    {t.network ? ` · ${SCOPE[t.network]}` : ""}
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
      </aside>
      <TrailMap
        point={point}
        trails={trails}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onPick={(p) => {
          setPoint(p);
          setPointLabel("Dropped pin");
        }}
      />
    </div>
  );
}
