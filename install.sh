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
  echo "==> Merging plugin + provider into $CONFIG_FILE"
  node - "$CONFIG_FILE" "$PLUGIN_DIR" <<'NODE'
const fs = require("fs");
const [configFile, pluginDir] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(configFile, "utf8"));
// v2 loads plugins from the `plugins` key (directory targets);
// the legacy `plugin` file entry stays for V1 installs (<2.x).
const dirEntry = `./plugins/antigravity-auth`;
const fileEntry = `./plugins/antigravity-auth/plugin.js`;

if (!Array.isArray(cfg.plugins)) cfg.plugins = [];
if (!cfg.plugins.includes(dirEntry)) cfg.plugins.push(dirEntry);
if (Array.isArray(cfg.plugin)) {
  const kept = cfg.plugin.filter((s) => s !== fileEntry && s !== dirEntry);
  if (kept.length) cfg.plugin = kept;
  else delete cfg.plugin;
}

// v2: the plugin registers providers + model catalog itself, so the legacy
// `provider` block (V1 schema: npm/models/tool_call/reasoning) is removed to
// avoid "unsupported legacy setting" warnings and model duplication.
if (cfg.provider && typeof cfg.provider === "object") {
  for (const pId of ["google-antigravity", "antigravity"]) delete cfg.provider[pId];
  if (Object.keys(cfg.provider).length === 0) delete cfg.provider;
}
fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
NODE
  echo "    config merged"
fi

chmod +x "$PLUGIN_DIR/quota.js" "$PLUGIN_DIR/image.js" 2>/dev/null || true

echo
echo "==> Done. Next steps:"
echo "  1. opencode auth login   # pick 'Google Antigravity (browser)'"
echo "  2. opencode models google-antigravity"
echo "  3. opencode              # select google-antigravity/gemini-3.8-flash-high"
echo "  4. node $PLUGIN_DIR/quota.js  # check remaining quota & token limits"
