/**
 * Thought Signature Cache & Fallback for Google Antigravity.
 *
 * Prevents Google Cloud Code Assist HTTP 400 Bad Request ("Missing thought signature"
 * or "Invalid signature") during multi-turn tool calling with reasoning models
 * (Gemini 2.0 Flash Thinking, Gemini 3, Claude 3.7 Thinking).
 *
 * Stores signatures captured from streaming responses keyed by session and tool call identifier.
 */

import { SKIP_THOUGHT_SIGNATURE } from "../auth/constants.js";

/**
 * Valid base64-encoded sentinel (`"skip_thought_signature_validator"` -> base64).
 * Retained for backward compatibility with callers importing DEFAULT_THINKING_AG_SIGNATURE.
 */
export const DEFAULT_THINKING_AG_SIGNATURE = SKIP_THOUGHT_SIGNATURE;

const MAX_SIGNATURE_ENTRIES = 2048;

/** In-memory cache mapping cacheKey -> thoughtSignature */
const signatureCache = new Map<string, string>();

/**
 * Cache a thought signature for a session and call identifier / tool name.
 */
export function recordThoughtSignature(
  sessionId: string,
  identifier: string | undefined,
  signature: string | undefined,
): void {
  if (!sessionId || !identifier || !signature) return;
  if (signature === SKIP_THOUGHT_SIGNATURE) return;
  if (signatureCache.size >= MAX_SIGNATURE_ENTRIES) {
    const oldest = signatureCache.keys().next().value;
    if (oldest !== undefined) signatureCache.delete(oldest);
  }
  signatureCache.set(`${sessionId}::${identifier}`, signature);
}
/**
 * Retrieve a cached thought signature for a session and identifier.
 */
export function getCachedThoughtSignature(
  sessionId: string,
  identifier: string | undefined,
): string | undefined {
  if (!sessionId || !identifier) return undefined;
  return signatureCache.get(`${sessionId}::${identifier}`);
}

/**
 * Resolve thought signature from cache:
 * 1. Check cached signature for callId
 * 2. Check cached signature for tool name
 * 3. Optional fallback when explicitly requested (defaults to false — never
 *    fabricate a cryptographic signature for unsigned sibling tool calls)
 */
export function resolveThoughtSignatureWithFallback(
  sessionId: string | undefined,
  callId: string | undefined,
  toolName: string | undefined,
  options: { fallback?: boolean } = {},
): string | undefined {
  if (sessionId) {
    if (callId) {
      const cached = getCachedThoughtSignature(sessionId, callId);
      if (cached) return cached;
    }
    if (toolName) {
      const cached = getCachedThoughtSignature(sessionId, toolName);
      if (cached) return cached;
    }
  }
  if (options.fallback === true) {
    return DEFAULT_THINKING_AG_SIGNATURE;
  }
  return undefined;
}

/** Clear all cached signatures (useful for testing) */
export function clearThoughtSignatureCache(): void {
  signatureCache.clear();
}
