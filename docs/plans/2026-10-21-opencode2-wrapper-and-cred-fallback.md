# 2026-10-21: Fix `opencode2` API Key Error (Wrapper `XDG_CONFIG_HOME` & V2 Credential Fallback)

## Context
- Running `opencode2` with `google-antigravity/*` or `antigravity/*` models fails with `Error: API key not valid. Please pass a valid API key.` (`AI.Error.Authentication`), whereas running `XDG_CONFIG_HOME=~/.config/opencode2 opencode2 run --standalone -m google-antigravity/gemini-3.8-flash-medium "Reply with OK"` succeeds (`OK`).
- Two root causes were identified:
  1. **Broken `~/.opencode/bin/opencode2` wrapper & stale daemon**:
     - `~/.opencode/bin/opencode2` currently contains only `exec "$(dirname "$0")/opencode" "$@"` without `export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config/opencode2}"`.
     - `install.sh` line 131 checked `if [ ! -f "$V2_WRAPPER" ] || grep -q 'opencode2' "$V2_WRAPPER"`, which skipped overwriting an existing `opencode2` wrapper that lacked `opencode2` in its text!
     - Without `XDG_CONFIG_HOME=~/.config/opencode2`, `opencode2` loads V1's `~/.config/opencode/opencode.json`, which defines `provider.google-antigravity` with `npm: "@ai-sdk/google"`. OpenCode V2 normalizes config `npm: "@ai-sdk/google"` into its built-in `@opencode/ai/providers/google` package, bypassing `ctx.aisdk.hook("sdk")` and sending raw OAuth tokens as Google AI Studio API keys.
     - Additionally, a background `opencode serve --service` daemon spawned before `XDG_CONFIG_HOME` was set remains cached in memory and serves non-`--standalone` `opencode2` invocations using the V1 config.
  2. **Missing fallback in `resolveV2Credential` (`src/auth/v2-credentials.ts`)**:
     - `resolveV2Credential` only checks `ctx.integration.connection.active(id)` and returns `null` if no active runtime connection is found, unlike `toolAuth` which falls back to `resolveStoredAccessToken()` (`auth.json` and direct `opencode.db` SQLite read with token auto-refresh).

## Approach
1. **Fix `install.sh` V2 wrapper update & daemon restart**:
   - In `install.sh`, unconditionally write/update `$V2_WRAPPER` (`~/.opencode/bin/opencode2`) when `$V2_BIN` and `$V2_SEPARATE` are active (or check `grep -q 'XDG_CONFIG_HOME.*opencode2'`), ensuring `export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$V2_DIR}"` is always present.
   - Ensure the daemon restart step kills any running `opencode serve` process so `opencode2` respawns the service with `XDG_CONFIG_HOME=~/.config/opencode2`.
2. **Add resilient credential fallback in `antigravity-auth/src/auth/v2-credentials.ts`**:
   - In `resolveV2Credential(ctx, providerID)`, if `ctx.integration.connection.active(id)` returns nothing or fails to resolve, fall back to `resolveStoredAccessToken()` from `./store.js` (which checks `auth.json` and `opencode.db` and refreshes expired tokens) and return `{ type: "oauth", methodID: "oauth", access: stored.access, metadata: { projectId: stored.projectId } }`.
3. **Add unit test coverage in `antigravity-auth/test/features.test.js`**:
   - Verify `resolveV2Credential` returns the active connection credential when present and falls back when `connection.active` returns `undefined`.

## Critical files and ownership
- `install.sh`
- `antigravity-auth/src/auth/v2-credentials.ts`
- `antigravity-auth/test/features.test.js`

## Verification
- `AC-01`: `npm run typecheck`, `npm run build`, and `npm test` pass with 0 failures.
- `AC-02`: After running `bash install.sh`, `~/.opencode/bin/opencode2` sets `XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config/opencode2}"`.
- `AC-03`: `opencode2 run -m google-antigravity/gemini-3.8-flash-medium "Reply with OK"` (both with and without `--standalone`) succeeds and outputs `OK` with zero API key errors.
- `AC-04`: `opencode2 run -m antigravity/gemini-3.8-flash-medium "Reply with OK"` succeeds and outputs `OK`.

## Execution checklist
- [x] `T-01`: Update `antigravity-auth/src/auth/v2-credentials.ts` to fall back to `resolveStoredAccessToken()` when `ctx.integration.connection.active` is empty (`AC-01`).
- [x] `T-02`: Update `install.sh` so `$V2_WRAPPER` is always updated with `XDG_CONFIG_HOME` and stale `opencode serve` daemons are restarted (`AC-02`).
- [x] `T-03`: Add unit test in `antigravity-auth/test/features.test.js` and run `test-runner` (`AC-01`).
- [x] `T-04`: Run `bash install.sh` and verify `opencode2 run` live against `google-antigravity` and `antigravity` (`AC-02`, `AC-03`, `AC-04`).

## Evidence and handoff
- Baseline reproduction (2026-10-21):
  - `opencode2 run -m google-antigravity/gemini-3.8-flash-medium "Reply with OK"` -> `Error: API key not valid. Please pass a valid API key.` (loaded `/Users/giapminh79/.config/opencode/opencode.json`).
  - `XDG_CONFIG_HOME=/Users/giapminh79/.config/opencode2 /Users/giapminh79/.opencode/bin/opencode run --standalone --print-logs -m google-antigravity/gemini-3.8-flash-medium "Reply with OK"` -> `OK` (loaded `/Users/giapminh79/.config/opencode2/opencode/opencode.json` and plugin `antigravity-auth/index.js`).
- `T-01`..`T-03` completed (2026-10-21):
  - `antigravity-auth/src/auth/v2-credentials.ts`: `resolveV2Credential` now falls back to `resolveStoredAccessToken()` when `ctx.integration.connection.active` returns `undefined` or throws.
  - `install.sh`: Unconditionally updates `$V2_WRAPPER` (`~/.opencode/bin/opencode2`) with `export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$V2_DIR}"` and matches `opencode` / `opencode2` processes cleanly via `case "$(basename "$comm")"` when restarting `opencode serve` daemons.
  - `test-runner` receipt: `npm run typecheck && npm run build && npm test` -> exit code 0, 57/57 tests pass.
- `T-04` live verification (2026-10-21):
  - `bash install.sh` -> updated `/Users/giapminh79/.opencode/bin/opencode2`, merged configs, restarted stale `opencode serve` daemon.
  - `opencode2 run -m google-antigravity/gemini-3.8-flash-medium "Reply with exactly: OK"` (daemon mode) -> `OK`.
  - `opencode2 run --standalone -m antigravity/gemini-3.8-flash-medium "Reply with exactly: OK"` (standalone mode) -> `OK`.
  - `opencode run -m google-antigravity/gemini-3.8-flash-medium "Reply with exactly: OK"` (V1 regression check) -> `OK`.
- Reviewer receipt: `status: pass`, 0 blocking/important/nit findings.

## Assumptions and contingencies
- Both V1 (`opencode`) and V2 (`opencode2`) coexist on this workstation; `opencode` uses `~/.config/opencode` and `opencode2` uses `~/.config/opencode2`.
