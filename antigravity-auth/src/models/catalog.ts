/**
 * Comprehensive Model Catalog for Google Antigravity.
 * Includes Gemini 3.8, 3.7, 3.6, 3.5, 3.1 Pro, Claude Opus/Sonnet, and GPT OSS.
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
  "gemini-3.1-pro-high": {
    name: "Gemini 3.1 Pro High (→ gemini-pro-agent)",
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
  "gemini-3.1-pro": {
    name: "Gemini 3.1 Pro (Antigravity)",
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
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.6-flash-low": {
    name: "Gemini 3.6 Flash (Low) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // Gemini 3.5 Flash
  "gemini-3-flash-agent": {
    name: "Gemini 3.5 Flash (High) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.5-flash-low": {
    name: "Gemini 3.5 Flash (Medium) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.5-flash-extra-low": {
    name: "Gemini 3.5 Flash (Low) (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.5-flash-lite": {
    name: "Gemini 3.5 Flash-Lite (Antigravity)",
    limit: { context: 1048576, output: 65535 },
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
  },
  "gemini-3.5-flash": {
    name: "Gemini 3.5 Flash (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // Gemini 3 Flash & 3.1 Flash
  "gemini-3-flash": {
    name: "Gemini 3 Flash (Antigravity)",
    limit: { context: 1048576, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "gemini-3.1-flash-lite": {
    name: "Gemini 3.1 Flash Lite (Antigravity)",
    limit: { context: 1048576, output: 65535 },
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
  },
  "gemini-3.1-flash-image": {
    name: "Gemini 3.1 Flash Image (Antigravity)",
    limit: { context: 1000000, output: 64000 },
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
  },

  // Claude models via Antigravity bridge
  "claude-opus-4-6": {
    name: "Claude Opus 4.6 (Antigravity)",
    limit: { context: 250000, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-opus-4-6-thinking": {
    name: "Claude Opus 4.6 Thinking (Antigravity)",
    limit: { context: 250000, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-sonnet-4-6": {
    name: "Claude Sonnet 4.6 (Antigravity)",
    limit: { context: 200000, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-sonnet-4-6-thinking": {
    name: "Claude Sonnet 4.6 Thinking (Antigravity)",
    limit: { context: 200000, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-sonnet-4-5": {
    name: "Claude Sonnet 4.5 (Antigravity)",
    limit: { context: 200000, output: 65536 },
    reasoning: false,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "claude-sonnet-4-5-thinking": {
    name: "Claude Sonnet 4.5 Thinking (Antigravity)",
    limit: { context: 200000, output: 65536 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text", "image"], output: ["text"] },
  },

  // GPT OSS models
  "gpt-oss-120b": {
    name: "GPT OSS 120b (Antigravity)",
    limit: { context: 131072, output: 32768 },
    reasoning: true,
    tool_call: true,
    modalities: { input: ["text"], output: ["text"] },
  },
};
