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

  // Retired Claude 4.x ids are removed upstream; route saved selections to
  // the matching 5.5 medium tier so they keep working instead of 404ing.
  "claude-opus-4-6": "claude-opus-5-5-medium",
  "claude-opus-4-6-thinking": "claude-opus-5-5-medium",
  "claude-opus-4-5": "claude-opus-5-5-medium",
  "claude-opus-4-5-thinking": "claude-opus-5-5-medium",
  "claude-sonnet-4-6": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-6-thinking": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-5": "claude-sonnet-5-5-medium",
  "claude-sonnet-4-5-thinking": "claude-sonnet-5-5-medium",
};

export function resolveWireModelId(modelId: string): string {
  const id = String(modelId || "");
  return MODEL_ID_ALIASES[id] || id;
}
