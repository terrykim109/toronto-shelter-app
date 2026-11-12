import { useCallback, useEffect, useState } from "react";
import { CommunityChat } from "./components/CommunityChat";
import { PostalSearch } from "./components/PostalSearch";
import { ShelterList } from "./components/ShelterList";
import { ShelterMap } from "./components/ShelterMap";
import { SupportSites } from "./components/SupportSites";
import { WeatherWidget } from "./components/WeatherWidget";
import type {
  GeocodeResult,
  Shelter,
  SupportSite,
  SupportSitesResponse,
} from "./types";
import { findNearest, formatCapacity } from "./utils/geo";

type FocusTarget = {
  lat: number;
  lon: number;
  name: string;
  address?: string;
  capacityLabel: string;
} | null;

export default function App() {
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [overnight, setOvernight] = useState<SupportSite[]>([]);
  const [cooling, setCooling] = useState<SupportSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [supportLoading, setSupportLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusTarget>(null);
  const [selectedShelter, setSelectedShelter] = useState<Shelter | null>(null);

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

    async function loadSupportSites() {
      setSupportLoading(true);
      try {
        const response = await fetch("/api/support-sites");
        if (!response.ok) {
          throw new Error("Could not load support sites.");
        }
        const data: SupportSitesResponse = await response.json();
        if (!cancelled) {
          setOvernight(data.overnight || []);
          setCooling(data.cooling || []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setOvernight([]);
          setCooling([]);
        }
      } finally {
        if (!cancelled) setSupportLoading(false);
      }
    }

    loadShelters();
    loadSupportSites();
    return () => {
      cancelled = true;
    };
  }, []);

  const focusPlace = useCallback(
    (
      place: {
        lat: number | null;
        lon: number | null;
        name: string;
        address?: string | null;
        capacityLabel: string;
      },
      options?: { scrollToMap?: boolean }
    ) => {
      if (place.lat == null || place.lon == null) {
        setError("That location does not have map coordinates yet.");
        return;
      }

      setError(null);
      setFocus({
        lat: place.lat,
        lon: place.lon,
        name: place.name,
        address: place.address || undefined,
        capacityLabel: place.capacityLabel,
      });

      if (options?.scrollToMap) {
        document.getElementById("map-heading")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    },
    []
  );

  const focusShelter = useCallback(
    (shelter: Shelter, options?: { scrollToMap?: boolean }) => {
      setSelectedShelter(shelter.profile ? shelter : null);
      focusPlace(
        {
          lat: shelter.lat,
          lon: shelter.lon,
          name: shelter.LOCATION_NAME,
          address: shelter.LOCATION_ADDRESS,
          capacityLabel: formatCapacity(shelter),
        },
        options
      );
    },
    [focusPlace]
  );

  const closeShelterDetail = useCallback(() => {
    setSelectedShelter(null);
  }, []);

  const focusSupportSite = useCallback(
    (site: SupportSite) => {
      focusPlace({
        lat: site.lat,
        lon: site.lon,
        name: site.name,
        address: site.address,
        capacityLabel:
          site.category === "cooling"
            ? site.type
            : site.available
              ? formatCapacity(site)
              : `Full · ${formatCapacity(site)}`,
      });
    },
    [focusPlace]
  );

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
        const nearest = findNearest(point, shelters);
        if (!nearest) {
          throw new Error("No mapped shelters are available yet.");
        }

        setStatus(
          `Nearest available: ${nearest.place.LOCATION_NAME} (${nearest.distanceKm.toFixed(1)} km from ${point.fsa})`
        );
        focusShelter(nearest.place, { scrollToMap: true });
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

  const allSupportSites = [...overnight, ...cooling];

  return (
    <div className="page">
      <PostalSearch
        onSearch={handleSearch}
        busy={busy || loading}
        error={error}
        status={status}
      />
      <ShelterMap
        shelters={shelters}
        supportSites={allSupportSites}
        focus={focus}
      />
      <ShelterList
        shelters={shelters}
        loading={loading}
        selectedId={selectedShelter?.LOCATION_ID ?? selectedShelter?.LOCATION_NAME}
        onSelect={focusShelter}
        onClose={closeShelterDetail}
      />
      <SupportSites
        overnight={overnight}
        cooling={cooling}
        loading={supportLoading}
        onSelect={focusSupportSite}
      />
      <CommunityChat />
      <WeatherWidget />
      <footer className="footer">
        Occupancy and overnight service data from the City of Toronto Open Data
        portal. Cooling centres from Toronto GIS. Postal lookup uses a local
        Toronto FSA coordinate set. Shelter detail profiles were researched
        offline by AI agents from public sources and may not reflect same-day
        intake rules — call ahead when you can.
      </footer>
    </div>
  );
}
