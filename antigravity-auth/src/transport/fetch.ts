/**
 * Custom fetch interceptor for Google Antigravity OpenCode plugin.
 * Wraps @ai-sdk/google HTTP calls, routes to Cloud Code Assist endpoints,
 * handles token auto-refresh, exponential backoff, and SSE unwrapping.
 */
import { ENDPOINT_FALLBACKS } from "../auth/constants.js";
import { resolveWireModelId, getFallbackWireModelId } from "../models/aliases.js";
import { extractRetryDelay, parseAntigravityRateLimitReason } from "../utils/retry.js";
import { antigravityFetch, prewarmConnection } from "../utils/http.js";
import { buildEnvelope, getAntigravityHeaders } from "./envelope.js";
import { unwrapSseResponseStream } from "./stream.js";
import { ensureAntigravityVersion } from "./version.js";
import { getLastGoodEndpoint, recordExecutionId, setLastGoodEndpoint } from "./session.js";
import { recordThoughtSignature } from "./thought-signature.js";
import type { AntigravityFetchDeps } from "../types/index.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;
/** Fail over when the first SSE event has not arrived within this window. */
const FIRST_EVENT_WATCHDOG_MS = 60_000;

export function extractModelIdFromUrl(urlString: string): string | undefined {
  try {
    const u = new URL(urlString);
    const decodedPath = decodeURIComponent(u.pathname);
    const m = decodedPath.match(/\/models\/([^:]+)/);
    if (!m?.[1]) return undefined;
    let modelId = m[1].replace(/:(?:streamGenerateContent|generateContent)$/, "");
    if (modelId.startsWith("google-antigravity/")) {
      modelId = modelId.slice("google-antigravity/".length);
    } else if (modelId.startsWith("antigravity/")) {
      modelId = modelId.slice("antigravity/".length);
    }
    return modelId;
  } catch {
    return undefined;
  }
}

export function isGoogleGenerativeUrl(urlString: string): boolean {
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

export function isStreamUrl(urlString: string): boolean {
  return String(urlString).includes("streamGenerateContent") || String(urlString).includes("alt=sse");
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
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

/**
 * Read the first SSE chunk with a watchdog. Returns the chunk, or null when the
 * stream stalled past `timeoutMs` (caller should fail over to the next endpoint).
 * Throws on abort or stream error.
 */
async function readFirstSseChunk(
  body: ReadableStream<Uint8Array>,
  timeoutMs: number,
  signal?: AbortSignal | null,
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  let timer: NodeJS.Timeout | undefined;
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal?.addEventListener?.("abort", onAbort, { once: true });
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      }),
    ]);
    if (result === "timeout") {
      await reader.cancel().catch(() => {});
      return null;
    }
    if (result.done || !result.value) return null;
    return result.value;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/** Rebuild a stream that yields `first` before the remaining body. */
function prependChunk(first: Uint8Array, body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(first);
      const reader = body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    },
    async cancel(reason) {
      await body.cancel(reason).catch(() => {});
    },
  });
}

export function createAntigravityFetch(deps: AntigravityFetchDeps) {
  // Prewarm TLS connection to default endpoint in background
  prewarmConnection(ENDPOINT_FALLBACKS[0]);

  const baseFetch = deps.fetchImpl || antigravityFetch;

  return async function customFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
  ): Promise<Response> {
    const urlString =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url;

    if (!urlString || !isGoogleGenerativeUrl(urlString)) {
      return baseFetch(input, init);
    }

    const modelId = extractModelIdFromUrl(urlString);
    if (!modelId) {
      return baseFetch(input, init);
    }

    const signal =
      init.signal || (typeof input === "object" && input !== null ? (input as Request).signal : undefined);
    const stream = isStreamUrl(urlString);

    let bodyText = "";
    if (typeof init.body === "string") {
      bodyText = init.body;
    } else if (init.body != null) {
      if (init.body instanceof Uint8Array) {
        bodyText = new TextDecoder().decode(init.body);
      } else if (typeof init.body === "object" && typeof (init.body as any).getReader === "function") {
        throw new Error("Antigravity adapter requires buffered request body (got stream)");
      } else {
        bodyText = String(init.body);
      }
    } else if (typeof input === "object" && input !== null && typeof (input as any).text === "function") {
      try {
        bodyText = await (input as any).clone().text();
      } catch {
        // ignore
      }
    }

    let geminiBody: Record<string, unknown> = {};
    if (bodyText) {
      try {
        geminiBody = JSON.parse(bodyText);
      } catch {
        geminiBody = {};
      }
    }

    // Track the newest Antigravity client version in the background so the UA
    // fingerprint does not go stale between releases.
    ensureAntigravityVersion().catch(() => {});

    const wireModelId = resolveWireModelId(modelId);

    // Rate-limit escape hatch: Gemini 4 Argon retries as the equivalent
    // Gemini 3.8 Flash tier when OPENCODE_AGY_AUTO_FALLBACK=1 and upstream
    // answers terminal 429/404 (parity with antigravity-pi).
    const wireCandidates = [wireModelId];
    const fallbackWireId = getFallbackWireModelId(wireModelId);
    if (process.env.OPENCODE_AGY_AUTO_FALLBACK === "1" && fallbackWireId) {
      wireCandidates.push(fallbackWireId);
    }

    let accessToken = await deps.getAccessToken();
    let projectId = await deps.getProjectId();
    if (!accessToken || !projectId) {
      throw new Error(
        "Antigravity credentials missing access token or projectId. Run: opencode auth login",
      );
    }

    const baseHeaders = new Headers();
    const rawHeaders =
      init.headers || (typeof input === "object" && input !== null ? (input as any).headers : undefined);
    if (rawHeaders) {
      const h = new Headers(rawHeaders);
      h.forEach((v, k) => {
        const lk = k.toLowerCase();
        if (lk === "x-goog-api-key" || lk === "authorization") return;
        baseHeaders.set(k, v);
      });
    }

    let lastError: Error | undefined;
    let rotated = false;
    let sessionId: string | undefined;

    wireLoop: for (let candIdx = 0; candIdx < wireCandidates.length; candIdx++) {
      const activeWireId = wireCandidates[candIdx];
      // Envelope is built once per request so requestId/labels stay stable across
      // retries — the real client does not mint a new identity on retry.
      const envelope = buildEnvelope(geminiBody, {
        projectId,
        modelId: activeWireId,
        isAntigravity: true,
      });
      let envelopeJson = JSON.stringify(envelope);
      sessionId =
        typeof envelope.request?.sessionId === "string" ? envelope.request.sessionId : undefined;

      const headers = new Headers(baseHeaders);
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set("Content-Type", "application/json");
      headers.set("Accept", "text/event-stream");
      for (const [k, v] of Object.entries(getAntigravityHeaders(activeWireId))) {
        headers.set(k, v);
      }

      const hasMoreCandidates = candIdx < wireCandidates.length - 1;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new Error("Request was aborted");

      // Try the endpoint that last succeeded first; fall back to the static list.
      const lastGood = getLastGoodEndpoint();
      const endpoints = lastGood
        ? [lastGood, ...ENDPOINT_FALLBACKS.filter((e) => e !== lastGood)]
        : ENDPOINT_FALLBACKS;

      let endpointIndex = 0;
      while (endpointIndex < endpoints.length) {
        const endpoint = endpoints[endpointIndex];
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
            endpointIndex < endpoints.length - 1
          ) {
            endpointIndex++;
            lastError = new Error(`Antigravity ${response.status} at ${endpoint}`);
            continue;
          }

          if (response.status === 401 && attempt < MAX_RETRIES) {
            lastError = new Error("Antigravity 401 unauthorized — refreshing token");
            const refreshed = await deps.getAccessToken({ forceRefresh: true }).catch(() => null);
            if (refreshed) {
              accessToken = refreshed;
              headers.set("Authorization", `Bearer ${accessToken}`);
            }
            await sleep(200, signal);
            break;
          }

          if (response.status === 429) {
            const errText = await response.clone().text().catch(() => "");
            const reason = parseAntigravityRateLimitReason(errText);
            if (reason && deps.rotateAccount && !rotated) {
              const rotatedCreds = await deps.rotateAccount().catch(() => null);
              if (rotatedCreds) {
                rotated = true;
                accessToken = rotatedCreds.accessToken;
                projectId = rotatedCreds.projectId;
                envelope.project = projectId;
                envelopeJson = JSON.stringify(envelope);
                headers.set("Authorization", `Bearer ${accessToken}`);
                lastError = new Error(`Antigravity 429 ${reason} — rotated account`);
                break;
              }
            }
            if (attempt < MAX_RETRIES) {
              let delay = extractRetryDelay(errText, response) ?? BASE_DELAY_MS * 2 ** attempt;
              delay = Math.min(delay, MAX_RETRY_DELAY_MS);
              lastError = new Error(`Antigravity 429: ${errText.slice(0, 200)}`);
              await sleep(delay, signal);
              break;
            }
          }

          if (
            isRetryableStatus(response.status) &&
            response.status !== 429 &&
            attempt < MAX_RETRIES
          ) {
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
            if (response.status === 404 || response.status === 429) {
              const errBody = await response.clone().text().catch(() => "");
              // Free the pooled socket: the clone read leaves the original
              // body unconsumed on both the fallback and hint-return paths.
              void response.body?.cancel().catch(() => {});
              lastError = new Error(
                `Antigravity ${response.status} ${activeWireId}: ${errBody.slice(0, 200)}`,
              );
              if (hasMoreCandidates) continue wireLoop;
              if (response.status === 404 && /not found/i.test(errBody)) {
                // User-facing hint for removed/unavailable models. Plain text:
                // the body is no longer valid JSON once the hint is appended.
                const hintHeaders = new Headers(response.headers);
                hintHeaders.set("content-type", "text/plain; charset=utf-8");
                return new Response(
                  `${errBody}\n\nThis model is not available right now. Next: switch to gemini-3.8-flash, gemini-4-argon, claude-sonnet-5-5, gemini-3.5-flash-lite, or another working model.`,
                  {
                    status: response.status,
                    statusText: response.statusText,
                    headers: hintHeaders,
                  },
                );
              }
            }
            return response;
          }

          setLastGoodEndpoint(endpoint);

          const ct = response.headers.get("content-type") || "";
          const shouldCloak = process.env.OPENCODE_AGY_CLOAK_TOOLS === "1";
          if (stream && response.body && ct.includes("text/event-stream")) {
            // First-event watchdog: a stalled stream fails over like a hung request.
            const firstChunk = await readFirstSseChunk(
              response.body,
              FIRST_EVENT_WATCHDOG_MS,
              signal,
            );
            if (!firstChunk) {
              lastError = new Error(`Antigravity SSE first-event timeout at ${endpoint}`);
              if (endpointIndex < endpoints.length - 1) {
                endpointIndex++;
                continue;
              }
              if (attempt < MAX_RETRIES) {
                await sleep(BASE_DELAY_MS * 2 ** attempt, signal);
                break;
              }
              throw lastError;
            }
            let sseStream = unwrapSseResponseStream(
              prependChunk(firstChunk, response.body),
              {
                onResponseId: (responseId) => { if (sessionId) recordExecutionId(sessionId, responseId); },
                onThoughtSignature: (identifier, signature) => {
                  if (sessionId) recordThoughtSignature(sessionId, identifier, signature);
                },
              },
            );
            if (shouldCloak) {
              const transform = new TransformStream({
                transform(chunk, controller) {
                  const text = new TextDecoder().decode(chunk);
                  const uncloaked = text.replaceAll(`_ide"`, `"`);
                  controller.enqueue(new TextEncoder().encode(uncloaked));
                },
              });
              sseStream = sseStream.pipeThrough(transform);
            }
            return new Response(sseStream, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          }

          let text = await response.text();
          if (shouldCloak) {
            text = text.replaceAll(`_ide"`, `"`);
          }
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && parsed.response) {
              const responseId = (parsed.response as Record<string, unknown>)?.responseId;
              if (typeof responseId === "string" && responseId) {
                if (sessionId) recordExecutionId(sessionId, responseId);
              }
              // Extract thought signatures from non-streaming response candidates
              const candidateList = (parsed.response as Record<string, unknown>)?.candidates;
              if (sessionId && Array.isArray(candidateList)) {
                for (const cand of candidateList) {
                  const candObj = cand as Record<string, unknown> | undefined;
                  const content = candObj?.content as Record<string, unknown> | undefined;
                  const parts = content?.parts;
                  if (Array.isArray(parts)) {
                    for (const part of parts) {
                      const partObj = part as Record<string, unknown> | undefined;
                      const fc = partObj?.functionCall as Record<string, unknown> | undefined;
                      const sig = partObj?.thoughtSignature || fc?.thoughtSignature;
                      if (typeof sig === "string" && sig) {
                        if (typeof fc?.id === "string") recordThoughtSignature(sessionId, fc.id, sig);
                        if (typeof fc?.name === "string") recordThoughtSignature(sessionId, fc.name, sig);
                      }
                    }
                  }
                }
              }
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
          if (endpointIndex < endpoints.length - 1) {
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
    }
    throw lastError ?? new Error("Antigravity request failed on all endpoints");
  };
}
