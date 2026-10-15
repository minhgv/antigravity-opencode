/**
 * Per-wire-id Antigravity Cloud Code Assist request constants. `modelEnum` is
 * optional for ids accepted without the opaque telemetry label. Keyed by routed
 * upstream wire id (post alias resolution), not the collapsed logical id.
 */
export interface AntigravityModelWireProfile {
  modelEnum?: string;
  maxOutputTokens: number;
}

export const ANTIGRAVITY_MODEL_WIRE_PROFILES: Readonly<
  Record<string, AntigravityModelWireProfile>
> = {
  "gemini-3.8-flash-high": { modelEnum: "MODEL_PLACEHOLDER_M318", maxOutputTokens: 65536 },
  "gemini-3.8-flash-medium": { modelEnum: "MODEL_PLACEHOLDER_M319", maxOutputTokens: 65536 },
  "gemini-3.8-flash-low": { modelEnum: "MODEL_PLACEHOLDER_M320", maxOutputTokens: 65536 },
  "gemini-4-argon": { maxOutputTokens: 65536 },
  "gemini-4-argon-low": { maxOutputTokens: 65536 },
  "gemini-4-argon-medium": { maxOutputTokens: 65536 },
  "gemini-4-argon-high": { maxOutputTokens: 65536 },
  // Claude backend rejects maxOutputTokens > 64000.
  "claude-sonnet-5-5-low": { maxOutputTokens: 64000 },
  "claude-sonnet-5-5-medium": { maxOutputTokens: 64000 },
  "claude-sonnet-5-5-high": { maxOutputTokens: 64000 },
  "claude-opus-5-5-low": { maxOutputTokens: 64000 },
  "claude-opus-5-5-medium": { maxOutputTokens: 64000 },
  "claude-opus-5-5-high": { maxOutputTokens: 64000 },
};
