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

function ClickCatcher({ onPick }: { onPick: (p: Point) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lon: e.latlng.lng }),
  });
  return null;
}

function CenterOn({ point }: { point: Point }) {
  const map = useMap();
  useEffect(() => {
    map.setView([point.lat, point.lon], Math.max(map.getZoom(), 11));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- oxlint
  }, [point.lat, point.lon]);
  return null;
}

function FitTrail({ trail }: { trail: Trail }) {
  const map = useMap();
  useEffect(() => {
    const pts = trail.paths.flat().map((p) => [p.lat, p.lon] as [number, number]);
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.15));
  }, [trail.id]);
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
      <ClickCatcher onPick={props.onPick} />
      {props.point && (
        <>
          <CenterOn point={props.point} />
          <CircleMarker
            center={[props.point.lat, props.point.lon]}
            radius={8}
            pathOptions={{ color: "#fff", fillColor: SELECTED, fillOpacity: 1, weight: 2 }}
          />
        </>
      )}
      {(props.trails ?? []).map((t) => (
        <Polyline
          key={t.id}
          positions={t.paths.map((seg) => seg.map((p) => [p.lat, p.lon]))}
          pathOptions={{
            color: t.id === props.selectedId ? SELECTED : NORMAL,
            weight: t.id === props.selectedId ? 4 : 2,
            opacity: 0.85,
          }}
          eventHandlers={{ click: () => props.onSelect(t.id) }}
        />
      ))}
      {selected && <FitTrail trail={selected} />}
    </MapContainer>
  );
}
