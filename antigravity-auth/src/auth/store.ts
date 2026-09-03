/**
 * Sidecar store for Antigravity projectId / email.
 * OpenCode OAuth auth schema only supports: access, refresh, expires, accountId, enterpriseUrl.
 */
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AuthMeta } from "../types/index.js";

export function metaPath(
  configHome: string = process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
): string {
  return join(configHome, "opencode", "google-antigravity-meta.json");
}

export function readMeta(path: string = metaPath()): AuthMeta {
  try {
    if (!existsSync(path)) return {};
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function writeMeta(
  patch: { projectId?: string; email?: string },
  path: string = metaPath(),
): AuthMeta {
  const prev = readMeta(path);
  const next: AuthMeta = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
  return next;
}
