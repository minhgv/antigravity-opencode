/**
 * OpenCode plugin: Google Antigravity OAuth + custom fetch for Gemini via Cloud Code Assist.
 *
 * Architecture C:
 * - AuthHook provider id: google-antigravity
 * - loader returns { apiKey: OAUTH_DUMMY_KEY, fetch: antigravityFetch }
 * - Provider config uses npm: @ai-sdk/google so tool calls stay Gemini-native
 *
 * Install: copy this directory to ~/.config/opencode/plugins/antigravity-auth/
 * and register in opencode.json plugin array + provider block.
 */

import { loginAntigravity, refreshAccessToken, toExpires, discoverProject } from "./oauth.js";
import { createAntigravityFetch } from "./transport.js";
import { readMeta, writeMeta } from "./store.js";

const PROVIDER_ID = "google-antigravity";
// OpenCode uses this dummy key for OAuth providers that supply custom fetch
const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key";

/**
 * OpenCode plugin entry (default export) — matches caveman / official plugins.
 * @type {import('@opencode-ai/plugin').Plugin}
 */
export default async function GoogleAntigravityAuthPlugin(ctx) {
  const { client } = ctx;

  // Single-flight refresh so parallel tool/stream requests don't stampede token endpoint
  let refreshInFlight = null;

  async function ensureFreshAuth(getAuth) {
    const auth = await getAuth();
    if (!auth || auth.type !== "oauth") return null;

    let access = auth.access;
    let refresh = auth.refresh;
    let expires = auth.expires;

    if (!access || !refresh) return null;

    if (!expires || expires < Date.now()) {
      if (!refreshInFlight) {
        refreshInFlight = (async () => {
          try {
            const json = await refreshAccessToken(refresh);
            const nextAccess = json.access_token;
            const nextRefresh = json.refresh_token || refresh;
            const nextExpires = toExpires(json.expires_in ?? 3600);
            await client.auth.set({
              path: { id: PROVIDER_ID },
              body: {
                type: "oauth",
                access: nextAccess,
                refresh: nextRefresh,
                expires: nextExpires,
                accountId: auth.accountId,
                enterpriseUrl: auth.enterpriseUrl,
              },
            });
            return {
              access: nextAccess,
              refresh: nextRefresh,
              expires: nextExpires,
            };
          } finally {
            refreshInFlight = null;
          }
        })();
      }
      const refreshed = await refreshInFlight;
      access = refreshed.access;
      refresh = refreshed.refresh;
      expires = refreshed.expires;
    }

    // projectId: sidecar first (0600), then accountId backup from login
    const meta = readMeta();
    let projectId = meta.projectId || auth.accountId;
    if (!projectId) {
      projectId = await discoverProject(access);
      writeMeta({ projectId, email: meta.email });
    } else if (!meta.projectId) {
      writeMeta({ projectId, email: meta.email });
    }

    return { access, refresh, expires, projectId, email: meta.email };
  }

  return {
    auth: {
      provider: PROVIDER_ID,
      /**
       * OpenCode 1.14.40 merges loader return into provider.options and passes
       * them to createGoogleGenerativeAI({ apiKey, fetch, ... }).
       * See packages/opencode/src/provider/provider.ts (auth.loader → mergeProvider → resolveSDK).
       */
      async loader(getAuth) {
        const fresh = await ensureFreshAuth(getAuth);
        if (!fresh) return {};

        const fetchImpl = createAntigravityFetch({
          getAccessToken: async () => {
            const again = await ensureFreshAuth(getAuth);
            if (!again?.access) throw new Error("Antigravity access token missing");
            return again.access;
          },
          getProjectId: async () => {
            const again = await ensureFreshAuth(getAuth);
            if (!again?.projectId) throw new Error("Antigravity projectId missing");
            return again.projectId;
          },
        });

        return {
          apiKey: OAUTH_DUMMY_KEY,
          fetch: fetchImpl,
        };
      },
      methods: [
        {
          type: "oauth",
          label: "Google Antigravity (browser)",
          async authorize() {
            const flow = await loginAntigravity();
            const originalCallback = flow.callback;
            return {
              url: flow.url,
              instructions: flow.instructions,
              method: "auto",
              callback: async () => {
                const result = await originalCallback();
                if (result.type === "success") {
                  // MUST write sidecar BEFORE returning success so OpenCode
                  // never needs unknown OAuth fields (_projectId is stripped).
                  const projectId = result._projectId || result.accountId;
                  if (projectId) {
                    writeMeta({
                      projectId,
                      email: result._email,
                    });
                  }
                  return {
                    type: "success",
                    access: result.access,
                    refresh: result.refresh,
                    expires: result.expires,
                    // backup if sidecar missing later
                    accountId: projectId,
                    enterpriseUrl: result.enterpriseUrl,
                  };
                }
                return result;
              },
            };
          },
        },
      ],
    },
  };
}
