#!/usr/bin/env bash
# One-shot installer for the Google Antigravity Auth plugin for OpenCode.
# Covers every coexistence case: v1-only, v2-only, v1+v2 side-by-side.
# Idempotent, safe to re-run; merges config without clobbering other keys.
#
# Usage:
#   bash install.sh                    # install + auto-detect + configure
#   bash install.sh /path/to/repo      # install from another checkout
#   OPENCODE_AGY_SKIP_CONFIG=1 bash install.sh   # copy files only
#   OPENCODE_AGY_NO_RESTART=1 bash install.sh    # do not restart `opencode serve`
set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
SRC_DIR="$REPO_DIR/antigravity-auth"
V1_CFG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"   # canonical v1 (or v2-single) config
V2_DIR="$HOME/.config/opencode2"                          # v2 config root when dual
V1_DATA_DIR="$HOME/.local/share/opencode-v1"
V2_DATA_DIR="$HOME/.local/share/opencode"
V1_WRAPPER="$HOME/.local/bin/opencode"
V2_WRAPPER="$HOME/.opencode/bin/opencode2"
PLUGIN_FILES=(plugin.js index.js oauth.js transport.js store.js quota.js image.js package.json)
PROVIDER_IDS=(google-antigravity antigravity)
SHARED_ENTRIES=(skills skill agents commands context-mode AGENTS.md)

# ---------------------------------------------------------------- detection
V1_BIN=""
# Prefer the platform binary (opencode-<os>-<arch>/bin/opencode): the
# `opencode-ai/bin/opencode` JS launcher can spawn a stale cached `.opencode`
# binary and exit 0 with no output.
for f in "$HOME"/.bun/install/global/node_modules/opencode-*-*/bin/opencode; do
  [ -x "$f" ] && V1_BIN="$f" && break
done
V2_BIN="$HOME/.opencode/bin/opencode"
[ -x "$V2_BIN" ] || V2_BIN=""

ver_major() { ( "$1" --version 2>/dev/null || true ) | grep -oE '[0-9]+' | head -1; }

HAS_V1=0; HAS_V2=0
[ -n "$V1_BIN" ] || [ -f "$V1_WRAPPER" ] && HAS_V1=1
[ -n "$V2_BIN" ] || [ -f "$V2_WRAPPER" ] && HAS_V2=1
if [ "$HAS_V1" -eq 0 ] && command -v opencode >/dev/null 2>&1; then
  [ "$(ver_major opencode)" = "1" ] && HAS_V1=1
fi
if [ "$HAS_V2" -eq 0 ]; then
  [ "$(ver_major opencode2)" = "2" ] && HAS_V2=1
  [ "$HAS_V1" -eq 0 ] && [ "$(ver_major opencode)" = "2" ] && HAS_V2=1
fi
# A separate v2 config root is required when: it already exists, an opencode2
# wrapper exists, or both binaries are installed (they must not share config).
V2_SEPARATE=0
[ -d "$V2_DIR" ] || [ -f "$V2_WRAPPER" ] && V2_SEPARATE=1
{ [ "$HAS_V1" -eq 1 ] && [ "$HAS_V2" -eq 1 ]; } && V2_SEPARATE=1

TARGET="${OPENCODE_AGY_TARGET:-auto}"
if [ "$TARGET" = "auto" ]; then
  if [ "$HAS_V1" -eq 1 ]; then TARGET="v1"; else TARGET="v2"; fi
fi

echo "==> Detected: v1=$HAS_V1 v2=$HAS_V2 v2-separate=$V2_SEPARATE target=$TARGET"

# ---------------------------------------------------------------- build + copy
PLUGIN_DIR="$V1_CFG_DIR/plugins/antigravity-auth"
echo "==> Building and installing antigravity-auth plugin to $PLUGIN_DIR"
if [ -f "$SRC_DIR/package.json" ]; then
  echo "==> Compiling TypeScript..."
  (cd "$SRC_DIR" && npm run build)
fi

install_plugin_files() {
  local dir="$1"
  mkdir -p "$dir"
  for f in "${PLUGIN_FILES[@]}"; do
    [ -f "$SRC_DIR/$f" ] || { echo "ERROR: source file missing: $SRC_DIR/$f" >&2; exit 1; }
    cp "$SRC_DIR/$f" "$dir/"
  done
  if [ -d "$SRC_DIR/dist" ]; then rm -rf "$dir/dist"; cp -R "$SRC_DIR/dist" "$dir/"; fi
  if [ -d "$SRC_DIR/node_modules" ]; then rm -rf "$dir/node_modules"; cp -R "$SRC_DIR/node_modules" "$dir/"; fi
}

install_plugin_files "$PLUGIN_DIR"
echo "    copied plugin files, dist, and dependencies"

# If v2 keeps a real (non-symlink) plugins dir, install there too.
if [ "$V2_SEPARATE" -eq 1 ]; then
  # Resolve the v2 config subdir: flat layout uses self-symlink `opencode -> .`.
  V2_CFG_DIR="$V2_DIR"
  if [ -e "$V2_DIR/opencode" ] && [ ! -L "$V2_DIR/opencode" ]; then
    V2_CFG_DIR="$V2_DIR/opencode"
  fi
  if [ -d "$V2_CFG_DIR/plugins" ] && [ ! -L "$V2_CFG_DIR/plugins" ]; then
    install_plugin_files "$V2_CFG_DIR/plugins/antigravity-auth"
    echo "    also copied into real $V2_CFG_DIR/plugins"
  fi
fi

# ---------------------------------------------------------------- wrappers
# V1 wrapper: bun binary + isolated data dir so its sqlite doesn't collide
# with v2's opencode.db schema.
if [ -n "$V1_BIN" ]; then
  if [ ! -f "$V1_WRAPPER" ] || grep -q 'opencode-v1' "$V1_WRAPPER" 2>/dev/null; then
    mkdir -p "$(dirname "$V1_WRAPPER")"
    cat > "$V1_WRAPPER" <<EOF
#!/bin/sh
# opencode (V1) — managed by antigravity-auth install.sh
# Isolated data dir avoids sqlite schema collision with V2; auth.json is
# hardlinked so both versions share OAuth credentials.
export XDG_DATA_HOME="\${XDG_DATA_HOME:-$V1_DATA_DIR}"
exec "$V1_BIN" "\$@"
EOF
    chmod +x "$V1_WRAPPER"
    echo "    wrote v1 wrapper: $V1_WRAPPER"
  fi
  # macOS: adhoc re-sign if the signature is broken (SIGKILL on launch).
  if [ "$(uname)" = "Darwin" ] && ! codesign -v "$V1_BIN" 2>/dev/null; then
    codesign --force --sign - "$V1_BIN" && echo "    re-signed $V1_BIN (adhoc)"
  fi
  # V1 data dir: isolated sqlite + hardlinked auth.json.
  mkdir -p "$V1_DATA_DIR/opencode"
  if [ ! -f "$V1_DATA_DIR/opencode/auth.json" ] && [ -f "$V2_DATA_DIR/opencode/auth.json" ]; then
    ln "$V2_DATA_DIR/opencode/auth.json" "$V1_DATA_DIR/opencode/auth.json" 2>/dev/null \
      || cp "$V2_DATA_DIR/opencode/auth.json" "$V1_DATA_DIR/opencode/auth.json"
    echo "    linked shared auth.json into v1 data dir"
  fi
  if [ ! -e "$V1_DATA_DIR/opencode/log" ] && [ -d "$V2_DATA_DIR/opencode/log" ]; then
    ln -sfn "$V2_DATA_DIR/opencode/log" "$V1_DATA_DIR/opencode/log"
  fi
fi

# V2 wrapper: opencode2 -> v2 binary with isolated XDG_CONFIG_HOME.
if [ -n "$V2_BIN" ] && [ "$V2_SEPARATE" -eq 1 ]; then
  mkdir -p "$(dirname "$V2_WRAPPER")"
  cat > "$V2_WRAPPER" <<EOF
#!/bin/sh
# opencode2 — managed by antigravity-auth install.sh
# V2 resolves config as \$XDG_CONFIG_HOME/opencode; the self-symlink
# \`$V2_DIR/opencode -> .\` keeps files flat in that dir.
export XDG_CONFIG_HOME="\${XDG_CONFIG_HOME:-$V2_DIR}"
exec "\$(dirname "\$0")/opencode" "\$@"
EOF
  chmod +x "$V2_WRAPPER"
  echo "    wrote v2 wrapper: $V2_WRAPPER"
  mkdir -p "$V2_DIR"
  if [ -d "$V2_DIR/opencode" ] && [ ! -L "$V2_DIR/opencode" ]; then
    cp -rn "$V2_DIR/opencode/." "$V2_DIR/" 2>/dev/null || true
    rm -rf "$V2_DIR/opencode"
  fi
  [ -L "$V2_DIR/opencode" ] || ln -sfn . "$V2_DIR/opencode"
  V2_CFG_DIR="$V2_DIR"
  # Shared entries: symlink from v2 config to v1 config when missing.
  for name in "${SHARED_ENTRIES[@]}"; do
    src="$V1_CFG_DIR/$name"; dst="$V2_CFG_DIR/$name"
    [ -e "$dst" ] || [ -L "$dst" ] && continue
    { [ -e "$src" ] || [ -L "$src" ]; } && ln -s "$src" "$dst" && echo "    linked $dst -> $src"
  done
  [ -e "$V2_CFG_DIR/plugins" ] || [ -L "$V2_CFG_DIR/plugins" ] \
    || { [ -d "$V1_CFG_DIR/plugins" ] && ln -s "$V1_CFG_DIR/plugins" "$V2_CFG_DIR/plugins" \
         && echo "    linked $V2_CFG_DIR/plugins -> $V1_CFG_DIR/plugins"; }
fi

# ---------------------------------------------------------------- auth.json
# V1 only invokes the plugin's auth loader when an entry exists for the
# provider id — duplicate `antigravity` -> `google-antigravity` when missing.
for ajson in "$V2_DATA_DIR/opencode/auth.json" "$V1_DATA_DIR/opencode/auth.json"; do
  [ -f "$ajson" ] || continue
  node - "$ajson" <<'NODE' || true
const fs = require("fs");
const f = process.argv[2];
const a = JSON.parse(fs.readFileSync(f, "utf8"));
if (a.antigravity && !a["google-antigravity"]) {
  a["google-antigravity"] = JSON.parse(JSON.stringify(a.antigravity));
  fs.writeFileSync(f, JSON.stringify(a, null, 2));
  console.log("    added google-antigravity auth entry in " + f);
}
NODE
done

# ---------------------------------------------------------------- config merge
if [ "${OPENCODE_AGY_SKIP_CONFIG:-0}" = "1" ]; then
  echo "==> SKIP_CONFIG set — not touching opencode.json files"
else
  merge_cfg() { # $1=file $2=target(v1|v2)
    local cfg_file="$1" target="$2"
    mkdir -p "$(dirname "$cfg_file")"
    [ -f "$cfg_file" ] || echo "{}" > "$cfg_file"
    node --input-type=module - "$cfg_file" "$PLUGIN_DIR" "$target" <<'NODE'
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
// Each version STRICTLY rejects the other's key — write only what this
// target's parser accepts.
if (target === "v1") {
  if (Array.isArray(cfg.plugins)) delete cfg.plugins;
  if (!Array.isArray(cfg.plugin)) cfg.plugin = [];
  if (!cfg.plugin.includes(fileEntry)) cfg.plugin.push(fileEntry);
  // V1 reads the model catalog from provider.<id>.models.
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
  if (Array.isArray(cfg.plugin)) delete cfg.plugin;
  if (!Array.isArray(cfg.plugins)) cfg.plugins = [];
  if (!cfg.plugins.includes(dirEntry)) cfg.plugins.push(dirEntry);
  // V2: plugin self-registers providers+models; a config `provider` block for
  // our ids is normalized onto the built-in Google provider -> must remove.
  if (cfg.provider && typeof cfg.provider === "object") {
    for (const pId of PROVIDER_IDS) delete cfg.provider[pId];
    if (Object.keys(cfg.provider).length === 0) delete cfg.provider;
  }
}
fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n");
NODE
    echo "    merged $cfg_file ($target)"
  }

  merge_cfg "$V1_CFG_DIR/opencode.json" "$TARGET"
  [ "$V2_SEPARATE" -eq 1 ] && merge_cfg "$V2_CFG_DIR/opencode.json" "v2"
fi

# ---------------------------------------------------------------- daemon restart
# A running `opencode serve` keeps the old plugin in memory -> stale
# credentials -> "API key not valid". Kill daemons so they respawn fresh.
if [ "${OPENCODE_AGY_NO_RESTART:-0}" != "1" ]; then
  killed=0
  for pid in $(pgrep -f "opencode serve" 2>/dev/null || true); do
    [ "$pid" = "$$" ] || [ "$pid" = "$PPID" ] && continue
    comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
    case "$(basename "$comm")" in
      opencode|opencode2) kill "$pid" 2>/dev/null && killed=$((killed+1)) ;;
    esac
  done
  [ "$killed" -gt 0 ] && echo "    restarted $killed stale 'opencode serve' daemon(s)"
fi

chmod +x "$PLUGIN_DIR/quota.js" "$PLUGIN_DIR/image.js" 2>/dev/null || true

echo
echo "==> Done. Next steps:"
echo "  1. opencode auth login       # pick 'Google Antigravity (browser)' (once for both v1+v2)"
echo "  2. opencode models --standalone"
echo "  3. opencode | opencode2      # v1 or v2 — both ready"
echo "  4. node $PLUGIN_DIR/quota.js"
