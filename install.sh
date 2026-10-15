#!/usr/bin/env bash
# One-shot installer for the Google Antigravity Auth plugin for OpenCode.
# Agent/CLI-executable: idempotent, safe to re-run, merges config without clobbering.
#
# Usage:
#   bash install.sh                    # install from this repo
#   bash install.sh /path/to/repo      # install from another checkout
#   OPENCODE_AGY_SKIP_CONFIG=1 bash install.sh   # copy files only, skip config merge
set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SRC_DIR="$REPO_DIR/antigravity-auth"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
OPENCODE_DIR="$CONFIG_HOME/opencode"
PLUGIN_DIR="$OPENCODE_DIR/plugins/antigravity-auth"
CONFIG_FILE="$OPENCODE_DIR/opencode.json"

PLUGIN_FILES=(plugin.js index.js oauth.js transport.js store.js quota.js image.js package.json)

echo "==> Building and installing antigravity-auth plugin to $PLUGIN_DIR"
if [ -f "$SRC_DIR/package.json" ]; then
  echo "==> Compiling TypeScript..."
  (cd "$SRC_DIR" && npm run build)
fi

mkdir -p "$PLUGIN_DIR"
for f in "${PLUGIN_FILES[@]}"; do
  if [ ! -f "$SRC_DIR/$f" ]; then
    echo "ERROR: source file missing: $SRC_DIR/$f" >&2
    exit 1
  fi
  cp "$SRC_DIR/$f" "$PLUGIN_DIR/"
done
if [ -d "$SRC_DIR/dist" ]; then
  rm -rf "$PLUGIN_DIR/dist"
  cp -R "$SRC_DIR/dist" "$PLUGIN_DIR/"
fi
if [ -d "$SRC_DIR/node_modules" ]; then
  rm -rf "$PLUGIN_DIR/node_modules"
  cp -R "$SRC_DIR/node_modules" "$PLUGIN_DIR/"
fi
echo "    copied plugin files, dist, and dependencies"
if [ "${OPENCODE_AGY_SKIP_CONFIG:-0}" = "1" ]; then
  echo "==> SKIP_CONFIG set — not touching $CONFIG_FILE"
else
  if [ ! -f "$CONFIG_FILE" ]; then
    mkdir -p "$OPENCODE_DIR"
    echo "{}" > "$CONFIG_FILE"
  fi
  echo "==> Merging plugin entries + provider (V1) into $CONFIG_FILE"
  # Config shape is version-specific: OpenCode V2 requires `plugins` (dir) and
  # MUST NOT have a `provider` block for our ids (the normalizer maps
  # `npm: "@ai-sdk/google"` to the built-in `@opencode/ai/providers/google`,
  # bypassing this plugin's auth transport -> "API key not valid").
  # OpenCode V1 requires `plugin` (file) + `provider.<id>.models` in the config.
  TARGET="${OPENCODE_AGY_TARGET:-auto}"
  if [ "$TARGET" = "auto" ]; then
    VER_MAJOR="$( (opencode --version 2>/dev/null || opencode2 --version 2>/dev/null || true) | grep -oE '[0-9]+' | head -1 )"
    if [ "${VER_MAJOR:-2}" = "1" ]; then TARGET="v1"; else TARGET="v2"; fi
  fi
  echo "    target: $TARGET (override with OPENCODE_AGY_TARGET=v1|v2)"
  node --input-type=module - "$CONFIG_FILE" "$PLUGIN_DIR" "$TARGET" <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [configFile, pluginDir, target] = process.argv.slice(2);
const catalogModule = await import(pathToFileURL(path.join(pluginDir, "dist/models/catalog.js")).href);
const catalog = catalogModule.ANTIGRAVITY_MODEL_CATALOG;
const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
const dirEntry = "./plugins/antigravity-auth";
const fileEntry = "./plugins/antigravity-auth/plugin.js";
const PROVIDER_IDS = ["google-antigravity", "antigravity"];

// `plugins` (dir) is the V2 load path; `plugin` (file) is the V1 load path.
// Keeping both is safe: V1 ignores unknown `plugins`, V2 ignores `plugin`
// (only a benign "plugin path must be a directory" log line).
if (!Array.isArray(cfg.plugins)) cfg.plugins = [];
if (!cfg.plugins.includes(dirEntry)) cfg.plugins.push(dirEntry);
if (!Array.isArray(cfg.plugin)) cfg.plugin = [];
if (!cfg.plugin.includes(fileEntry)) cfg.plugin.push(fileEntry);

if (target === "v1") {
  // V1 reads the model catalog from `provider.<id>.models` (npm/tool_call/
  // reasoning/modalities schema). Generated from ANTIGRAVITY_MODEL_CATALOG so
  // it can never drift from the plugin's wire catalog.
  cfg.provider ??= {};
  for (const pId of PROVIDER_IDS) {
    cfg.provider[pId] = {
      ...(cfg.provider[pId] ?? {}),
      name: pId === "google-antigravity" ? "Google Antigravity" : "Antigravity",
      npm: "@ai-sdk/google",
      models: catalog,
    };
  }
} else {
  // V2: the plugin registers providers + models itself via provider.transform.
  // A config `provider` block for our ids is normalized onto the built-in
  // Google provider and must be removed.
  if (cfg.provider && typeof cfg.provider === "object") {
    for (const pId of PROVIDER_IDS) delete cfg.provider[pId];
    if (Object.keys(cfg.provider).length === 0) delete cfg.provider;
  }
}
fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
NODE
  echo "    config merged"
fi

chmod +x "$PLUGIN_DIR/quota.js" "$PLUGIN_DIR/image.js" 2>/dev/null || true

echo
echo "==> Done. Next steps:"
echo "  1. opencode auth login   # pick 'Google Antigravity (browser)'"
echo "  2. opencode models --standalone"
echo "  3. opencode              # select google-antigravity/gemini-3.8-flash-high"
echo "  4. node $PLUGIN_DIR/quota.js  # check remaining quota & token limits"
