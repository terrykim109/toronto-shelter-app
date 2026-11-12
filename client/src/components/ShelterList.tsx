import { useEffect, useRef } from "react";
import type { Shelter } from "../types";
import { formatCapacity } from "../utils/geo";

type ShelterListProps = {
  shelters: Shelter[];
  loading: boolean;
  selectedId?: string | number | null;
  onSelect: (shelter: Shelter) => void;
  onClose: () => void;
};

function accessLabel(access: string | undefined): string | null {
  if (!access || access === "unknown") return null;
  if (access === "walk-in") return "Walk-in";
  if (access === "referral") return "Referral";
  if (access === "mixed") return "Walk-in / referral";
  return null;
}

function hasEnrichment(shelter: Shelter): boolean {
  return Boolean(shelter.profile);
}

function ExpandedDetails({
  shelter,
  onClose,
}: {
  shelter: Shelter;
  onClose: () => void;
}) {
  const profile = shelter.profile;
  if (!profile) return null;

  const access = accessLabel(profile.access);

  return (
    <div className="shelter-expand" id="shelter-expand">
      <div className="shelter-expand-toolbar">
        <p className="shelter-expand-capacity">
          {formatCapacity(shelter)}
          {shelter.SECTOR ? ` · ${shelter.SECTOR}` : ""}
          {shelter.PROGRAM_NAME ? ` · ${shelter.PROGRAM_NAME}` : ""}
        </p>
        <button type="button" className="shelter-detail-close" onClick={onClose}>
          Collapse
        </button>
      </div>

      {profile.summary ? (
        <p className="shelter-detail-summary">{profile.summary}</p>
      ) : null}

      <dl className="shelter-detail-facts">
        {profile.whoServed ? (
          <div>
            <dt>Who it serves</dt>
            <dd>{profile.whoServed}</dd>
          </div>
        ) : null}
        {access ? (
          <div>
            <dt>Access</dt>
            <dd>{access}</dd>
          </div>
        ) : null}
        {profile.phone ? (
          <div>
            <dt>Phone</dt>
            <dd>
              <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}>
                {profile.phone}
              </a>
            </dd>
          </div>
        ) : null}
        {profile.website ? (
          <div>
            <dt>Website</dt>
            <dd>
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                Organization site
              </a>
            </dd>
          </div>
        ) : null}
        {profile.intakeNotes ? (
          <div>
            <dt>Intake</dt>
            <dd>{profile.intakeNotes}</dd>
          </div>
        ) : null}
        {profile.transit ? (
          <div>
            <dt>Transit</dt>
            <dd>{profile.transit}</dd>
          </div>
        ) : null}
      </dl>

      {profile.requirements.length > 0 ? (
        <div className="shelter-detail-requirements">
          <h3>Before you go</h3>
          <ul>
            {profile.requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="shelter-detail-meta">
        Profile reviewed {profile.lastReviewed}
        {profile.confidence ? ` · ${profile.confidence} confidence` : ""}
      </p>
    </div>
  );
}

export function ShelterList({
  shelters,
  loading,
  selectedId,
  onSelect,
  onClose,
}: ShelterListProps) {
  const expandedRef = useRef<HTMLLIElement | null>(null);
  const enrichedCount = shelters.filter(hasEnrichment).length;

  useEffect(() => {
    if (selectedId == null) return;
    expandedRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selectedId]);

  useEffect(() => {
    if (selectedId == null) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, onClose]);

  return (
    <section className="list-section" aria-labelledby="list-heading">
      <div className="section-header">
        <h2 id="list-heading">Available shelters</h2>
        <p>
          {loading
            ? "Loading occupancy data…"
            : enrichedCount > 0
              ? `${shelters.length} locations with open capacity · ${enrichedCount} with extra details`
              : `${shelters.length} locations with open capacity`}
        </p>
      </div>

      {loading ? (
        <p className="message">Fetching the latest shelter data…</p>
      ) : (
        <ul className="shelter-list">
          {shelters.map((shelter) => {
            const id = shelter.LOCATION_ID ?? shelter.LOCATION_NAME;
            const canExpand = hasEnrichment(shelter);
            const selected =
              canExpand &&
              selectedId != null &&
              String(selectedId) === String(id);
            const profile = shelter.profile;
            const access = accessLabel(profile?.access);

            return (
              <li
                key={`${id}`}
                ref={selected ? expandedRef : null}
                className={selected ? "shelter-item-expanded" : undefined}
              >
                <button
                  type="button"
                  className={`shelter-row${selected ? " shelter-row-selected" : ""}`}
                  onClick={() => {
                    if (!canExpand) {
                      onSelect(shelter);
                      return;
                    }
                    if (selected) onClose();
                    else onSelect(shelter);
                  }}
                  disabled={shelter.lat == null || shelter.lon == null}
                  aria-expanded={canExpand ? selected : undefined}
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
                  {!selected && profile ? (
                    <span className="shelter-chips" aria-label="Extra details">
                      {profile.whoServed ? (
                        <span className="shelter-chip">{profile.whoServed}</span>
                      ) : null}
                      {access ? (
                        <span className="shelter-chip">{access}</span>
                      ) : null}
                      {profile.phone ? (
                        <span className="shelter-chip">{profile.phone}</span>
                      ) : null}
                    </span>
                  ) : null}
                  {canExpand ? (
                    <span className="shelter-expand-hint">
                      {selected ? "Expanded" : "Show details"}
                    </span>
                  ) : null}
                </button>

                {selected ? (
                  <ExpandedDetails shelter={shelter} onClose={onClose} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
