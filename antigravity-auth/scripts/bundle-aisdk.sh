#!/usr/bin/env bash
# Vendors @ai-sdk/google into a single self-contained ESM file at
# dist/vendor/google-ai-sdk.js. Required because the opencode plugin host
# cannot resolve nested bare imports (@ai-sdk/provider-utils, zod, ...) from
# either plugin-local or config-root node_modules.
set -e
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENTRY="$SRC_DIR/node_modules/@ai-sdk/google/dist/index.js"
OUT_DIR="$SRC_DIR/dist/vendor"
OUT="$OUT_DIR/google-ai-sdk.js"

if [ ! -f "$ENTRY" ]; then
  echo "bundle-aisdk: $ENTRY missing — run npm install first" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
if command -v bun >/dev/null 2>&1; then
  bun build "$ENTRY" --outdir "$OUT_DIR" --target bun
  mv "$OUT_DIR/index.js" "$OUT"
elif command -v npx >/dev/null 2>&1; then
  npx --yes esbuild "$ENTRY" --bundle --format=esm --platform=node --outfile="$OUT"
else
  echo "bundle-aisdk: need bun or npx/esbuild to vendor @ai-sdk/google" >&2
  exit 1
fi
echo "bundle-aisdk: wrote $OUT"
