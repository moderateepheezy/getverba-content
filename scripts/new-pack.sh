#!/bin/bash
#
# Create a new pack entry with canonical folder structure
# Usage: ./scripts/new-pack.sh <pack-id> [--workspace <ws>] [--title <title>] [--level <level>]
#        ./scripts/new-pack.sh <pack-id> --generate --scenario <scenario> [--level <level>] [--seed <seed>]
#
# Example:
#   ./scripts/new-pack.sh shopping_conversations --title "Shopping Conversations" --level A2
#   ./scripts/new-pack.sh work_2 --generate --scenario work --level A2 --seed 42
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Defaults
WORKSPACE="de"
LEVEL="A1"
TITLE=""
PACK_ID=""
GENERATE=false
SCENARIO=""
SEED=1

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
    --generate|-g)
      GENERATE=true
      shift
      ;;
    --scenario|-s)
      SCENARIO="$2"
      shift 2
      ;;
    --seed)
      SEED="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 <pack-id> [options]"
      echo ""
      echo "Options:"
      echo "  --workspace, -w   Workspace ID (default: de)"
      echo "  --title, -t       Pack title (default: generated from ID)"
      echo "  --level, -l       CEFR level (default: A1)"
      echo "  --generate, -g    Generate pack from template (requires --scenario)"
      echo "  --scenario, -s    Scenario ID (work, restaurant, shopping) - required with --generate"
      echo "  --seed            Random seed for deterministic generation (default: 1)"
      echo ""
      echo "Examples:"
      echo "  $0 shopping_conversations --title 'Shopping Conversations' --level A2"
      echo "  $0 work_2 --generate --scenario work --level A2 --seed 42"
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

# If generate mode, validate scenario
if [[ "$GENERATE" == true ]]; then
  if [[ -z "$SCENARIO" ]]; then
    echo "❌ Error: --scenario is required when using --generate"
    exit 1
  fi
  
  # Run generator
  echo "📦 Generating pack from template..."
  npx tsx "$SCRIPT_DIR/generate-pack.ts" \
    --workspace "$WORKSPACE" \
    --packId "$PACK_ID" \
    --scenario "$SCENARIO" \
    --level "$LEVEL" \
    --seed "$SEED"
  
  # Generate indexes
  echo ""
  echo "🔄 Regenerating section indexes..."
  npm run content:generate-indexes -- --workspace "$WORKSPACE"
  
  # Run validation
  echo ""
  echo "🔍 Running validation..."
  npm run content:validate
  
  # Run quality check
  echo ""
  echo "🔍 Running quality check..."
  npm run content:quality
  
  # Get entry URL
  ENTRY_URL="/v1/workspaces/$WORKSPACE/packs/$PACK_ID/pack.json"
  INDEX_PATH="$CONTENT_DIR/workspaces/$WORKSPACE/context/index.json"
  
  echo ""
  echo "✅ Pack generated successfully!"
  echo ""
  echo "📋 Entry URL: $ENTRY_URL"
  echo "📋 Section index: $INDEX_PATH"
  exit 0
fi

# Manual mode (original behavior)
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
  "schemaVersion": 1,
  "kind": "pack",
  "title": "$TITLE",
  "level": "$LEVEL",
  "estimatedMinutes": 15,
  "description": "TODO: Add description for $TITLE",
  "scenario": "TODO: Add scenario (e.g., work, restaurant, shopping, doctor, housing)",
  "register": "neutral",
  "primaryStructure": "TODO: Add primaryStructure (e.g., verb_position, negation, modal_verbs, dative_case)",
  "variationSlots": ["subject", "verb"],
  "outline": [
    "Introduction",
    "Key Phrases",
    "Practice"
  ],
  "prompts": [
    {
      "id": "prompt-001",
      "text": "TODO: Add prompt text",
      "intent": "TODO: Add intent (greet, request, apologize, inform, ask, confirm, schedule, order, ask_price, thank, goodbye)",
      "gloss_en": "TODO: Add natural English meaning (6-180 chars, must be genuine English, not literal translation)",
      "alt_de": "TODO: Optional native German paraphrase (6-240 chars)",
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
  "tags": [],
  "analytics": {
    "goal": "TODO: What this pack trains (1-120 chars)",
    "constraints": [
      "TODO: What is held constant (e.g., 'formal register maintained', 'work scenario context')"
    ],
    "levers": [
      "TODO: What changes across prompts (must reference variationSlots, e.g., 'subject variation', 'verb substitution')"
    ],
    "successCriteria": [
      "TODO: What 'good' sounds like (e.g., 'Uses formal address correctly')"
    ],
    "commonMistakes": [
      "TODO: Most likely failure modes (e.g., 'Forgetting formal address')"
    ],
    "drillType": "TODO: One of 'substitution', 'pattern-switch', 'roleplay-bounded'",
    "cognitiveLoad": "TODO: One of 'low', 'medium', 'high'"
  }
}
EOF

echo "   ✅ Created $PACK_FILE"

# Generate indexes (replaces manual index editing)
echo ""
echo "🔄 Regenerating section indexes..."
npm run content:generate-indexes -- --workspace "$WORKSPACE"

# Run validation
echo ""
echo "🔍 Running validation..."
npm run content:validate

echo ""
echo "✅ Pack created successfully!"
echo ""
echo "Next steps:"
echo "  1. Edit $PACK_FILE to add real content"
echo "  2. Fill meaning contract fields (intent, gloss_en, optional alt_de) for each prompt"
echo "  3. Run: npm run content:validate"
echo "  4. Run: npm run content:report (review report)"
echo "  5. Publish: ./scripts/publish-content.sh"
echo "  6. Promote: ./scripts/promote-staging.sh"
echo ""
echo "⚠️  Remember: Fill meaning contract fields (intent, gloss_en) before publishing!"

