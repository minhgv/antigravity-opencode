/**
 * Model ID aliases mapping OpenCode user IDs to Cloud Code Assist wire model IDs.
 */

export const MODEL_ID_ALIASES: Record<string, string> = {
  "gemini-3.1-pro-high": "gemini-pro-agent",
  "gemini-pro-agent": "gemini-pro-agent",
};

export function resolveWireModelId(modelId: string): string {
  const id = String(modelId || "");
  return MODEL_ID_ALIASES[id] || id;
}
