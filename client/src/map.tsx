import { useEffect } from "react";
import L from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Trail } from "../../shared/schema.ts";
import type { Point } from "./api";

const SELECTED = "#dc2626";
const NORMAL = "#2563eb";

function MapEffects({
  point,
  selected,
  onPick,
}: {
  point: Point | null;
  selected: Trail | undefined;
  onPick: (p: Point) => void;
}) {
  const map = useMap();
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }) });
  useEffect(() => {
    if (point) map.setView([point.lat, point.lon], Math.max(map.getZoom(), 11));
  }, [point?.lat, point?.lon]); // oxlint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;
    const pts = selected.paths.flat().map((p): [number, number] => [p.lat, p.lon]);
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }, [selected?.id]); // oxlint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function TrailMap(props: {
  point: Point | null;
  trails: Array<Trail> | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onPick: (p: Point) => void;
}) {
  const selected = props.trails?.find((t) => t.id === props.selectedId);
  return (
    <MapContainer center={[46.02, 7.75]} zoom={9} className="map" preferCanvas>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEffects point={props.point} selected={selected} onPick={props.onPick} />
      {props.point && (
        <CircleMarker
          center={[props.point.lat, props.point.lon]}
          radius={8}
          pathOptions={{ color: "#fff", fillColor: SELECTED, fillOpacity: 1, weight: 2 }}
        />
      )}
      {(props.trails ?? []).map((t) => (
        <Polyline
          key={t.id}
          positions={t.paths.map((seg) => seg.map((p): [number, number] => [p.lat, p.lon]))}
          pathOptions={{
            color: t.id === props.selectedId ? SELECTED : NORMAL,
            weight: t.id === props.selectedId ? 4 : 2,
            opacity: 0.85,
          }}
          eventHandlers={{ click: () => props.onSelect(t.id) }}
        />
      ))}
    </MapContainer>
  );
}
