/**
 * Sidecar store for Antigravity projectId / email.
 * OpenCode OAuth auth schema only supports: access, refresh, expires, accountId, enterpriseUrl.
 */
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export function metaPath(configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")) {
  return join(configHome, "opencode", "google-antigravity-meta.json");
}

/**
 * @returns {{ projectId?: string, email?: string, updatedAt?: number }}
 */
export function readMeta(path = metaPath()) {
  try {
    if (!existsSync(path)) return {};
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * @param {{ projectId?: string, email?: string }} patch
 */
export function writeMeta(patch, path = metaPath()) {
  const prev = readMeta(path);
  const next = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf8");
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
  return next;
}
