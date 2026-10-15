/**
 * Model ID aliases mapping OpenCode user IDs to Cloud Code Assist wire model IDs.
 */

export const MODEL_ID_ALIASES: Record<string, string> = {
  "gemini-3.8-flash": "gemini-3.8-flash-medium",
  "gemini-4-argon": "gemini-4-argon-medium",

  // Claude 5.5 uses suffix tiers; bare ids default to medium and thinking to high.
  "claude-opus-5-5": "claude-opus-5-5-medium",
  "claude-opus-5-5-thinking": "claude-opus-5-5-high",
  "claude-sonnet-5-5": "claude-sonnet-5-5-medium",
  "claude-sonnet-5-5-thinking": "claude-sonnet-5-5-high",

  // Retired Claude 4.x selections continue to route to the current medium tier.
  "claude-opus-4-6": "claude-opus-5-5-medium",
  "claude-opus-4-6-thinking": "claude-opus-5-5-medium",
  "claude-opus-4-5": "claude-opus-5-5-medium",
  "claude-opus-4-5-thinking": "claude-opus-5-5-medium",
  "claude-sonnet-4-6": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-6-thinking": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-5": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-5-thinking": "claude-sonnet-5-5-medium",

  "gemini-3.7-flash": "gemini-3.8-flash-medium",
  "gemini-3.7-flash-high": "gemini-3.8-flash-high",
  "gemini-3.7-flash-medium": "gemini-3.8-flash-medium",
  "gemini-3.7-flash-low": "gemini-3.8-flash-low",
  "gemini-3.6-flash": "gemini-3.8-flash-medium",
  "gemini-3.6-flash-high": "gemini-3.8-flash-high",
  "gemini-3.6-flash-medium": "gemini-3.8-flash-medium",
  "gemini-3.6-flash-low": "gemini-3.8-flash-low",
  "gemini-3.5-flash": "gemini-3.8-flash-medium",
  "gemini-3.5-flash-high": "gemini-3.8-flash-high",
  "gemini-3.5-flash-medium": "gemini-3.8-flash-medium",
  "gemini-3.5-flash-low": "gemini-3.8-flash-low",
  "gemini-3.5-flash-extra-low": "gemini-3.8-flash-low",
  "gemini-3-flash-agent": "gemini-3.8-flash-high",
  "gemini-3.1-pro": "gemini-4-argon-high",
  "gemini-3.1-pro-high": "gemini-4-argon-high",
  "gemini-3.1-pro-low": "gemini-4-argon-low",
  "gemini-pro-agent": "gemini-4-argon-high",

  "gpt-oss-120b": "gpt-oss-120b-medium",
};

export function resolveWireModelId(modelId: string): string {
  const id = String(modelId || "");
  return MODEL_ID_ALIASES[id] || id;
}
