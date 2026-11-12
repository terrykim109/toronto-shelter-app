# Housing Toronto

A web app that shows which Toronto homeless shelters reported open beds or
rooms in the City of Toronto's latest occupancy data, finds the nearest one
to a postal code, and lists warming centres, respite sites, and cooling
centres as alternatives.

> This is an independent project, not a City of Toronto service. Occupancy is
> a daily snapshot that lags by a day or more, so it may not match what a
> shelter can offer tonight. Contact the shelter or Toronto Central Intake
> before travelling.

## Why

The City publishes nightly shelter occupancy on its Open Data portal, but only
as a raw dataset. This app turns that dataset into a searchable map and list,
so someone looking for a bed can see where capacity was last reported.

## Features

- **Nearest shelter by postal code.** Enter a full code (`M5V 1E3`) or just
  its first three characters (`M5V`). The app picks the closest listed
  shelter and centres the map on it.
- **Map and list of shelters with capacity.** Only locations whose service
  type is *Shelter* or *Motel/Hotel Shelter*, and whose latest record shows
  unoccupied rooms or beds, are listed.
- **Shelter profiles.** For some shelters there are reviewed details (phone,
  who it serves, walk-in or referral, intake notes, transit). They were drafted
  offline by an AI research script and approved by a person (see
  [Shelter profiles](#shelter-profiles)).
- **Other places to go.** Warming centres, 24-hour respite sites, 24-hour
  women's drop-ins, and surge sites from the same City feed (full ones are
  shown and marked full), plus cooling centres from Toronto GIS.
- **Community chat.** An anonymous, nickname-only chat room over Socket.IO.
  It works only when the server runs as a long-lived Node process (see
  [Deployment](#deployment)).
- **Weather.** An embedded widget from weatherwidget.io.

## Tech stack

| Part | Technology |
| --- | --- |
| Server | Node.js, Express 4, Socket.IO 4 (CommonJS) |
| Client | React 19, TypeScript, Vite, Leaflet / react-leaflet, OpenStreetMap tiles |
| Data sources | City of Toronto CKAN ([Daily Shelter & Overnight Service Occupancy & Capacity](https://open.toronto.ca/dataset/daily-shelter-overnight-service-occupancy-capacity/)), Toronto GIS cooling centres, GeoNames postal centroids |
| Profile research (offline) | OpenRouter Responses API with web search/fetch tools |
| Tests | Node's built-in test runner (`node:test`), `socket.io-client` |

## Architecture

```
Browser (client/, React)
  │  GET /api/*, Socket.IO /socket.io
  ▼
server.js ─ loads data/*.json, wires real dependencies, listens on PORT
  └─ lib/app.js ─ createServer(): Express routes + Socket.IO + SPA static files
       ├─ lib/occupancy.js         pure rules: availability, latest record, coords, profiles
       ├─ lib/toronto-open-data.js HTTPS fetchers for CKAN and Toronto GIS
       └─ lib/chat.js              chat protocol, limits, JSON-file history store

api/*.js ─ Vercel function adapters that reuse the Express app from server.js
scripts/ ─ offline maintenance: rebuild coordinate tables, research profiles
data/    ─ committed lookup tables and approved profiles (read at startup)
```

On each `/api/shelters` or `/api/support-sites` request, the server downloads
the City's year-to-date occupancy file and keeps the newest record per
location. It then filters by service type and availability and attaches
coordinates and any approved profile. Nothing is cached or stored, so every
request repeats the download. `createServer` takes the upstream fetchers and
lookup tables as arguments, which is how the tests run without the network.

The main design trade-offs (no cache, local FSA geocoding, offline profile
research, in-process chat) are recorded in
[`docs/decisions.md`](docs/decisions.md).

## Getting started

### Prerequisites

- Node.js 22 (developed and tested on 22.16). `npm test` needs 22.6 or later
  for TypeScript type stripping.
- Outbound HTTPS access to `ckan0.cf.opendata.inter.prod-toronto.ca` and
  `gis.toronto.ca` for the shelter and support-site endpoints.

### Install

```bash
npm install
npm install --prefix client
```

### Run in development

```bash
npm run dev
```

This starts the API and chat server on <http://localhost:8080> and the Vite dev
server on <http://localhost:5173>. Open the Vite URL; it proxies `/api` and
`/socket.io` to port 8080.

### Run a production build locally

```bash
npm start
```

This installs client dependencies, builds `client/dist`, and serves the app and
API from one process on `PORT` (default 8080). When `client/dist` exists, any
non-API path returns `index.html`.

## Configuration

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | `server.js` | `8080` | HTTP port |
| `OPENROUTER_API_KEY` | `scripts/research-shelter-profiles.js` only | none | Required for profile research |
| `OPENROUTER_MODEL` | research script | `openai/gpt-4o-mini` | Model ID |
| `OPENROUTER_BASE_URL` | research script | `https://openrouter.ai/api/v1/responses` | API endpoint override |

The web app needs no API keys. The research script reads `.env` in the
repository root; copy [`.env.example`](.env.example) to get started.

## API

Response types are defined in [`client/src/types.ts`](client/src/types.ts),
which is the contract the client compiles against.

### `GET /api/geocode?postal=<code>`

Returns the centroid of the code's FSA from `data/toronto-fsa.json`.

```bash
curl "http://localhost:8080/api/geocode?postal=M5V%201E3"
# {"fsa":"M5V","lat":43.6404,"lon":-79.3995,"name":"Downtown Toronto (CN Tower / ...)"}
```

| Status | When |
| --- | --- |
| 200 | `{ fsa, lat, lon, name }` |
| 400 | Missing input, or input doesn't start with letter-digit-letter |
| 404 | Valid FSA not in the Toronto table (e.g. `K1A`); body includes `fsa` |

### `GET /api/shelters`

Returns a `Shelter[]` sorted by `LOCATION_NAME`. Each item is the City record
(original upper-case field names) plus `lat`, `lon`, `fsa`, and `profile`
(`ShelterProfile`, or `null` if none is approved). If the City feed fails, the
response is `500 { "error": "Failed to fetch shelter data." }`.

### `GET /api/support-sites`

Returns `{ overnight: SupportSite[], cooling: SupportSite[] }`. Overnight
sites include full ones with `available: false`. Cooling centres without
coordinates are omitted. If either upstream source throws, the whole response
is `500`.

### Chat (Socket.IO at `/socket.io`)

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `join` | `{ nickname }`, 2–20 characters after trimming |
| client → server | `message` | `{ text }`, allowed only after a successful `join`; trimmed and cut to 280 characters |
| server → joiner | `history` | Up to the last 150 messages |
| server → all | `message` | `{ id, nickname, text, at }` |
| server → all | `presence` | `{ online }`, the number of joined sockets |
| server → sender | `chat:error` | `{ error }` |

`<` and `>` are removed from nicknames and messages before they are stored.

## Data files

| File | Produced by | Read by |
| --- | --- | --- |
| `data/toronto-fsa.json` | `npm run build:toronto-fsa -- path/to/CA.txt` ([GeoNames CA.zip](https://download.geonames.org/export/zip/CA.zip)) | server (required) |
| `data/shelter-coords.json` | `npm run build:shelter-coords` (City feed + FSA table) | server (required) |
| `data/shelter-profiles.json` | `npm run merge:shelter-profile` | server (optional) |
| `data/shelter-targets.json` | `npm run export:shelter-targets` | research script |
| `data/shelter-profile-drafts.json` | `npm run research:shelters` | merge script, human reviewers |
| `data/chat-messages.json` | chat server at runtime (gitignored) | chat server |

The server reads these files once at startup, so restart it after
regenerating them.

### Shelter profiles

Profiles come from a manual, offline pipeline: export targets, have the
OpenRouter model draft profiles with source URLs, review the drafts by hand,
and merge them. The steps, budgets, and research rules are in
[`scripts/agents/README.md`](scripts/agents/README.md). Schema validation
checks structure, not truth. A profile is only as current as its
`lastReviewed` date.

## Testing

```bash
npm test                        # all tests, no network access or API keys needed
npm run test:research           # profile-research pipeline only
npm run build --prefix client   # TypeScript type-check + production build
```

| File | Covers |
| --- | --- |
| `tests/occupancy.test.js` | Availability rules, latest-record selection, coordinate and profile matching, support-site shaping |
| `tests/api.test.js` | HTTP status codes and bodies for each endpoint, upstream-failure handling, SPA fallback, the Vercel adapter |
| `tests/chat.test.js` | Chat protocol over real WebSocket connections: join rules, broadcast, sanitizing, truncation, history cap, presence |
| `tests/client-geo.test.mjs` | Client distance, nearest-shelter, and capacity-label helpers (imports the `.ts` source directly) |
| `tests/research-agent.test.js` | Profile validation, OpenRouter client retries, draft and merge safety (OpenRouter is mocked) |

Tests marked `# TODO` in the output document known defects (listed below).
They run and are expected to fail without failing the suite. When a defect is
fixed, its test passes, and the `todo` option should be removed. There is no
linter configured, and the React components have no automated tests.

## Deployment

`vercel.json` builds the client to `client/dist` and exposes the three GET
endpoints as Vercel functions (`api/*.js`), which reuse the Express app.
**The chat does not work on that configuration**: Vercel functions can't hold
WebSocket connections and can't persist `data/chat-messages.json`. To run the
full app, including chat, use `npm start` on a host that keeps one Node
process running.

## Security and privacy

- **Chat is open and unmoderated.** There is no authentication, rate
  limiting, or moderation. Nicknames aren't unique, so anyone can post under
  any name. Every new joiner receives the last 150 messages, and the server
  stores them in plain text on disk.
- **Any client can crash the server** by sending a chat `join` or `message`
  event with a `null` payload. The uncaught exception stops the whole process,
  including the API. This is a known defect (see below).
- **CORS is open.** Express (`cors()`) and Socket.IO (`origin: true`) accept
  requests from any origin.
- **Third parties.** Postal-code lookups stay on this server. The browser
  does load map tiles from OpenStreetMap and a script from weatherwidget.io.
- **Map popups use HTML strings.** The popup opened after a search builds HTML
  from upstream shelter names and addresses. The app trusts City data not to
  contain markup.

## Known limitations

- **Approximate locations.** Pins and distances use the centroid of the postal
  FSA, not the street address, so "nearest" can be wrong among nearby
  shelters ([decision 2](docs/decisions.md#2-geocode-postal-codes-locally-to-fsa-centroids)).
- **Slow, uncached upstream calls.** Each shelter or support-site request
  downloads the City's full year-to-date file (about 40 MB in November 2026).
  There are no timeouts. `/api/support-sites` waits for both sources, and a
  slow GIS response delays the overnight list too.
- **Upstream errors can look like empty data.** During development the GIS
  service returned an error object after about 70 seconds. The app treats
  that as "no cooling centres" instead of reporting a failure.
- **Partial profile coverage.** Only shelters with an approved profile show
  extra details.

### Known defects

Each defect has a matching `todo` test.

| Defect | Effect observed on 2026-11-12 data | Test |
| --- | --- | --- |
| One record kept per location, though locations can run several programs | 3 of 40 locations with an open shelter program were missing from `/api/shelters`, because the record the server kept for each was a full program | `tests/occupancy.test.js` |
| A location's last record is treated as current even if it is months old | 10 of 18 "other places to go" were last reported between February and April | `tests/occupancy.test.js` |
| Chat handlers crash on a `null` payload | Server process exits | `tests/chat.test.js` |
| Research drafts are keyed by the model's `locationId`, not the target's | A wrong ID from the model files the draft under another shelter | `tests/research-agent.test.js` |
| Profile `website` scheme is not validated | Non-http(s) values reach a link `href` | `tests/research-agent.test.js` |

## License

`package.json` declares ISC. The repository doesn't include a LICENSE file.
