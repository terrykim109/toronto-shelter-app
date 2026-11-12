import type { SupportSite } from "../types";
import { formatCapacity } from "../utils/geo";

type SupportSitesProps = {
  overnight: SupportSite[];
  cooling: SupportSite[];
  loading: boolean;
  onSelect: (site: SupportSite) => void;
};

const TYPE_ORDER = [
  "Warming Centre",
  "24-Hour Respite Site",
  "24-Hour Women's Drop-in",
  "Surge site",
];

function groupByType(sites: SupportSite[]) {
  const groups: { type: string; sites: SupportSite[] }[] = [];
  const seen = new Set<string>();

  for (const type of TYPE_ORDER) {
    const matches = sites.filter((s) => s.type === type);
    if (matches.length) {
      groups.push({ type, sites: matches });
      seen.add(type);
    }
  }

  for (const site of sites) {
    if (seen.has(site.type)) continue;
    const existing = groups.find((g) => g.type === site.type);
    if (existing) existing.sites.push(site);
    else groups.push({ type: site.type, sites: [site] });
  }

  return groups;
}

function statusLabel(site: SupportSite): string {
  if (site.category === "cooling") {
    return "Air-conditioned public space";
  }
  if (site.available) {
    return `Space available · ${formatCapacity(site)}`;
  }
  return `Currently full · ${formatCapacity(site)}`;
}

export function SupportSites({
  overnight,
  cooling,
  loading,
  onSelect,
}: SupportSitesProps) {
  const groups = groupByType(overnight);
  const total = overnight.length + cooling.length;

  return (
    <section className="support-section" aria-labelledby="support-heading">
      <div className="section-header">
        <h2 id="support-heading">Other places to go</h2>
        <p>
          {loading
            ? "Loading warming centres, respites, and cooling sites…"
            : `${total} alternatives when shelters are full or closed`}
        </p>
      </div>

      {loading ? (
        <p className="message">Fetching support locations…</p>
      ) : total === 0 ? (
        <p className="message">No alternate sites available right now.</p>
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.type} className="support-group">
              <h3 className="support-group-title">{group.type}</h3>
              <ul className="shelter-list">
                {group.sites.map((site) => (
                  <li key={site.id}>
                    <button
                      type="button"
                      className={`shelter-row${site.available ? "" : " shelter-row-muted"}`}
                      onClick={() => onSelect(site)}
                      disabled={site.lat == null || site.lon == null}
                    >
                      <span className="shelter-name">{site.name}</span>
                      <span className="shelter-meta">
                        {site.address || "Address unavailable"}
                        {site.postalCode ? ` · ${site.postalCode}` : ""}
                      </span>
                      <span className="shelter-meta">{statusLabel(site)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {cooling.length > 0 ? (
            <div className="support-group">
              <h3 className="support-group-title">Cooling centres</h3>
              <p className="support-note">
                Civic and recreation spaces for extreme heat. Confirm hours with
                the City when a heat warning is in effect.
              </p>
              <ul className="shelter-list">
                {cooling.map((site) => (
                  <li key={site.id}>
                    <button
                      type="button"
                      className="shelter-row"
                      onClick={() => onSelect(site)}
                      disabled={site.lat == null || site.lon == null}
                    >
                      <span className="shelter-name">{site.name}</span>
                      <span className="shelter-meta">
                        {site.address || "Address unavailable"}
                        {site.postalCode ? ` · ${site.postalCode}` : ""}
                      </span>
                      <span className="shelter-meta">{statusLabel(site)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
