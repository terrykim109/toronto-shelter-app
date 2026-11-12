const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1/responses";

function extractOutputText(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenRouter response was empty.");
  }

  if (payload.error) {
    const message =
      payload.error.message ||
      payload.error.code ||
      JSON.stringify(payload.error);
    throw new Error(`OpenRouter API error: ${message}`);
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (let i = output.length - 1; i >= 0; i -= 1) {
    const item = output[i];
    if (!item || item.type !== "message") continue;
    const parts = Array.isArray(item.content) ? item.content : [];
    for (const part of parts) {
      if (part && part.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
      if (typeof part?.text === "string") return part.text;
    }
  }

  if (typeof payload.output_text === "string") return payload.output_text;

  throw new Error("OpenRouter response did not include output text.");
}

function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Model returned empty text.");

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model response was not valid JSON.");
  }
}

async function createResponse(body, options = {}) {
  const {
    apiKey = process.env.OPENROUTER_API_KEY,
    baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL,
    fetchImpl = fetch,
    maxRetries = 2,
    retryDelayMs = 750,
  } = options;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required.");
  }

  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const response = await fetchImpl(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/housing-toronto",
          "X-Title": "Housing Toronto shelter research",
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          `OpenRouter returned non-JSON (${response.status}): ${text.slice(0, 200)}`
        );
      }

      if (!response.ok) {
        const message =
          payload?.error?.message ||
          payload?.message ||
          `HTTP ${response.status}`;
        const retryable = response.status === 429 || response.status >= 500;
        const error = new Error(`OpenRouter request failed: ${message}`);
        error.retryable = retryable;
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      return payload;
    } catch (err) {
      lastError = err;
      const retryable = err.retryable === true || err.name === "FetchError";
      if (!retryable || attempt > maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  throw lastError;
}

async function researchWithOpenRouter({
  model,
  instructions,
  input,
  schema,
  limits,
  clientOptions = {},
}) {
  const body = {
    model,
    instructions,
    input,
    tools: [
      {
        type: "openrouter:web_search",
        parameters: {
          max_uses: limits.maxSearches,
          max_results: limits.maxResultsPerSearch,
          max_total_results: limits.maxTotalResults,
        },
      },
      {
        type: "openrouter:web_fetch",
        parameters: {
          engine: limits.fetchEngine || "openrouter",
          max_uses: limits.maxFetches,
          max_content_tokens: limits.maxContentTokens,
        },
      },
    ],
    max_tool_calls: limits.maxToolCalls,
    max_output_tokens: limits.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: "shelter_profile_research",
        strict: true,
        schema,
      },
    },
  };

  const payload = await createResponse(body, {
    ...clientOptions,
    maxRetries: limits.maxRetries,
  });
  const text = extractOutputText(payload);
  const parsed = parseJsonObject(text);
  return { payload, text, parsed };
}

module.exports = {
  DEFAULT_BASE_URL,
  extractOutputText,
  parseJsonObject,
  createResponse,
  researchWithOpenRouter,
};
