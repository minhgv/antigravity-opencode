/**
 * OAuth & API constants for Google Antigravity.
 */

// Deobfuscate client credentials via XOR 0x5a
const decode = (hex: string): string =>
  Buffer.from(
    (hex.match(/.{2}/g) || []).map((h) => parseInt(h, 16) ^ 0x5a),
  ).toString("utf8");

export const CLIENT_ID = decode(
  "6b6a6d6b6a6a6c6a6c6a6f636b772e3732292933346832686b3639283f68696f2c2e35363530326e3d6e6a693f2a743b2a2a29743d35353d363f2f293f283935342e3f342e74393537",
);

export const CLIENT_SECRET = decode(
  "1d1519090a0277116f621c0d086e626c163e16106b371618622902196e206c2b1e1b3c",
);

export const REDIRECT_URI = "http://localhost:51121/oauth-callback";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

export const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const PROVIDER_ID = "google-antigravity";
export const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key";
export const DEFAULT_ENDPOINT = "https://cloudcode-pa.googleapis.com";
export const ANTIGRAVITY_DAILY = "https://daily-cloudcode-pa.sandbox.googleapis.com";
export const ANTIGRAVITY_AUTOPUSH = "https://autopush-cloudcode-pa.sandbox.googleapis.com";
export const ENDPOINT_FALLBACKS = [ANTIGRAVITY_DAILY, ANTIGRAVITY_AUTOPUSH, DEFAULT_ENDPOINT];

export const CLAUDE_THINKING_BETA_HEADER = "interleaved-thinking-2025-05-14";
export const SKIP_THOUGHT_SIGNATURE = "skip_thought_signature_validator";
