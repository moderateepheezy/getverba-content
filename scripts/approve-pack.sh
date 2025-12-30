#!/bin/bash

# Approve Pack
# Updates pack.json review fields to approved status
# Usage: ./scripts/approve-pack.sh <packId> --reviewer "<name>" [--workspace <ws>]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Parse arguments
PACK_ID=""
REVIEWER=""
WORKSPACE=""

for i in "$@"; do
  case $i in
    --reviewer)
      REVIEWER="$2"
      shift 2
      ;;
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    *)
      if [ -z "$PACK_ID" ]; then
        PACK_ID="$i"
      fi
      shift
      ;;
  esac
done

if [ -z "$PACK_ID" ]; then
  echo "❌ Error: Pack ID is required"
  echo "Usage: ./scripts/approve-pack.sh <packId> --reviewer \"<name>\" [--workspace <ws>]"
  exit 1
fi

if [ -z "$REVIEWER" ]; then
  echo "❌ Error: Reviewer name is required"
  echo "Usage: ./scripts/approve-pack.sh <packId> --reviewer \"<name>\" [--workspace <ws>]"
  exit 1
fi

# Find pack file
PACK_PATH=""
if [ -n "$WORKSPACE" ]; then
  PACK_PATH="$CONTENT_DIR/workspaces/$WORKSPACE/packs/$PACK_ID/pack.json"
else
  # Search all workspaces
  for ws_dir in "$CONTENT_DIR/workspaces"/*; do
    if [ -d "$ws_dir" ]; then
      test_path="$ws_dir/packs/$PACK_ID/pack.json"
      if [ -f "$test_path" ]; then
        PACK_PATH="$test_path"
        WORKSPACE=$(basename "$ws_dir")
        break
      fi
    fi
  done
fi

if [ -z "$PACK_PATH" ] || [ ! -f "$PACK_PATH" ]; then
  echo "❌ Error: Pack not found: $PACK_ID"
  exit 1
fi

echo "✅ Approving pack: $PACK_ID"
echo "   Workspace: $WORKSPACE"
echo "   Reviewer: $REVIEWER"
echo ""

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required for this script"
  echo "   Install with: brew install jq"
  exit 1
fi

# Update review fields
REVIEWED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create temporary file with updated JSON
TEMP_FILE=$(mktemp)
jq --arg reviewer "$REVIEWER" --arg reviewedAt "$REVIEWED_AT" \
  '.review.status = "approved" | .review.reviewer = $reviewer | .review.reviewedAt = $reviewedAt' \
  "$PACK_PATH" > "$TEMP_FILE"

# Replace original file
mv "$TEMP_FILE" "$PACK_PATH"

echo "✅ Pack approved successfully!"
echo "   Review status updated to: approved"
echo "   Reviewed at: $REVIEWED_AT"
echo ""

# Run validation
echo "🔍 Running validation..."
cd "$SCRIPT_DIR/.."
if npm run content:validate > /dev/null 2>&1; then
  echo "✅ Validation passed"
else
  echo "⚠️  Validation found issues (see output above)"
fi

