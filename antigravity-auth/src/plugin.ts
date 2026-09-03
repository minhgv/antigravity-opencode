/**
 * OpenCode Plugin: Google Antigravity Native Integration.
 * Dual provider support: 'google-antigravity' (primary) and 'antigravity' (alias).
 *
 * Architecture:
 * - AuthHook provider id: 'google-antigravity' & 'antigravity'
 * - loader returns { apiKey: OAUTH_DUMMY_KEY, fetch: antigravityFetch }
 * - Uses @ai-sdk/google provider npm package so tool calls stay Gemini-native
 * - Undici connection pooling & TLS prewarming
 * - Schema dereferencing and thinkingConfig normalization
 */
import {
  loginAntigravity,
  refreshAccessToken,
  toExpires,
  discoverProject,
  readMeta,
  writeMeta,
  DEFAULT_PROJECT_ID,
  OAUTH_DUMMY_KEY,
} from "./auth/index.js";
import { createAntigravityFetch } from "./transport/index.js";
import type {
  OpenCodePluginContext,
  OAuthCredentials,
  OpenCodeAuthHook,
} from "./types/index.js";

const PRIMARY_PROVIDER_ID = "google-antigravity";
const ALIAS_PROVIDER_ID = "antigravity";

/**
 * Creates an OpenCode AuthHook for the given provider ID.
 */
function createAuthHook(
  providerId: string,
  ctx?: OpenCodePluginContext,
): OpenCodeAuthHook {
  const { client } = ctx || {};
  let refreshInFlight: Promise<OAuthCredentials | null> | null = null;

  async function ensureFreshAuth(
    getAuth: () => Promise<OAuthCredentials | null>,
    forceRefresh = false,
  ): Promise<{ access: string; refresh: string; expires?: number } | null> {
    const auth = await getAuth();
    if (!auth || auth.type !== "oauth") return null;

    const access = auth.access;
    const refresh = auth.refresh;
    const expires = auth.expires;

    if (!access || !refresh) return null;

    if (forceRefresh || !expires || expires < Date.now()) {
      if (!refreshInFlight) {
        refreshInFlight = (async () => {
          try {
            const json = await refreshAccessToken(refresh);
            const nextAccess = json.access_token;
            const nextRefresh = json.refresh_token || refresh;
            const nextExpires = toExpires(json.expires_in ?? 3600);
            if (client?.auth?.set) {
              await client.auth.set({
                path: { id: providerId },
                body: {
                  type: "oauth",
                  access: nextAccess,
                  refresh: nextRefresh,
                  expires: nextExpires,
                  accountId: auth.accountId,
                  enterpriseUrl: auth.enterpriseUrl,
                },
              });
            }
            return {
              type: "oauth" as const,
              access: nextAccess,
              refresh: nextRefresh,
              expires: nextExpires,
              accountId: auth.accountId,
              enterpriseUrl: auth.enterpriseUrl,
            };
          } catch (err: any) {
            console.error(`[antigravity-auth] Token refresh failed for ${providerId}:`, err?.message || err);
            return null;
          } finally {
            refreshInFlight = null;
          }
        })();
      }
      return refreshInFlight;
    }
    return { access, refresh, expires };
  }

  return {
    provider: providerId,
    async loader(getAuth: () => Promise<OAuthCredentials | null>) {
      const customFetch = createAntigravityFetch({
        async getAccessToken(opts?: { forceRefresh?: boolean }) {
          const fresh = await ensureFreshAuth(getAuth, opts?.forceRefresh);
          if (!fresh?.access) throw new Error("Antigravity access token missing");
          return fresh.access;
        },
        async getProjectId() {
          const auth = await getAuth();
          const meta = readMeta();
          let projectId = meta.projectId || auth?.accountId;
          if (!projectId && auth?.access) {
            projectId = (await discoverProject(auth.access)) || undefined;
            if (projectId) {
              writeMeta({ projectId });
            }
          }
          return projectId || DEFAULT_PROJECT_ID;
        },
      });

      return {
        apiKey: OAUTH_DUMMY_KEY,
        fetch: customFetch as any,
      };
    },
    methods: [
      {
        type: "oauth",
        label: `Google Antigravity (${providerId === PRIMARY_PROVIDER_ID ? "browser" : "alias"})`,
        async authorize() {
          const result = await loginAntigravity();
          return {
            url: result.url,
            instructions: result.instructions,
            method: result.method,
            callback: async () => {
              const res = await result.callback();
              if (res.type === "success") {
                const projectId = res._projectId || res.accountId;
                if (projectId) {
                  writeMeta({
                    projectId,
                    email: res._email,
                  });
                }
                return {
                  type: "success" as const,
                  access: res.access,
                  refresh: res.refresh,
                  expires: res.expires,
                  accountId: projectId,
                  enterpriseUrl: res.enterpriseUrl,
                };
              }
              return res;
            },
          };
        },
      },
    ],
  };
}

/**
 * OpenCode primary plugin entry (google-antigravity).
 */
export async function GoogleAntigravityAuthPlugin(
  ctx?: OpenCodePluginContext,
) {
  return {
    auth: createAuthHook(PRIMARY_PROVIDER_ID, ctx),
  };
}

/**
 * OpenCode alias plugin entry (antigravity).
 */
export async function AntigravityAliasAuthPlugin(
  ctx?: OpenCodePluginContext,
) {
  return {
    auth: createAuthHook(ALIAS_PROVIDER_ID, ctx),
  };
}

export default GoogleAntigravityAuthPlugin;
