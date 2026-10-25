import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Shelter } from "../types";
import { formatCapacity } from "../utils/geo";

const TORONTO_CENTER: [number, number] = [43.65107, -79.347015];

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

type FocusTarget = {
  lat: number;
  lon: number;
  name: string;
  address?: string;
  capacityLabel: string;
} | null;

type ShelterMapProps = {
  shelters: Shelter[];
  focus: FocusTarget;
};

function MapFocus({ focus }: { focus: FocusTarget }) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;
    map.setView([focus.lat, focus.lon], 14);
    L.popup()
      .setLatLng([focus.lat, focus.lon])
      .setContent(
        `<strong>${focus.name}</strong><br/>${focus.address || ""}<br/>${focus.capacityLabel}`
      )
      .openOn(map);
  }, [focus, map]);

  return null;
}

export function ShelterMap({ shelters, focus }: ShelterMapProps) {
  const withCoords = shelters.filter(
    (s): s is Shelter & { lat: number; lon: number } =>
      typeof s.lat === "number" && typeof s.lon === "number"
  );

  return (
    <section className="map-section" aria-labelledby="map-heading">
      <div className="section-header">
        <h2 id="map-heading">Map</h2>
        <p>Available shelters plotted by Toronto postal area.</p>
      </div>
      <div className="map-frame">
        <MapContainer
          center={TORONTO_CENTER}
          zoom={11}
          scrollWheelZoom={false}
          className="map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {withCoords.map((shelter) => (
            <Marker
              key={`${shelter.LOCATION_ID ?? shelter.LOCATION_NAME}-${shelter.lat}`}
              position={[shelter.lat, shelter.lon]}
            >
              <Popup>
                <strong>{shelter.LOCATION_NAME}</strong>
                <br />
                {shelter.LOCATION_ADDRESS || "Address unavailable"}
                <br />
                {formatCapacity(shelter)}
              </Popup>
            </Marker>
          ))}
          <MapFocus focus={focus} />
        </MapContainer>
      </div>
    </section>
  );
}