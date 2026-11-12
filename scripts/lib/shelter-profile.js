const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PROFILES_PATH = path.join(ROOT, "data", "shelter-profiles.json");
const DRAFTS_PATH = path.join(ROOT, "data", "shelter-profile-drafts.json");
const TARGETS_PATH = path.join(ROOT, "data", "shelter-targets.json");

const ACCESS_VALUES = new Set(["walk-in", "referral", "mixed", "unknown"]);
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);

const PROFILE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "locationId",
    "name",
    "phone",
    "website",
    "whoServed",
    "access",
    "intakeNotes",
    "requirements",
    "transit",
    "summary",
    "confidence",
    "sources",
    "lastReviewed",
    "conflicts",
  ],
  properties: {
    locationId: { type: "string" },
    name: { type: "string" },
    phone: { type: ["string", "null"] },
    website: { type: ["string", "null"] },
    whoServed: { type: ["string", "null"] },
    access: { type: "string", enum: ["walk-in", "referral", "mixed", "unknown"] },
    intakeNotes: { type: ["string", "null"] },
    requirements: { type: "array", items: { type: "string" } },
    transit: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    sources: { type: "array", items: { type: "string" } },
    lastReviewed: { type: "string" },
    conflicts: { type: "array", items: { type: "string" } },
  },
};

function asNullableString(value, field) {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string or null.`);
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function validateProfile(raw, options = {}) {
  const { requireSourcesForFacts = false } = options;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Profile must be a JSON object.");
  }

  const locationId = String(raw.locationId || "").trim();
  if (!locationId) throw new Error("locationId is required.");

  const name = asNullableString(raw.name, "name");
  if (!name) throw new Error("name is required.");

  const access = raw.access || "unknown";
  if (!ACCESS_VALUES.has(access)) {
    throw new Error(`access must be one of: ${[...ACCESS_VALUES].join(", ")}`);
  }

  const confidence = raw.confidence || "low";
  if (!CONFIDENCE_VALUES.has(confidence)) {
    throw new Error(
      `confidence must be one of: ${[...CONFIDENCE_VALUES].join(", ")}`
    );
  }

  const requirements = Array.isArray(raw.requirements)
    ? raw.requirements
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
    : [];

  const sources = Array.isArray(raw.sources)
    ? raw.sources
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
    : [];

  const conflicts = Array.isArray(raw.conflicts)
    ? raw.conflicts
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
    : [];

  const lastReviewed = asNullableString(raw.lastReviewed, "lastReviewed");
  if (!lastReviewed || !/^\d{4}-\d{2}-\d{2}$/.test(lastReviewed)) {
    throw new Error("lastReviewed must be YYYY-MM-DD.");
  }

  const phone = asNullableString(raw.phone, "phone");
  const website = asNullableString(raw.website, "website");
  const whoServed = asNullableString(raw.whoServed, "whoServed");
  const intakeNotes = asNullableString(raw.intakeNotes, "intakeNotes");
  const transit = asNullableString(raw.transit, "transit");
  const summary = asNullableString(raw.summary, "summary");

  const factualFields = [phone, website, whoServed, intakeNotes, transit, summary];
  const hasFacts = factualFields.some(Boolean) || requirements.length > 0;

  if (requireSourcesForFacts && hasFacts && sources.length === 0) {
    throw new Error(
      "sources must include at least one URL when factual fields are set."
    );
  }

  for (const url of sources) {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`sources entries must be http(s) URLs: ${url}`);
    }
  }

  return {
    locationId,
    name,
    phone,
    website,
    whoServed,
    access,
    intakeNotes,
    requirements,
    transit,
    summary,
    confidence,
    sources,
    lastReviewed,
    ...(conflicts.length ? { conflicts } : {}),
  };
}

function toStoredProfile(profile) {
  const { conflicts, ...rest } = profile;
  return rest;
}

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function loadProfiles() {
  const parsed = loadJson(PROFILES_PATH, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function loadDrafts() {
  const parsed = loadJson(DRAFTS_PATH, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function loadTargets() {
  const parsed = loadJson(TARGETS_PATH, []);
  return Array.isArray(parsed) ? parsed : [];
}

function selectMissingTargets(targets, profiles, options = {}) {
  const { locationId = null, limit = Infinity } = options;
  let missing = targets.filter(
    (t) => t && t.locationId && !profiles[String(t.locationId)]
  );

  if (locationId) {
    missing = missing.filter((t) => String(t.locationId) === String(locationId));
  }

  return missing.slice(0, limit);
}

function mergeProfile(profile, options = {}) {
  const { force = false, profilesPath = PROFILES_PATH } = options;
  const validated = validateProfile(profile, { requireSourcesForFacts: false });
  const stored = toStoredProfile(validated);
  const profiles = loadJson(profilesPath, {});

  if (profiles[stored.locationId] && !force) {
    throw new Error(
      `Profile already exists for ${stored.locationId}. Pass force: true to overwrite.`
    );
  }

  profiles[stored.locationId] = stored;
  saveJson(profilesPath, profiles);
  return stored;
}

function upsertDraft(draft, options = {}) {
  const { draftsPath = DRAFTS_PATH } = options;
  if (!draft || !draft.profile) {
    throw new Error("Draft must include a profile object.");
  }

  const profile = validateProfile(draft.profile, {
    requireSourcesForFacts: true,
  });
  const drafts = loadJson(draftsPath, {});
  const entry = {
    status: draft.status || "pending_review",
    generatedAt: draft.generatedAt || new Date().toISOString(),
    sourceAccessDate:
      draft.sourceAccessDate || profile.lastReviewed || null,
    model: draft.model || null,
    conflicts: Array.isArray(draft.conflicts)
      ? draft.conflicts
      : profile.conflicts || [],
    notes: draft.notes || null,
    profile: toStoredProfile(profile),
  };

  drafts[profile.locationId] = entry;
  saveJson(draftsPath, drafts);
  return entry;
}

function readResearchInstructions() {
  const instructionPath = path.join(
    __dirname,
    "..",
    "agents",
    "enrich-shelter-profiles.md"
  );
  return fs.readFileSync(instructionPath, "utf8");
}

module.exports = {
  ROOT,
  PROFILES_PATH,
  DRAFTS_PATH,
  TARGETS_PATH,
  ACCESS_VALUES,
  CONFIDENCE_VALUES,
  PROFILE_JSON_SCHEMA,
  validateProfile,
  toStoredProfile,
  loadProfiles,
  loadDrafts,
  loadTargets,
  selectMissingTargets,
  mergeProfile,
  upsertDraft,
  readResearchInstructions,
  saveJson,
  loadJson,
};
