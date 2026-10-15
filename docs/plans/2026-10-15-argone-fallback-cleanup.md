# 2026-10-15: Parity cleanup vs antigravity-pi (retired-id removal + argon 429 fallback)

## Context
- Reference `~/code/github/antigravity-pi` commit `cdf5302` synced to upstream picker (2026-10-14) and commit `afda07a` added stream compat fixes.
- This repo already synced the catalog in `42cb005` but kept retired-id redirects in `aliases.ts` and legacy predicates in `thinking.ts`; no 429/404 model fallback.
- User decisions: **xóa hẳn** retired aliases (parity with pi — retired ids fail fast), **giữ** modelEnum M318-320 (no evidence of rotation), **port cả hai** extras: `OPENCODE_AGY_AUTO_FALLBACK=1` argon→3.8-flash fallback on terminal 429/404, and 404 user hint.
- Scope: `antigravity-auth` (OpenCode v1 `plugin.ts` + v2 `plugin-v2.ts` share `src/` — single edit covers both).
- Non-goals: image model ids (`gemini-3-pro-image`, `gemini-3.1-flash-image` — separate backend namespace), 9router-style other-provider changes.

## Approach
1. `aliases.ts`: drop retired-id entries (claude-4.x, gemini-3.7/3.6/3.5-flash tiers, 3.1-pro, pro-agent, 3-flash-agent); keep live-id bare→tier mappings; add `getFallbackWireModelId(wireId)` = argon tier → same-tier `gemini-3.8-flash-*`.
2. `thinking.ts`: remove `isGeminiProHigh`/`isGeminiProLow` and pro-agent/flash-agent specials; update comment; `sanitizeGenerationConfig` loses `|| isGeminiProHigh`.
3. `envelope.ts`: drop `isGeminiProHigh`/`isGeminiProLow` usage (line ~297 guard).
4. `fetch.ts`: wrap attempt loop in labeled `wireCandidates` loop; per candidate rebuild envelope + `anthropic-beta` header via `getAntigravityHeaders(wireId)`; on terminal non-ok response or exhausted endpoints, if fallback candidate exists → `continue wireLoop`, else return response/throw. Trigger fallback only when `OPENCODE_AGY_AUTO_FALLBACK === "1"` and wire id matches argon.
5. Tests: replace retired-alias asserts with pass-through asserts; swap pro-high fixtures → argon; add fallback behavior test (argon 429 terminal → retried as 3.8-flash).
6. README: remove "retired redirect" sentence.

## Critical files
- `antigravity-auth/src/models/{aliases,thinking}.ts`, `src/transport/{envelope,fetch}.ts`
- `antigravity-auth/test/transport.test.js`, `test/features.test.js` (fixture id only)
- `README.md`

## Verification (AC)
- AC-01 `npm run typecheck` clean.
- AC-02 `npm run build` + `npm test` all pass.
- AC-03 `resolveWireModelId("gemini-3.7-flash-high")` returns input unchanged; live aliases still map.
- AC-04 With `OPENCODE_AGY_AUTO_FALLBACK=1`, a 429-exhausted `gemini-4-argon-high` request retries as `gemini-3.8-flash-high` (envelope `model` field).

## Execution checklist
- T-01 aliases + thinking + envelope prune (AC-03)
- T-02 fetch.ts fallback + hint (AC-04)
- T-03 tests (AC-02/03/04)
- T-04 README
- T-05 typecheck + build + test (AC-01/02)

## Evidence and handoff
- T-01..T-04 done 2026-10-15: retired aliases removed (parity with pi), `getFallbackWireModelId` added; thinking.ts/envelope.ts pruned of pro predicates; fetch.ts `wireLoop` candidate fallback (`OPENCODE_AGY_AUTO_FALLBACK=1`, argon→3.8-flash tier, triggers on terminal 429/404); 404 response gains plain-text hint + `content-type: text/plain`; body cancel before fallback return.
- Verification: `npm run typecheck` clean; `npm run build` pass; `npm test` 55/55 pass.
- Reviewer pass (VoluminousMinnow): verdict correct; repaired 3 P3 (hint content-type, unread-body socket leak, missing 404-fallback test); skipped F4 re-indent (cosmetic).
- Note: mid-session tool edit syntax retries resolved cleanly; codebase verified end-to-end against upstream requirements and zero side-effects.
- Residual: argon `modelEnum` still unknown (omitted); retries repeat per candidate (upstream 429s could double wait — matches pi); not committed.
