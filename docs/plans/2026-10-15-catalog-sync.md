# 2026-10-15: Sync OpenCode Antigravity plugin catalog

## Context
`antigravity-opencode` plugin (`antigravity-auth/`) still ships the pre-2026-10-14 picker: gemini-3.7/3.6/3.1-pro/gemini-pro-agent/gemini-3.5* are live in catalog, aliases and wire profiles; upstream removed them (9router `8cd29c1b`). Missing: gemini-4-argon tiers, gemini-3.5-flash-lite, gemini-3-flash. Claude 5.5 + gpt-oss-120b-medium + 3.8-flash tiers already live.

## Approach (source of truth: 9router open-sse/providers/registry/antigravity.js @ 8cd29c1b)
- catalog.ts: remove 3.7/3.6/3.1-pro/pro-agent entries; add gemini-4-argon-{high,medium,low} (1M/65536, reasoning), gemini-3.5-flash-lite (1M/65536, reasoning:false), gemini-3-flash (1M/65536, reasoning:false).
- aliases.ts: bare `gemini-3.8-flash` → `-high`? Upstream 9router maps bare→medium; plugin currently maps bare→high. KEEP existing bare→high? Align with upstream: bare → medium (parity fix; note in commit). Retired ids redirect to nearest live: gemini-3.7-flash*→3.8 same tier; gemini-3.6-flash*→3.8 same tier; gemini-3.5-flash*→3.5-flash-lite or 3.8-low? Decision: gemini-3.5-flash* tiers → gemini-3.5-flash-lite is non-thinking; better map old tiers to 3.8-flash equivalents (high→high, medium→medium, low/extra-low→low); gemini-3.5-flash-lite already live so it needs NO alias (remove the redirect, add catalog entry); gemini-3-flash-agent→gemini-3.8-flash-high; gemini-3.1-pro*/pro-agent→gemini-4-argon-high (pro-tier replacement); gemini-3-flash is live → remove redirect, add catalog entry.
- wire-profiles.ts: prune removed ids; add argon tiers (65536; enum unknown → omit modelEnum). Claude 5.5 stays 64000 (backend caps) even though upstream capability lists 128k — wire profile reflects observed 400; keep 64000.
- thinking.ts: extend predicates to argon (gemini-4-*): isGemini3Model-ish coverage for `gemini-4`; MINIMAL unsupported already returns false for major>=4 — argon ok; default level: argon bare→MEDIUM via suffix logic (bare argon has no suffix → falls through to LOW floor... need argon bare→MEDIUM special-case); getDefaultThinkingLevel must handle argon tiers (high/medium/low suffixes → same level names). Gemini-3-flash/lite non-thinking: sanitizeGenerationConfig must NOT inject thinkingConfig for them — they hit the `isGemini3` path today (id includes "gemini-3") → add catalog reasoning:false guard already exists in sanitize path (checks catalogEntry.reasoning !== false) — catalog entries carry reasoning:false, good; also ensure isGemini3High etc. don't misclassify.
- README table + model list (lines ~118-137) sync.
- transport.test.js: update catalog-id assertions + alias resolution asserts (~lines 270-292).
- Keep the pre-existing uncommitted plugin-v2.ts integrationID fix untouched (separate concern).

## Verification (AC)
- AC-01 `cd antigravity-auth && npm run typecheck` clean.
- AC-02 `npm run build` + `npm test` all pass.
- AC-03 resolveWireModelId maps retired ids → live ids; new catalog ids resolve to themselves.
- AC-04 sanitizeGenerationConfig injects thinkingLevel for 3.8/argon, strips for claude-5-5, and does NOT inject for gemini-3-flash/3.5-flash-lite.
- AC-05 README table matches catalog.

## Execution checklist
- T-01 catalog/aliases/wire-profiles (AC-03)
- T-02 thinking.ts (AC-04)
- T-03 tests (AC-02)
- T-04 README (AC-05)
- T-05 typecheck+build+test (AC-01, AC-02)

## Evidence and handoff
- Implemented by subagent OcCatalogSync (2026-10-15): catalog/aliases/wire-profiles/thinking updated; transport.test.js asserts + README synced. Pre-existing plugin-v2.ts integrationID diff left untouched.
- `npm run typecheck`: pass. `npm run build`: pass. `npm test`: 51 passed, 0 failed.
- Residual risk: argon modelEnum tokens unknown (omitted); claude-5-5 wire cap kept at 64000 (observed 400 upstream) though capabilities list 128k.
- Not committed — awaiting user instruction.
