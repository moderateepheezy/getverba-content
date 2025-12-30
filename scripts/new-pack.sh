#!/bin/bash
#
# Create a new pack entry with canonical folder structure
# Usage: ./scripts/new-pack.sh <pack-id> [--workspace <ws>] [--title <title>] [--level <level>]
#
# Example:
#   ./scripts/new-pack.sh shopping_conversations --title "Shopping Conversations" --level A2
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Defaults
WORKSPACE="de"
LEVEL="A1"
TITLE=""
PACK_ID=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace|-w)
      WORKSPACE="$2"
      shift 2
      ;;
    --title|-t)
      TITLE="$2"
      shift 2
      ;;
    --level|-l)
      LEVEL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 <pack-id> [options]"
      echo ""
      echo "Options:"
      echo "  --workspace, -w   Workspace ID (default: de)"
      echo "  --title, -t       Pack title (default: generated from ID)"
      echo "  --level, -l       CEFR level (default: A1)"
      echo ""
      echo "Example:"
      echo "  $0 shopping_conversations --title 'Shopping Conversations' --level A2"
      exit 0
      ;;
    *)
      if [[ -z "$PACK_ID" ]]; then
        PACK_ID="$1"
      else
        echo "Unknown option: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$PACK_ID" ]]; then
  echo "❌ Error: Pack ID is required"
  echo "Usage: $0 <pack-id> [options]"
  exit 1
fi

# Validate level
VALID_LEVELS="A1 A2 B1 B2 C1 C2"
if [[ ! " $VALID_LEVELS " =~ " $LEVEL " ]]; then
  echo "❌ Error: Invalid level '$LEVEL'. Must be one of: $VALID_LEVELS"
  exit 1
fi

# Generate title from ID if not provided
if [[ -z "$TITLE" ]]; then
  TITLE=$(echo "$PACK_ID" | sed 's/_/ /g' | sed 's/\b\(.\)/\u\1/g')
fi

# Paths
PACK_DIR="$CONTENT_DIR/workspaces/$WORKSPACE/packs/$PACK_ID"
PACK_FILE="$PACK_DIR/pack.json"
INDEX_FILE="$CONTENT_DIR/workspaces/$WORKSPACE/context/index.json"

# Check if pack already exists
if [[ -d "$PACK_DIR" ]]; then
  echo "❌ Error: Pack already exists at $PACK_DIR"
  exit 1
fi

# Check if index exists
if [[ ! -f "$INDEX_FILE" ]]; then
  echo "❌ Error: Index file not found at $INDEX_FILE"
  exit 1
fi

echo "📦 Creating new pack: $PACK_ID"
echo "   Workspace: $WORKSPACE"
echo "   Title: $TITLE"
echo "   Level: $LEVEL"
echo ""

# Create pack directory
mkdir -p "$PACK_DIR"

# Create pack.json
cat > "$PACK_FILE" << EOF
{
  "id": "$PACK_ID",
  "kind": "pack",
  "title": "$TITLE",
  "level": "$LEVEL",
  "estimatedMinutes": 15,
  "description": "TODO: Add description for $TITLE",
  "outline": [
    "Introduction",
    "Key Phrases",
    "Practice"
  ],
  "prompts": [
    {
      "id": "prompt-001",
      "text": "TODO: Add prompt text",
      "translation": "TODO: Add translation",
      "audioUrl": "/v1/audio/$PACK_ID/prompt-001.mp3"
    }
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "intro",
        "title": "Introduction",
        "promptIds": ["prompt-001"]
      },
      {
        "id": "phrases",
        "title": "Key Phrases",
        "promptIds": ["prompt-001"]
      },
      {
        "id": "practice",
        "title": "Practice",
        "promptIds": ["prompt-001"]
      }
    ]
  },
  "tags": []
}
EOF

echo "   ✅ Created $PACK_FILE"

# Update index.json
# Read current index
INDEX_CONTENT=$(cat "$INDEX_FILE")

# Extract current total
CURRENT_TOTAL=$(echo "$INDEX_CONTENT" | grep -o '"total": *[0-9]*' | grep -o '[0-9]*')
NEW_TOTAL=$((CURRENT_TOTAL + 1))

# Create new item
NEW_ITEM=$(cat << EOF
    {
      "id": "$PACK_ID",
      "kind": "pack",
      "title": "$TITLE",
      "level": "$LEVEL",
      "durationMinutes": 15,
      "entryUrl": "/v1/workspaces/$WORKSPACE/packs/$PACK_ID/pack.json"
    }
EOF
)

# Add item to index (before the closing bracket of items array)
# This is a simple approach - for production, use jq if available
if command -v jq &> /dev/null; then
  # Use jq for reliable JSON manipulation
  jq --arg id "$PACK_ID" \
     --arg title "$TITLE" \
     --arg level "$LEVEL" \
     --arg entryUrl "/v1/workspaces/$WORKSPACE/packs/$PACK_ID/pack.json" \
     '.total = (.total + 1) | .items += [{id: $id, kind: "pack", title: $title, level: $level, durationMinutes: 15, entryUrl: $entryUrl}]' \
     "$INDEX_FILE" > "$INDEX_FILE.tmp" && mv "$INDEX_FILE.tmp" "$INDEX_FILE"
  echo "   ✅ Updated $INDEX_FILE (total: $NEW_TOTAL)"
else
  echo "   ⚠️  jq not found. Please manually add the item to $INDEX_FILE:"
  echo ""
  echo "$NEW_ITEM"
  echo ""
fi

# Run validation
echo ""
echo "🔍 Running validation..."
npm run content:validate

echo ""
echo "✅ Pack created successfully!"
echo ""
echo "Next steps:"
echo "  1. Edit $PACK_FILE to add real content"
echo "  2. Run: npm run content:validate"
echo "  3. Publish: ./scripts/publish-content.sh"
echo "  4. Promote: ./scripts/promote-staging.sh"

