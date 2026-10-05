/**
 * OpenCode 2.x plugin: Google Antigravity Native Integration.
 *
 * V2 runtime contract (verified against opencode 2.0.22):
 * - default export `{ id, setup(ctx) }` from a directory listed in the
 *   `plugins` config key.
 * - `ctx.integration.transform` registers OAuth methods; credentials land in
 *   `opencode.db` and `connection.resolve` auto-refreshes expired tokens.
 * - `ctx.provider.transform` registers providers + model catalog;
 *   `package: "aisdk:@ai-sdk/google"` routes construction through the AI SDK.
 * - `ctx.aisdk.hook("sdk", cb)` injects the custom transport `fetch` into the
 *   SDK factory options; the runtime builds `aisdk:@ai-sdk/google` itself.
 * - `ctx.tool.transform` registers custom tools (JSON-Schema input).
 */
import {
  loginAntigravity,
  refreshAccessToken,
  toExpires,
  writeMeta,
  OAUTH_DUMMY_KEY,
} from "./auth/index.js";
import {
  PRIMARY_PROVIDER_ID,
  ALIAS_PROVIDER_ID,
  resolveV2Credential,
  resolveProjectId,
  rotateV2Account,
  type V2PluginContextLike,
  type CredentialValueLike,
} from "./auth/v2-credentials.js";
import { createAntigravityFetch } from "./transport/index.js";
import { ANTIGRAVITY_MODEL_CATALOG } from "./models/index.js";
import { generateAntigravityImage } from "./image/index.js";
import { fetchFullQuotaReport, formatQuotaReport } from "./quota/index.js";
import type { ModelCatalogEntry } from "./types/index.js";
import { resolveStoredAccessToken } from "./auth/store.js";

const PROVIDER_IDS = [PRIMARY_PROVIDER_ID, ALIAS_PROVIDER_ID] as const;
const PROVIDER_NAMES: Record<string, string> = {
  [PRIMARY_PROVIDER_ID]: "Google Antigravity",
  [ALIAS_PROVIDER_ID]: "Antigravity",
};

interface OAuthCredential {
  type: "oauth";
  methodID: string;
  refresh: string;
  access: string;
  expires: number;
  metadata: Record<string, unknown>;
}

interface IntegrationRefEditor {
  name?: string;
  metadata?: Record<string, unknown>;
}

interface IntegrationEditor {
  update(id: string, update: (integration: IntegrationRefEditor) => void): void;
  method: {
    update(input: unknown): void;
  };
}

interface ProviderRecordLike {
  provider: { id: string };
}

interface ProviderEditor {
  get(providerID: string): ProviderRecordLike | undefined;
  add(input: { info: Record<string, unknown>; models: Record<string, unknown>[] }): void;
}

interface SdkHookEvent {
  model: { providerID: string };
  package: string;
  options: Record<string, unknown>;
  sdk?: unknown;
}

interface ToolContextLike {
  signal?: AbortSignal;
}

interface ToolEditor {
  namespace?(ns: { name: string; description: string }): void;
  add(tool: Record<string, unknown>): void;
}

interface PluginContextV2 extends V2PluginContextLike {
  integration: V2PluginContextLike["integration"] & {
    transform(callback: (editor: IntegrationEditor) => void): Promise<unknown>;
  };
  provider: {
    transform(callback: (editor: ProviderEditor) => void): Promise<unknown>;
  };
  aisdk: {
    hook(
      name: "sdk",
      callback: (event: SdkHookEvent) => Promise<void> | void,
    ): Promise<unknown>;
  };
  tool: {
    transform(callback: (editor: ToolEditor) => void): Promise<unknown>;
  };
}

/** Model family inference for grouping (v2 `small` model selection). */
const FAMILIES: [RegExp, string][] = [
  [/^gemini.*flash/, "gemini-flash"],
  [/^gemini.*pro|^gemini-pro/, "gemini-pro"],
  [/^claude.*opus/, "claude-opus"],
  [/^claude.*sonnet/, "claude-sonnet"],
  [/^gpt-oss/, "gpt-oss"],
];

function modelInfo(id: string, providerID: string, entry: ModelCatalogEntry) {
  const family = FAMILIES.find(([pattern]) => pattern.test(id))?.[1];
  return {
    id,
    modelID: id,
    providerID,
    name: entry.name,
    ...(family ? { family } : {}),
    capabilities: {
      tools: entry.tool_call,
      input: entry.modalities.input,
      output: entry.modalities.output,
    },
    variants: [],
    time: { released: 1758000000000 }, // 2025-09-16: static catalog baseline
    cost: [],
    status: "active" as const,
    enabled: true,
    limit: entry.limit,
    settings: {},
    headers: {},
    body: {},
  };
}
function oauthMethod(providerID: string) {
  return {
    integrationID: providerID,
    method: {
      // id must match credentials migrated from v1 auth.json (`"oauth"`),
      // otherwise connection.resolve cannot find the refresh implementation.
      id: "oauth",
      type: "oauth" as const,
      label: "Google Antigravity (browser)",
    },
    authorize: async () => {
      const result = await loginAntigravity();
      return {
        url: result.url,
        instructions: result.instructions,
        mode: "auto" as const,
        callback: (async (): Promise<OAuthCredential> => {
          const res = await result.callback();
          if (res.type !== "success") {
            throw new Error("Google Antigravity sign-in was cancelled or failed");
          }
          const projectId = res._projectId || res.accountId;
          if (projectId) writeMeta({ projectId, email: res._email });
          return {
            type: "oauth",
            methodID: "oauth",
            refresh: res.refresh,
            access: res.access,
            expires: res.expires,
            metadata: {
              ...(projectId ? { projectId } : {}),
              ...(res._email ? { email: res._email } : {}),
            },
          };
        })(),
      };
    },
    refresh: async (credential: CredentialValueLike): Promise<OAuthCredential> => {
      const json = await refreshAccessToken(credential.refresh as string);
      return {
        type: "oauth",
        methodID: (credential.methodID as string) ?? "oauth",
        refresh: json.refresh_token || (credential.refresh as string),
        access: json.access_token,
        expires: toExpires(json.expires_in ?? 3600),
        metadata: credential.metadata ?? {},
      };
    },
    label: (credential: CredentialValueLike) =>
      typeof credential.metadata?.email === "string" ? credential.metadata.email : undefined,
  };
}


/**
 * Lazily resolves `@ai-sdk/google` factory. Dynamic import is required: the
 * package is not part of this plugin's static graph (tsc cannot resolve the
 * literal specifier) and the plugin host cannot resolve nested bare imports —
 * the vendored bundle in dist/vendor is the canonical entry.
 */
interface GoogleSdkProvider {
  languageModel(id: string): unknown;
}

type GoogleSdkFactory = (options: Record<string, unknown>) => GoogleSdkProvider;

async function loadGoogleSdkFactory(): Promise<GoogleSdkFactory> {
  // The vendored bundle (scripts/bundle-aisdk.sh) is the reliable path: a
  // single self-contained ESM file inside dist/, immune to the plugin host's
  // bare-specifier resolution limits. node_modules fallbacks stay for dev
  // checkouts where the bundle has not been generated yet.
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const { homedir } = await import("node:os");
  const candidates = [
    new URL("./vendor/google-ai-sdk.js", import.meta.url).href,
    new URL("../node_modules/@ai-sdk/google/dist/index.js", import.meta.url).href,
    pathToFileURL(
      join(
        process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
        "opencode",
        "node_modules",
        "@ai-sdk",
        "google",
        "dist",
        "index.js",
      ),
    ).href,
  ];
  const failures: string[] = [];
  for (const specifier of candidates) {
    try {
      const mod: { createGoogleGenerativeAI?: GoogleSdkFactory } = await import(specifier);
      if (mod.createGoogleGenerativeAI) return mod.createGoogleGenerativeAI;
      failures.push(`${specifier}: missing createGoogleGenerativeAI export`);
    } catch (err) {
      failures.push(`${specifier}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`cannot load @ai-sdk/google (${failures.join(" | ")})`);
}

function buildModelTransport(ctx: V2PluginContextLike, providerID: string) {
  return createAntigravityFetch({
    async getAccessToken() {
      const cred = await resolveV2Credential(ctx, providerID);
      if (!cred?.access) {
        throw new Error(
          "Google Antigravity credential missing. Run `opencode auth login` and pick 'Google Antigravity (browser)'.",
        );
      }
      return cred.access;
    },
    async getProjectId() {
      const cred = await resolveV2Credential(ctx, providerID);
      return resolveProjectId(ctx, providerID, cred);
    },
    async rotateAccount() {
      return rotateV2Account(ctx, providerID);
    },
  });
}

function toolAuth(ctx: V2PluginContextLike): Promise<{ access: string; projectId: string } | null> {
  // Tools are provider-agnostic: use whichever integration is connected.
  return (async () => {
    for (const providerID of PROVIDER_IDS) {
      const cred = await resolveV2Credential(ctx, providerID);
      if (cred?.access) {
        return { access: cred.access, projectId: await resolveProjectId(ctx, providerID, cred) };
      }
    }
    // Standalone fallback: auth.json written by the v1 plugin / older installs.
    return resolveStoredAccessToken();
  })();
}

export async function setup(ctx: PluginContextV2) {
  const v2ctx = ctx;

  // ── Integrations: OAuth method per provider alias ─────────────────────────
  await ctx.integration.transform((editor: IntegrationEditor) => {
    for (const providerID of PROVIDER_IDS) {
      editor.update(providerID, (integration) => {
        integration.name = PROVIDER_NAMES[providerID];
      });
      editor.method.update(oauthMethod(providerID));
    }
  });

  // ── Providers + model catalog ─────────────────────────────────────────────
  await ctx.provider.transform((editor: ProviderEditor) => {
    for (const providerID of PROVIDER_IDS) {
      const existing = editor.get(providerID);
      if (existing) continue; // user-defined provider wins
      editor.add({
        info: {
          id: providerID,
          integrationID: providerID,
          name: PROVIDER_NAMES[providerID],
          activation: "enabled", // alias integration may hold no credential row; availability would drop it under "auto"
          package: "aisdk:@ai-sdk/google",
          headers: {},
          body: {},
        },
        models: Object.entries(ANTIGRAVITY_MODEL_CATALOG).map(([id, entry]) =>
          modelInfo(id, providerID, entry),
        ),
      });
    }
  });

  // ── AI SDK transport: inject antigravity fetch ────────────────────────────
  await ctx.aisdk.hook("sdk", async (event) => {
    const providerID = event.model.providerID;
    if (providerID !== PRIMARY_PROVIDER_ID && providerID !== ALIAS_PROVIDER_ID) return;
    // The "sdk" hook writeback only persists `event.sdk` — mutating
    // `event.options` is a no-op, and the built-in dynamic provider may have
    // already constructed an SDK without our transport. Always build and
    // assign our own so `options.fetch` is the antigravity transport.
    const createGoogleGenerativeAI = await loadGoogleSdkFactory();
    event.sdk = createGoogleGenerativeAI({
      ...event.options,
      name: providerID,
      // The transport fetch replaces auth headers per request; the key only
      // needs to satisfy the SDK's non-empty apiKey requirement.
      apiKey: (event.options.apiKey as string) || OAUTH_DUMMY_KEY,
      fetch: buildModelTransport(v2ctx, providerID),
    });
  });

  // ── Custom tools ──────────────────────────────────────────────────────────
  await ctx.tool.transform((editor: ToolEditor) => {
    if (typeof editor.namespace === "function") {
      editor.namespace({ name: "antigravity", description: "Google Antigravity tools" });
    }
    editor.add({
      name: "check_quota",
      description:
        "Check Google Antigravity remaining quota, shared token pools (Gemini Models, Claude & GPT Models), remaining percentage, and reset time.",
      input: {
        type: "object",
        properties: {
          showModels: {
            type: "boolean",
            description:
              "Whether to list individual model quota rows in addition to shared pools (default: false).",
          },
        },
      },
      async execute(args: { showModels?: boolean }) {
        const auth = await toolAuth(v2ctx);
        if (!auth?.access) {
          throw new Error("No Google Antigravity credentials found. Please run 'opencode auth login' first.");
        }
        const report = await fetchFullQuotaReport(auth.access, auth.projectId);
        return {
          content: formatQuotaReport(report, { showModels: args?.showModels }),
          metadata: {
            projectId: report.projectId,
            endpoint: report.endpoint,
            groupsCount: report.groups.length,
            fetchedAt: report.fetchedAt,
          },
        };
      },
    });
    editor.add({
      name: "generate_image",
      description:
        "Generate high-quality images using Gemini Image models via Google Antigravity (gemini-3-pro-image, gemini-3.1-flash-image). Automatically saves the image file to the workspace.",
      input: {
        type: "object",
        required: ["prompt"],
        properties: {
          prompt: { type: "string", description: "Detailed visual description of the image to generate." },
          aspectRatio: {
            type: "string",
            description:
              "Aspect ratio: '1:1' (default), '16:9', '9:16', '4:3', '3:4', '2:3', '3:2', '4:5', '5:4', '21:9'.",
          },
          path: {
            type: "string",
            description:
              "Optional project-relative file or directory path to save the image (e.g. 'assets/hero.png').",
          },
          model: {
            type: "string",
            description: "Optional image model: 'gemini-3-pro-image' (default) or 'gemini-3.1-flash-image'.",
          },
        },
      },
      async execute(
        args: { prompt: string; aspectRatio?: string; path?: string; model?: string },
        toolContext?: ToolContextLike,
      ) {
        const auth = await toolAuth(v2ctx);
        if (!auth?.access) {
          throw new Error("No Google Antigravity credentials found. Please run 'opencode auth login' first.");
        }
        const result = await generateAntigravityImage({
          prompt: args.prompt,
          accessToken: auth.access,
          projectId: auth.projectId,
          cwd: v2ctx.location?.directory || process.cwd(),
          aspectRatio: args.aspectRatio,
          model: args.model,
          path: args.path,
          signal: toolContext?.signal,
        });
        return {
          content: `Successfully generated image (${result.model}). Saved to: ${result.savedPaths.join(", ")}`,
          metadata: { savedPaths: result.savedPaths, model: result.model },
        };
      },
    });
  });
}
