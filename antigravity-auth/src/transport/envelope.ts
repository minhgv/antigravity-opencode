/**
 * Antigravity request envelope and body transformation.
 */
import { randomBytes } from "node:crypto";
import {
  CLAUDE_THINKING_BETA_HEADER,
  SKIP_THOUGHT_SIGNATURE,
} from "../auth/constants.js";
import {
  sanitizeGenerationConfig,
  isGemini3Model,
  isGeminiProHigh,
  isGeminiProLow,
} from "../models/thinking.js";
import { ANTIGRAVITY_MODEL_CATALOG } from "../models/catalog.js";
import { ANTIGRAVITY_MODEL_WIRE_PROFILES } from "../models/wire-profiles.js";
import { resolveWireModelId } from "../models/aliases.js";
import { dereferenceSchema, ensureRootObjectSchema, sanitizeForOpenApi } from "../utils/schema.js";
import { sanitizeSystemInstruction } from "../utils/system.js";
import { getAntigravityVersion } from "./version.js";
import { buildSessionEnvelope } from "./session.js";
import { resolveThoughtSignatureWithFallback } from "./thought-signature.js";
import type { AntigravityEnvelope, GeminiContent, GeminiPart } from "../types/index.js";

export function isClaudeModel(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return id.startsWith("claude-");
}

export function isClaudeThinkingModel(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  if (!id.startsWith("claude-")) return false;
  // Claude 5.5 wire ids carry the effort tier as a suffix (-low/-medium/
  // -high); all tiers are thinking-capable upstream, so the interleaved
  // thinking beta applies to every suffix id. Retired `-thinking` ids and
  // catalog-flagged logical ids keep the old behavior.
  return (
    id.endsWith("-low") ||
    id.endsWith("-medium") ||
    id.endsWith("-high") ||
    id.includes("thinking") ||
    ANTIGRAVITY_MODEL_CATALOG[id]?.reasoning === true
  );
}


export function requiresToolCallId(modelId: string): boolean {
  const id = String(modelId || "");
  return id.startsWith("claude-") || id.startsWith("gpt-oss-");
}

export function normalizeToolCallId(id: string): string {
  if (!id) return id;
  return String(id)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
}
export const AG_TOOL_SUFFIX = "_ide";

export const AG_DECOY_TOOLS = [
  {
    name: "browser_subagent",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "command_status",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "find_by_name",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "list_dir",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "view_file_outline",
    description: "This tool is currently unavailable.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
];


export function getAntigravityHeaders(modelId = ""): Record<string, string> {
  const platform =
    process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";

  let userAgentStr: string;
  const uaMode = (process.env.OPENCODE_AGY_UA_MODE || "ide").toLowerCase();
  if (uaMode === "sdk") {
    userAgentStr = `antigravity/${getAntigravityVersion()} ${platform}/${arch}`;
  } else if (uaMode === "desktop") {
    userAgentStr = `Antigravity/${getAntigravityVersion()} ${platform}/${arch}`;
  } else if (uaMode === "cli") {
    const cliVer = process.env.PI_AI_ANTIGRAVITY_VERSION || "1.1.13";
    userAgentStr = `antigravity/cli/${cliVer} (aidev_client; os_type=${platform}; arch=${arch}; auth_method=consumer)`;
  } else {
    // Default to official Antigravity IDE desktop fingerprint; the version
    // auto-tracks the latest release via the electron-builder update manifest.
    userAgentStr = `antigravity/ide/${getAntigravityVersion()} ${platform}/${arch}`;
  }

  const headers: Record<string, string> = {
    "User-Agent": userAgentStr,
    "x-request-source": "local",
    "Client-Metadata": JSON.stringify({
      ideType: "ANTIGRAVITY",
      platform: platform === "darwin" ? "MACOS" : platform === "windows" ? "WINDOWS" : "LINUX",
      pluginType: "GEMINI",
    }),
  };

  if (isClaudeThinkingModel(modelId)) {
    headers["anthropic-beta"] = CLAUDE_THINKING_BETA_HEADER;
  }
  return headers;
}

export function adaptToolsForModel(
  tools: unknown[],
  modelId: string,
  options: { cloak?: boolean } = {},
): unknown[] {
  if (!tools || !Array.isArray(tools)) return tools;
  const claude = isClaudeModel(modelId);
  const shouldCloak = options.cloak === true || process.env.OPENCODE_AGY_CLOAK_TOOLS === "1";

  return tools.map((toolGroup) => {
    if (!toolGroup || typeof toolGroup !== "object") return toolGroup;
    const tg = toolGroup as Record<string, unknown>;
    if (!Array.isArray(tg.functionDeclarations)) return toolGroup;

    const clientDeclarations = tg.functionDeclarations.map((fd) => {
      if (!fd || typeof fd !== "object") return fd;
      const next = { ...fd } as Record<string, unknown>;
      if (shouldCloak && typeof next.name === "string" && !next.name.endsWith(AG_TOOL_SUFFIX)) {
        next.name = `${next.name}${AG_TOOL_SUFFIX}`;
      }
      const rawSchema = next.parameters ?? next.parametersJsonSchema;
      const dereferenced = rawSchema ? dereferenceSchema(rawSchema) : undefined;
      const rootObject = ensureRootObjectSchema(dereferenced);
      const cleaned = sanitizeForOpenApi(rootObject);
      next.parameters = cleaned;
      if (claude || next.parametersJsonSchema !== undefined) {
        delete next.parametersJsonSchema;
      }
      return next;
    });

    let declarations = clientDeclarations;
    if (shouldCloak) {
      const seen = new Set<string>();
      for (const d of declarations) {
        if (d && typeof d === "object" && "name" in d && typeof (d as { name?: unknown }).name === "string") {
          seen.add((d as { name: string }).name);
        }
      }
      for (const decoy of AG_DECOY_TOOLS) {
        if (!seen.has(decoy.name)) {
          seen.add(decoy.name);
          declarations.push(decoy);
        }
      }
    }

    return {
      ...tg,
      functionDeclarations: declarations,
    };
  });
}

export function postProcessContents(
  contents: GeminiContent[],
  modelId: string,
  options: { sessionId?: string } = {},
): GeminiContent[] {
  if (!Array.isArray(contents)) return contents;
  const gemini3 = isGemini3Model(modelId);
  const claudeThinking = isClaudeThinkingModel(modelId);
  const needIds = requiresToolCallId(modelId);
  let toolCounter = 0;
  const lastToolCallIds = new Map<string, string>();

  return contents
    .map((content) => {
      if (!content || !Array.isArray(content.parts)) return content;
      const parts: GeminiPart[] = [];
      // The real client attaches the sentinel only to the first unsigned
      // functionCall of each model turn; later unsigned calls stay bare.
      let isFirstToolCall = true;

      for (const part of content.parts) {
        if (!part || typeof part !== "object") {
          parts.push(part);
          continue;
        }

        if (
          typeof part.text === "string" &&
          part.text.trim() === "" &&
          !part.functionCall &&
          !part.functionResponse
        ) {
          continue;
        }

        const next: GeminiPart = { ...part };
        if (next.functionCall && typeof next.functionCall === "object") {
          const fc = { ...next.functionCall };
          const shouldCloak = process.env.OPENCODE_AGY_CLOAK_TOOLS === "1";
          if (shouldCloak && typeof fc.name === "string" && !fc.name.endsWith(AG_TOOL_SUFFIX)) {
            fc.name = `${fc.name}${AG_TOOL_SUFFIX}`;
          }
          if (needIds) {
            const raw = fc.id || `${fc.name || "tool"}_${Date.now()}_${++toolCounter}`;
            fc.id = normalizeToolCallId(raw);
            if (fc.name) {
              lastToolCallIds.set(fc.name, fc.id);
            }
          }
          next.functionCall = fc;
          const hasSig = Boolean(next.thoughtSignature || fc.thoughtSignature);
          if (!hasSig) {
            // Try multi-turn cache first
            const cached = resolveThoughtSignatureWithFallback(
              options.sessionId,
              fc.id,
              fc.name,
              { fallback: false },
            );
            if (cached) {
              next.thoughtSignature = cached;
            } else if (gemini3 && isFirstToolCall) {
              next.thoughtSignature = SKIP_THOUGHT_SIGNATURE;
            } else if (gemini3 || claudeThinking) {
              // Multi-turn thought signature fallback when orphaned/untracked
              const fallback = resolveThoughtSignatureWithFallback(
                options.sessionId,
                fc.id,
                fc.name,
                { fallback: true },
              );
              if (fallback) {
                next.thoughtSignature = fallback;
              }
            }
          }
          isFirstToolCall = false;
        }

        if (next.functionResponse && typeof next.functionResponse === "object") {
          const fr = { ...next.functionResponse };
          const shouldCloak = process.env.OPENCODE_AGY_CLOAK_TOOLS === "1";
          if (shouldCloak && typeof fr.name === "string" && !fr.name.endsWith(AG_TOOL_SUFFIX)) {
            fr.name = `${fr.name}${AG_TOOL_SUFFIX}`;
          }
          if (needIds) {
            const resolvedId = fr.id || lastToolCallIds.get(fr.name) || fr.name || "tool";
            fr.id = normalizeToolCallId(resolvedId);
          }
          next.functionResponse = fr;
        }

        parts.push(next);
      }

      if (parts.length === 0) return null;
      return { ...content, parts };
    })
    .filter((c): c is GeminiContent => c !== null);
}

export function postProcessGeminiBody(
  geminiBody: Record<string, unknown>,
  modelId: string,
  options: { sessionId?: string } = {},
): Record<string, unknown> {
  const body = { ...geminiBody };
  if (Array.isArray(body.tools)) {
    body.tools = adaptToolsForModel(body.tools, modelId);
  }
  if (Array.isArray(body.contents)) {
    body.contents = postProcessContents(body.contents as GeminiContent[], modelId, options);
  }
  if (body.generationConfig && typeof body.generationConfig === "object") {
    body.generationConfig = sanitizeGenerationConfig(
      body.generationConfig as Record<string, unknown>,
      modelId,
    );
  } else if (isGemini3Model(modelId) || isGeminiProHigh(modelId) || isGeminiProLow(modelId)) {
    body.generationConfig = sanitizeGenerationConfig({}, modelId);
  }

  // The real client pins `maxOutputTokens` per wire id regardless of the
  // requested budget (Claude caps at 64000, Gemini at the discovered cap).
  const profile = ANTIGRAVITY_MODEL_WIRE_PROFILES[modelId];
  if (profile) {
    body.generationConfig = {
      ...((body.generationConfig as Record<string, unknown> | undefined) ?? {}),
      maxOutputTokens: profile.maxOutputTokens,
    };
  }

  // The real client always sends functionCallingConfig.mode "VALIDATED" —
  // Claude even without tools. An explicit caller toolConfig wins.
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  if (isClaudeModel(modelId) || (hasTools && body.toolConfig == null)) {
    const existing =
      body.toolConfig && typeof body.toolConfig === "object"
        ? (body.toolConfig as Record<string, unknown>)
        : {};
    const existingFcc =
      existing.functionCallingConfig && typeof existing.functionCallingConfig === "object"
        ? (existing.functionCallingConfig as Record<string, unknown>)
        : {};
    body.toolConfig = {
      ...existing,
      functionCallingConfig: { ...existingFcc, mode: "VALIDATED" },
    };
  }
  return body;
}

export interface BuildEnvelopeOptions {
  projectId: string;
  modelId: string;
  sessionId?: string;
  isAntigravity?: boolean;
}

export function buildEnvelope(
  geminiBody: Record<string, unknown>,
  opts: BuildEnvelopeOptions,
): AntigravityEnvelope {
  const isAntigravity = opts.isAntigravity !== false;
  const wireModelId = resolveWireModelId(opts.modelId);
  let request = postProcessGeminiBody({ ...geminiBody }, wireModelId, {
    sessionId: opts.sessionId,
  });
  if (isAntigravity) {
    request = sanitizeSystemInstruction(request);
  }

  // Google One AI Credits Protection:
  // Cloud Code Assist will deduct from paid Google One AI Credits if `enabledCreditTypes`
  // includes "GOOGLE_ONE_AI". By default, strip this field to protect user credits.
  // Opt-in only when explicitly allowed via OPENCODE_AGY_ENABLE_G1_CREDITS=1.
  const enableG1Credits = process.env.OPENCODE_AGY_ENABLE_G1_CREDITS === "1";
  if (!enableG1Credits) {
    delete request.enabledCreditTypes;
  }

  let requestId: string;
  let sessionId: string | undefined;
  let labels: Record<string, string> | undefined;
  if (isAntigravity) {
    // Persistent per-conversation identity: UUID agentId/trajectoryId,
    // monotonic step, signed-decimal int63 sessionId, telemetry labels.
    // `requestType` is deliberately omitted — the official client does not
    // send it on consumer Cloud Code, and "agent" is a constrained bucket
    // that answers with a detail-free 429 RESOURCE_EXHAUSTED.
    const session = buildSessionEnvelope({
      contents: Array.isArray(request.contents)
        ? (request.contents as GeminiContent[])
        : undefined,
      wireModelId,
      claude: isClaudeModel(wireModelId),
      sessionId: opts.sessionId,
    });
    sessionId = session.sessionId;
    requestId = session.requestId;
    labels = session.labels;
    request.sessionId = sessionId;
    if (Object.keys(labels).length > 0) {
      request.labels = labels;
    }
  } else {
    if (opts.sessionId) {
      request.sessionId = opts.sessionId;
    } else if (request.sessionId == null) {
      delete request.sessionId;
    }
    const hexRandom = randomBytes(4).toString("hex");
    requestId = `oc-${Date.now()}-${hexRandom}`;
  }

  return {
    project: opts.projectId,
    model: wireModelId,
    request,
    userAgent: isAntigravity ? "antigravity" : "opencode",
    requestId,
  };
}
