# OpenRouter shelter research agent

One-time, on-demand enrichment for Toronto shelter profiles. This replaces the earlier manual Cursor research workflow with a small Node script that calls OpenRouter (with web search + web fetch). The live Vercel/Render app still never calls an LLM.

## How this replaced the old process

| Before | Now |
| --- | --- |
| Developer pasted targets into Cursor and followed a prompt by hand | `node scripts/research-shelter-profiles.js` runs the same rules programmatically |
| Profiles typed/merged one by one in chat | Agent writes **drafts** to `data/shelter-profile-drafts.json` |
| Easy to accidentally re-touch seeded rows | Only `hasProfile: false` targets are selected; existing profiles are preserved |
| No hard budget | Configurable caps on shelters, searches, fetches, tool calls, tokens, retries |

Research rules live in one place: [`enrich-shelter-profiles.md`](./enrich-shelter-profiles.md). The script loads that file as the model instructions.

## Workflow

```bash
# 1. Refresh targets from Toronto Open Data
npm run export:shelter-targets

# 2. Test one missing shelter (recommended)
npm run research:shelters -- --location-id 1015

# 3. Or run a small batch of missing shelters
npm run research:shelters -- --limit 3

# 4. Review data/shelter-profile-drafts.json
# 5. Merge an approved draft (refuses overwrite unless --force)
npm run merge:shelter-profile -- --from-draft 1015

# 6. Commit data/shelter-profiles.json
```

Dry-run (no API calls):

```bash
npm run research:shelters -- --dry-run --limit 5
```

## Configuration

Copy `.env.example` to `.env` (gitignored):

```
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=openai/gpt-4o-mini
```

Default budgets (inexpensive) are in `scripts/lib/research-agent.js` (`DEFAULT_LIMITS`): few shelters per run, limited searches/fetches, capped tool iterations and retries.

## What is intentionally not included

- No cron / GitHub Actions schedule
- No automatic freshness checks or re-enrichment of existing profiles
- No OpenRouter / LLM usage from `server.js` or the React client
- No Google review scraping

## Demo claim

> An OpenRouter research agent researched public shelter information offline (web search + page fetch), wrote structured draft profiles for human review, and the app merges approved profiles with the City of Toronto's daily occupancy data.

## Related files

| Path | Role |
| --- | --- |
| `scripts/agents/enrich-shelter-profiles.md` | Research instructions loaded by the agent |
| `scripts/research-shelter-profiles.js` | Manual CLI entry point |
| `scripts/lib/research-agent.js` | Selection, research orchestration, draft writing |
| `scripts/lib/openrouter-client.js` | OpenRouter Responses API client |
| `scripts/lib/shelter-profile.js` | Shared schema validation / merge helpers |
| `scripts/export-shelter-targets.js` | Build `data/shelter-targets.json` |
| `scripts/merge-shelter-profile.js` | Promote an approved draft into `shelter-profiles.json` |
| `data/shelter-profile-drafts.json` | Intermediate review queue |
| `data/shelter-profiles.json` | Approved profiles consumed at runtime |
| `tests/research-agent.test.js` | Mocked unit tests (no paid API calls) |
