#!/bin/bash
#
# Sprint Report Generator
# 
# Generates a markdown report for the Content Expansion Sprint.
# Usage:
#   ./scripts/sprint-report.sh [--workspace <ws>]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"
REPORTS_DIR="$SCRIPT_DIR/../docs/content-pipeline"
WORKSPACE="de"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace|-w)
      WORKSPACE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --workspace, -w   Workspace ID (default: de)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

WORKSPACE_DIR="$CONTENT_DIR/workspaces/$WORKSPACE"
REPORT_FILE="$REPORTS_DIR/SPRINT_REPORT.md"

if [[ ! -d "$WORKSPACE_DIR" ]]; then
  echo "❌ Error: Workspace directory not found: $WORKSPACE_DIR"
  exit 1
fi

mkdir -p "$REPORTS_DIR"

echo "📊 Generating sprint report..."
echo "   Workspace: $WORKSPACE"
echo "   Report: $REPORT_FILE"
echo ""

# Collect pack statistics
PACKS_DIR="$WORKSPACE_DIR/packs"
DRILLS_DIR="$WORKSPACE_DIR/drills"

TOTAL_PACKS=0
TOTAL_DRILLS=0

# Temporary files for counting
TMP_SCENARIOS=$(mktemp)
TMP_LEVELS=$(mktemp)
TMP_REGISTERS=$(mktemp)
TMP_STRUCTURES=$(mktemp)
TMP_DRILL_TYPES=$(mktemp)
TMP_COGNITIVE_LOADS=$(mktemp)
TMP_ANALYTICS_COMPLETE=$(mktemp)

# Analyze packs
if [[ -d "$PACKS_DIR" ]]; then
  for PACK_DIR in "$PACKS_DIR"/*; do
    if [[ ! -d "$PACK_DIR" ]]; then
      continue
    fi
    
    PACK_FILE="$PACK_DIR/pack.json"
    if [[ ! -f "$PACK_FILE" ]]; then
      continue
    fi
    
    TOTAL_PACKS=$((TOTAL_PACKS + 1))
    
    # Extract metadata using jq if available, otherwise use grep/sed
    if command -v jq &> /dev/null; then
      SCENARIO=$(jq -r '.scenario // "unknown"' "$PACK_FILE" 2>/dev/null || echo "unknown")
      LEVEL=$(jq -r '.level // "unknown"' "$PACK_FILE" 2>/dev/null || echo "unknown")
      REGISTER=$(jq -r '.register // "unknown"' "$PACK_FILE" 2>/dev/null || echo "unknown")
      PRIMARY_STRUCTURE=$(jq -r '.primaryStructure // "unknown"' "$PACK_FILE" 2>/dev/null || echo "unknown")
      
      # Extract analytics metadata
      DRILL_TYPE=$(jq -r '.analytics.drillType // "missing"' "$PACK_FILE" 2>/dev/null || echo "missing")
      COGNITIVE_LOAD=$(jq -r '.analytics.cognitiveLoad // "missing"' "$PACK_FILE" 2>/dev/null || echo "missing")
      
      # Check if analytics is complete (no TODO markers)
      HAS_ANALYTICS=$(jq -e '.analytics' "$PACK_FILE" >/dev/null 2>&1 && echo "yes" || echo "no")
      HAS_TODO=$(jq -r '.analytics // {}' "$PACK_FILE" 2>/dev/null | grep -q "TODO" && echo "yes" || echo "no")
      
      if [[ "$HAS_ANALYTICS" == "yes" && "$HAS_TODO" == "no" ]]; then
        echo "complete" >> "$TMP_ANALYTICS_COMPLETE"
      else
        echo "incomplete" >> "$TMP_ANALYTICS_COMPLETE"
      fi
    else
      SCENARIO=$(grep -o '"scenario"[[:space:]]*:[[:space:]]*"[^"]*"' "$PACK_FILE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "unknown")
      LEVEL=$(grep -o '"level"[[:space:]]*:[[:space:]]*"[^"]*"' "$PACK_FILE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "unknown")
      REGISTER=$(grep -o '"register"[[:space:]]*:[[:space:]]*"[^"]*"' "$PACK_FILE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "unknown")
      PRIMARY_STRUCTURE=$(grep -o '"primaryStructure"[[:space:]]*:[[:space:]]*"[^"]*"' "$PACK_FILE" | sed 's/.*"\([^"]*\)".*/\1/' || echo "unknown")
      DRILL_TYPE="unknown"
      COGNITIVE_LOAD="unknown"
      echo "incomplete" >> "$TMP_ANALYTICS_COMPLETE"
    fi
    
    echo "$SCENARIO" >> "$TMP_SCENARIOS"
    echo "$LEVEL" >> "$TMP_LEVELS"
    echo "$REGISTER" >> "$TMP_REGISTERS"
    echo "$PRIMARY_STRUCTURE" >> "$TMP_STRUCTURES"
    echo "$DRILL_TYPE" >> "$TMP_DRILL_TYPES"
    echo "$COGNITIVE_LOAD" >> "$TMP_COGNITIVE_LOADS"
  done
fi

# Count drills
if [[ -d "$DRILLS_DIR" ]]; then
  for DRILL_DIR in "$DRILLS_DIR"/*; do
    if [[ -d "$DRILL_DIR" ]]; then
      DRILL_FILE="$DRILL_DIR/drill.json"
      if [[ -f "$DRILL_FILE" ]]; then
        TOTAL_DRILLS=$((TOTAL_DRILLS + 1))
      fi
    fi
  done
fi

# Run validation and capture output
VALIDATION_OUTPUT=""
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

if command -v npm &> /dev/null; then
  echo "🔍 Running validation..."
  VALIDATION_OUTPUT=$(npm run content:validate 2>&1 || true)
  VALIDATION_ERRORS=$(echo "$VALIDATION_OUTPUT" | grep -c "❌\|Error\|error" || true)
  VALIDATION_WARNINGS=$(echo "$VALIDATION_OUTPUT" | grep -c "⚠️\|Warning\|warning" || true)
fi

# Generate report
cat > "$REPORT_FILE" << EOF
# Content Expansion Sprint Report

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")  
**Workspace:** $WORKSPACE

---

## Summary

- **Total Packs:** $TOTAL_PACKS
- **Total Drills:** $TOTAL_DRILLS
- **Total Items:** $((TOTAL_PACKS + TOTAL_DRILLS))

---

## Distribution by Scenario

EOF

# Count scenarios
if [[ -f "$TMP_SCENARIOS" ]]; then
  sort "$TMP_SCENARIOS" | uniq -c | sort -rn | while read COUNT SCENARIO; do
    echo "- **$SCENARIO:** $COUNT pack(s)" >> "$REPORT_FILE"
  done
fi

cat >> "$REPORT_FILE" << EOF

---

## Distribution by Level

EOF

# Count levels (sorted by CEFR order)
for LEVEL in A1 A2 B1 B2 C1 C2; do
  if [[ -f "$TMP_LEVELS" ]]; then
    COUNT=$(grep -c "^${LEVEL}$" "$TMP_LEVELS" 2>/dev/null || echo "0")
    if [[ "$COUNT" -gt 0 ]]; then
      echo "- **$LEVEL:** $COUNT pack(s)" >> "$REPORT_FILE"
    fi
  fi
done

cat >> "$REPORT_FILE" << EOF

---

## Distribution by Register

EOF

# Count registers
for REGISTER in formal neutral casual; do
  if [[ -f "$TMP_REGISTERS" ]]; then
    COUNT=$(grep -c "^${REGISTER}$" "$TMP_REGISTERS" 2>/dev/null || echo "0")
    if [[ "$COUNT" -gt 0 ]]; then
      echo "- **$REGISTER:** $COUNT pack(s)" >> "$REPORT_FILE"
    fi
  fi
done

cat >> "$REPORT_FILE" << EOF

---

## Top Primary Structures

EOF

# Count primary structures
if [[ -f "$TMP_STRUCTURES" ]]; then
  sort "$TMP_STRUCTURES" | uniq -c | sort -rn | head -10 | while read COUNT STRUCTURE; do
    echo "- **$STRUCTURE:** $COUNT pack(s)" >> "$REPORT_FILE"
  done
fi

cat >> "$REPORT_FILE" << EOF

---

## Validation Results

EOF

if [[ $VALIDATION_ERRORS -gt 0 ]]; then
  echo "❌ **Validation Errors:** $VALIDATION_ERRORS" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "### Error Summary" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "\`\`\`" >> "$REPORT_FILE"
  echo "$VALIDATION_OUTPUT" | grep -E "❌|Error|error" | head -20 >> "$REPORT_FILE" || true
  echo "\`\`\`" >> "$REPORT_FILE"
else
  echo "✅ **No validation errors found**" >> "$REPORT_FILE"
fi

if [[ $VALIDATION_WARNINGS -gt 0 ]]; then
  echo "" >> "$REPORT_FILE"
  echo "⚠️  **Validation Warnings:** $VALIDATION_WARNINGS" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "### Warning Summary" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo "\`\`\`" >> "$REPORT_FILE"
  echo "$VALIDATION_OUTPUT" | grep -E "⚠️|Warning|warning" | head -20 >> "$REPORT_FILE" || true
  echo "\`\`\`" >> "$REPORT_FILE"
fi

# Enhanced metrics
METRICS_JSON=""
if command -v npx &> /dev/null && command -v tsx &> /dev/null; then
  echo "📊 Computing enhanced metrics..."
  METRICS_JSON=$(npx tsx "$SCRIPT_DIR/sprint-report-metrics.ts" --workspace "$WORKSPACE" 2>/dev/null || echo "")
fi

cat >> "$REPORT_FILE" << EOF

---

## Review Queue Status

EOF

if [ -n "$METRICS_JSON" ] && command -v jq &> /dev/null; then
  PENDING=$(echo "$METRICS_JSON" | jq -r '.review.pending // 0')
  APPROVED=$(echo "$METRICS_JSON" | jq -r '.review.approved // 0')
  echo "- **Pending:** $PENDING items" >> "$REPORT_FILE"
  echo "- **Approved:** $APPROVED items" >> "$REPORT_FILE"
else
  echo "- Run \`npm run content:dedupe\` to check duplicate status" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF

---

## Natural EN Coverage

EOF

if [ -n "$METRICS_JSON" ] && command -v jq &> /dev/null; then
  MISSING_NATURAL_EN=$(echo "$METRICS_JSON" | jq -r '.naturalEn.totalMissing // 0')
  TOTAL_PROMPTS=$(echo "$METRICS_JSON" | jq -r '.naturalEn.totalPrompts // 0')
  if [ "$TOTAL_PROMPTS" -gt 0 ]; then
    COVERAGE=$(( (TOTAL_PROMPTS - MISSING_NATURAL_EN) * 100 / TOTAL_PROMPTS ))
    echo "- **Missing natural_en:** $MISSING_NATURAL_EN / $TOTAL_PROMPTS prompts ($((100 - COVERAGE))%)" >> "$REPORT_FILE"
    echo "- **Coverage:** ${COVERAGE}%" >> "$REPORT_FILE"
    
    # List packs with missing natural_en
    PACKS_WITH_MISSING=$(echo "$METRICS_JSON" | jq -r '.naturalEn.byPack[] | "\(.packId): \(.count)/\(.total)"' 2>/dev/null)
    if [ -n "$PACKS_WITH_MISSING" ]; then
      echo "" >> "$REPORT_FILE"
      echo "Packs with missing natural_en:" >> "$REPORT_FILE"
      echo "$PACKS_WITH_MISSING" | while read LINE; do
        echo "- $LINE" >> "$REPORT_FILE"
      done
    fi
  fi
else
  echo "- Run enhanced metrics to see natural_en coverage" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF

---

## Scenario Token Pass Rate

EOF

if [ -n "$METRICS_JSON" ] && command -v jq &> /dev/null; then
  PASS_RATE=$(echo "$METRICS_JSON" | jq -r '.scenarioTokens.passRate // 0')
  PASS_COUNT=$(echo "$METRICS_JSON" | jq -r '.scenarioTokens.passCount // 0')
  TOTAL_COUNT=$(echo "$METRICS_JSON" | jq -r '.scenarioTokens.totalCount // 0')
  echo "- **Pass Rate:** ${PASS_RATE}% ($PASS_COUNT / $TOTAL_COUNT prompts)" >> "$REPORT_FILE"
else
  echo "- Run enhanced metrics to see scenario token pass rate" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF

---

## Multi-Slot Variation Stats

EOF

if [ -n "$METRICS_JSON" ] && command -v jq &> /dev/null; then
  MULTI_SLOT_RATE=$(echo "$METRICS_JSON" | jq -r '.multiSlot.rate // 0')
  MULTI_SLOT_COUNT=$(echo "$METRICS_JSON" | jq -r '.multiSlot.count // 0')
  MULTI_SLOT_TOTAL=$(echo "$METRICS_JSON" | jq -r '.multiSlot.total // 0')
  echo "- **Multi-slot rate:** ${MULTI_SLOT_RATE}% ($MULTI_SLOT_COUNT / $MULTI_SLOT_TOTAL prompts with 2+ slots changed)" >> "$REPORT_FILE"
else
  echo "- Run enhanced metrics to see multi-slot variation stats" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF

---

## Top Repeated Intents

EOF

if [ -n "$METRICS_JSON" ] && command -v jq &> /dev/null; then
  echo "$METRICS_JSON" | jq -r '.topIntents[] | "- **\(.intent):** \(.count) occurrence(s)"' >> "$REPORT_FILE" 2>/dev/null || echo "- No intent data available" >> "$REPORT_FILE"
else
  echo "- Run enhanced metrics to see top intents" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF

---

## Pack Metadata Completeness

EOF

if [ -n "$METRICS_JSON" ] && command -v jq &> /dev/null; then
  INCOMPLETE=$(echo "$METRICS_JSON" | jq -r '.metadataCompleteness.incomplete // 0')
  TOTAL_PACKS_META=$(echo "$METRICS_JSON" | jq -r '.metadataCompleteness.total // 0')
  echo "- **Incomplete metadata:** $INCOMPLETE / $TOTAL_PACKS_META packs" >> "$REPORT_FILE"
  
  INCOMPLETE_PACKS=$(echo "$METRICS_JSON" | jq -r '.metadataCompleteness.incompletePacks[]' 2>/dev/null)
  if [ -n "$INCOMPLETE_PACKS" ]; then
    echo "" >> "$REPORT_FILE"
    echo "Packs with incomplete metadata (missing scenario/register/primaryStructure/variationSlots):" >> "$REPORT_FILE"
    echo "$INCOMPLETE_PACKS" | while read PACK_ID; do
      echo "- $PACK_ID" >> "$REPORT_FILE"
    done
  fi
else
  echo "- Run enhanced metrics to see metadata completeness" >> "$REPORT_FILE"
fi

cat >> "$REPORT_FILE" << EOF

---

## Duplicate Checks

Run duplicate detection:
\`\`\`bash
npm run content:dedupe -- --workspace $WORKSPACE
\`\`\`

Check for:
- Duplicate prompt texts across packs
- Near-duplicate sentences (similarity > 0.85)
- Exact duplicate normalized text (hard fail)

---

## Ready to Promote? Checklist

- [ ] All packs pass validation (\`npm run content:validate\`)
- [ ] Quality gates pass (\`npm run content:quality\`)
- [ ] No duplicate prompts detected
- [ ] All section indexes regenerated (\`npm run content:generate-indexes\`)
- [ ] Smoke test passes (\`./scripts/smoke-test-content.sh\`)
- [ ] Content published to staging (\`./scripts/publish-content.sh\`)
- [ ] Staging content verified manually
- [ ] Ready to promote (\`./scripts/promote-staging.sh\`)

---

## Next Steps

1. **Review generated content:**
   \`\`\`bash
   # Review packs
   ls -la content/v1/workspaces/$WORKSPACE/packs/
   
   # Review drills
   ls -la content/v1/workspaces/$WORKSPACE/drills/
   \`\`\`

2. **Validate content:**
   \`\`\`bash
   npm run content:validate
   npm run content:quality
   \`\`\`

3. **Regenerate indexes (if needed):**
   \`\`\`bash
   npm run content:generate-indexes -- --workspace $WORKSPACE
   \`\`\`

4. **Publish to staging:**
   \`\`\`bash
   ./scripts/publish-content.sh
   \`\`\`

5. **Promote to production:**
   \`\`\`bash
   ./scripts/promote-staging.sh
   \`\`\`

---

## Notes

- This report is generated automatically and may need manual review.
- Check validation output above for specific issues.
- Government office packs should be prioritized for review.
- Ensure all prompts have proper \`intent\` and \`gloss_en\` fields.

EOF

# Cleanup temp files
rm -f "$TMP_SCENARIOS" "$TMP_LEVELS" "$TMP_REGISTERS" "$TMP_STRUCTURES" "$TMP_DRILL_TYPES" "$TMP_COGNITIVE_LOADS" "$TMP_ANALYTICS_COMPLETE"

echo "✅ Sprint report generated: $REPORT_FILE"
echo ""
echo "📋 Report contents:"
head -30 "$REPORT_FILE"
