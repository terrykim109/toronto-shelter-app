import { useEffect } from "react";
import type { Shelter } from "../types";
import { formatCapacity } from "../utils/geo";

type ShelterDetailProps = {
  shelter: Shelter | null;
  onClose: () => void;
};

function accessLabel(access: string | undefined): string | null {
  if (!access || access === "unknown") return null;
  if (access === "walk-in") return "Walk-in";
  if (access === "referral") return "Referral";
  if (access === "mixed") return "Walk-in / referral";
  return access;
}

export function ShelterDetail({ shelter, onClose }: ShelterDetailProps) {
  useEffect(() => {
    if (!shelter) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shelter, onClose]);

  useEffect(() => {
    if (!shelter) return;
    document.getElementById("shelter-detail")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [shelter]);

  if (!shelter) return null;

  const profile = shelter.profile;
  const access = accessLabel(profile?.access);

  return (
    <aside
      id="shelter-detail"
      className="shelter-detail"
      aria-labelledby="shelter-detail-heading"
    >
      <div className="shelter-detail-header">
        <div>
          <h2 id="shelter-detail-heading">{shelter.LOCATION_NAME}</h2>
          <p>
            {shelter.LOCATION_ADDRESS || "Address unavailable"}
            {shelter.LOCATION_POSTAL_CODE
              ? ` · ${shelter.LOCATION_POSTAL_CODE}`
              : ""}
          </p>
        </div>
        <button type="button" className="shelter-detail-close" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="shelter-detail-capacity">
        {formatCapacity(shelter)}
        {shelter.SECTOR ? ` · ${shelter.SECTOR}` : ""}
        {shelter.PROGRAM_NAME ? ` · ${shelter.PROGRAM_NAME}` : ""}
      </p>

      {profile ? (
        <div className="shelter-detail-body">
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
            {profile.sources.length
              ? ` · Sources: ${profile.sources.join("; ")}`
              : ""}
          </p>
        </div>
      ) : (
        <p className="message">Details limited — occupancy only.</p>
      )}
    </aside>
  );
}
