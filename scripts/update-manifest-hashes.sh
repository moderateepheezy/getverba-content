#!/bin/bash

# Update manifest with workspace hashes
# Usage: ./scripts/update-manifest-hashes.sh [manifest-path]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_DIR="$SCRIPT_DIR/../content/meta"
MANIFEST_PATH="${1:-$META_DIR/manifest.staging.json}"

if [ ! -f "$MANIFEST_PATH" ]; then
  echo "❌ Error: Manifest not found: $MANIFEST_PATH"
  exit 1
fi

echo "📝 Generating workspace hashes..."

# Generate hashes using TypeScript script
HASHES_JSON=$(npx tsx "$SCRIPT_DIR/generate-workspace-hashes.ts" "$MANIFEST_PATH")

if [ -z "$HASHES_JSON" ]; then
  echo "❌ Error: Failed to generate workspace hashes"
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required to update manifest"
  exit 1
fi

# Update manifest with hashes
TEMP_FILE=$(mktemp)
jq --argjson hashes "$HASHES_JSON" '.workspaceHashes = $hashes' "$MANIFEST_PATH" > "$TEMP_FILE"
mv "$TEMP_FILE" "$MANIFEST_PATH"

echo "✅ Updated workspace hashes in $MANIFEST_PATH"
echo "$HASHES_JSON" | jq -r 'to_entries[] | "   \(.key): \(.value)"'

