# 2026-10-15: OpenCode V1 & V2 Dual Compatibility and Catalog Sync in `opencode.json`

## Context
- Users running OpenCode V1 and/or OpenCode V2 against `~/.config/opencode/opencode.json` experienced missing new models (`gemini-4-argon-*`, `gemini-3.5-flash-lite`, `gemini-3-flash`) and V1/V2 config conflicts:
  1. `install.sh` had not been re-run after catalog sync `42cb005`/`5811c7f`, leaving the installed plugin in `~/.config/opencode/plugins/antigravity-auth` on the pre-2026-10-14 catalog (`gemini-3.7`, `gemini-3.6`, `gemini-3.1-pro-low`, `gemini-pro-agent`).
  2. `install.sh` stripped the `provider` and `plugin` blocks from `opencode.json`, which broke OpenCode V1 (V1 requires `provider.<id>.models` and `plugin` in `opencode.json`).
  3. If a V1 `provider` block or `plugin` entry is present in `opencode.json`, OpenCode V2 can conflict unless:
     - Entry points (`index.js` and `plugin.js`) expose a unified export compatible with both V1 (callable plugin function) and V2 (`{ id, setup, server }`).
     - `plugin-v2.ts` registers/merges all catalog models even when a `provider` entry already exists from config (`editor.get(providerID)`).
     - `opencode.json` contains the synced `ANTIGRAVITY_MODEL_CATALOG` for V1 without breaking V2 config validation or model resolution.

## Approach
1. **Verify V2 behavior with `provider` and `plugin`/`plugins` in `opencode.json`** using an isolated `XDG_CONFIG_HOME` in the workspace.
2. **Unify `plugin.js` and `index.js` exports** so that importing either `./plugins/antigravity-auth` (directory) or `./plugins/antigravity-auth/plugin.js` (file) works in both V1 and V2:
   - Export callable plugin function with `.id = "antigravity-auth"`, `.setup = setup`, `.server = GoogleAntigravityAuthPlugin` attached, plus named exports for V1.
3. **Update `src/plugin-v2.ts` (`ctx.provider.transform`)**:
   - Instead of skipping when `editor.get(providerID)` is truthy, ensure V2 provider metadata (`package: "aisdk:@ai-sdk/google"`, `integrationID: PRIMARY_PROVIDER_ID`) and all `ANTIGRAVITY_MODEL_CATALOG` models are registered/merged cleanly.
4. **Update `install.sh` to generate `opencode.json` from `ANTIGRAVITY_MODEL_CATALOG`**:
   - Dynamically import `./dist/models/catalog.js` during `install.sh` so `opencode.json` is always 100% in sync with `ANTIGRAVITY_MODEL_CATALOG` (zero manual duplication).
   - Write `opencode.json` in a format that both OpenCode V1 and OpenCode V2 accept without errors, warnings, or missing models.
   - Fix the post-install CLI instructions (`opencode models` in V2 vs V1).
5. **Run `bash install.sh` and verify live** that `opencode models --standalone` lists all 15 models per provider (30 total across `google-antigravity` and `antigravity`) including `gemini-4-argon-{high,medium,low}`, `gemini-3.8-flash-{high,medium,low}`, `gemini-3.5-flash-lite`, `gemini-3-flash`, `claude-opus-5-5-*`, `claude-sonnet-5-5-*`, and `gpt-oss-120b-medium`, and that `opencode.json` has the full updated catalog.

## Critical files and ownership
- `antigravity-auth/src/plugin-v2.ts`
- `antigravity-auth/index.js`
- `antigravity-auth/plugin.js`
- `install.sh`
- `antigravity-auth/test/features.test.js`

## Verification
- `AC-01`: `npm run typecheck`, `npm run build`, and `npm test` pass with 0 failures.
- `AC-02`: Both `./index.js` and `./plugin.js` work for V1 (callable function returning `{ auth, tool }`) and V2 (`{ id, setup, server }`).
- `AC-03`: `install.sh` populates `opencode.json` with all 15 models from `ANTIGRAVITY_MODEL_CATALOG` for V1 compatibility while keeping V2 `plugins` working without `PluginModule.LoadError` or config schema errors.
- `AC-04`: `opencode models --standalone` outputs all 15 updated models under both `google-antigravity/*` and `antigravity/*` (including `gemini-4-argon-*`, `gemini-3.5-flash-lite`, `gemini-3-flash`) and zero retired models (`gemini-3.7-*`, `gemini-3.6-*`, `gemini-3.1-pro-*`, `gemini-pro-agent`).

## Execution checklist
- [x] `T-01`: Probe OpenCode V2 config handling (`provider`, `plugin`, `plugins`) in isolated workspace config dir (`AC-03`).
- [x] `T-02`: Update `src/plugin-v2.ts`, `index.js`, and `plugin.js` for dual V1/V2 compatibility (`AC-01`, `AC-02`).
- [x] `T-03`: Update `install.sh` to sync `ANTIGRAVITY_MODEL_CATALOG` into `opencode.json` and deploy updated plugin (`AC-03`, `AC-04`).
- [ ] `T-04`: Add unit test coverage for dual V1/V2 entry exports and run `test-runner` + live `opencode models --standalone` verification (`AC-01`..`AC-04`).

## Evidence and handoff
- T-01 probe findings (2026-10-15, verified against `opencode` v2.0.29 binary + isolated `XDG_CONFIG_HOME`):
  - V2 requires `index.js` default export to be a **plain object** `{id, setup}` — a callable-function default export fails with `SchemaError(Expected object at ["default"])`.
  - V2 ignores `plugin: [...]` file entries (`configured plugin path must be a directory` warn only); V1 ignores unknown `plugins` — **keeping BOTH keys is safe** and required for dual support.
  - V2 `provider.transform` runs BEFORE config normalization: `editor.get(id)` inside transform is always empty. **`npm: "@ai-sdk/google"` in `provider.<id>` is hard-mapped by the V2 normalizer (`mc`/`Iy`/`mR` in the binary) to `package: "@opencode/ai/providers/google"`** — the built-in Google provider, which bypasses `aisdk.hook("sdk")` and our auth fetch → runtime `Method doesn't allow unregistered callers` / `API key not valid`. Plugin code CANNOT defend; the config block MUST NOT exist for V2. This makes one static `opencode.json` unable to serve both V1 and V2 → `install.sh` is version-aware (`OPENCODE_AGY_TARGET` / `opencode --version` detection); V1 target writes `provider.<id>.models` generated from `ANTIGRAVITY_MODEL_CATALOG`, V2 target deletes them.
  - `reasoning` on config models produces only `omitted unsupported legacy setting` warn logs; full catalog (incl. `reasoning`, `modalities`) retained for V1.
- T-02/T-03 done (subagent FixV1V2Compat + main): `plugin-v2.ts` `editor.remove` before `add` (defensive); `install.sh` generates V1 provider models dynamically from `dist/models/catalog.js` for `target=v1`, deletes `provider.<our ids>` for `target=v2`; keeps both `plugins` dir + `plugin` file entries; next-steps fixed to `opencode models --standalone`.
- Live fix verified: `bash install.sh` (target v2) → `~/.config/opencode/opencode.json` no longer has `provider.google-antigravity`/`antigravity`; `opencode models --standalone` lists 30 models (15×2) incl. `gemini-4-argon-*`, `gemini-3.5-flash-lite`, `gemini-3-flash`; zero retired ids. `typecheck`/`build`/`npm test` 56/56 pass.
- Residual: V1-style `provider` block and V2 runtime cannot coexist in one `opencode.json`; users running both binaries must re-run `install.sh` with `OPENCODE_AGY_TARGET` matching the active binary.
- Argon 429 root cause (scout ElderlyCod, cross-checked `antigravity-pi` + `9router`): upstream `daily-cloudcode-pa` gates the model roster on the UA client token — `antigravity/ide` or version `<2.23.0` gets a 26-model catalog WITHOUT Argon → 404 → fallback prod → `429` fingerprint throttle. Fix: default `OPENCODE_AGY_UA_MODE=hub` → `antigravity/hub/<ver> (aidev_client; os_type=…; arch=…; cl=963137146)`, `DEFAULT_ANTIGRAVITY_VERSION=2.23.0`, endpoint order `daily → daily-sandbox → prod` in `constants.ts`, prewarm switched to `ENDPOINT_FALLBACKS[0]`. Live verified: `gemini-4-argon-high` + `-low` → `OK` (~8s, was 280s→429); `gemini-3.8-flash-medium` regression OK. Tests 56/56.
- Note: `claude-sonnet-5-5-*` timed out 300s — Claude/GPT weekly quota is at 0% (quota.js), expected upstream behavior, not a code defect.
- V1/V2 coexistence deployed (2026-10-16): `opencode` → v1 wrapper `~/.local/bin/opencode` (bun binary v1.14.40, `XDG_DATA_HOME=~/.local/share/opencode-v1`, config `~/.config/opencode`); `opencode2` → v2 wrapper (`XDG_CONFIG_HOME=~/.config/opencode2`, self-symlink `opencode -> .` inside). v1 config = `plugin` file entry + `provider` blocks; v2 config = `plugins` only. Shared via symlinks in `~/.config/opencode2`: `plugins`, `skills`, `skill`, `agents`, `commands`, `context-mode`, `AGENTS.md`. V1 fixes applied: (a) bun binary re-signed adhoc (`SIGKILL Code Signature Invalid` on macOS 27), (b) `plugin` schema crash `n._zod.def` — v1 1.14.40 requires `@opencode-ai/plugin` `tool()` helper with zod `args` (doc's plain-object args outdated) → `plugin.ts` tools converted via static `import { tool }`, (c) `auth.json` gained `google-antigravity` entry (v1 only calls loader when auth entry exists; entry duplicated from `antigravity` in v1 data dir).
- Verified: v1 `opencode run google-antigravity/gemini-3.8-flash-medium` → OK ~14s; `antigravity/gemini-3.5-flash-lite` → OK ~8s; v2 `opencode2 models --standalone` → 30 models; tests 56/56.

## Assumptions and contingencies
- If OpenCode V2 logs a warning or error when legacy V1 keys (`npm`, `tool_call`, `reasoning`) appear inside `provider` in `opencode.json`, inspect exact V2 config parser behavior in `T-01` and shape the config/editor transform accordingly.
