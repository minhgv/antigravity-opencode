# OpenCode 2 Plugin Port (antigravity-auth)

## Context

`opencode`/`opencode2` (same binary v2.0.22) fails with `API key not valid` for
`google-antigravity/*` models: the plugin uses the V1 API (`export async function
Plugin(ctx) → {auth, tool}` + `plugin: [file.js]` config), which V2 never loads.

Verified on v2.0.22 source tag + live probe of `ctx` keys:

- `plugins: ["./plugins/antigravity-auth"]` config key; value is a **directory**,
  `import`ed; must default-export `{id, setup}` (or `{id, effect}`).
- `ctx.integration.transform` → `editor.method.update({integrationID, method:
  {id,type:"oauth",label}, authorize(answer)→{url,instructions,mode:"auto",
  callback:Promise<Credential.OAuth>}, refresh, label})`. Credentials persisted in
  `~/.local/share/opencode/opencode.db` table `credential` (`bun:sqlite`
  importable inside plugin process; verified).
- `connection.resolve` auto-refreshes via `method.refresh` when `expires <=
  now+5min`. OAuth `access` → `apiKey` into SDK options.
- `ctx.provider.transform` → `editor.add({info: Provider.Info, models: Model.Info[]})`;
  `info.package = "aisdk:@ai-sdk/google"` (`aisdk:` prefix required by
  `Provider.isAISDK`). `editor.add` structuredClones info → no functions in config.
- `ctx.model.transform` exists but models inherit `package` from provider; config
  `provider`/`providers` keys unnecessary when plugin registers models.
- `ctx.aisdk.hook("sdk"|"language", cb, {providerID?})`; `evt.options` becomes SDK
  factory options (incl. `fetch`); `evt.sdk` can be assigned (dynamic-plugin
  skips when set, so hook order does not matter).
- `ctx.tool.transform` → `editor.add({name, description, input: JSON-Schema,
  output?, execute(input, ctx2)→{content|output|metadata}})`;
  `editor.namespace()`. `ToolContext` has `sessionID, signal, progress`.
- `PluginContext.location: Location.Info` (has `directory`).
- v1 `plugin` key still exists (v1 service still wired) but v2 migration also
  maps it to `plugins`; keeping only `plugins` dir entry is cleanest.
- Model schema requires: `id, modelID, providerID, name, capabilities{tools,
  input, output}, variants[], time{released}, cost[], status, enabled,
  limit{context, output}`; optional `family, compatibility, package, settings,
  headers, body`.

## Approach

New `src/plugin-v2.ts` + `index.js` (default export `{id:"antigravity-auth",
setup, server}`; `server` = existing v1 `GoogleAntigravityAuthPlugin` for
forward/backward compat). `install.sh` keeps copying `plugin.js`+`index.js` and
writes `plugins` (dir) instead of `plugin`; removes stale `provider` entries for
our ids (models now plugin-registered).

`setup(ctx)`:
1. `integration.transform`: `update` ref names + `method.update` for
   `google-antigravity` and `antigravity`; `authorize` adapts `loginAntigravity()`
   → `{url, instructions, mode:"auto", callback→Credential.OAuth{refresh,access,
   expires, metadata:{projectId,email}}}`; `refresh` wraps `refreshAccessToken`;
   `label` → email.
2. `provider.transform`: `editor.add({info:{id,name,activation:"auto",
   integrationID:id, package:"aisdk:@ai-sdk/google", headers:{}, body:{}},
   models})` for both ids; models built from `ANTIGRAVITY_MODEL_CATALOG`.
3. `aisdk.hook("sdk")`: unscoped; guard `providerID ∈ {primary, alias}` →
   `evt.options.fetch = v2Fetch`; `evt.sdk = createGoogleGenerativeAI(evt.options)`
   (import `@ai-sdk/google` w/ `npm.add` fallback).
   `v2Fetch = createAntigravityFetch({getAccessToken, getProjectId,
   rotateAccount})` where:
   - `getAccessToken(force)`: `connection.active(pid)` → `resolve` → `.access`.
   - `getProjectId`: `credential.metadata.projectId` → meta file →
     `discoverProject` → DEFAULT.
   - `rotateAccount`: sqlite `credential` table: pick sibling credential (other
     integration or inactive cred with different refresh), flip `active=1`, run
     `refresh` impl if expired, return `{accessToken, projectId}`.
4. `tool.transform`: `editor.namespace` optional; `editor.add` `generate_image`,
   `check_quota` adapted to v2 `Info` (JSON-schema input, `{content,metadata}`
   result); creds via `ctx.integration` then `resolveStoredAccessToken` fallback.

`store.ts`: add `resolveDbAccessToken()` reading `opencode.db` credential rows
(`bun:sqlite` → `node:sqlite` → skip) for CLI tools quota.js/image.js when
`auth.json` absent.

## Critical files and ownership

- `antigravity-auth/src/plugin-v2.ts` (new, sole owner)
- `antigravity-auth/index.js` (new)
- `antigravity-auth/src/auth/store.ts` (extend, sole owner)
- `antigravity-auth/src/auth/v2-credentials.ts` (new: integration/sqlite helpers)
- `install.sh` (config merge section)
- `README.md` (v2 install notes)

## Verification

- AC-01 `opencode2 models` lists `google-antigravity/gemini-3.8-flash-high`.
- AC-02 `opencode2 run -m google-antigravity/gemini-3.8-flash-high "hi"` returns a
  model response (no `API key not valid`) using existing opencode.db credential.
- AC-03 No `PluginModule.LoadError` for antigravity-auth in opencode.log.
- AC-04 `check_quota` / `generate_image` tools registered (`opencode2 run`
  tool list / transform log).
- AC-05 `node ~/.config/opencode/plugins/antigravity-auth/quota.js` still works
  (auth.json fallback or db read).

## Execution checklist
- [x] T-01 `src/auth/v2-credentials.ts`: connection resolve, projectId, sqlite
      sibling rotate, refresh persist → AC-02
- [x] T-02 `src/plugin-v2.ts`: setup() with integration+provider+aisdk+tool
      wiring → AC-01..04
- [x] T-03 `index.js` default export + `store.ts` db fallback → AC-05
- [x] T-04 `install.sh` plugins/providers config merge + deploy → AC-01, AC-03
- [x] T-05 build (`tsc`), install, smoke `opencode2 run` → AC-02, AC-04
- [x] T-06 README update

## Evidence and handoff

- Probe: `/tmp/oc2probe/ctx*.txt`, `ctx.json` — ctx domains + editor keys verified
  on binary 2.0.22.
- `bun:sqlite` import inside plugin: verified (10 credential rows read).
- v2.0.22 sources consulted: `plugin/host.ts`, `core/{aisdk,provider,model,
  model-resolver,integration,credential}.ts`, `packages/plugin/src/promise/*`.
- **2026-10-05 delivery evidence**:
  - AC-01 `opencode2 models` → 36 `google-antigravity/*` + `antigravity/*` models.
  - AC-02 `opencode2 run -m google-antigravity/gemini-3.8-flash-high "Reply with exactly: OK"` → `OK` (and same for `antigravity/…`).
  - AC-03 `--print-logs` shows `loading plugin …/antigravity-auth`, zero `PluginModule.LoadError` for our id.
  - AC-04 `check_quota` executed in-session: real pool percentages returned (Gemini 98.7%, Claude/GPT 90.3%).
  - AC-05 `node …/plugins/antigravity-auth/quota.js` → full report via opencode.db fallback.
  - `npm test`: 51/51 pass.
  - Root causes fixed during bring-up:
    1. `"sdk"` hook writeback persists **only `event.sdk`** — `event.options` reassignment is a no-op; SDK must be built and assigned by the plugin.
    2. Plugin host cannot resolve nested bare imports (`@ai-sdk/provider-utils`) under plugin-local or config-root `node_modules` → `@ai-sdk/google` vendored to `dist/vendor/google-ai-sdk.js` via `scripts/bundle-aisdk.sh` (wired into `npm run build`, prefer bun, fallback esbuild).
    3. Credential-backed init injects `apiKey` = OAuth access → SDK requires non-empty key; pass `OAUTH_DUMMY_KEY` (transport rewrites auth headers anyway).
    4. Stale `opencode serve --service` daemon caches plugin state — restart required after reinstall (hit during debugging; not a code defect).

## Assumptions and contingencies

- `@ai-sdk/google` is NOT importable inside the plugin process (host resolver
  blocks nested bare imports) — vendored bundle `dist/vendor/google-ai-sdk.js`
  is the canonical path; node_modules paths remain as dev fallbacks.
- `connection.resolve` refresh covers normal expiry; `rotateAccount` handles
  429-quota only via sqlite writes (in-memory state may not reflect `active`
  flip until restart — acceptable; rotation is local transport-level anyway).
- `Plugin.define` optional; plain `{id, setup}` object suffices (verified).
- After `install.sh`, users on v2 with a running background `opencode serve`
  must restart the service (or reboot) to pick up the new plugin build.
