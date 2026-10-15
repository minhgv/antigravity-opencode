/**
 * Comprehensive Model Catalog for Google Antigravity.
 * Mirrors the 2026-10-14 model picker: Gemini 4 Argon and Gemini 3.8 Flash
 * tiers, Gemini 3.5 Flash Lite, Gemini 3 Flash, Claude 5.5 tiers, and GPT-OSS
 * 120B (Medium). Backend-only ids are intentionally left out here.
 */
import type { ModelCatalogEntry } from "../types/index.js";

export const ANTIGRAVITY_MODEL_CATALOG: Record<string, ModelCatalogEntry> = {
  // Gemini 4 Argon
  "gemini-4-argon-high": {
    name: "Gemini 4 Argon (High) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-4-argon-medium": {
    name: "Gemini 4 Argon (Medium) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-4-argon-low": {
    name: "Gemini 4 Argon (Low) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

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

  "gemini-3.5-flash-lite": {
    name: "Gemini 3.5 Flash Lite (Antigravity)",
    limit: { context: 1000000, output: 65536 },
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3-flash": {
    name: "Gemini 3 Flash (Antigravity)",
    limit: { context: 1000000, output: 65536 },
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // Claude 5.5 tiered wire ids.
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

  "gpt-oss-120b-medium": {
    name: "GPT OSS 120b (Medium) (Antigravity)",
    limit: { context: 131072, output: 32768 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
  },
};
