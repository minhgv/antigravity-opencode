/**
 * Sidecar store for Antigravity projectId / email.
 * OpenCode OAuth auth schema only supports: access, refresh, expires, accountId, enterpriseUrl.
 */
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_PROJECT_ID } from "./constants.js";
import { refreshAccessToken, toExpires } from "./pkce.js";
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

export function getAuthCredentialsFor(providerId: string): {
  access: string;
  refresh: string;
  expires?: number;
  accountId?: string;
  enterpriseUrl?: string;
} | null {
  const authPath = join(homedir(), ".local", "share", "opencode", "auth.json");
  if (!existsSync(authPath)) return null;
  try {
    const data = JSON.parse(readFileSync(authPath, "utf8"));
    const entry = data[providerId];
    if (entry && entry.access && entry.refresh) return entry;
  } catch {
    return null;
  }
  return null;
}

export function getStoredAuthCredentials(): {
  access: string;
  refresh: string;
  expires?: number;
  accountId?: string;
} | null {
  return (
    getAuthCredentialsFor("google-antigravity") ?? getAuthCredentialsFor("antigravity")
  );
}

/**
 * OpenCode 2 stores OAuth credentials as JSON rows inside
 * `~/.local/share/opencode/opencode.db` (table `credential`). Used as a
 * fallback for CLI tools (quota.js / image.js) when auth.json has no entry.
 */
async function resolveDbStoredAccessToken(): Promise<{ access: string; projectId: string } | null> {
  const dbFile = join(homedir(), ".local", "share", "opencode", "opencode.db");
  if (!existsSync(dbFile)) return null;
  type Row = { value: string; active: number | null };
  let rows: Row[];
  try {
    // runtime-conditional: bun:sqlite exists only under Bun
    const bunSqlite = await import("bun:sqlite" as string).catch(() => null);
    if (bunSqlite) {
      const db = new bunSqlite.Database(dbFile, { readonly: true });
      try {
        rows = db
          .query(
            `select value, active from credential where integration_id in ('google-antigravity','antigravity') order by active desc, time_created asc`,
          )
          .all() as Row[];
      } finally {
        db.close();
      }
    } else {
      const nodeSqlite = await import("node:sqlite" as string).catch(() => null);
      if (!nodeSqlite) return null;
      const db = new nodeSqlite.DatabaseSync(dbFile, { readonly: true });
      try {
        rows = db
          .prepare(
            `select value, active from credential where integration_id in ('google-antigravity','antigravity') order by active desc, time_created asc`,
          )
          .all() as Row[];
      } finally {
        db.close();
      }
    }
  } catch {
    return null;
  }
  for (const row of rows) {
    try {
      const value = JSON.parse(row.value);
      if (value?.type === "oauth" && value.access) {
        let access = value.access as string;
        if (value.expires && value.expires < Date.now() + 60_000 && value.refresh) {
          try {
            const refreshed = await refreshAccessToken(value.refresh);
            access = refreshed.access_token;
          } catch {
            // keep stale access; backend may still accept it briefly
          }
        }
        const projectId =
          (typeof value.metadata?.projectId === "string" && value.metadata.projectId) ||
          readMeta().projectId ||
          DEFAULT_PROJECT_ID;
        return { access, projectId };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveStoredAccessToken(): Promise<{ access: string; projectId: string } | null> {
  const creds = getStoredAuthCredentials();
  if (!creds) return resolveDbStoredAccessToken();

  let access = creds.access;
  if (creds.expires && creds.expires < Date.now() + 60_000 && creds.refresh) {
    try {
      const refreshed = await refreshAccessToken(creds.refresh);
      access = refreshed.access_token;
      creds.access = access;
      if (refreshed.refresh_token) creds.refresh = refreshed.refresh_token;
      creds.expires = toExpires(refreshed.expires_in ?? 3600);
      const authPath = join(homedir(), ".local", "share", "opencode", "auth.json");
      if (existsSync(authPath)) {
        const fullAuth = JSON.parse(readFileSync(authPath, "utf8"));
        if (fullAuth["google-antigravity"]) fullAuth["google-antigravity"] = creds;
        if (fullAuth["antigravity"]) fullAuth["antigravity"] = creds;
        writeFileSync(authPath, JSON.stringify(fullAuth, null, 2));
      }
    } catch {
      // fallback to existing
    }
  }

  const meta = readMeta();
  const projectId = meta.projectId || creds.accountId || DEFAULT_PROJECT_ID;
  return { access, projectId };
}
