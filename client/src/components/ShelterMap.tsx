import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Shelter, SupportSite } from "../types";
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
  supportSites: SupportSite[];
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

function supportColor(site: SupportSite): string {
  if (site.category === "cooling") return "#77848E";
  if (site.type === "Warming Centre") return "#576878";
  return "#33414D";
}

export function ShelterMap({ shelters, supportSites, focus }: ShelterMapProps) {
  const withCoords = shelters.filter(
    (s): s is Shelter & { lat: number; lon: number } =>
      typeof s.lat === "number" && typeof s.lon === "number"
  );

  const supportWithCoords = supportSites.filter(
    (s): s is SupportSite & { lat: number; lon: number } =>
      typeof s.lat === "number" && typeof s.lon === "number"
  );

  return (
    <section className="map-section" aria-labelledby="map-heading">
      <div className="section-header">
        <h2 id="map-heading">Map</h2>
        <p>
          Shelters as pins · warming, respite, and cooling sites as circles
        </p>
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
          {supportWithCoords.map((site) => (
            <CircleMarker
              key={site.id}
              center={[site.lat, site.lon]}
              radius={8}
              pathOptions={{
                color: supportColor(site),
                fillColor: supportColor(site),
                fillOpacity: site.available ? 0.7 : 0.35,
                weight: 1.5,
              }}
            >
              <Popup>
                <strong>{site.name}</strong>
                <br />
                {site.type}
                <br />
                {site.address || "Address unavailable"}
                <br />
                {site.category === "cooling"
                  ? "Cooling centre"
                  : site.available
                    ? formatCapacity(site)
                    : `Full · ${formatCapacity(site)}`}
              </Popup>
            </CircleMarker>
          ))}
          <MapFocus focus={focus} />
        </MapContainer>
      </div>
    </section>
  );
}
