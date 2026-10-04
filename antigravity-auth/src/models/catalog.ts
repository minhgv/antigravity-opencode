/**
 * Comprehensive Model Catalog for Google Antigravity.
 * Mirrors the model picker list served by the Antigravity 2.x language
 * server (`cascadeModelConfigData.clientModelConfigs`): Gemini 3.8/3.7/3.6
 * Flash tiers, Gemini 3.1 Pro tiers, Claude Opus/Sonnet 5.5 tiers, and
 * GPT-OSS 120B (Medium). Backend `fetchAvailableModels` exposes additional
 * internal ids that the IDE does not surface — they are intentionally left
 * out here.
 */
import type { ModelCatalogEntry } from "../types/index.js";

export const ANTIGRAVITY_MODEL_CATALOG: Record<string, ModelCatalogEntry> = {
  // Gemini 3.8 Flash
  "gemini-3.8-flash-high": {
    name: "Gemini 3.8 Flash (High) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.8-flash-medium": {
    name: "Gemini 3.8 Flash (Medium) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.8-flash-low": {
    name: "Gemini 3.8 Flash (Low) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // Gemini 3.7 Flash
  "gemini-3.7-flash-high": {
    name: "Gemini 3.7 Flash (High) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.7-flash-medium": {
    name: "Gemini 3.7 Flash (Medium) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.7-flash-low": {
    name: "Gemini 3.7 Flash (Low) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // Gemini 3.1 Pro
  "gemini-pro-agent": {
    name: "Gemini 3.1 Pro (High) (Antigravity)",
    limit: { context: 1048576, output: 65535 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.1-pro-low": {
    name: "Gemini 3.1 Pro (Low) (Antigravity)",
    limit: { context: 1048576, output: 65535 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // Gemini 3.6 Flash
  "gemini-3.6-flash-high": {
    name: "Gemini 3.6 Flash (High) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.6-flash-medium": {
    name: "Gemini 3.6 Flash (Medium) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.6-flash-low": {
    name: "Gemini 3.6 Flash (Low) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },


  // Claude 5.5 models via Antigravity bridge. The wire ids encode the
  // effort tier directly (-low / -medium / -high); bare and -thinking ids
  // are routed through MODEL_ID_ALIASES.
  "claude-opus-5-5-low": {
    name: "Claude Opus 5.5 (Low) (Antigravity)",
    limit: { context: 1000000, output: 64000 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-opus-5-5-medium": {
    name: "Claude Opus 5.5 (Medium) (Antigravity)",
    limit: { context: 1000000, output: 64000 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-opus-5-5-high": {
    name: "Claude Opus 5.5 (High) (Antigravity)",
    limit: { context: 1000000, output: 64000 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-sonnet-5-5-low": {
    name: "Claude Sonnet 5.5 (Low) (Antigravity)",
    limit: { context: 1000000, output: 64000 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-sonnet-5-5-medium": {
    name: "Claude Sonnet 5.5 (Medium) (Antigravity)",
    limit: { context: 1000000, output: 64000 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-sonnet-5-5-high": {
    name: "Claude Sonnet 5.5 (High) (Antigravity)",
    limit: { context: 1000000, output: 64000 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // GPT OSS (scheduled for removal upstream on 2026-11-02; the picker only
  // exposes the medium wire id)
  "gpt-oss-120b-medium": {
    name: "GPT OSS 120b (Medium) (Antigravity)",
    limit: { context: 131072, output: 32768 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
  },
};
