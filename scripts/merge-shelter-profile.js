/**
 * Validate and upsert one shelter profile into data/shelter-profiles.json.
 *
 * Usage:
 *   node scripts/merge-shelter-profile.js path/to/profile.json
 *   node scripts/merge-shelter-profile.js --stdin < profile.json
 *   node scripts/merge-shelter-profile.js --from-draft 1015
 *   node scripts/merge-shelter-profile.js --from-draft 1015 --force
 */
const fs = require("fs");
const path = require("path");
const {
  validateProfile,
  mergeProfile,
  loadDrafts,
  DRAFTS_PATH,
} = require("./lib/shelter-profile");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readInput(fileArg) {
  if (!fileArg || fileArg === "--stdin") {
    const text = fs.readFileSync(0, "utf8");
    return JSON.parse(text);
  }
  return JSON.parse(fs.readFileSync(path.resolve(fileArg), "utf8"));
}

function parseArgs(argv) {
  const options = {
    fromDraft: null,
    force: false,
    stdin: false,
    file: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") options.force = true;
    else if (arg === "--stdin") options.stdin = true;
    else if (arg === "--from-draft") options.fromDraft = argv[++i];
    else if (arg.startsWith("--from-draft=")) {
      options.fromDraft = arg.slice("--from-draft=".length);
    } else if (arg.startsWith("-")) {
      fail(`Unknown argument: ${arg}`);
    } else {
      options.file = arg;
    }
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  let raw;

  if (options.fromDraft) {
    const drafts = loadDrafts();
    const draft = drafts[String(options.fromDraft)];
    if (!draft || !draft.profile) {
      fail(
        `No draft found for ${options.fromDraft} in ${DRAFTS_PATH}. Run the research agent first.`
      );
    }
    if (Array.isArray(draft.conflicts) && draft.conflicts.length) {
      console.warn(
        `Warning: draft ${options.fromDraft} has conflict notes. Review carefully before relying on eligibility/intake fields.`
      );
    }
    raw = draft.profile;
  } else if (options.stdin) {
    raw = readInput("--stdin");
  } else if (options.file) {
    raw = readInput(options.file);
  } else {
    fail(
      "Usage: node scripts/merge-shelter-profile.js <file|--stdin|--from-draft <id>> [--force]"
    );
  }

  try {
    const stored = mergeProfile(raw, { force: options.force });
    console.log(`Upserted profile for ${stored.locationId} (${stored.name})`);
  } catch (err) {
    fail(err.message || String(err));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateProfile,
  mergeProfile,
};
