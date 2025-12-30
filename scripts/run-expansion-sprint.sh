#!/bin/bash

# Expansion Sprint Orchestrator
# 
# Orchestrates the complete expansion sprint workflow:
# 1. Generate packs/drills
# 2. Regenerate indexes
# 3. Run validation + quality gates
# 4. Produce sprint report
# 5. Produce curriculum exports
# 6. Print release candidate summary
#
# Usage:
#   ./scripts/run-expansion-sprint.sh --workspace de --scenario government_office --packs 20 --drills 10 --level A1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Parse arguments
WORKSPACE=""
SCENARIO=""
PACKS=0
DRILLS=0
LEVEL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    --packs)
      PACKS="$2"
      shift 2
      ;;
    --drills)
      DRILLS="$2"
      shift 2
      ;;
    --level)
      LEVEL="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$WORKSPACE" ]; then
  echo "❌ Error: --workspace argument required"
  exit 1
fi

if [ -z "$SCENARIO" ]; then
  echo "❌ Error: --scenario argument required"
  exit 1
fi

if [ "$PACKS" -eq 0 ] && [ "$DRILLS" -eq 0 ]; then
  echo "❌ Error: At least one of --packs or --drills must be > 0"
  exit 1
fi

echo "🚀 Starting Expansion Sprint"
echo "   Workspace: $WORKSPACE"
echo "   Scenario: $SCENARIO"
echo "   Level: ${LEVEL:-all}"
echo "   Packs: $PACKS"
echo "   Drills: $DRILLS"
echo ""

# Step 1: Generate packs/drills
if [ "$PACKS" -gt 0 ]; then
  echo "📦 Step 1: Generating $PACKS pack(s)..."
  if [ -f "$SCRIPT_DIR/expand-content.sh" ]; then
    "$SCRIPT_DIR/expand-content.sh" \
      --workspace "$WORKSPACE" \
      --section context \
      --count "$PACKS" \
      --scenario "$SCENARIO" \
      --level "${LEVEL:-A1}"
  else
    echo "⚠️  expand-content.sh not found, skipping pack generation"
  fi
  echo ""
fi

if [ "$DRILLS" -gt 0 ]; then
  echo "📦 Step 1: Generating $DRILLS drill(s)..."
  if [ -f "$SCRIPT_DIR/expand-content.sh" ]; then
    "$SCRIPT_DIR/expand-content.sh" \
      --workspace "$WORKSPACE" \
      --section mechanics \
      --count "$DRILLS" \
      --scenario "$SCENARIO" \
      --level "${LEVEL:-A1}"
  else
    echo "⚠️  expand-content.sh not found, skipping drill generation"
  fi
  echo ""
fi

# Step 2: Regenerate indexes
echo "🔄 Step 2: Regenerating indexes..."
npm run content:generate-indexes -- --workspace "$WORKSPACE"
echo ""

# Step 3: Run validation + quality gates
echo "🔍 Step 3: Running validation and quality gates..."
if ! npm run content:validate > /dev/null 2>&1; then
  echo "❌ Validation failed. Fix errors before continuing."
  exit 1
fi
echo "   ✅ Validation passed"
echo ""

if ! npm run content:quality > /dev/null 2>&1; then
  echo "❌ Quality gates failed. Review quality report."
  exit 1
fi
echo "   ✅ Quality gates passed"
echo ""

# Step 4: Produce sprint report
echo "📊 Step 4: Generating sprint report..."
if [ -f "$SCRIPT_DIR/sprint-report.sh" ]; then
  "$SCRIPT_DIR/sprint-report.sh" --workspace "$WORKSPACE" > /dev/null 2>&1 || true
  echo "   ✅ Sprint report generated"
else
  echo "   ⚠️  sprint-report.sh not found, skipping"
fi
echo ""

# Step 5: Produce curriculum exports
echo "📦 Step 5: Generating curriculum exports..."
EXPORT_OUT="$SCRIPT_DIR/../exports"
mkdir -p "$EXPORT_OUT"

# Export all sections
npm run content:export-bundle -- \
  --workspace "$WORKSPACE" \
  --section all \
  --out "$EXPORT_OUT" \
  --scenario "$SCENARIO" \
  ${LEVEL:+--level "$LEVEL"} \
  --format bundle

echo "   ✅ Curriculum exports generated"
echo ""

# Step 6: Print release candidate summary
echo "✅ Expansion Sprint Complete!"
echo ""
echo "📋 Release Candidate Summary:"
echo ""
echo "Generated Content:"
echo "  - Packs: $PACKS"
echo "  - Drills: $DRILLS"
echo "  - Workspace: $WORKSPACE"
echo "  - Scenario: $SCENARIO"
echo "  - Level: ${LEVEL:-all}"
echo ""
echo "Next Steps:"
echo "  1. Review generated content:"
echo "     cd $CONTENT_DIR/workspaces/$WORKSPACE"
echo ""
echo "  2. Publish to staging:"
echo "     ./scripts/publish-content.sh"
echo ""
echo "  3. Run smoke test:"
echo "     ./scripts/smoke-test-content.sh"
echo ""
echo "  4. Promote to production:"
echo "     ./scripts/promote-staging.sh"
echo ""
echo "Export Bundle Location:"
echo "  $EXPORT_OUT/$WORKSPACE/*/"
echo ""

