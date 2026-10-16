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
  resolveStoredAccessToken,
  getAuthCredentialsFor,
  DEFAULT_PROJECT_ID,
  OAUTH_DUMMY_KEY,
} from "./auth/index.js";
import { createAntigravityFetch } from "./transport/index.js";
import { generateAntigravityImage } from "./image/index.js";
import { fetchFullQuotaReport, formatQuotaReport } from "./quota/index.js";
// Static import: resolved at build time here, at runtime inside the V1 host
// (opencode provides @opencode-ai/plugin in its plugin sandbox).
import { tool } from "@opencode-ai/plugin";
import type {
  OpenCodePluginContext,
  OAuthCredentials,
  OpenCodeAuthHook,
} from "./types/index.js";

const PRIMARY_PROVIDER_ID = "google-antigravity";
const ALIAS_PROVIDER_ID = "antigravity";

/**
 * Creates OpenCode tool definition for checking Antigravity Quota.
 */
export async function createCheckQuotaTool() {
  // V1 host requires the official `tool()` helper with zod args — plain
  // JSON-schema `args` objects crash its schema walker (`n._zod.def`).
  return tool({
    description:
      "Check Google Antigravity remaining quota, shared token pools (Gemini Models, Claude & GPT Models), remaining percentage, and reset time.",
    args: {
      showModels: tool.schema.boolean().optional().describe(
        "Whether to list individual model quota rows in addition to shared pools (default: false).",
      ),
    },
    async execute(args?: { showModels?: boolean }) {
      const auth = await resolveStoredAccessToken();
      if (!auth?.access) {
        throw new Error("No Google Antigravity credentials found. Please run 'opencode auth login' first.");
      }
      const report = await fetchFullQuotaReport(auth.access, auth.projectId);
      const text = formatQuotaReport(report, { showModels: args?.showModels });
      return {
        title: "Antigravity Quota Status",
        output: text,
        metadata: {
          projectId: report.projectId,
          endpoint: report.endpoint,
          groupsCount: report.groups.length,
          fetchedAt: report.fetchedAt,
        },
      };
    },
  });
}

/**
 * Creates OpenCode tool definition for Gemini Image Generation.
 */
export async function createGenerateImageTool() {
  return tool({
    description:
      "Generate high-quality images using Gemini Image models via Google Antigravity (gemini-3-pro-image, gemini-3.1-flash-image). Automatically saves the image file to the workspace.",
    args: {
      prompt: tool.schema.string().describe(
        "Detailed visual description of the image to generate.",
      ),
      aspectRatio: tool.schema.string().optional().describe(
        "Aspect ratio: '1:1' (default), '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '4:5', '5:4', '21:9'.",
      ),
      path: tool.schema.string().optional().describe(
        "Optional project-relative file or directory path to save the image (e.g. 'assets/hero.png').",
      ),
      model: tool.schema.string().optional().describe(
        "Optional image model: 'gemini-3-pro-image' (default) or 'gemini-3.1-flash-image'.",
      ),
    },
    async execute(args: { prompt: string; aspectRatio?: string; path?: string; model?: string }, context?: any) {
      const auth = await resolveStoredAccessToken();
      if (!auth?.access) {
        throw new Error(
          "No Google Antigravity credentials found. Please run 'opencode auth login' first.",
        );
      }
      const cwd = context?.directory || process.cwd();
      const result = await generateAntigravityImage({
        prompt: args.prompt,
        accessToken: auth.access,
        projectId: auth.projectId,
        cwd,
        aspectRatio: args.aspectRatio,
        model: args.model,
        path: args.path,
        signal: context?.abort,
      });

      return {
        title: "Image Generated",
        output: `Successfully generated image (${result.model}). Saved to: ${result.savedPaths.join(", ")}`,
        metadata: {
          savedPaths: result.savedPaths,
          model: result.model,
        },
      };
    },
  });
}

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
        async rotateAccount() {
          // Sibling account = the other Antigravity provider id in auth.json
          // (google-antigravity <-> antigravity). Only rotate when it holds a
          // distinct Google account (different refresh token).
          const siblingId =
            providerId === PRIMARY_PROVIDER_ID ? ALIAS_PROVIDER_ID : PRIMARY_PROVIDER_ID;
          const current = await getAuth();
          const sibling = getAuthCredentialsFor(siblingId);
          if (!sibling?.refresh || sibling.refresh === current?.refresh) return null;

          let access = sibling.access;
          if (sibling.expires && sibling.expires < Date.now() + 60_000) {
            try {
              const json = await refreshAccessToken(sibling.refresh);
              access = json.access_token;
              if (client?.auth?.set) {
                await client.auth.set({
                  path: { id: siblingId },
                  body: {
                    type: "oauth",
                    access,
                    refresh: json.refresh_token || sibling.refresh,
                    expires: toExpires(json.expires_in ?? 3600),
                    accountId: sibling.accountId,
                    enterpriseUrl: sibling.enterpriseUrl,
                  },
                });
              }
            } catch {
              return null;
            }
          }

          const projectId = sibling.accountId
            ? sibling.accountId
            : ((await discoverProject(access).catch(() => "")) || DEFAULT_PROJECT_ID);
          return { accessToken: access, projectId };
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
    tool: {
      generate_image: await createGenerateImageTool(),
      check_quota: await createCheckQuotaTool(),
    },
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
    tool: {
      generate_image: await createGenerateImageTool(),
      check_quota: await createCheckQuotaTool(),
    },
  };
}

export default GoogleAntigravityAuthPlugin;
