#!/bin/bash
#
# Generate Government Office Packs (6 packs + 4 drills)
# 
# This script generates the required government office content for the expansion sprint.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="de"

echo "🏛️  Generating Government Office Packs"
echo ""

# Pack definitions: id, level, seed
PACKS=(
  "anmeldung_address_registration_a1:A1:1"
  "residence_permit_appointment_a2:A2:2"
  "passport_pickup_a1:A1:3"
  "immigration_office_questions_a2:A2:4"
  "health_insurance_basic_a1:A1:5"
  "jobcenter_basic_a2:A2:6"
)

# Drill definitions: id, level
DRILLS=(
  "verb_endings_a1:A1"
  "dative_case_a1:A1"
  "accusative_articles_a1:A1"
  "separable_verbs_a1:A1"
)

echo "📦 Generating 6 government office packs..."

for PACK_DEF in "${PACKS[@]}"; do
  IFS=':' read -r PACK_ID LEVEL SEED <<< "$PACK_DEF"
  
  # Check if pack already exists
  PACK_DIR="$SCRIPT_DIR/../content/v1/workspaces/$WORKSPACE/packs/$PACK_ID"
  if [[ -d "$PACK_DIR" ]]; then
    echo "⏭️  Skipping $PACK_ID (already exists)"
    continue
  fi
  
  echo "📦 Generating: $PACK_ID (Level: $LEVEL)"
  npx tsx "$SCRIPT_DIR/generate-pack.ts" \
    --workspace "$WORKSPACE" \
    --packId "$PACK_ID" \
    --scenario "government_office" \
    --level "$LEVEL" \
    --seed "$SEED"
done

echo ""
echo "🔧 Generating 4 mechanics drills..."

for DRILL_DEF in "${DRILLS[@]}"; do
  IFS=':' read -r DRILL_ID LEVEL <<< "$DRILL_DEF"
  
  # Check if drill already exists
  DRILL_DIR="$SCRIPT_DIR/../content/v1/workspaces/$WORKSPACE/drills/$DRILL_ID"
  if [[ -d "$DRILL_DIR" ]]; then
    echo "⏭️  Skipping $DRILL_ID (already exists)"
    continue
  fi
  
  echo "🔧 Generating: $DRILL_ID (Level: $LEVEL)"
  # Use new-drill.sh to create the drill structure
  ./scripts/new-drill.sh "$DRILL_ID" --workspace "$WORKSPACE" --level "$LEVEL" --title "$(echo "$DRILL_ID" | sed 's/_/ /g' | sed 's/\b\(.\)/\u\1/g')"
done

echo ""
echo "🔄 Regenerating section indexes..."
npm run content:generate-indexes -- --workspace "$WORKSPACE"

echo ""
echo "✅ Government office packs generation complete!"
echo ""
echo "Next steps:"
echo "  1. Review generated packs and drills"
echo "  2. Run: npm run content:validate"
echo "  3. Run: npm run content:quality"
echo "  4. Generate sprint report: ./scripts/sprint-report.sh"

