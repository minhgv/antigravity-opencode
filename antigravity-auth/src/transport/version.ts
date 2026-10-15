/**
 * Antigravity client version tracking.
 *
 * The backend gates model access on the client version in the User-Agent, so a
 * stale pinned version is itself a fingerprint. The real client updates via
 * electron-builder; its update manifest is publicly readable and carries the
 * latest released version. Ported from oh-my-pi `packages/catalog/src/wire/gemini-headers.ts`.
 */

/** Pinned fallback when the update manifest is unreachable.
 *  Must be >= 2.23.0: daily-cloudcode-pa gates Gemini 4 Argon on client version. */
export const DEFAULT_ANTIGRAVITY_VERSION = "2.23.0";

/** Changelist appended to the hub User-Agent (not validated upstream; captured value stays). */
export const DEFAULT_ANTIGRAVITY_CL = "963137146";

const ANTIGRAVITY_VERSION_MANIFEST_URL =
  "https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/latest-arm64-mac.yml";
const ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS = 5_000;

let discoveredAntigravityVersion: string | null = null;
let antigravityVersionFetch: Promise<void> | null = null;

/** Current Antigravity client version: env override → manifest-discovered → pinned fallback. */
export function getAntigravityVersion(): string {
  return (
    process.env.PI_AI_ANTIGRAVITY_VERSION ||
    discoveredAntigravityVersion ||
    DEFAULT_ANTIGRAVITY_VERSION
  );
}

/**
 * Extracts the client version from an electron-builder update manifest.
 * Returns null when no well-formed `version:` line is present.
 */
export function parseAntigravityManifestVersion(yamlText: string): string | null {
  for (const line of yamlText.split(/\r?\n/)) {
    const match = /^\s*version\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    const version = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    return /^\d+\.\d+\.\d+$/.test(version) ? version : null;
  }
  return null;
}

/**
 * Resolves the latest Antigravity release from the official update manifest.
 * Success is cached for the process lifetime; failures are silent (the pinned
 * fallback stays valid) and clear the in-flight cache so a later call retries.
 * Skipped entirely when PI_AI_ANTIGRAVITY_VERSION is set.
 */
export function ensureAntigravityVersion(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<void> {
  if (process.env.PI_AI_ANTIGRAVITY_VERSION || discoveredAntigravityVersion) {
    return Promise.resolve();
  }
  if (antigravityVersionFetch) return antigravityVersionFetch;

  antigravityVersionFetch = (async () => {
    try {
      const timeoutSignal = AbortSignal.timeout(ANTIGRAVITY_VERSION_FETCH_TIMEOUT_MS);
      const response = await fetcher(ANTIGRAVITY_VERSION_MANIFEST_URL, {
        headers: { "Cache-Control": "no-cache", "User-Agent": "electron-builder" },
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      });
      if (response.ok) {
        discoveredAntigravityVersion = parseAntigravityManifestVersion(await response.text());
      }
    } catch {
      // Silent: the pinned fallback remains valid when version discovery fails.
    } finally {
      if (!discoveredAntigravityVersion) antigravityVersionFetch = null;
    }
  })();
  return antigravityVersionFetch;
}
