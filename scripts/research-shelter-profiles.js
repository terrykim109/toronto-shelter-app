/**
 * One-time OpenRouter shelter research agent.
 *
 * Manual only — no cron, no GitHub Actions, no live-app LLM calls.
 *
 * Usage:
 *   node scripts/export-shelter-targets.js
 *   node scripts/research-shelter-profiles.js --location-id 1015
 *   node scripts/research-shelter-profiles.js --limit 3
 *   node scripts/research-shelter-profiles.js --dry-run --limit 5
 *
 * Writes review drafts to data/shelter-profile-drafts.json (does not merge).
 */
const path = require("path");
const {
  researchMissingShelters,
  DEFAULT_LIMITS,
} = require("./lib/research-agent");
const { DRAFTS_PATH } = require("./lib/shelter-profile");

function readEnvFile() {
  try {
    const fs = require("fs");
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

function parseArgs(argv) {
  const options = {
    locationId: null,
    limit: DEFAULT_LIMITS.maxShelters,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--location-id") {
      options.locationId = argv[++i];
    } else if (arg.startsWith("--location-id=")) {
      options.locationId = arg.slice("--location-id=".length);
    } else if (arg === "--limit") {
      options.limit = Number(argv[++i]);
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--model") {
      process.env.OPENROUTER_MODEL = argv[++i];
    } else if (arg.startsWith("--model=")) {
      process.env.OPENROUTER_MODEL = arg.slice("--model=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive number.");
  }

  return options;
}

function printHelp() {
  console.log(`OpenRouter shelter research agent (manual, one-time)

Usage:
  node scripts/research-shelter-profiles.js --location-id <id>
  node scripts/research-shelter-profiles.js --limit <n>
  node scripts/research-shelter-profiles.js --dry-run --limit <n>

Options:
  --location-id   Research a single missing shelter (recommended first test)
  --limit         Max shelters without profiles to process (default ${DEFAULT_LIMITS.maxShelters})
  --dry-run       List selected targets only; no API calls
  --model         OpenRouter model id (default OPENROUTER_MODEL or openai/gpt-4o-mini)
  --help          Show help

Requires OPENROUTER_API_KEY in the environment or .env
Writes drafts to ${DRAFTS_PATH}
Does not overwrite data/shelter-profiles.json — review drafts, then merge.
`);
}

async function main() {
  readEnvFile();
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!options.dryRun && !process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it to .env or the environment."
    );
  }

  console.log(
    options.dryRun
      ? "Dry run — selecting missing-profile shelters only."
      : `Researching up to ${options.limit} shelter(s) via OpenRouter…`
  );

  const summary = await researchMissingShelters({
    locationId: options.locationId,
    limit: options.limit,
    dryRun: options.dryRun,
    onProgress: (event) => {
      if (event.type === "start") {
        console.log(`→ ${event.target.locationId} ${event.target.name}`);
      } else if (event.type === "done") {
        console.log(
          `  draft saved (${event.conflicts.length} conflict note(s))`
        );
      } else if (event.type === "error") {
        console.error(`  failed: ${event.error}`);
      }
    },
  });

  const ok = summary.results.filter((r) => r.ok).length;
  const failed = summary.results.length - ok;
  console.log(
    `Finished. selected=${summary.selectedCount} ok=${ok} failed=${failed}`
  );
  console.log(
    `Existing approved profiles preserved: ${summary.preservedProfileIds.length}`
  );
  if (!options.dryRun) {
    console.log(`Review drafts in ${DRAFTS_PATH}`);
    console.log(
      "Merge one approved draft with: node scripts/merge-shelter-profile.js --from-draft <locationId>"
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
