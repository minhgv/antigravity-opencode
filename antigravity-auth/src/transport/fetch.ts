/**
 * Custom fetch interceptor for Google Antigravity OpenCode plugin.
 * Wraps @ai-sdk/google HTTP calls, routes to Cloud Code Assist endpoints,
 * handles token auto-refresh, exponential backoff, and SSE unwrapping.
 */
import { ENDPOINT_FALLBACKS, DEFAULT_ENDPOINT } from "../auth/constants.js";
import { resolveWireModelId } from "../models/aliases.js";
import { extractRetryDelay } from "../utils/retry.js";
import { antigravityFetch, prewarmConnection } from "../utils/http.js";
import { buildEnvelope, getAntigravityHeaders } from "./envelope.js";
import { unwrapSseResponseStream } from "./stream.js";
import type { AntigravityFetchDeps } from "../types/index.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;

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

export function createAntigravityFetch(deps: AntigravityFetchDeps) {
  // Prewarm TLS connection to default endpoint in background
  prewarmConnection(DEFAULT_ENDPOINT);

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

    let lastError: Error | undefined;
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
      const rawHeaders =
        init.headers || (typeof input === "object" && input !== null ? (input as any).headers : undefined);
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
      for (const [k, v] of Object.entries(getAntigravityHeaders(wireModelId))) {
        headers.set(k, v);
      }

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
