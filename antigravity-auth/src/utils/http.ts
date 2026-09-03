/**
 * High-performance HTTP client with Undici keep-alive connection pool & TLS prewarming.
 * Eliminates 150-300ms TLS handshake latency on interactive turns.
 */

const KEEP_ALIVE_TIMEOUT_MS = 60_000;
const KEEP_ALIVE_MAX_TIMEOUT_MS = 5 * 60_000;
const CONNECT_TIMEOUT_MS = 10_000;
const PREWARM_TIMEOUT_MS = 3_000;

type DispatcherInit = RequestInit & { dispatcher?: unknown };

let activeAgent: any | undefined;
let dispatcherPromise: Promise<any | undefined> | undefined;

function hasProxyConfiguration(): boolean {
  return ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"].some(
    (name) => Boolean(process.env[name]?.trim()),
  );
}

export async function getDispatcher(): Promise<any | undefined> {
  dispatcherPromise ??= (async () => {
    if (process.env.OPENCODE_AGY_NO_KEEPALIVE === "1" || hasProxyConfiguration()) {
      return undefined;
    }
    const nodeMajor = Number(process.versions.node?.split(".")[0]);
    if (!Number.isNaN(nodeMajor) && nodeMajor >= 22) {
      // Node 22+ built-in fetch has improved pooling, but Undici agent still provides fine-grained control
    }
    try {
      // Dynamic import to allow optional undici or pre-bundled environments
      // @ts-ignore
      const undiciModule: any = await import("undici").catch(() => null);
      if (undiciModule?.Agent) {
        activeAgent = new undiciModule.Agent({
          keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
          keepAliveMaxTimeout: KEEP_ALIVE_MAX_TIMEOUT_MS,
          connections: 8,
          connect: { timeout: CONNECT_TIMEOUT_MS },
          allowH2: process.env.OPENCODE_AGY_HTTP2 === "1",
        });
        return activeAgent;
      }
    } catch {
      // Fallback to standard global fetch
    }
    return undefined;
  })();
  return dispatcherPromise;
}

/** Close dispatcher on process exit or explicit cleanup */
export async function closeDispatcher(): Promise<void> {
  if (activeAgent) {
    try {
      await activeAgent.destroy();
    } catch {
      // ignore
    }
    activeAgent = undefined;
    dispatcherPromise = undefined;
  }
}

if (typeof process !== "undefined" && process.on) {
  process.on("exit", () => {
    if (activeAgent) {
      try {
        activeAgent.destroy();
      } catch {}
    }
  });
}

/** fetch() bound to keep-alive connection pool when available */
export async function antigravityFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const dispatcher = await getDispatcher();
  if (!dispatcher) return fetch(input, init);
  return fetch(input, { ...init, dispatcher } as DispatcherInit);
}

/**
 * Open TLS connection in background so the first message does not pay the handshake.
 */
export function prewarmConnection(url: string): void {
  if (process.env.OPENCODE_AGY_NO_PREWARM === "1") return;
  void (async () => {
    try {
      const res = await antigravityFetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(PREWARM_TIMEOUT_MS),
      });
      await res.arrayBuffer();
    } catch {
      // Warm-up only; real request connects on demand
    }
  })();
}
