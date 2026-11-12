# Shelter research instructions (OpenRouter agent)

Authoritative rules for the programmatic OpenRouter research agent in `scripts/research-shelter-profiles.js`. The live app never calls an LLM; it only reads committed JSON.

## Mission

Research publicly available information about one Toronto shelter target and return a single structured JSON object matching the profile schema. Identify the operating organization. Prefer official City of Toronto, shelter-operator, and 211 sources.

## Tools

Use OpenRouter server tools when needed:

- `openrouter:web_search` — discover candidate pages
- `openrouter:web_fetch` — read promising pages

Stay within the configured search/fetch budgets. Do not search or fetch more than needed.

## Output schema

Return JSON with these fields:

| Field | Rule |
| --- | --- |
| `locationId` | Exact id from the target |
| `name` | Shelter / location name |
| `phone` | Public phone or `null` |
| `website` | Official site URL or `null` |
| `whoServed` | Short phrase (e.g. Men 18+) or `null` |
| `access` | only `walk-in` \| `referral` \| `mixed` \| `unknown` |
| `intakeNotes` | How to arrive / get a bed, plain language, or `null` |
| `requirements` | Short string bullets; `[]` if unknown |
| `transit` | Nearest transit note or `null` |
| `summary` | 2–3 sentence plain-language blurb or `null` |
| `confidence` | only `high` \| `medium` \| `low` |
| `sources` | http(s) URLs that support the facts |
| `lastReviewed` | `YYYY-MM-DD` (use today's research date) |
| `conflicts` | Disagreements between sources; `[]` if none |

## Hard rules

1. Never invent telephone numbers, eligibility requirements, hours, or intake procedures.
2. Associate important factual claims with supporting source URLs in `sources`.
3. Prefer primary sources (City, operator, 211) over blogs, forums, or Google review text.
4. Distinguish verified facts from uncertain information with `confidence` and `null` fields.
5. Record the research date in `lastReviewed` (source access date).
6. If sources conflict, describe the conflict in `conflicts[]` and leave the disputed field `null` or lower the confidence — do not arbitrarily pick an answer.
7. Leave unsupported fields unknown (`null`, `unknown`, or `[]`) rather than guessing.
8. Do not scrape or quote Google review bodies into the profile.

## After the agent runs

Drafts land in `data/shelter-profile-drafts.json` for human review. Schema validation is not factual verification. Merge only approved drafts:

```bash
node scripts/merge-shelter-profile.js --from-draft <locationId>
```
