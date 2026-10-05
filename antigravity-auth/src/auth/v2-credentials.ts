/**
 * OpenCode 2.x credential plumbing for Google Antigravity.
 *
 * V2 stores OAuth credentials as rows in the `credential` table of
 * `~/.local/share/opencode/opencode.db` (drizzle/sqlite). The plugin resolves
 * tokens through `ctx.integration.connection` and performs sibling-account
 * rotation by flipping the `active` flag directly in that table.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PROJECT_ID } from "./constants.js";
import { discoverProject } from "./account.js";
import { refreshAccessToken, toExpires } from "./pkce.js";
import { readMeta, writeMeta } from "./store.js";

export const PRIMARY_PROVIDER_ID = "google-antigravity";
export const ALIAS_PROVIDER_ID = "antigravity";

/** Minimal structural type for ctx.integration.connection. */
export interface IntegrationConnectionApi {
  active(integrationID: string): Promise<ConnectionInfoLike | undefined>;
  resolve(connection: ConnectionInfoLike): Promise<CredentialValueLike | undefined>;
}

export interface ConnectionInfoLike {
  type: "credential" | "env";
  id?: string;
  name?: string;
  label?: string;
}

export interface CredentialValueLike {
  type: "oauth" | "key";
  methodID?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  key?: string;
  metadata?: Record<string, unknown>;
}

/** Loose structural type for the promise-based PluginContext we consume. */
export interface V2PluginContextLike {
  integration: {
    connection: IntegrationConnectionApi;
  };
  location?: { directory?: string };
}

type SqliteDatabase = {
  query(sql: string): {
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
};

interface BunSqliteDatabaseCtor {
  new (file: string, options: { readonly: boolean }): SqliteDatabase;
}

async function openDb(readonly = true): Promise<SqliteDatabase | null> {
  const file = join(homedir(), ".local", "share", "opencode", "opencode.db");
  if (!existsSync(file)) return null;
  try {
    // bun:sqlite exists only inside the opencode (Bun) process — runtime-conditional import.
    const bunSqlite: { Database: BunSqliteDatabaseCtor } = await import("bun:sqlite" as string);
    return new bunSqlite.Database(file, { readonly });
  } catch {
    // Node >= 22.5 (opencode CLI runs on Bun; quota.js/image.js may run on Node)
    try {
      const nodeSqlite: { DatabaseSync: new (file: string, options: { readonly: boolean }) => {
        prepare(sql: string): { all(...p: unknown[]): Record<string, unknown>[]; run(...p: unknown[]): unknown };
        close(): void;
      } } = await import("node:sqlite" as string);
      const raw = new nodeSqlite.DatabaseSync(file, { readonly });
      return {
        query: (sql: string) => {
          const stmt = raw.prepare(sql);
          return {
            all: (...params: unknown[]) => stmt.all(...params) as Record<string, unknown>[],
            run: (...params: unknown[]) => stmt.run(...params),
          };
        },
        close: () => raw.close(),
      };
    } catch {
      return null;
    }
  }
}

export interface StoredCredentialRow {
  id: string;
  integration_id: string;
  label: string;
  active: number | null;
  value: CredentialValueLike & { type: string };
}

/** Read all antigravity credentials straight from opencode.db. */
export async function readDbCredentials(): Promise<StoredCredentialRow[]> {
  const db = await openDb(true);
  if (!db) return [];
  try {
    const rows = db
      .query(
        `select id, integration_id, label, active, value from credential
         where integration_id in (?, ?) order by time_created asc`,
      )
      .all(PRIMARY_PROVIDER_ID, ALIAS_PROVIDER_ID);
    return rows
      .map((row) => ({
        id: String(row.id),
        integration_id: String(row.integration_id),
        label: String(row.label ?? ""),
        active: row.active === null || row.active === undefined ? null : Number(row.active),
        value:
          typeof row.value === "string"
            ? (JSON.parse(row.value) as StoredCredentialRow["value"])
            : (row.value as StoredCredentialRow["value"]),
      }))
      .filter((row) => row.value && row.value.type === "oauth");
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Resolves the active OAuth credential for a provider integration via the
 * plugin context. `connection.resolve` already refreshes expired tokens.
 */
export async function resolveV2Credential(
  ctx: V2PluginContextLike,
  providerID: string,
): Promise<CredentialValueLike | null> {
  try {
    // The alias provider may have no dedicated credential row yet — the user
    // logs in once on `google-antigravity` and both providers share the
    // account. Falls back to the sibling integration, mirroring the v1
    // auth.json lookup order.
    const ids =
      providerID === ALIAS_PROVIDER_ID
        ? [ALIAS_PROVIDER_ID, PRIMARY_PROVIDER_ID]
        : [PRIMARY_PROVIDER_ID, ALIAS_PROVIDER_ID];
    for (const id of ids) {
      const connection = await ctx.integration.connection.active(id);
      if (!connection) continue;
      const value = await ctx.integration.connection.resolve(connection);
      if (value && value.type === "oauth" && value.access) return value;
    }
    return null;
  } catch {
    return null;
  }
}

/** projectId lookup order: credential metadata → sidecar meta → discover. */
export async function resolveProjectId(
  ctx: V2PluginContextLike,
  providerID: string,
  credential?: CredentialValueLike | null,
): Promise<string> {
  const meta = readMeta();
  const fromCredential =
    credential?.metadata?.projectId ?? credential?.metadata?.accountId;
  let projectId = (typeof fromCredential === "string" && fromCredential) || meta.projectId;
  if (!projectId) {
    const cred = credential ?? (await resolveV2Credential(ctx, providerID));
    if (cred?.access) {
      projectId = await discoverProject(cred.access).catch(() => "");
      if (projectId) writeMeta({ projectId });
    }
  }
  return projectId || DEFAULT_PROJECT_ID;
}

/**
 * Rotate to a sibling Antigravity credential inside opencode.db.
 *
 * V2 keeps every Google account as a credential row bound to an integration id;
 * the provider only consumes the active one. Rotation flips `active` so the
 * sibling row wins subsequent `connection.active` lookups and returns fresh
 * token material for the in-flight request.
 */
export async function rotateV2Account(
  ctx: V2PluginContextLike,
  providerID: string,
): Promise<{ accessToken: string; projectId: string } | null> {
  try {
    const current = await ctx.integration.connection.active(providerID);
    const currentValue = current ? await ctx.integration.connection.resolve(current) : undefined;

    const db = await openDb(false);
    if (!db) return null;
    try {
      const siblingIntegration =
        providerID === PRIMARY_PROVIDER_ID ? ALIAS_PROVIDER_ID : PRIMARY_PROVIDER_ID;
      const rows = db
        .query(
          `select id, integration_id, label, active, value from credential
           where integration_id in (?, ?) order by time_created asc`,
        )
        .all(providerID, siblingIntegration);

      const parsed = rows
        .map((row) => ({
          id: String(row.id),
          integration_id: String(row.integration_id),
          active: row.active === null || row.active === undefined ? null : Number(row.active),
          value:
            typeof row.value === "string"
              ? (JSON.parse(row.value) as CredentialValueLike)
              : (row.value as CredentialValueLike),
        }))
        .filter((row) => row.value?.type === "oauth" && row.value.refresh);

      const sibling = parsed.find(
        (row) =>
          row.id !== current?.id &&
          row.value.refresh &&
          row.value.refresh !== currentValue?.refresh,
      );
      if (!sibling) return null;

      // Refresh sibling token if stale before handing it to the transport.
      let value = { ...sibling.value };
      if (value.expires !== undefined && value.expires < Date.now() + 60_000 && value.refresh) {
        try {
          const json = await refreshAccessToken(value.refresh);
          value = {
            ...value,
            access: json.access_token,
            refresh: json.refresh_token || value.refresh,
            expires: toExpires(json.expires_in ?? 3600),
          };
          db.query(`update credential set value = ? where id = ?`).run(
            JSON.stringify(value),
            sibling.id,
          );
        } catch {
          return null;
        }
      }
      // Borrow the sibling token for this request only — mirroring the v1
      // behavior where the sibling auth.json entry is read but the user's
      // active-account selection stays untouched.

      const projectId =
        (typeof value.metadata?.projectId === "string" && value.metadata.projectId) ||
        (await discoverProject(value.access as string).catch(() => "")) ||
        DEFAULT_PROJECT_ID;
      return { accessToken: value.access as string, projectId };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
