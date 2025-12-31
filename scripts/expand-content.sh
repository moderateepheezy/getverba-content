#!/bin/bash
#
# Content Expansion Sprint - Batch Generator
# 
# Generates multiple packs/drills in batch for content expansion.
# Usage:
#   ./scripts/expand-content.sh --workspace de --section context --count 20 --scenario government_office --level A1
#   ./scripts/expand-content.sh --workspace de --section mechanics --count 10 --level A1
#   ./scripts/expand-content.sh --workspace de --section context --scenario government_office --level A1 --register formal --dry-run
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Defaults
WORKSPACE="de"
SECTION="context"
COUNT=20
SCENARIO=""
LEVEL="A1"
REGISTER=""
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace|-w)
      WORKSPACE="$2"
      shift 2
      ;;
    --section|-s)
      SECTION="$2"
      shift 2
      ;;
    --count|-c)
      COUNT="$2"
      shift 2
      ;;
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    --level|-l)
      LEVEL="$2"
      shift 2
      ;;
    --register|-r)
      REGISTER="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --workspace, -w   Workspace ID (default: de)"
      echo "  --section, -s      Section: context|exams|mechanics (default: context)"
      echo "  --count, -c        Number of items to generate (default: 20)"
      echo "  --scenario         Scenario ID (work, restaurant, shopping, doctor, housing, government_office)"
      echo "  --level, -l        CEFR level: A1|A2|B1|B2|C1|C2 (default: A1)"
      echo "  --register, -r     Register: formal|neutral|casual (optional, uses template default if not specified)"
      echo "  --dry-run          Show what would be generated without creating files"
      echo ""
      echo "Examples:"
      echo "  $0 --workspace de --section context --count 20 --scenario government_office --level A1"
      echo "  $0 --workspace de --section mechanics --count 10 --level A1"
      echo "  $0 --workspace de --section context --scenario government_office --level A1 --register formal --dry-run"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate section
VALID_SECTIONS="context exams mechanics"
if [[ ! " $VALID_SECTIONS " =~ " $SECTION " ]]; then
  echo "❌ Error: Invalid section '$SECTION'. Must be one of: $VALID_SECTIONS"
  exit 1
fi

# Validate level
VALID_LEVELS="A1 A2 B1 B2 C1 C2"
if [[ ! " $VALID_LEVELS " =~ " $LEVEL " ]]; then
  echo "❌ Error: Invalid level '$LEVEL'. Must be one of: $VALID_LEVELS"
  exit 1
fi

# Validate register if provided
if [[ -n "$REGISTER" ]]; then
  VALID_REGISTERS="formal neutral casual"
  if [[ ! " $VALID_REGISTERS " =~ " $REGISTER " ]]; then
    echo "❌ Error: Invalid register '$REGISTER'. Must be one of: $VALID_REGISTERS"
    exit 1
  fi
fi

# Determine item type based on section
if [[ "$SECTION" == "context" ]]; then
  ITEM_TYPE="pack"
elif [[ "$SECTION" == "mechanics" ]]; then
  ITEM_TYPE="drill"
elif [[ "$SECTION" == "exams" ]]; then
  ITEM_TYPE="exam"
else
  echo "❌ Error: Unknown item type for section '$SECTION'"
  exit 1
fi

# For context section, scenario is required
if [[ "$SECTION" == "context" && -z "$SCENARIO" ]]; then
  echo "❌ Error: --scenario is required for context section"
  exit 1
fi

# For mechanics section, scenario is not used (drills are grammar-focused)
if [[ "$SECTION" == "mechanics" && -n "$SCENARIO" ]]; then
  echo "⚠️  Warning: --scenario is ignored for mechanics section (drills are grammar-focused)"
  SCENARIO=""
fi

echo "🚀 Content Expansion Sprint - Batch Generator"
echo "   Workspace: $WORKSPACE"
echo "   Section: $SECTION"
echo "   Item Type: $ITEM_TYPE"
echo "   Count: $COUNT"
echo "   Level: $LEVEL"
if [[ -n "$SCENARIO" ]]; then
  echo "   Scenario: $SCENARIO"
fi
if [[ -n "$REGISTER" ]]; then
  echo "   Register: $REGISTER"
fi
if [[ "$DRY_RUN" == true ]]; then
  echo "   Mode: DRY RUN (no files will be created)"
fi
echo ""

# Generate items
GENERATED_ITEMS=()

if [[ "$ITEM_TYPE" == "pack" ]]; then
  # Generate packs using generate-pack.ts
  for ((i=1; i<=COUNT; i++)); do
    # Generate pack ID (convert LEVEL to lowercase for compatibility)
    LEVEL_LOWER=$(echo "$LEVEL" | tr '[:upper:]' '[:lower:]')
    if [[ -n "$SCENARIO" ]]; then
      PACK_ID="${SCENARIO}_pack_${i}_${LEVEL_LOWER}"
    else
      PACK_ID="pack_${i}_${LEVEL_LOWER}"
    fi
    
    # Check if pack already exists
    PACK_DIR="$CONTENT_DIR/workspaces/$WORKSPACE/packs/$PACK_ID"
    if [[ -d "$PACK_DIR" ]]; then
      echo "⏭️  Skipping $PACK_ID (already exists)"
      continue
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
      echo "📦 [DRY RUN] Would generate: $PACK_ID"
      GENERATED_ITEMS+=("$PACK_ID")
    else
      echo "📦 Generating pack $i/$COUNT: $PACK_ID"
      # Use seed based on index for deterministic generation
      SEED=$i
      npx tsx "$SCRIPT_DIR/generate-pack.ts" \
        --workspace "$WORKSPACE" \
        --packId "$PACK_ID" \
        --scenario "$SCENARIO" \
        --level "$LEVEL" \
        --seed "$SEED"
      
      GENERATED_ITEMS+=("$PACK_ID")
    fi
  done
elif [[ "$ITEM_TYPE" == "drill" ]]; then
  # Generate drills - for now, create placeholder drills
  # In a full implementation, you'd have a generate-drill.ts similar to generate-pack.ts
  DRILL_TEMPLATES=(
    "verb_endings"
    "dative_case"
    "accusative_articles"
    "separable_verbs"
    "verb_position"
    "negation"
    "question_formation"
    "case_endings"
  )
  
  for ((i=1; i<=COUNT; i++)); do
    # Use template name with level
    TEMPLATE_INDEX=$(( (i - 1) % ${#DRILL_TEMPLATES[@]} ))
    TEMPLATE_NAME="${DRILL_TEMPLATES[$TEMPLATE_INDEX]}"
    LEVEL_LOWER=$(echo "$LEVEL" | tr '[:upper:]' '[:lower:]')
    DRILL_ID="${TEMPLATE_NAME}_${LEVEL_LOWER}_${i}"
    
    # Check if drill already exists
    DRILL_DIR="$CONTENT_DIR/workspaces/$WORKSPACE/drills/$DRILL_ID"
    if [[ -d "$DRILL_DIR" ]]; then
      echo "⏭️  Skipping $DRILL_ID (already exists)"
      continue
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
      echo "🔧 [DRY RUN] Would generate: $DRILL_ID"
      GENERATED_ITEMS+=("$DRILL_ID")
    else
      echo "🔧 Generating drill $i/$COUNT: $DRILL_ID"
      # Use new-drill.sh for now (manual editing required)
      ./scripts/new-drill.sh "$DRILL_ID" --workspace "$WORKSPACE" --level "$LEVEL" --title "$(echo "$TEMPLATE_NAME" | sed 's/_/ /g' | sed 's/\b\(.\)/\u\1/g') - $LEVEL"
      GENERATED_ITEMS+=("$DRILL_ID")
    fi
  done
else
  echo "❌ Error: Exam generation not yet implemented"
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "✅ [DRY RUN] Would generate ${#GENERATED_ITEMS[@]} items"
  echo ""
  echo "To actually generate, run without --dry-run:"
  echo "  $0 $@"
  exit 0
fi

if [[ ${#GENERATED_ITEMS[@]} -eq 0 ]]; then
  echo "⚠️  No items generated (all may already exist)"
  exit 0
fi

echo ""
echo "✅ Generated ${#GENERATED_ITEMS[@]} items"

# Regenerate indexes
echo ""
echo "🔄 Regenerating section indexes..."
npm run content:generate-indexes -- --workspace "$WORKSPACE"

# Run validation
echo ""
echo "🔍 Running validation..."
npm run content:validate || {
  echo "⚠️  Validation found issues. Please review and fix before publishing."
}

echo ""
echo "✅ Batch generation complete!"
echo ""
echo "Next steps:"
echo "  1. Review generated items"
echo "  2. Run: npm run content:validate (if not already run)"
echo "  3. Run: npm run content:quality"
echo "  4. Publish: ./scripts/publish-content.sh"
echo "  5. Promote: ./scripts/promote-staging.sh"

