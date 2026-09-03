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

PLUGIN_FILES=(plugin.js oauth.js transport.js store.js package.json)

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
const entry = `./plugins/antigravity-auth/plugin.js`;

if (!Array.isArray(cfg.plugin)) cfg.plugin = [];
if (!cfg.plugin.includes(entry)) cfg.plugin.push(entry);

const MODELS = {
  // Gemini 3.8 Flash (Provisional / Ready)
  "gemini-3.8-flash": { name: "Gemini 3.8 Flash (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.8-flash-high": { name: "Gemini 3.8 Flash (High) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.8-flash-medium": { name: "Gemini 3.8 Flash (Medium) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.8-flash-low": { name: "Gemini 3.8 Flash (Low) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },

  // Gemini 3.7 Flash
  "gemini-3.7-flash-high": { name: "Gemini 3.7 Flash (High) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.7-flash-medium": { name: "Gemini 3.7 Flash (Medium) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.7-flash-low": { name: "Gemini 3.7 Flash (Low) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },

  // Gemini 3.1 Pro (Agent)
  "gemini-pro-agent": { name: "Gemini 3.1 Pro (High) (Antigravity)", limit: { context: 1048576, output: 65535 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.1-pro-high": { name: "Gemini 3.1 Pro High (→ gemini-pro-agent)", limit: { context: 1048576, output: 65535 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.1-pro-low": { name: "Gemini 3.1 Pro (Low) (Antigravity)", limit: { context: 1048576, output: 65535 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },

  // Gemini 3.6 Flash
  "gemini-3.6-flash-high": { name: "Gemini 3.6 Flash (High) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.6-flash-medium": { name: "Gemini 3.6 Flash (Medium) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: false, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.6-flash-low": { name: "Gemini 3.6 Flash (Low) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: false, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },

  // Gemini 3.5 Flash
  "gemini-3-flash-agent": { name: "Gemini 3.5 Flash (High) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.5-flash-low": { name: "Gemini 3.5 Flash (Medium) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.5-flash-extra-low": { name: "Gemini 3.5 Flash (Low) (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.5-flash-lite": { name: "Gemini 3.5 Flash-Lite (Antigravity)", limit: { context: 1048576, output: 65535 }, reasoning: false, tool_call: true, modalities: { input: ["text"], output: ["text"] } },

  // Gemini 3 Flash & 3.1 Flash
  "gemini-3-flash": { name: "Gemini 3 Flash (Antigravity)", limit: { context: 1048576, output: 65536 }, reasoning: true, tool_call: true, modalities: { input: ["text", "image"], output: ["text"] } },
  "gemini-3.1-flash-lite": { name: "Gemini 3.1 Flash Lite (Antigravity)", limit: { context: 1048576, output: 65535 }, reasoning: false, tool_call: true, modalities: { input: ["text"], output: ["text"] } },
  "gemini-3.1-flash-image": { name: "Gemini 3.1 Flash Image (Antigravity)", limit: { context: 1000000, output: 64000 }, reasoning: false, tool_call: true, modalities: { input: ["text"], output: ["text"] } }
};

cfg.provider = cfg.provider || {};
for (const pId of ["google-antigravity", "antigravity"]) {
  cfg.provider[pId] = cfg.provider[pId] || {};
  cfg.provider[pId].name = cfg.provider[pId].name || (pId === "antigravity" ? "Antigravity (Native)" : "Google Antigravity");
  cfg.provider[pId].npm = cfg.provider[pId].npm || "@ai-sdk/google";
  cfg.provider[pId].models = Object.assign({}, MODELS, cfg.provider[pId].models || {});
}
fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
NODE
  echo "    config merged"
fi

echo
echo "==> Done. Next steps:"
echo "  1. opencode auth login   # pick 'Google Antigravity (browser)'"
echo "  2. opencode models google-antigravity"
echo "  3. opencode              # select google-antigravity/gemini-3-flash"
