#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist"
SRC_DIR="$ROOT_DIR/motuwe-extension"

mkdir -p "$OUT_DIR"
ZIP_NAME="motuwe-extension-$(date +%Y%m%d%H%M%S).zip"

cd "$SRC_DIR"
zip -r9 "$OUT_DIR/$ZIP_NAME" . -x "*.DS_Store" -x "images/*.py" -x "README.md"

echo "Created: $OUT_DIR/$ZIP_NAME"
