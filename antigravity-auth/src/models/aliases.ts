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
};

export function resolveWireModelId(modelId: string): string {
  const id = String(modelId || "");
  return MODEL_ID_ALIASES[id] || id;
}
