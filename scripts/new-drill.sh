#!/bin/bash
#
# Create a new drill entry with canonical folder structure
# Usage: ./scripts/new-drill.sh <drill-id> [--workspace <ws>] [--title <title>] [--level <level>]
#
# Example:
#   ./scripts/new-drill.sh accusative_case_a2 --title "Accusative Case Practice" --level A2
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Defaults
WORKSPACE="de"
LEVEL="A1"
TITLE=""
DRILL_ID=""

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
      echo "Usage: $0 <drill-id> [options]"
      echo ""
      echo "Options:"
      echo "  --workspace, -w   Workspace ID (default: de)"
      echo "  --title, -t       Drill title (default: generated from ID)"
      echo "  --level, -l       CEFR level (default: A1)"
      echo ""
      echo "Example:"
      echo "  $0 accusative_case_a2 --title 'Accusative Case Practice' --level A2"
      exit 0
      ;;
    *)
      if [[ -z "$DRILL_ID" ]]; then
        DRILL_ID="$1"
      else
        echo "Unknown option: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$DRILL_ID" ]]; then
  echo "❌ Error: Drill ID is required"
  echo "Usage: $0 <drill-id> [options]"
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
  TITLE=$(echo "$DRILL_ID" | sed 's/_/ /g' | sed 's/\b\(.\)/\u\1/g')
fi

# Paths
DRILL_DIR="$CONTENT_DIR/workspaces/$WORKSPACE/drills/$DRILL_ID"
DRILL_FILE="$DRILL_DIR/drill.json"
INDEX_FILE="$CONTENT_DIR/workspaces/$WORKSPACE/mechanics/index.json"

# Check if drill already exists
if [[ -d "$DRILL_DIR" ]]; then
  echo "❌ Error: Drill already exists at $DRILL_DIR"
  exit 1
fi

# Check if index exists
if [[ ! -f "$INDEX_FILE" ]]; then
  echo "❌ Error: Index file not found at $INDEX_FILE"
  echo "   Make sure mechanics section exists in catalog"
  exit 1
fi

echo "🔧 Creating new drill: $DRILL_ID"
echo "   Workspace: $WORKSPACE"
echo "   Title: $TITLE"
echo "   Level: $LEVEL"
echo ""

# Create drill directory
mkdir -p "$DRILL_DIR"

# Create drill.json
cat > "$DRILL_FILE" << EOF
{
  "id": "$DRILL_ID",
  "schemaVersion": 1,
  "kind": "drill",
  "title": "$TITLE",
  "level": "$LEVEL",
  "estimatedMinutes": 10,
  "description": "TODO: Add description for $TITLE",
  "instructions": "Complete each exercise to practice this grammar concept.",
  "exercises": [
    {
      "id": "ex-001",
      "type": "fill-blank",
      "prompt": "TODO: Add exercise prompt with ___ blank",
      "answer": "TODO",
      "hint": "TODO: Add hint"
    },
    {
      "id": "ex-002",
      "type": "multiple-choice",
      "prompt": "TODO: Add multiple choice question",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Option A",
      "hint": "TODO: Add hint"
    }
  ],
  "passingScore": 70,
  "tags": ["grammar"]
}
EOF

echo "   ✅ Created $DRILL_FILE"

# Generate indexes (replaces manual index editing)
echo ""
echo "🔄 Regenerating section indexes..."
npm run content:generate-indexes -- --workspace "$WORKSPACE"

# Run validation
echo ""
echo "🔍 Running validation..."
npm run content:validate

echo ""
echo "✅ Drill created successfully!"
echo ""
echo "Next steps:"
echo "  1. Edit $DRILL_FILE to add real exercises"
echo "  2. Run: npm run content:validate"
echo "  3. Publish: ./scripts/publish-content.sh"
echo "  4. Promote: ./scripts/promote-staging.sh"

