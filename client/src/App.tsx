import { useCallback, useEffect, useState } from "react";
import { PostalSearch } from "./components/PostalSearch";
import { ShelterList } from "./components/ShelterList";
import { ShelterMap } from "./components/ShelterMap";
import { WeatherWidget } from "./components/WeatherWidget";
import type { GeocodeResult, Shelter } from "./types";
import { formatCapacity, getDistance } from "./utils/geo";

type FocusTarget = {
  lat: number;
  lon: number;
  name: string;
  address?: string;
  capacityLabel: string;
} | null;

export default function App() {
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadShelters() {
      setLoading(true);
      try {
        const response = await fetch("/api/shelters");
        if (!response.ok) {
          throw new Error("Could not load shelter data.");
        }
        const data: Shelter[] = await response.json();
        if (!cancelled) {
          setShelters(data);
          setError(null);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Unable to load shelter occupancy data right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadShelters();
    return () => {
      cancelled = true;
    };
  }, []);

  const focusShelter = useCallback((shelter: Shelter) => {
    if (shelter.lat == null || shelter.lon == null) {
      setError("That shelter does not have map coordinates yet.");
      return;
    }

    setError(null);
    setFocus({
      lat: shelter.lat,
      lon: shelter.lon,
      name: shelter.LOCATION_NAME,
      address: shelter.LOCATION_ADDRESS,
      capacityLabel: formatCapacity(shelter),
    });

    document.getElementById("map-heading")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const handleSearch = useCallback(
    async (postal: string) => {
      if (!postal) return;

      setBusy(true);
      setError(null);
      setStatus(null);

      try {
        const response = await fetch(
          `/api/geocode?postal=${encodeURIComponent(postal)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Postal code lookup failed.");
        }

        const point = payload as GeocodeResult;
        const withCoords = shelters.filter(
          (s): s is Shelter & { lat: number; lon: number } =>
            typeof s.lat === "number" && typeof s.lon === "number"
        );

        if (withCoords.length === 0) {
          throw new Error("No mapped shelters are available yet.");
        }

        let nearest = withCoords[0];
        let minDist = Infinity;

        for (const shelter of withCoords) {
          const dist = getDistance(
            point.lat,
            point.lon,
            shelter.lat,
            shelter.lon
          );
          if (dist < minDist) {
            minDist = dist;
            nearest = shelter;
          }
        }

        setStatus(
          `Nearest available: ${nearest.LOCATION_NAME} (${minDist.toFixed(1)} km from ${point.fsa})`
        );
        focusShelter(nearest);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
      } finally {
        setBusy(false);
      }
    },
    [focusShelter, shelters]
  );

  return (
    <div className="page">
      <PostalSearch
        onSearch={handleSearch}
        busy={busy || loading}
        error={error}
        status={status}
      />
      <ShelterMap shelters={shelters} focus={focus} />
      <ShelterList
        shelters={shelters}
        loading={loading}
        onSelect={focusShelter}
      />
      <WeatherWidget />
      <footer className="footer">
        Occupancy data from the City of Toronto Open Data portal. Postal lookup
        uses a local Toronto FSA coordinate set.
      </footer>
    </div>
  );
}