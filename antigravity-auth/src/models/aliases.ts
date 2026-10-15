/**
 * Model ID aliases mapping OpenCode user IDs to Cloud Code Assist wire model IDs.
 * Only live upstream ids (2026-10-14 picker) map here; ids dropped upstream
 * (gemini-3.7/3.6/3.5-flash tiers, 3.1-pro, pro-agent, claude-4.x) resolve to
 * themselves and fail upstream rather than silently switching models.
 */

export const MODEL_ID_ALIASES: Record<string, string> = {
  "gemini-3.8-flash": "gemini-3.8-flash-medium",
  "gemini-4-argon": "gemini-4-argon-medium",

  // Claude 5.5 uses suffix tiers; bare ids default to medium and thinking to high.
  "claude-opus-5-5": "claude-opus-5-5-medium",
  "claude-opus-5-5-thinking": "claude-opus-5-5-high",
  "claude-sonnet-5-5": "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-thinking": "claude-sonnet-5-5-high",

  "gpt-oss-120b": "gpt-oss-120b-medium",
};

export function resolveWireModelId(modelId: string): string {
  const id = String(modelId || "");
  return MODEL_ID_ALIASES[id] || id;
}

/**
 * Rate-limit/missing-model escape hatch: Gemini 4 Argon tiers fall back to the
 * equivalent Gemini 3.8 Flash tier when OPENCODE_AGY_AUTO_FALLBACK=1 and the
 * upstream answers terminal 429/404. Mirrors antigravity-pi
 * getFallbackRuntimeModel.
 */
export function getFallbackWireModelId(wireModelId: string): string | undefined {
  const match = /^gemini-4-argon(?:-(low|medium|high))?$/.exec(wireModelId);
  if (!match) return undefined;
  return `gemini-3.8-flash-${match[1] ?? "medium"}`;
}
