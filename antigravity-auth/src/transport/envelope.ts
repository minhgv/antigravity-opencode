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
import { dereferenceSchema, ensureRootObjectSchema, sanitizeForOpenApi } from "../utils/schema.js";
import { injectAntigravitySystem } from "../utils/system.js";
import type { AntigravityEnvelope, GeminiContent, GeminiPart } from "../types/index.js";

export function isClaudeModel(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return id.startsWith("claude-");
}

export function isClaudeThinkingModel(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return id.startsWith("claude-") && (id.includes("thinking") || ANTIGRAVITY_MODEL_CATALOG[id]?.reasoning === true);
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

export function getAntigravityHeaders(modelId = ""): Record<string, string> {
  const platform =
    process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";

  const uaMode = (process.env.OPENCODE_AGY_UA_MODE || "cli").toLowerCase();
  let userAgentStr: string;

  if (uaMode === "sdk") {
    userAgentStr = `antigravity/${process.env.PI_AI_ANTIGRAVITY_VERSION || "1.21.9"} ${platform}/${arch}`;
  } else if (uaMode === "desktop") {
    userAgentStr = `Antigravity/${process.env.PI_AI_ANTIGRAVITY_VERSION || "2.2.1"} ${platform}/${arch}`;
  } else {
    const cliVer = process.env.PI_AI_ANTIGRAVITY_VERSION || "1.1.13";
    userAgentStr = `antigravity/cli/${cliVer} (aidev_client; os_type=${platform}; arch=${arch}; auth_method=consumer)`;
  }

  const headers: Record<string, string> = {
    "User-Agent": userAgentStr,
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
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

export function adaptToolsForModel(tools: unknown[], modelId: string): unknown[] {
  if (!tools || !Array.isArray(tools)) return tools;
  const claude = isClaudeModel(modelId);

  return tools.map((toolGroup) => {
    if (!toolGroup || typeof toolGroup !== "object") return toolGroup;
    const tg = toolGroup as Record<string, unknown>;
    if (!Array.isArray(tg.functionDeclarations)) return toolGroup;

    return {
      ...tg,
      functionDeclarations: tg.functionDeclarations.map((fd) => {
        if (!fd || typeof fd !== "object") return fd;
        const next = { ...fd } as Record<string, unknown>;
        const rawSchema = next.parameters ?? next.parametersJsonSchema;
        if (rawSchema) {
          const dereferenced = dereferenceSchema(rawSchema);
          const rootObject = ensureRootObjectSchema(dereferenced);
          const cleaned = sanitizeForOpenApi(rootObject);
          if (claude) {
            next.parameters = cleaned;
            delete next.parametersJsonSchema;
          } else {
            next.parameters = cleaned;
          }
        }
        return next;
      }),
    };
  });
}

export function postProcessContents(contents: GeminiContent[], modelId: string): GeminiContent[] {
  if (!Array.isArray(contents)) return contents;
  const gemini3 = isGemini3Model(modelId);
  const needIds = requiresToolCallId(modelId);
  let toolCounter = 0;
  const lastToolCallIds = new Map<string, string>();

  return contents
    .map((content) => {
      if (!content || !Array.isArray(content.parts)) return content;
      const parts: GeminiPart[] = [];

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
          if (needIds) {
            const raw = fc.id || `${fc.name || "tool"}_${Date.now()}_${++toolCounter}`;
            fc.id = normalizeToolCallId(raw);
            if (fc.name) {
              lastToolCallIds.set(fc.name, fc.id);
            }
          }
          next.functionCall = fc;
          if (gemini3 && !next.thoughtSignature && !fc.thoughtSignature) {
            next.thoughtSignature = SKIP_THOUGHT_SIGNATURE;
          }
        }

        if (next.functionResponse && typeof next.functionResponse === "object") {
          const fr = { ...next.functionResponse };
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
): Record<string, unknown> {
  const body = { ...geminiBody };
  if (Array.isArray(body.tools)) {
    body.tools = adaptToolsForModel(body.tools, modelId);
  }
  if (Array.isArray(body.contents)) {
    body.contents = postProcessContents(body.contents as GeminiContent[], modelId);
  }
  if (body.generationConfig && typeof body.generationConfig === "object") {
    body.generationConfig = sanitizeGenerationConfig(
      body.generationConfig as Record<string, unknown>,
      modelId,
    );
  } else if (isGemini3Model(modelId) || isGeminiProHigh(modelId) || isGeminiProLow(modelId)) {
    body.generationConfig = sanitizeGenerationConfig({}, modelId);
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
  let request = postProcessGeminiBody({ ...geminiBody }, opts.modelId);

  if (opts.sessionId) {
    request.sessionId = opts.sessionId;
  } else if (request.sessionId == null) {
    delete request.sessionId;
  }

  if (isAntigravity) {
    request = injectAntigravitySystem(request);
  }

  const hexRandom = randomBytes(4).toString("hex");
  return {
    project: opts.projectId,
    model: opts.modelId,
    request,
    ...(isAntigravity ? { requestType: "agent" } : {}),
    userAgent: isAntigravity ? "antigravity" : "opencode",
    requestId: `${isAntigravity ? "agent" : "oc"}-${Date.now()}-${hexRandom}`,
  };
}
