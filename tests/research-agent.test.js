const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  validateProfile,
  mergeProfile,
  upsertDraft,
  selectMissingTargets,
  toStoredProfile,
} = require("../scripts/lib/shelter-profile");
const {
  extractOutputText,
  parseJsonObject,
  createResponse,
} = require("../scripts/lib/openrouter-client");
const {
  normalizeModelResult,
  researchMissingShelters,
  buildUserPrompt,
} = require("../scripts/lib/research-agent");

function sampleProfile(overrides = {}) {
  return {
    locationId: "9999",
    name: "Test Shelter",
    phone: "416-555-0100",
    website: "https://example.org",
    whoServed: "Men 18+",
    access: "referral",
    intakeNotes: "Call Central Intake first.",
    requirements: ["Ask about ID"],
    transit: "Near a subway station",
    summary: "A test shelter profile for unit tests.",
    confidence: "medium",
    sources: ["https://www.toronto.ca/community-people/housing-shelter/"],
    lastReviewed: "2026-11-12",
    conflicts: [],
    ...overrides,
  };
}

test("validateProfile accepts a complete structured profile", () => {
  const profile = validateProfile(sampleProfile(), {
    requireSourcesForFacts: true,
  });
  assert.equal(profile.locationId, "9999");
  assert.equal(profile.access, "referral");
  assert.deepEqual(profile.sources.length, 1);
});

test("validateProfile rejects incomplete or invalid model responses", () => {
  assert.throws(() => validateProfile({ name: "Missing id" }), /locationId/);
  assert.throws(
    () => validateProfile(sampleProfile({ access: "drop-in" })),
    /access/
  );
  assert.throws(
    () => validateProfile(sampleProfile({ lastReviewed: "12-11-2026" })),
    /lastReviewed/
  );
});

test("validateProfile rejects factual claims without source attribution", () => {
  assert.throws(
    () =>
      validateProfile(sampleProfile({ sources: [] }), {
        requireSourcesForFacts: true,
      }),
    /sources must include/
  );
});

test("normalizeModelResult keeps conflicts and strips them from stored profile", () => {
  const normalized = normalizeModelResult(
    sampleProfile({
      conflicts: ["Phone is 416-111-1111 on 211 and 416-222-2222 on operator site"],
      phone: null,
    }),
    { locationId: "9999", name: "Test Shelter" },
    "2026-11-12"
  );

  assert.equal(normalized.conflicts.length, 1);
  assert.equal("conflicts" in normalized.profile, false);
  assert.equal(normalized.profile.phone, null);
});

test("createResponse retries retryable API errors then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) {
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: { message: "upstream" } }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"ok":true}' }],
            },
          ],
        }),
    };
  };

  const payload = await createResponse(
    { model: "test", input: "hi" },
    { apiKey: "test-key", fetchImpl, maxRetries: 2, retryDelayMs: 1 }
  );
  assert.equal(extractOutputText(payload), '{"ok":true}');
  assert.equal(calls, 2);
});

test("createResponse surfaces non-retryable API errors", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () =>
      JSON.stringify({ error: { message: "Invalid API key" } }),
  });

  await assert.rejects(
    () =>
      createResponse(
        { model: "test", input: "hi" },
        { apiKey: "bad", fetchImpl, maxRetries: 2, retryDelayMs: 1 }
      ),
    /Invalid API key/
  );
});

test("parseJsonObject rejects empty or non-JSON model text", () => {
  assert.throws(() => parseJsonObject(""), /empty/);
  assert.throws(() => parseJsonObject("not json"), /not valid JSON/);
});

test("selectMissingTargets processes only shelters without profiles", () => {
  const targets = [
    { locationId: "1", name: "A" },
    { locationId: "2", name: "B" },
    { locationId: "3", name: "C" },
  ];
  const profiles = { "2": sampleProfile({ locationId: "2" }) };
  const missing = selectMissingTargets(targets, profiles, { limit: 10 });
  assert.deepEqual(
    missing.map((t) => t.locationId),
    ["1", "3"]
  );
});

test("mergeProfile preserves existing profiles unless force is set", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shelter-profiles-"));
  const profilesPath = path.join(dir, "shelter-profiles.json");
  fs.writeFileSync(
    profilesPath,
    JSON.stringify({ "1001": toStoredProfile(sampleProfile({ locationId: "1001", name: "Existing" })) }, null, 2)
  );

  assert.throws(
    () =>
      mergeProfile(sampleProfile({ locationId: "1001", name: "New Name" }), {
        profilesPath,
        force: false,
      }),
    /already exists/
  );

  const stored = mergeProfile(
    sampleProfile({ locationId: "1001", name: "Forced" }),
    { profilesPath, force: true }
  );
  assert.equal(stored.name, "Forced");

  const mergedNew = mergeProfile(sampleProfile({ locationId: "2002", name: "Fresh" }), {
    profilesPath,
    force: false,
  });
  assert.equal(mergedNew.locationId, "2002");

  const disk = JSON.parse(fs.readFileSync(profilesPath, "utf8"));
  assert.equal(disk["1001"].name, "Forced");
  assert.equal(disk["2002"].name, "Fresh");
});

test("researchMissingShelters writes drafts and skips existing profiles", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shelter-drafts-"));
  const draftsPath = path.join(dir, "drafts.json");
  const profiles = {
    "1001": toStoredProfile(sampleProfile({ locationId: "1001" })),
  };
  const targets = [
    { locationId: "1001", name: "Already Seeded", address: "1 Main" },
    { locationId: "3003", name: "Needs Research", address: "2 Main" },
  ];

  let researchCalls = 0;
  const summary = await researchMissingShelters({
    profiles,
    targets,
    limit: 5,
    writeDraft: (draft) =>
      upsertDraft(draft, { draftsPath }),
    researchFn: async () => {
      researchCalls += 1;
      return {
        payload: {},
        text: "{}",
        parsed: sampleProfile({
          locationId: "3003",
          name: "Needs Research",
          conflicts: ["Operator site and 211 list different phones"],
        }),
      };
    },
  });

  assert.equal(researchCalls, 1);
  assert.equal(summary.selectedCount, 1);
  assert.equal(summary.results[0].ok, true);
  assert.equal(summary.results[0].locationId, "3003");
  assert.equal(summary.preservedProfileIds.includes("1001"), true);

  const drafts = JSON.parse(fs.readFileSync(draftsPath, "utf8"));
  assert.equal(drafts["3003"].status, "pending_review");
  assert.equal(drafts["3003"].conflicts.length, 1);
  assert.equal(drafts["3003"].profile.locationId, "3003");
});

test("researchMissingShelters records research failures without aborting the batch", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shelter-drafts-fail-"));
  const draftsPath = path.join(dir, "drafts.json");
  const written = [];

  const summary = await researchMissingShelters({
    profiles: {},
    targets: [
      { locationId: "1", name: "One" },
      { locationId: "2", name: "Two" },
    ],
    limit: 2,
    writeDraft: (draft) => {
      written.push(draft.profile.locationId);
      return upsertDraft(draft, { draftsPath });
    },
    researchFn: async ({ input }) => {
      if (input.includes('"locationId": "1"')) {
        throw new Error("boom");
      }
      return {
        payload: {},
        text: "{}",
        parsed: sampleProfile({ locationId: "2", name: "Two" }),
      };
    },
  });

  assert.equal(summary.results[0].ok, false);
  assert.match(summary.results[0].error, /boom/);
  assert.equal(summary.results[1].ok, true);
  assert.deepEqual(written, ["2"]);
});

test(
  "normalizeModelResult keys the profile by the researched target, not the id the model returns",
  {
    todo: "Known defect: a model-returned locationId wins, so a draft can be filed under (and later merged over) a different shelter.",
  },
  () => {
    const normalized = normalizeModelResult(
      sampleProfile({ locationId: "1001" }),
      { locationId: "3003", name: "Test Shelter" },
      "2026-11-12"
    );
    assert.equal(normalized.profile.locationId, "3003");
  }
);

test(
  "validateProfile rejects website values that are not http(s) URLs",
  {
    todo: "Known defect: website is rendered as a link href but, unlike sources, its scheme is not validated.",
  },
  () => {
    assert.throws(
      () => validateProfile(sampleProfile({ website: "javascript:alert(1)" })),
      /website/
    );
  }
);

test("buildUserPrompt includes target and no-invention guidance date", () => {
  const prompt = buildUserPrompt(
    { locationId: "1015", name: "Dixon Hall Heyworth House" },
    "2026-11-12"
  );
  assert.match(prompt, /1015/);
  assert.match(prompt, /2026-11-12/);
  assert.match(prompt, /unsupported/);
});
