/**
 * Per-wire-id Antigravity Cloud Code Assist request constants, captured from the
 * real `antigravity/hub` client against `daily-cloudcode-pa`. `modelEnum` is the
 * opaque `labels.model_enum` token the client tags each request with — optional
 * because Anthropic-backed wire ids (e.g. `claude-sonnet-5-5-medium`,
 * `claude-opus-5-5-high`) are accepted without one; the label is purely
 * telemetry. `maxOutputTokens` is the fixed `generationConfig.maxOutputTokens`
 * the backend enforces regardless of the thinking budget (Claude caps at
 * 64000, Gemini accepts the discovered cap). Keyed by the routed upstream wire
 * id (post alias resolution), not the collapsed logical id.
 *
 * Ported from oh-my-pi `packages/catalog/src/wire/gemini-headers.ts`.
 */
export interface AntigravityModelWireProfile {
  modelEnum?: string;
  maxOutputTokens: number;
}

export const ANTIGRAVITY_MODEL_WIRE_PROFILES: Readonly<
  Record<string, AntigravityModelWireProfile>
> = {
  "gemini-3.5-flash-extra-low": { modelEnum: "MODEL_PLACEHOLDER_M187", maxOutputTokens: 65536 },
  "gemini-3.5-flash-low": { modelEnum: "MODEL_PLACEHOLDER_M20", maxOutputTokens: 65536 },
  "gemini-3-flash-agent": { modelEnum: "MODEL_PLACEHOLDER_M132", maxOutputTokens: 65536 },
  "gemini-3.1-pro-low": { modelEnum: "MODEL_PLACEHOLDER_M36", maxOutputTokens: 65535 },
  "gemini-pro-agent": { modelEnum: "MODEL_PLACEHOLDER_M16", maxOutputTokens: 65535 },
  // Claude on `daily-cloudcode-pa` rejects `maxOutputTokens > 64000` with a
  // 400 (`Request contains an invalid argument`). The model_enum label is
  // untracked for these ids; the backend does not require it. Claude 5.5 ships
  // one wire id per effort tier, so all six suffixed ids get the pin.
  "claude-sonnet-5-5-low": { maxOutputTokens: 64000 },
  "claude-sonnet-5-5-medium": { maxOutputTokens: 64000 },
  "claude-sonnet-5-5-high": { maxOutputTokens: 64000 },
  "claude-opus-5-5-low": { maxOutputTokens: 64000 },
  "claude-opus-5-5-medium": { maxOutputTokens: 64000 },
  "claude-opus-5-5-high": { maxOutputTokens: 64000 },
};
