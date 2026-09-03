/**
 * Thinking level configuration & sanitization for Gemini models.
 */
import { ANTIGRAVITY_MODEL_CATALOG } from "./catalog.js";
import type { GenerationConfig } from "../types/index.js";

export function isGemini3Model(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  if (id === "gemini-pro-agent" || id.includes("flash-agent")) return true;
  return id.includes("gemini-3");
}

export function isGemini3High(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return (
    id === "gemini-pro-agent" ||
    id === "gemini-3-flash-agent" ||
    (id.includes("gemini-3") && id.includes("high"))
  );
}

export function isGemini3Medium(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return id.includes("gemini-3") && id.includes("medium");
}

export function isGemini3Low(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return id.includes("gemini-3") && (id.includes("low") || id.includes("extra-low"));
}

export function isGeminiProHigh(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return id === "gemini-pro-agent" || (id.includes("gemini-3") && id.includes("pro") && id.includes("high"));
}

export function isGeminiProLow(modelId: string): boolean {
  const id = String(modelId || "").toLowerCase();
  return id.includes("gemini-3") && id.includes("pro") && id.includes("low");
}

/**
 * MINIMAL thinking level is rejected by the Antigravity backend for Gemini 3.7+
 * (HTTP 400 "Thinking level MINIMAL is not supported for this model"). The
 * minimum supported floor there is LOW. Older models (gemini-3.6 and below)
 * still accept MINIMAL.
 */
export function isMinimalThinkingSupported(modelId: string): boolean {
  const m = String(modelId || "").toLowerCase().match(/^gemini-(\d+)(?:\.(\d+))?/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = m[2] !== undefined ? Number(m[2]) : 0;
  if (major >= 4) return false;
  return major === 3 ? minor < 7 : true;
}

export function getDefaultThinkingLevel(modelId: string): "HIGH" | "MEDIUM" | "LOW" | "MINIMAL" {
  if (isGemini3High(modelId)) return "HIGH";
  if (isGemini3Medium(modelId)) return "MEDIUM";
  if (isGemini3Low(modelId)) return "LOW";
  return isMinimalThinkingSupported(modelId) ? "MINIMAL" : "LOW";
}

/** Alias for backward compatibility with existing tests */
export const defaultThinkingLevelFor = getDefaultThinkingLevel;

/**
 * Normalizes generationConfig for Cloud Code Assist:
 * - Deletes thinkingBudget (Cloud Code Assist only accepts thinkingLevel)
 * - Normalizes MIN -> MINIMAL, MED -> MEDIUM
 * - Downgrades MINIMAL to LOW on models that do not support MINIMAL (3.7+)
 * - Injects default thinkingLevel if model is reasoning-capable
 */
export function sanitizeGenerationConfig<T extends GenerationConfig>(
  generationConfig: T | undefined,
  modelId: string,
): T {
  if (!generationConfig || typeof generationConfig !== "object") return generationConfig as unknown as T;
  const id = String(modelId || "").toLowerCase();
  const isGemini3 = isGemini3Model(modelId) || isGeminiProHigh(modelId);
  if (!isGemini3 && !id.includes("gemini-3") && id !== "gemini-pro-agent") return generationConfig;

  const next = { ...generationConfig } as T;
  delete next.thinkingBudget;

  const defaultLevel = getDefaultThinkingLevel(modelId);

  if (next.thinkingConfig && typeof next.thinkingConfig === "object") {
    const tc = { ...next.thinkingConfig };
    delete tc.thinkingBudget;
    if (!tc.thinkingLevel) {
      tc.thinkingLevel = defaultLevel;
    }
    if (typeof tc.thinkingLevel === "string") {
      let level = tc.thinkingLevel.toUpperCase();
      if (level === "MIN") level = "MINIMAL";
      if (level === "MED") level = "MEDIUM";
      if (level === "MINIMAL" && !isMinimalThinkingSupported(modelId)) {
        level = "LOW";
      }
      tc.thinkingLevel = level;
    }
    if (tc.includeThoughts === undefined) {
      tc.includeThoughts = true;
    }
    next.thinkingConfig = tc;
  } else if (isGemini3) {
    const catalogEntry = ANTIGRAVITY_MODEL_CATALOG[modelId];
    if (!catalogEntry || catalogEntry.reasoning !== false) {
      next.thinkingConfig = {
        includeThoughts: true,
        thinkingLevel: defaultLevel,
      };
    }
  }
  return next;
}
