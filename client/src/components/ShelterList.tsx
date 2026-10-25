import type { Shelter } from "../types";
import { formatCapacity } from "../utils/geo";

type ShelterListProps = {
  shelters: Shelter[];
  loading: boolean;
  onSelect: (shelter: Shelter) => void;
};

export function ShelterList({
  shelters,
  loading,
  onSelect,
}: ShelterListProps) {
  return (
    <section className="list-section" aria-labelledby="list-heading">
      <div className="section-header">
        <h2 id="list-heading">Available shelters</h2>
        <p>
          {loading
            ? "Loading occupancy data…"
            : `${shelters.length} locations with open capacity`}
        </p>
      </div>

      {loading ? (
        <p className="message">Fetching the latest shelter data…</p>
      ) : (
        <ul className="shelter-list">
          {shelters.map((shelter) => (
            <li key={`${shelter.LOCATION_ID ?? shelter.LOCATION_NAME}`}>
              <button
                type="button"
                className="shelter-row"
                onClick={() => onSelect(shelter)}
                disabled={shelter.lat == null || shelter.lon == null}
              >
                <span className="shelter-name">{shelter.LOCATION_NAME}</span>
                <span className="shelter-meta">
                  {shelter.LOCATION_ADDRESS || "Address unavailable"}
                  {shelter.LOCATION_POSTAL_CODE
                    ? ` · ${shelter.LOCATION_POSTAL_CODE}`
                    : ""}
                </span>
                <span className="shelter-meta">
                  {shelter.PROGRAM_NAME || "Program unavailable"} ·{" "}
                  {formatCapacity(shelter)}
                  {shelter.SECTOR ? ` · ${shelter.SECTOR}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
