/**
 * Cloud Code Assist / Antigravity transport for @ai-sdk/google.
 * Ports OpenClaw pi-ai google-gemini-cli.js + google-shared.js measures.
 * Catalog synced from AICoworker ~/.openclaw/openclaw.json + pi-ai Claude/gpt-oss.
 */

export const DEFAULT_ENDPOINT = "https://cloudcode-pa.googleapis.com";
export const ANTIGRAVITY_DAILY = "https://daily-cloudcode-pa.sandbox.googleapis.com";
export const ANTIGRAVITY_AUTOPUSH = "https://autopush-cloudcode-pa.sandbox.googleapis.com";
export const ENDPOINT_FALLBACKS = [ANTIGRAVITY_DAILY, ANTIGRAVITY_AUTOPUSH, DEFAULT_ENDPOINT];

const CLAUDE_THINKING_BETA_HEADER = "interleaved-thinking-2025-05-14";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;

export const SKIP_THOUGHT_SIGNATURE = "skip_thought_signature_validator";

export const ANTIGRAVITY_SYSTEM_INSTRUCTION =
  "You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding." +
  "You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question." +
  "**Absolute paths only**" +
  "**Proactiveness**";

const JSON_SCHEMA_META_DECLARATIONS = new Set([
  "$schema",
  "$id",
  "$anchor",
  "$dynamicAnchor",
  "$vocabulary",
  "$comment",
  "$defs",
  "definitions",
]);

/** OpenCode/pi-ai id → AICoworker CCA wire id */
export const MODEL_ID_ALIASES = {
  "gemini-3.1-pro-high": "gemini-pro-agent",
  "gemini-pro-agent": "gemini-pro-agent",
};

export function resolveWireModelId(modelId) {
  const id = String(modelId || "");
  return MODEL_ID_ALIASES[id] || id;
}

export function isClaudeModel(modelId) {
  return String(modelId || "").startsWith("claude-");
}

export function isClaudeThinkingModel(modelId) {
  const id = String(modelId || "");
  return id.startsWith("claude-") && (id.includes("thinking") || ANTIGRAVITY_MODEL_CATALOG[id]?.reasoning === true);
}

export function isGemini3Model(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (id === "gemini-pro-agent" || id.includes("flash-agent")) return true;
  return id.includes("gemini-3");
}

export function isGemini3High(modelId) {
  const id = String(modelId || "").toLowerCase();
  return (
    id === "gemini-pro-agent" ||
    id === "gemini-3-flash-agent" ||
    (id.includes("gemini-3") && id.includes("high"))
  );
}

export function isGemini3Medium(modelId) {
  const id = String(modelId || "").toLowerCase();
  return id.includes("gemini-3") && id.includes("medium");
}

export function isGemini3Low(modelId) {
  const id = String(modelId || "").toLowerCase();
  return id.includes("gemini-3") && (id.includes("low") || id.includes("extra-low"));
}

export function isGeminiProHigh(modelId) {
  const id = String(modelId || "").toLowerCase();
  return id === "gemini-pro-agent" || (id.includes("gemini-3") && id.includes("pro") && id.includes("high"));
}

export function isGeminiProLow(modelId) {
  const id = String(modelId || "").toLowerCase();
  return id.includes("gemini-3") && id.includes("pro") && id.includes("low");
}

export function getDefaultThinkingLevel(modelId) {
  if (isGemini3High(modelId)) return "HIGH";
  if (isGemini3Medium(modelId)) return "MEDIUM";
  if (isGemini3Low(modelId)) return "LOW";
  return isMinimalThinkingSupported(modelId) ? "MINIMAL" : "LOW";
}

/**
 * MINIMAL thinking level is rejected by the Antigravity backend for Gemini 3.7+
 * (HTTP 400 "Thinking level MINIMAL is not supported for this model"). The
 * minimum supported floor there is LOW. Older models (gemini-3.6 and below)
 * still accept MINIMAL.
 */
export function isMinimalThinkingSupported(modelId) {
  const m = String(modelId || "").toLowerCase().match(/^gemini-(\d+)(?:\.(\d+))?/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = m[2] !== undefined ? Number(m[2]) : 0;
  if (major >= 4) return false;
  return major === 3 ? minor < 7 : true;
}

export function requiresToolCallId(modelId) {
  const id = String(modelId || "");
  return id.startsWith("claude-") || id.startsWith("gpt-oss-");
}

export function normalizeToolCallId(id) {
  if (!id) return id;
  return String(id)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
}

export function getAntigravityHeaders(modelId = "") {
  const platform =
    process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";

  // User-Agent mode: 'cli' (default, official Antigravity CLI UA — unlocks newest
  // models like gemini-3.7-flash; server routes model availability by UA prefix),
  // 'sdk' (antigravity/1.21.9), 'desktop' (Antigravity/2.2.1).
  const uaMode = (process.env.OPENCODE_AGY_UA_MODE || "cli").toLowerCase();
  let userAgentStr;

  if (uaMode === "sdk") {
    userAgentStr = `antigravity/${process.env.PI_AI_ANTIGRAVITY_VERSION || "1.21.9"} ${platform}/${arch}`;
  } else if (uaMode === "desktop") {
    userAgentStr = `Antigravity/${process.env.PI_AI_ANTIGRAVITY_VERSION || "2.2.1"} ${platform}/${arch}`;
  } else {
    const cliVer = process.env.PI_AI_ANTIGRAVITY_VERSION || "1.1.13";
    userAgentStr = `antigravity/cli/${cliVer} (aidev_client; os_type=${platform}; arch=${arch}; auth_method=consumer)`;
  }

  const headers = {
    "User-Agent": userAgentStr,
  };
  if (isClaudeThinkingModel(modelId)) {
    headers["anthropic-beta"] = CLAUDE_THINKING_BETA_HEADER;
  }
  return headers;
}

export function sanitizeForOpenApi(schema) {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return schema;
  }
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (JSON_SCHEMA_META_DECLARATIONS.has(key)) continue;
    result[key] = sanitizeForOpenApi(value);
  }
  return result;
}

export function adaptToolsForModel(tools, modelId) {
  if (!tools || !Array.isArray(tools)) return tools;
  const claude = isClaudeModel(modelId);
  return tools.map((toolGroup) => {
    if (!toolGroup || typeof toolGroup !== "object") return toolGroup;
    if (!Array.isArray(toolGroup.functionDeclarations)) return toolGroup;
    return {
      ...toolGroup,
      functionDeclarations: toolGroup.functionDeclarations.map((fd) => {
        if (!fd || typeof fd !== "object") return fd;
        const next = { ...fd };
        if (claude) {
          const schema = next.parameters ?? next.parametersJsonSchema;
          if (schema) {
            next.parameters = sanitizeForOpenApi(schema);
            delete next.parametersJsonSchema;
          }
        }
        return next;
      }),
    };
  });
}

export function postProcessContents(contents, modelId) {
  if (!Array.isArray(contents)) return contents;
  const gemini3 = isGemini3Model(modelId);
  const needIds = requiresToolCallId(modelId);
  let toolCounter = 0;
  const lastToolCallIds = new Map();

  return contents
    .map((content) => {
      if (!content || !Array.isArray(content.parts)) return content;
      const parts = [];
      for (const part of content.parts) {
        if (!part || typeof part !== "object") {
          parts.push(part);
          continue;
        }
        if (
          typeof part.text === "string" &&
          part.text.trim() === "" &&
          !part.functionCall &&
          !part.functionResponse
        ) {
          continue;
        }
        let next = { ...part };

        if (next.functionCall && typeof next.functionCall === "object") {
          const fc = { ...next.functionCall };
          if (needIds) {
            const raw = fc.id || `${fc.name || "tool"}_${Date.now()}_${++toolCounter}`;
            fc.id = normalizeToolCallId(raw);
            if (fc.name) {
              lastToolCallIds.set(fc.name, fc.id);
            }
          }
          next.functionCall = fc;
          if (gemini3 && !next.thoughtSignature && !fc.thoughtSignature) {
            next.thoughtSignature = SKIP_THOUGHT_SIGNATURE;
          }
        }

        if (next.functionResponse && typeof next.functionResponse === "object") {
          const fr = { ...next.functionResponse };
          if (needIds) {
            const resolvedId = fr.id || lastToolCallIds.get(fr.name) || fr.name || "tool";
            fr.id = normalizeToolCallId(resolvedId);
          }
          next.functionResponse = fr;
        }

        parts.push(next);
      }
      if (parts.length === 0) return null;
      return { ...content, parts };
    })
    .filter(Boolean);
}

export function injectAntigravitySystem(geminiBody) {
  const disabled = process.env.OPENCODE_AGY_INJECT_SYSTEM === "0";
  if (disabled) return geminiBody;
  const request = { ...geminiBody };
  const existingParts = request.systemInstruction?.parts ?? [];
  const already =
    Array.isArray(existingParts) &&
    existingParts.some(
      (p) => typeof p?.text === "string" && p.text.includes("You are Antigravity, a powerful agentic"),
    );
  if (already) return request;
  request.systemInstruction = {
    role: "user",
    parts: [
      { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
      { text: `Please ignore following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]` },
      ...existingParts,
    ],
  };
  return request;
}

export function sanitizeGenerationConfig(generationConfig, modelId) {
  if (!generationConfig || typeof generationConfig !== "object") return generationConfig;
  const id = String(modelId || "").toLowerCase();
  const isGemini3 = isGemini3Model(modelId) || isGeminiProHigh(modelId);
  if (!isGemini3 && !id.includes("gemini-3") && id !== "gemini-pro-agent") return generationConfig;

  const next = { ...generationConfig };
  delete next.thinkingBudget;

  const defaultLevel = getDefaultThinkingLevel(modelId);

  if (next.thinkingConfig && typeof next.thinkingConfig === "object") {
    const tc = { ...next.thinkingConfig };
    delete tc.thinkingBudget;
    if (!tc.thinkingLevel) {
      tc.thinkingLevel = defaultLevel;
    }
    if (typeof tc.thinkingLevel === "string") {
      tc.thinkingLevel = tc.thinkingLevel.toUpperCase();
      if (tc.thinkingLevel === "MIN") tc.thinkingLevel = "MINIMAL";
      if (tc.thinkingLevel === "MED") tc.thinkingLevel = "MEDIUM";
      if (tc.thinkingLevel === "MINIMAL" && !isMinimalThinkingSupported(modelId)) {
        tc.thinkingLevel = "LOW";
      }
    }
    if (tc.includeThoughts === undefined) {
      tc.includeThoughts = true;
    }
    next.thinkingConfig = tc;
  } else if (isGemini3) {
    const catalogEntry = ANTIGRAVITY_MODEL_CATALOG[modelId];
    if (!catalogEntry || catalogEntry.reasoning !== false) {
      next.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: defaultLevel,
      };
    }
  }
  return next;
}

export function postProcessGeminiBody(geminiBody, modelId) {
  let body = { ...geminiBody };
  if (body.tools) body.tools = adaptToolsForModel(body.tools, modelId);
  if (body.contents) body.contents = postProcessContents(body.contents, modelId);
  if (body.generationConfig) {
    body.generationConfig = sanitizeGenerationConfig(body.generationConfig, modelId);
  } else if (isGemini3Model(modelId) || isGeminiProHigh(modelId) || isGeminiProLow(modelId)) {
    body.generationConfig = sanitizeGenerationConfig({}, modelId);
  }
  return body;
}

export function buildEnvelope(geminiBody, opts) {
  const isAntigravity = opts.isAntigravity !== false;
  let request = postProcessGeminiBody({ ...geminiBody }, opts.modelId);

  if (opts.sessionId) request.sessionId = opts.sessionId;
  else if (request.sessionId == null) {
    delete request.sessionId;
  }

  if (isAntigravity) {
    request = injectAntigravitySystem(request);
  }

  return {
    project: opts.projectId,
    model: opts.modelId,
    request,
    ...(isAntigravity ? { requestType: "agent" } : {}),
    userAgent: isAntigravity ? "antigravity" : "opencode",
    requestId: `${isAntigravity ? "agent" : "oc"}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  };
}

export function extractModelIdFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const decodedPath = decodeURIComponent(u.pathname);
    const m = decodedPath.match(/\/models\/([^:]+)/);
    if (!m?.[1]) return undefined;
    let modelId = m[1].replace(/:(?:streamGenerateContent|generateContent)$/, "");
    if (modelId.startsWith("google-antigravity/")) {
      modelId = modelId.slice("google-antigravity/".length);
    }
    return modelId;
  } catch {
    return undefined;
  }
}

export function isGoogleGenerativeUrl(urlString) {
  try {
    const u = new URL(urlString);
    return (
      u.hostname.includes("generativelanguage.googleapis.com") ||
      u.pathname.includes(":generateContent") ||
      u.pathname.includes(":streamGenerateContent")
    );
  } catch {
    return false;
  }
}

export function isStreamUrl(urlString) {
  return String(urlString).includes("streamGenerateContent") || String(urlString).includes("alt=sse");
}

export function extractRetryDelay(errorText, response) {
  const normalizeDelay = (ms) => (ms > 0 ? Math.ceil(ms + 1000) : undefined);
  const headers = response instanceof Headers ? response : response?.headers;
  if (headers) {
    const retryAfter = headers.get("retry-after");
    if (retryAfter) {
      const sec = Number(retryAfter);
      if (Number.isFinite(sec)) {
        const d = normalizeDelay(sec * 1000);
        if (d !== undefined) return d;
      }
      const dateMs = Date.parse(retryAfter);
      if (!Number.isNaN(dateMs)) {
        const d = normalizeDelay(dateMs - Date.now());
        if (d !== undefined) return d;
      }
    }
    const rateLimitResetAfter = headers.get("x-ratelimit-reset-after");
    if (rateLimitResetAfter) {
      const sec = Number(rateLimitResetAfter);
      if (Number.isFinite(sec)) {
        const d = normalizeDelay(sec * 1000);
        if (d !== undefined) return d;
      }
    }
  }
  const text = errorText || "";
  const durationMatch = text.match(/reset after (?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (durationMatch) {
    const hours = durationMatch[1] ? parseInt(durationMatch[1], 10) : 0;
    const minutes = durationMatch[2] ? parseInt(durationMatch[2], 10) : 0;
    const seconds = parseFloat(durationMatch[3]);
    if (!Number.isNaN(seconds)) {
      const d = normalizeDelay(((hours * 60 + minutes) * 60 + seconds) * 1000);
      if (d !== undefined) return d;
    }
  }
  const retryInMatch = text.match(/Please retry in ([0-9.]+)(ms|s)/i);
  if (retryInMatch?.[1]) {
    const value = parseFloat(retryInMatch[1]);
    if (!Number.isNaN(value) && value > 0) {
      const ms = retryInMatch[2].toLowerCase() === "ms" ? value : value * 1000;
      const d = normalizeDelay(ms);
      if (d !== undefined) return d;
    }
  }
  const retryDelayMatch = text.match(/"retryDelay":\s*"([0-9.]+)(ms|s)"/i);
  if (retryDelayMatch?.[1]) {
    const value = parseFloat(retryDelayMatch[1]);
    if (!Number.isNaN(value) && value > 0) {
      const ms = retryDelayMatch[2].toLowerCase() === "ms" ? value : value * 1000;
      const d = normalizeDelay(ms);
      if (d !== undefined) return d;
    }
  }
  return undefined;
}

export function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request was aborted"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("Request was aborted"));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export function transformSseDataLine(line) {
  const m = line.match(/^data:\s?(.*)$/);
  if (!m) return line;
  const jsonStr = m[1].trim();
  if (!jsonStr || jsonStr === "[DONE]") return line.startsWith("data:") ? line : `data: ${jsonStr}`;
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object" && "response" in parsed && parsed.response != null) {
      return `data: ${JSON.stringify(parsed.response)}`;
    }
  } catch {
    // leave
  }
  return line;
}

export function unwrapSseResponseStream(body) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let reader = null;

  return new ReadableStream({
    async start(controller) {
      reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.length) {
              const rest = buffer.replace(/\r$/, "");
              if (rest.startsWith("data:")) {
                controller.enqueue(encoder.encode(transformSseDataLine(rest) + "\n"));
              } else if (rest.trim()) {
                controller.enqueue(encoder.encode(rest));
              }
            }
            controller.close();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          let out = "";
          for (const line of lines) {
            if (line.startsWith("data:")) out += transformSseDataLine(line) + "\n";
            else out += line + "\n";
          }
          if (out) controller.enqueue(encoder.encode(out));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        try {
          reader?.releaseLock();
        } catch {
          /* ignore */
        }
      }
    },
    async cancel(reason) {
      try {
        if (reader) {
          await reader.cancel(reason);
        } else {
          await body.cancel(reason);
        }
      } catch {
        /* ignore */
      }
    },
  });
}

export function createAntigravityFetch(deps) {
  const baseFetch = deps.fetchImpl || globalThis.fetch;

  return async function antigravityFetch(input, init = {}) {
    const urlString =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url;

    if (!urlString || !isGoogleGenerativeUrl(urlString)) {
      return baseFetch(input, init);
    }

    const modelId = extractModelIdFromUrl(urlString);
    if (!modelId) {
      return baseFetch(input, init);
    }

    const signal = init.signal || (typeof input === "object" && input !== null ? input.signal : undefined);
    const stream = isStreamUrl(urlString);

    let bodyText = "";
    if (typeof init.body === "string") {
      bodyText = init.body;
    } else if (init.body != null) {
      if (init.body instanceof Uint8Array) {
        bodyText = new TextDecoder().decode(init.body);
      } else if (typeof init.body === "object" && typeof init.body.getReader === "function") {
        throw new Error("Antigravity adapter requires buffered request body (got stream)");
      } else {
        bodyText = String(init.body);
      }
    } else if (typeof input === "object" && input !== null && typeof input.text === "function") {
      try {
        bodyText = await input.clone().text();
      } catch {
        // ignore
      }
    }

    let geminiBody = {};
    if (bodyText) {
      try {
        geminiBody = JSON.parse(bodyText);
      } catch {
        geminiBody = {};
      }
    }

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error("Request was aborted");

      const accessToken = await deps.getAccessToken();
      const projectId = await deps.getProjectId();
      if (!accessToken || !projectId) {
        throw new Error(
          "Antigravity credentials missing access token or projectId. Run: opencode auth login",
        );
      }

      const wireModelId = resolveWireModelId(modelId);
      const envelope = buildEnvelope(geminiBody, {
        projectId,
        modelId: wireModelId,
        isAntigravity: true,
      });
      const envelopeJson = JSON.stringify(envelope);

      const headers = new Headers();
      const rawHeaders = init.headers || (typeof input === "object" && input !== null && input.headers ? input.headers : undefined);
      if (rawHeaders) {
        const h = new Headers(rawHeaders);
        h.forEach((v, k) => {
          const lk = k.toLowerCase();
          if (lk === "x-goog-api-key" || lk === "authorization") return;
          headers.set(k, v);
        });
      }
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "text/event-stream");
      for (const [k, v] of Object.entries(getAntigravityHeaders(wireModelId))) headers.set(k, v);

      let endpointIndex = 0;
      while (endpointIndex < ENDPOINT_FALLBACKS.length) {
        const endpoint = ENDPOINT_FALLBACKS[endpointIndex];
        const target = stream
          ? `${endpoint}/v1internal:streamGenerateContent?alt=sse`
          : `${endpoint}/v1internal:generateContent`;
        try {
          const response = await baseFetch(target, {
            ...init,
            method: "POST",
            headers,
            body: envelopeJson,
          });

          if (
            (response.status === 403 || response.status === 404) &&
            endpointIndex < ENDPOINT_FALLBACKS.length - 1
          ) {
            endpointIndex++;
            lastError = new Error(`Antigravity ${response.status} at ${endpoint}`);
            continue;
          }

          if (response.status === 401 && attempt < MAX_RETRIES) {
            lastError = new Error("Antigravity 401 unauthorized — refreshing token");
            await deps.getAccessToken({ forceRefresh: true }).catch(() => null);
            await sleep(200, signal);
            break;
          }

          if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
            const errText = await response.clone().text().catch(() => "");
            let delay = extractRetryDelay(errText, response) ?? BASE_DELAY_MS * 2 ** attempt;
            delay = Math.min(delay, MAX_RETRY_DELAY_MS);
            lastError = new Error(`Antigravity ${response.status}: ${errText.slice(0, 200)}`);
            await sleep(delay, signal);
            break;
          }

          if (!response.ok) {
            if (process.env.OPENCODE_AGY_DEBUG === "1") {
              try {
                const { writeFileSync } = await import("node:fs");
                const { join } = await import("node:path");
                const { tmpdir } = await import("node:os");
                const errBody = await response.clone().text().catch(() => "");
                writeFileSync(
                  join(tmpdir(), `agy-debug-${Date.now()}.json`),
                  JSON.stringify(
                    {
                      status: response.status,
                      modelId,
                      wireModelId,
                      endpoint,
                      errorBody: errBody.slice(0, 2000),
                      envelopeKeys: Object.keys(envelope),
                      requestKeys: Object.keys(envelope.request || {}),
                      generationConfig: envelope.request?.generationConfig,
                      toolsCount: envelope.request?.tools?.length ?? 0,
                      contentsRoles: (envelope.request?.contents || []).map((c) => c.role),
                    },
                    null,
                    2,
                  ),
                );
              } catch {
                /* ignore */
              }
            }
            return response;
          }

          const ct = response.headers.get("content-type") || "";
          if (stream && response.body && ct.includes("text/event-stream")) {
            return new Response(unwrapSseResponseStream(response.body), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          }

          const text = await response.text();
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && parsed.response) {
              return new Response(JSON.stringify(parsed.response), {
                status: response.status,
                statusText: response.statusText,
                headers: { "Content-Type": "application/json" },
              });
            }
          } catch {
            /* fallthrough */
          }
          return new Response(text, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (signal?.aborted) throw lastError;
          if (endpointIndex < ENDPOINT_FALLBACKS.length - 1) {
            endpointIndex++;
            continue;
          }
          if (attempt < MAX_RETRIES) {
            await sleep(BASE_DELAY_MS * 2 ** attempt, signal);
            break;
          }
          throw lastError;
        }
      }
    }
    throw lastError ?? new Error("Antigravity request failed on all endpoints");
  };
}

function entry(name, context, output, reasoning, inputs = ["text", "image"]) {
  return {
    name,
    limit: { context, output },
    reasoning,
    tool_call: true,
    modalities: { input: inputs, output: ["text"] },
  };
}

/** AICoworker openclaw.json (13) + pi-ai Claude/gpt-oss + pro-high alias */
export const ANTIGRAVITY_MODEL_CATALOG = {
  "gemini-3.5-flash-extra-low": entry("Gemini 3.5 Flash (Low) (Antigravity)", 1048576, 65536, true),
  "gemini-3.5-flash-low": entry("Gemini 3.5 Flash (Medium) (Antigravity)", 1048576, 65536, true),
  "gemini-3-flash-agent": entry("Gemini 3.5 Flash (High) (Antigravity)", 1048576, 65536, true),
  "gemini-3.5-flash-lite": entry("Gemini 3.5 Flash-Lite (Antigravity)", 1048576, 65535, false, ["text"]),
  "gemini-3.7-flash-high": entry("Gemini 3.7 Flash (High) (Antigravity)", 1048576, 65536, true),
  "gemini-3.7-flash-medium": entry("Gemini 3.7 Flash (Medium) (Antigravity)", 1048576, 65536, true),
  "gemini-3.7-flash-low": entry("Gemini 3.7 Flash (Low) (Antigravity)", 1048576, 65536, true),
  "gemini-3.6-flash-high": entry("Gemini 3.6 Flash (High) (Antigravity)", 1048576, 65536, true),
  "gemini-3.6-flash-medium": entry("Gemini 3.6 Flash (Medium) (Antigravity)", 1048576, 65536, false),
  "gemini-3.6-flash-low": entry("Gemini 3.6 Flash (Low) (Antigravity)", 1048576, 65536, false),
  "gemini-3-flash": entry("Gemini 3 Flash (Antigravity)", 1048576, 65536, true),
  "gemini-3.1-pro-low": entry("Gemini 3.1 Pro (Low) (Antigravity)", 1048576, 65535, true),
  "gemini-pro-agent": entry("Gemini 3.1 Pro (High) (Antigravity)", 1048576, 65535, true),
  "gemini-3.1-pro-high": entry("Gemini 3.1 Pro High (→ gemini-pro-agent)", 1048576, 65535, true),
  "gemini-3.1-flash-lite": entry("Gemini 3.1 Flash Lite (Antigravity)", 1048576, 65535, false, ["text"]),
  "gemini-3.1-flash-image": entry("Gemini 3.1 Flash Image (Antigravity)", 1000000, 64000, false, ["text"]),
  "gemini-2.5-pro": entry("Gemini 2.5 Pro (Antigravity)", 1048576, 65535, true),
  "claude-opus-4-6-thinking": entry("Claude Opus 4.6 Thinking (Antigravity, experimental)", 200000, 128000, true),
  "claude-opus-4-5-thinking": entry("Claude Opus 4.5 Thinking (Antigravity, experimental)", 200000, 64000, true),
  "claude-sonnet-4-6": entry("Claude Sonnet 4.6 (Antigravity, experimental)", 200000, 64000, true),
  "claude-sonnet-4-5-thinking": entry("Claude Sonnet 4.5 Thinking (Antigravity, experimental)", 200000, 64000, true),
  "claude-sonnet-4-5": entry("Claude Sonnet 4.5 (Antigravity, experimental)", 200000, 64000, false),
  "gpt-oss-120b-medium": entry("GPT-OSS 120B Medium (Antigravity, experimental)", 131072, 32768, false, ["text"]),
};
