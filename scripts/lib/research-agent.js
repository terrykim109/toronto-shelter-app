const {
  PROFILE_JSON_SCHEMA,
  validateProfile,
  toStoredProfile,
  loadProfiles,
  loadTargets,
  selectMissingTargets,
  upsertDraft,
  readResearchInstructions,
} = require("./shelter-profile");
const { researchWithOpenRouter } = require("./openrouter-client");

const DEFAULT_LIMITS = {
  maxShelters: 3,
  maxSearches: 2,
  maxResultsPerSearch: 5,
  maxTotalResults: 8,
  maxFetches: 3,
  maxContentTokens: 6000,
  maxToolCalls: 6,
  maxOutputTokens: 1800,
  maxRetries: 2,
  fetchEngine: "openrouter",
};

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function buildUserPrompt(target, today) {
  return [
    "Research this Toronto shelter target and return one JSON object matching the schema.",
    "Use web_search and web_fetch sparingly. Prefer City of Toronto, 211, and official operator sites.",
    "If a fact is unsupported, set the field to null / unknown / [].",
    "Put unresolved disagreements in conflicts[].",
    `Today's date for lastReviewed / source access: ${today}`,
    "",
    "Shelter target:",
    JSON.stringify(target, null, 2),
  ].join("\n");
}

function normalizeModelResult(parsed, target, today) {
  const merged = {
    ...parsed,
    locationId: String(parsed.locationId || target.locationId),
    name: parsed.name || target.name,
    lastReviewed: parsed.lastReviewed || today,
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    requirements: Array.isArray(parsed.requirements)
      ? parsed.requirements
      : [],
  };

  const profile = validateProfile(merged, { requireSourcesForFacts: true });
  return {
    profile: toStoredProfile(profile),
    conflicts: Array.isArray(merged.conflicts) ? merged.conflicts : [],
  };
}

async function researchOneShelter(target, options = {}) {
  const {
    model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    limits = DEFAULT_LIMITS,
    instructions = readResearchInstructions(),
    researchFn = researchWithOpenRouter,
    clientOptions = {},
    today = todayStamp(),
  } = options;

  const { parsed, payload } = await researchFn({
    model,
    instructions,
    input: buildUserPrompt(target, today),
    schema: PROFILE_JSON_SCHEMA,
    limits,
    clientOptions,
  });

  const normalized = normalizeModelResult(parsed, target, today);
  return {
    target,
    model,
    payload,
    ...normalized,
  };
}

async function researchMissingShelters(options = {}) {
  const {
    locationId = null,
    limit = DEFAULT_LIMITS.maxShelters,
    dryRun = false,
    profiles = loadProfiles(),
    targets = loadTargets(),
    writeDraft = upsertDraft,
    onProgress = () => {},
    ...researchOptions
  } = options;

  const limits = { ...DEFAULT_LIMITS, ...(researchOptions.limits || {}) };
  const selected = selectMissingTargets(targets, profiles, {
    locationId,
    limit,
  });

  if (locationId && selected.length === 0) {
    throw new Error(
      `No missing-profile target found for locationId=${locationId}.`
    );
  }

  const results = [];
  for (const target of selected) {
    onProgress({ type: "start", target });
    try {
      if (dryRun) {
        results.push({
          ok: true,
          dryRun: true,
          locationId: target.locationId,
          target,
        });
        continue;
      }

      const researched = await researchOneShelter(target, {
        ...researchOptions,
        limits,
      });

      const draft = writeDraft({
        status: "pending_review",
        generatedAt: new Date().toISOString(),
        sourceAccessDate: researched.profile.lastReviewed,
        model: researched.model,
        conflicts: researched.conflicts,
        notes:
          researched.conflicts.length > 0
            ? "Conflicts reported — human review required before merge."
            : null,
        profile: researched.profile,
      });

      const item = {
        ok: true,
        locationId: target.locationId,
        draft,
        conflicts: researched.conflicts,
      };
      results.push(item);
      onProgress({ type: "done", ...item });
    } catch (err) {
      const item = {
        ok: false,
        locationId: target.locationId,
        target,
        error: err.message || String(err),
      };
      results.push(item);
      onProgress({ type: "error", ...item });
    }
  }

  return {
    selectedCount: selected.length,
    results,
    preservedProfileIds: Object.keys(profiles),
  };
}

module.exports = {
  DEFAULT_LIMITS,
  buildUserPrompt,
  normalizeModelResult,
  researchOneShelter,
  researchMissingShelters,
};
