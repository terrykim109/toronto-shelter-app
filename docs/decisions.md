# Design decisions

Short records of choices a contributor might reasonably question. They were
reconstructed from the code and commit history in November 2026, so the
"Context" sections describe the constraints visible in the code rather than
the original author's recorded intent. Update or supersede an entry when its
revisit trigger fires.

---

## 1. Proxy the City feed on every request; no database or cache

**Context.** Availability comes from the City of Toronto's daily occupancy
dataset (CKAN package `21c83b32-…`). The client needs the latest night per
location, filtered and joined with coordinates and profiles.

**Decision.** `GET /api/shelters` and `GET /api/support-sites` each download
the current-year JSON file from CKAN and compute the response in memory
(`lib/occupancy.js`). Nothing is stored between requests.

**Alternatives.** A scheduled job writing a snapshot to disk or a database; an
in-memory cache with a TTL; having the browser call CKAN directly.

**Reasoning.** No persistence layer to run, and every response reflects the
newest file the City has published. Server-side processing keeps CKAN's large
payload and field names out of the browser, and it lets the server add
coordinates and profiles.

**Consequences.** Each call downloads the entire year-to-date file (about
42,000 records and 40 MB of JSON in November 2026, growing through the year).
A page load makes two such calls. Latency and upstream failures pass straight
through to users, and there are no request timeouts.

**Revisit when.** Response times or hosting bandwidth become a problem, the
City adds a "latest night only" resource, or the deployment target imposes
function duration limits that the download exceeds.

---

## 2. Geocode postal codes locally to FSA centroids

**Context.** Users search by postal code. An earlier version called the
public Nominatim geocoder (see commit `32eb673`).

**Decision.** `data/toronto-fsa.json` maps each Toronto Forward Sortation Area
(the first three characters, e.g. `M5V`) to a centroid from the GeoNames
postal export. `GET /api/geocode` only looks up that table.
`data/shelter-coords.json` assigns each shelter the centroid of its own FSA.

**Alternatives.** A third-party geocoder (Nominatim, Google, Mapbox) for both
the user's postal code and shelter street addresses.

**Reasoning.** No outbound request, no API key, and no third-party rate limit.
Users' postal codes never leave this server.

**Consequences.** Locations are neighbourhood-level, not street-level. Map
pins for shelters in the same FSA sit on the same point. "Nearest shelter" is
the straight-line distance between FSA centroids, so it can pick the wrong
shelter among close candidates. Postal codes outside the table return 404.

**Revisit when.** Users need street-level accuracy, or the City feed starts
publishing coordinates.

---

## 3. Research shelter profiles offline, with human review

**Context.** The City feed has capacity but no phone numbers, eligibility, or
intake details.

**Decision.** A manual CLI (`npm run research:shelters`) asks an OpenRouter
model with web search to draft profiles into
`data/shelter-profile-drafts.json`. A person reviews each draft and promotes
it with `npm run merge:shelter-profile`. The running app only reads the
committed `data/shelter-profiles.json` and never calls an LLM. Full workflow:
[`scripts/agents/README.md`](../scripts/agents/README.md).

**Alternatives.** Calling an LLM at request time; hand-writing every profile.

**Reasoning.** Keeps model cost, latency, and hallucination risk out of the
user-facing path. A schema check (`scripts/lib/shelter-profile.js`) plus human
review is the gate before anything is shown.

**Consequences.** Profiles go stale until someone re-researches them. The
schema check confirms structure, not facts. Coverage is partial (10 approved
profiles in November 2026).

**Revisit when.** Profiles need to be refreshed on a schedule, or the number
of shelters makes manual review impractical.

---

## 4. Chat state in process memory, persisted to a JSON file

**Context.** The community chat needs a live message stream and a short
history.

**Decision.** Socket.IO runs in the same Node process as Express
(`lib/chat.js`). History is an in-memory array capped at 150 messages. The
whole array is rewritten to `data/chat-messages.json` after every message.

**Alternatives.** A hosted realtime service; Redis or a database for history.

**Reasoning.** No extra infrastructure for a small feature.

**Consequences.** Chat only works when the app runs as a single long-lived
Node process (`npm start` / `npm run server`). It cannot run on the Vercel
configuration in this repo, because Vercel functions do not hold WebSocket
connections and their filesystem is not persistent. Running multiple
instances would split users into separate rooms. A crash during a write can
leave an unreadable file, which loads as empty history.

**Revisit when.** The app is deployed somewhere other than a single
long-running process, or chat needs moderation, authentication, or durable
history.
