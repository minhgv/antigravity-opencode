/**
 * Model ID aliases mapping OpenCode user IDs to Cloud Code Assist wire model IDs.
 */

export const MODEL_ID_ALIASES: Record<string, string> = {
  "gemini-3.1-pro-high": "gemini-pro-agent",
  "gemini-pro-agent": "gemini-pro-agent",
  "gemini-3.8-flash": "gemini-3.8-flash-high",
  "gemini-3.7-flash": "gemini-3.7-flash-high",
  "gemini-3.6-flash": "gemini-3.6-flash-high",
  "gemini-3.1-pro": "gemini-pro-agent",

  // Claude 5.5 on Cloud Code Assist follows the Gemini suffix-tier scheme:
  // one wire id per effort tier (-low | -medium | -high), no `-thinking`
  // variant and no thinkingConfig. Bare ids default to the neutral medium
  // tier; `-thinking` selects the high tier.
  "claude-opus-5-5": "claude-opus-5-5-medium",
  "claude-opus-5-5-thinking": "claude-opus-5-5-high",
  "claude-sonnet-5-5": "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-thinking": "claude-sonnet-5-5-high",

  // Retired Claude 4.x and Gemini 3.5 ids are gone from the Antigravity
  // picker; route saved selections to the current tiered ids instead of
  // 404ing upstream.
  "claude-opus-4-6": "claude-opus-5-5-medium",
  "claude-opus-4-6-thinking": "claude-opus-5-5-medium",
  "claude-opus-4-5": "claude-opus-5-5-medium",
  "claude-opus-4-5-thinking": "claude-opus-5-5-medium",
  "claude-sonnet-4-6": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-6-thinking": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-5": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-5-thinking": "claude-sonnet-5-5-medium",

  // Gemini 3.5 flash ids dropped from the picker; map to the 3.6 tiers.
  "gemini-3.5-flash": "gemini-3.6-flash-high",
  "gemini-3.5-flash-high": "gemini-3.6-flash-high",
  "gemini-3.5-flash-medium": "gemini-3.6-flash-medium",
  "gemini-3.5-flash-low": "gemini-3.6-flash-medium",
  "gemini-3.5-flash-extra-low": "gemini-3.6-flash-low",
  "gemini-3.5-flash-lite": "gemini-3.6-flash-low",
  "gemini-3-flash-agent": "gemini-3.6-flash-high",

  // GPT-OSS is only exposed as the medium wire id.
  "gpt-oss-120b": "gpt-oss-120b-medium",
};

export function resolveWireModelId(modelId: string): string {
  const id = String(modelId || "");
  return MODEL_ID_ALIASES[id] || id;
}
