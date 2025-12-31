#!/bin/bash

# Expansion Sprint Runner
# 
# Generates a coherent batch (20-50 items), runs all quality gates, produces coherence + sprint reports,
# and prepares a staging release that can be promoted safely.
#
# Usage:
#   ./scripts/run-expansion-sprint.sh \
#     --workspace de \
#     --scenario government_office \
#     --packs 30 \
#     --drills 10 \
#     --level A1 \
#     --source template \
#     --promptsPerPack 12 \
#     --reviewer "Afees" \
#     --autoApproveTop 5

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"
META_DIR="$SCRIPT_DIR/../content/meta"
SPRINTS_DIR="$META_DIR/sprints"
PROJECT_ROOT="$SCRIPT_DIR/.."

# Default values
WORKSPACE=""
SCENARIO=""
PACKS=0
DRILLS=0
LEVEL=""
SOURCE="mixed"
PDF_PATH=""
PROMPTS_PER_PACK=12
REVIEWER=""
AUTO_APPROVE_TOP=0

# Parse arguments
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
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --pdf)
      PDF_PATH="$2"
      shift 2
      ;;
    --promptsPerPack)
      PROMPTS_PER_PACK="$2"
      shift 2
      ;;
    --reviewer)
      REVIEWER="$2"
      shift 2
      ;;
    --autoApproveTop)
      AUTO_APPROVE_TOP="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --workspace <ws>          Workspace ID (required)"
      echo "  --scenario <scenario>      Scenario: government_office|work|housing|doctor|shopping|auto (required)"
      echo "  --packs <N>                Number of packs to generate (required)"
      echo "  --drills <N>               Number of drills to generate (default: 0)"
      echo "  --level <level>            CEFR level: A1|A2|B1|B2|C1|C2 (required)"
      echo "  --source <source>          Source type: pdf|template|mixed (default: mixed)"
      echo "  --pdf <path>               Path to PDF file (required if source includes pdf)"
      echo "  --promptsPerPack <N>       Prompts per pack (default: 12)"
      echo "  --reviewer <name>         Reviewer name (optional, for batch approval)"
      echo "  --autoApproveTop <N>      Auto-approve top N packs by quality score (default: 0)"
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$WORKSPACE" ]; then
  echo "❌ Error: --workspace is required"
  exit 1
fi

if [ -z "$SCENARIO" ]; then
  echo "❌ Error: --scenario is required"
  exit 1
fi

if [ "$PACKS" -eq 0 ] && [ "$DRILLS" -eq 0 ]; then
  echo "❌ Error: At least one of --packs or --drills must be > 0"
  exit 1
fi

if [ -z "$LEVEL" ]; then
  echo "❌ Error: --level is required"
  exit 1
fi

if [[ "$SOURCE" == *"pdf"* ]] && [ -z "$PDF_PATH" ]; then
  echo "❌ Error: --pdf is required when source includes pdf"
  exit 1
fi

if [ ! -f "$PDF_PATH" ] && [[ "$SOURCE" == *"pdf"* ]]; then
  echo "❌ Error: PDF file not found: $PDF_PATH"
  exit 1
fi

# Create sprint output directory with timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
SPRINT_DIR="$SPRINTS_DIR/$TIMESTAMP"
mkdir -p "$SPRINT_DIR"

echo "🚀 Starting Expansion Sprint"
echo "   Workspace: $WORKSPACE"
echo "   Scenario: $SCENARIO"
echo "   Level: $LEVEL"
echo "   Packs: $PACKS"
echo "   Drills: $DRILLS"
echo "   Source: $SOURCE"
echo "   Output: $SPRINT_DIR"
echo ""

# Step 1: Generate content
echo "📦 Step 1: Generating content..."
GENERATED_PACKS=0
GENERATED_DRILLS=0

if [[ "$SOURCE" == *"template"* ]]; then
  echo "   Generating from templates..."
  
  # Find templates matching scenario and level
  TEMPLATE_DIRS=(
    "$CONTENT_DIR/workspaces/$WORKSPACE/templates"
    "$PROJECT_ROOT/content/templates/v1/scenarios"
  )
  
  TEMPLATES_FOUND=0
  
  # Check if jq is available
  if ! command -v jq &> /dev/null; then
    echo "   ⚠️  Warning: jq not found. Cannot parse template metadata. Install with: brew install jq"
    echo "   Skipping template-based generation"
  else
    for TEMPLATE_DIR in "${TEMPLATE_DIRS[@]}"; do
      if [ -d "$TEMPLATE_DIR" ]; then
        # Look for templates matching scenario
        for TEMPLATE_FILE in "$TEMPLATE_DIR"/*.json; do
          if [ -f "$TEMPLATE_FILE" ]; then
            TEMPLATE_SCENARIO=$(jq -r '.scenario // .scenarioId // ""' "$TEMPLATE_FILE" 2>/dev/null || echo "")
            TEMPLATE_LEVEL=$(jq -r '.level // ""' "$TEMPLATE_FILE" 2>/dev/null || echo "")
            
            if [ "$TEMPLATE_SCENARIO" = "$SCENARIO" ] && [ "$TEMPLATE_LEVEL" = "$LEVEL" ]; then
              TEMPLATE_ID=$(basename "$TEMPLATE_FILE" .json)
              PACK_ID="${SCENARIO}_${LEVEL}_$(printf "%03d" $TEMPLATES_FOUND)"
              
              echo "   Generating pack $PACK_ID from template $TEMPLATE_ID..."
              
              if npx tsx "$SCRIPT_DIR/generate-pack-from-template.ts" \
          --workspace "$WORKSPACE" \
                --template "$TEMPLATE_ID" \
                --packId "$PACK_ID" \
                --level "$LEVEL" > "$SPRINT_DIR/generation-${PACK_ID}.log" 2>&1; then
                GENERATED_PACKS=$((GENERATED_PACKS + 1))
                echo "   ✅ Generated pack: $PACK_ID"
              else
                echo "   ⚠️  Failed to generate pack from template $TEMPLATE_ID (check $SPRINT_DIR/generation-${PACK_ID}.log)"
              fi
              
              TEMPLATES_FOUND=$((TEMPLATES_FOUND + 1))
              
              # Stop if we've generated enough packs
              if [ "$GENERATED_PACKS" -ge "$PACKS" ]; then
                break 2
              fi
            fi
        fi
      done
      fi
    done
  fi
  
  if [ "$GENERATED_PACKS" -lt "$PACKS" ] && [ "$GENERATED_PACKS" -gt 0 ]; then
    echo "   ⚠️  Warning: Only found $GENERATED_PACKS templates matching scenario=$SCENARIO, level=$LEVEL"
    echo "   Need $PACKS packs, but only generated $GENERATED_PACKS"
  elif [ "$GENERATED_PACKS" -eq 0 ] && [[ "$SOURCE" == *"template"* ]]; then
    echo "   ⚠️  Warning: No templates found matching scenario=$SCENARIO, level=$LEVEL"
    echo "   Check template locations:"
    for TEMPLATE_DIR in "${TEMPLATE_DIRS[@]}"; do
      echo "     - $TEMPLATE_DIR"
    done
  fi
fi

if [[ "$SOURCE" == *"pdf"* ]] && [ -n "$PDF_PATH" ]; then
  echo "   Generating from PDF..."
  
  PDF_SLUG=$(basename "$PDF_PATH" .pdf | tr '[:upper:]' '[:lower:]' | tr ' ' '_' | tr -cd '[:alnum:]_')
    
    if npx tsx "$SCRIPT_DIR/pdf-ingestion/pdf-to-packs-batch.ts" \
      --workspace "$WORKSPACE" \
    --pdf "$PDF_PATH" \
      --mode search \
      --discoverScenarios true \
    --scenario "$SCENARIO" \
    --level "$LEVEL" \
    --packs "$PACKS" \
      --promptsPerPack "$PROMPTS_PER_PACK" \
      --windowSizePages 25 \
      --minScenarioHits 2 \
      --skipFrontMatter true \
    > "$SPRINT_DIR/pdf-generation.log" 2>&1; then
    
    # Count generated packs from PDF report
    PDF_REPORT_DIR="$PROJECT_ROOT/reports/pdf-ingestion"
    LATEST_REPORT=""
    LATEST_TIMESTAMP=""
    
    for report_dir in "$PDF_REPORT_DIR"/*; do
      if [ -d "$report_dir" ] && [[ "$(basename "$report_dir")" == *"$PDF_SLUG"* ]]; then
          timestamp=$(basename "$report_dir" | cut -d'-' -f1-6)
        if [ -z "$LATEST_TIMESTAMP" ] || [ "$timestamp" \> "$LATEST_TIMESTAMP" ]; then
          LATEST_TIMESTAMP="$timestamp"
          LATEST_REPORT="$report_dir"
          fi
        fi
      done
      
    if [ -n "$LATEST_REPORT" ] && [ -f "$LATEST_REPORT/report.json" ]; then
      GENERATED_PACKS=$(jq -r '.generatedPacks | length' "$LATEST_REPORT/report.json" 2>/dev/null || echo "0")
      echo "   ✅ Generated $GENERATED_PACKS packs from PDF"
    fi
  else
    echo "   ⚠️  PDF generation encountered errors (check $SPRINT_DIR/pdf-generation.log)"
  fi
fi

# Set review status to needs_review for all generated packs
echo ""
echo "📝 Setting review status to 'needs_review' for generated packs..."
PACKS_DIR="$CONTENT_DIR/workspaces/$WORKSPACE/packs"
if [ -d "$PACKS_DIR" ] && command -v jq &> /dev/null; then
  for PACK_DIR in "$PACKS_DIR"/*; do
    if [ -d "$PACK_DIR" ] && [ -f "$PACK_DIR/pack.json" ]; then
      # Update review status if not already set
      CURRENT_STATUS=$(jq -r '.provenance.review.status // "needs_review"' "$PACK_DIR/pack.json" 2>/dev/null || echo "needs_review")
      if [ "$CURRENT_STATUS" != "approved" ]; then
        TEMP_FILE=$(mktemp)
        jq '.provenance.review.status = "needs_review"' "$PACK_DIR/pack.json" > "$TEMP_FILE" 2>/dev/null
        if [ $? -eq 0 ]; then
          mv "$TEMP_FILE" "$PACK_DIR/pack.json"
        else
          rm -f "$TEMP_FILE"
        fi
      fi
    fi
  done
  echo "   ✅ Review status updated"
elif [ ! -d "$PACKS_DIR" ]; then
  echo "   ⚠️  Packs directory not found: $PACKS_DIR"
elif ! command -v jq &> /dev/null; then
  echo "   ⚠️  jq not found. Skipping review status update. Install with: brew install jq"
fi

echo "   ✅ Generated $GENERATED_PACKS packs, $GENERATED_DRILLS drills"
echo ""

# Step 2: Rebuild indexes
echo "📇 Step 2: Rebuilding indexes..."
if npm run content:generate-indexes -- --workspace "$WORKSPACE" > "$SPRINT_DIR/index-generation.log" 2>&1; then
  echo "   ✅ Indexes rebuilt"
else
  echo "   ⚠️  Index generation encountered issues (check $SPRINT_DIR/index-generation.log)"
fi
echo ""

# Step 3: Run validation
echo "🔍 Step 3: Running validation..."
if npm run content:validate > "$SPRINT_DIR/validation.log" 2>&1; then
  echo "   ✅ Validation passed"
VALIDATION_PASSED=true
else
  echo "   ⚠️  Validation found issues (check $SPRINT_DIR/validation.log)"
  VALIDATION_PASSED=false
fi
echo ""

# Step 4: Run quality checks
echo "🔍 Step 4: Running quality checks (includes dedupe)..."
if npm run content:quality > "$SPRINT_DIR/quality.log" 2>&1; then
  echo "   ✅ Quality checks passed"
QUALITY_PASSED=true
else
  echo "   ⚠️  Quality checks found issues (check $SPRINT_DIR/quality.log)"
  QUALITY_PASSED=false
fi
echo ""

# Step 5: Generate sprint report
echo "📊 Step 5: Generating sprint report..."
if "$SCRIPT_DIR/sprint-report.sh" --workspace "$WORKSPACE" > "$SPRINT_DIR/sprint-report-generation.log" 2>&1; then
  # Copy sprint report to sprint directory
  if [ -f "$PROJECT_ROOT/docs/content-pipeline/SPRINT_REPORT.md" ]; then
    cp "$PROJECT_ROOT/docs/content-pipeline/SPRINT_REPORT.md" "$SPRINT_DIR/sprint.md"
    echo "   ✅ Sprint report generated: $SPRINT_DIR/sprint.md"
  fi
else
  echo "   ⚠️  Sprint report generation encountered issues"
fi

# Generate sprint JSON report
if command -v npx &> /dev/null && command -v tsx &> /dev/null; then
  METRICS_JSON=$(npx tsx "$SCRIPT_DIR/sprint-report-metrics.ts" --workspace "$WORKSPACE" 2>/dev/null || echo "{}")
  echo "$METRICS_JSON" > "$SPRINT_DIR/sprint.json"
  echo "   ✅ Sprint metrics JSON: $SPRINT_DIR/sprint.json"
fi
echo ""

# Step 6: Generate coherence report
echo "📊 Step 6: Generating coherence report..."
if npx tsx "$SCRIPT_DIR/catalog-coherence-report.ts" \
  --workspace "$WORKSPACE" \
  --manifest staging \
  --outDir "$SPRINT_DIR" > "$SPRINT_DIR/coherence-generation.log" 2>&1; then
  
  # Coherence report should be in SPRINT_DIR already
  if [ -f "$SPRINT_DIR/coherence.md" ]; then
    echo "   ✅ Coherence report: $SPRINT_DIR/coherence.md"
  fi
  if [ -f "$SPRINT_DIR/coherence.json" ]; then
    echo "   ✅ Coherence JSON: $SPRINT_DIR/coherence.json"
  fi
else
  echo "   ⚠️  Coherence report generation encountered issues (check $SPRINT_DIR/coherence-generation.log)"
fi
echo ""

# Step 7: Optional auto-approval
if [ "$AUTO_APPROVE_TOP" -gt 0 ]; then
  echo "✅ Step 7: Auto-approving top $AUTO_APPROVE_TOP packs..."
  
  if [ -n "$REVIEWER" ]; then
    # Try to approve from PDF batch report if available
    if [[ "$SOURCE" == *"pdf"* ]] && [ -n "$PDF_PATH" ]; then
      PDF_SLUG=$(basename "$PDF_PATH" .pdf | tr '[:upper:]' '[:lower:]' | tr ' ' '_' | tr -cd '[:alnum:]_')
      
      if "$SCRIPT_DIR/approve-batch.sh" \
        --sourceRef "$PDF_SLUG" \
        --limit "$AUTO_APPROVE_TOP" \
        --reviewer "$REVIEWER" \
        --workspace "$WORKSPACE" > "$SPRINT_DIR/auto-approval.log" 2>&1; then
        echo "   ✅ Approved top $AUTO_APPROVE_TOP packs from PDF batch"
      else
        echo "   ⚠️  Auto-approval from PDF batch failed (check $SPRINT_DIR/auto-approval.log)"
      fi
    fi
    
    # For template-generated packs, approve by quality score from coherence report
    if [ -f "$SPRINT_DIR/coherence.json" ] && command -v jq &> /dev/null; then
      # Get top packs by risk score (lowest risk = highest quality)
      TOP_PACKS=$(jq -r '.metrics.risks | sort_by(.score) | reverse | .[0:'"$AUTO_APPROVE_TOP"'] | .[].packId' "$SPRINT_DIR/coherence.json" 2>/dev/null || echo "")
      
      if [ -n "$TOP_PACKS" ]; then
        APPROVED_COUNT=0
        for PACK_ID in $TOP_PACKS; do
          if "$SCRIPT_DIR/approve-pack.sh" "$PACK_ID" --reviewer "$REVIEWER" --workspace "$WORKSPACE" >> "$SPRINT_DIR/auto-approval.log" 2>&1; then
            APPROVED_COUNT=$((APPROVED_COUNT + 1))
          fi
        done
        echo "   ✅ Approved $APPROVED_COUNT template-generated packs"
      fi
    fi
    
    # Re-run validation and quality after approval
    echo "   🔍 Re-running validation after approval..."
    npm run content:validate > "$SPRINT_DIR/post-approval-validation.log" 2>&1 || true
    
    echo "   🔍 Re-running quality checks after approval..."
    npm run content:quality > "$SPRINT_DIR/post-approval-quality.log" 2>&1 || true
  else
    echo "   ⚠️  Reviewer name required for auto-approval (use --reviewer)"
  fi
  echo ""
fi

# Step 8: Generate release checklist
echo "📋 Step 8: Generating release checklist..."
cat > "$SPRINT_DIR/RELEASE_CHECKLIST.md" << EOF
# Release Checklist

**Generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Sprint:** $TIMESTAMP
**Workspace:** $WORKSPACE
**Scenario:** $SCENARIO
**Level:** $LEVEL

## Summary

- **Packs Generated:** $GENERATED_PACKS
- **Drills Generated:** $GENERATED_DRILLS
- **Validation:** $([ "$VALIDATION_PASSED" = true ] && echo "✅ PASSED" || echo "❌ FAILED")
- **Quality Checks:** $([ "$QUALITY_PASSED" = true ] && echo "✅ PASSED" || echo "❌ FAILED")

## Review Status

EOF

# Count approved vs needs_review
if command -v jq &> /dev/null && [ -f "$SPRINT_DIR/sprint.json" ]; then
  APPROVED_COUNT=$(jq -r '.review.approved // 0' "$SPRINT_DIR/sprint.json" 2>/dev/null || echo "0")
  PENDING_COUNT=$(jq -r '.review.pending // 0' "$SPRINT_DIR/sprint.json" 2>/dev/null || echo "0")
  echo "- **Approved:** $APPROVED_COUNT" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
  echo "- **Needs Review:** $PENDING_COUNT" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
else
  echo "- **Status:** Run \`npm run content:report\` to check review status" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
fi

cat >> "$SPRINT_DIR/RELEASE_CHECKLIST.md" << EOF

## Approval Gate

EOF

if [ "$AUTO_APPROVE_TOP" -gt 0 ]; then
  echo "- **Auto-approved:** Top $AUTO_APPROVE_TOP packs by quality score" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
  if [ "$VALIDATION_PASSED" = true ] && [ "$QUALITY_PASSED" = true ]; then
    echo "- **Gate Status:** ✅ PASSED (validation + quality checks passed after approval)" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
  else
    echo "- **Gate Status:** ❌ FAILED (validation or quality checks failed after approval)" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
    echo "- **Reason:** Check validation.log and quality.log in sprint directory" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
  fi
else
  echo "- **Auto-approved:** None (use --autoApproveTop to enable)" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
  if [ "$PENDING_COUNT" -gt 0 ]; then
    echo "- **Gate Status:** ⚠️  PENDING (manual review required)" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
  else
    echo "- **Gate Status:** ✅ READY (all items approved)" >> "$SPRINT_DIR/RELEASE_CHECKLIST.md"
  fi
fi

cat >> "$SPRINT_DIR/RELEASE_CHECKLIST.md" << EOF

## Publish Commands

### 1. Publish to Staging (with sprint artifacts)

\`\`\`bash
./scripts/publish-content.sh --include-sprint-artifacts
\`\`\`

This will upload:
- All content files
- Sprint artifacts from: \`content/meta/sprints/$TIMESTAMP/\`
- Coherence reports

### 2. Smoke Test

\`\`\`bash
./scripts/smoke-test-content.sh
\`\`\`

### 3. Promote to Production

After verifying staging content:

\`\`\`bash
./scripts/promote-staging.sh
\`\`\`

## Artifacts

All artifacts are in: \`content/meta/sprints/$TIMESTAMP/\`

- \`sprint.md\` - Sprint report (markdown)
- \`sprint.json\` - Sprint metrics (JSON)
- \`coherence.md\` - Coherence report (markdown)
- \`coherence.json\` - Coherence metrics (JSON)
- \`RELEASE_CHECKLIST.md\` - This file
- \`validation.log\` - Validation output
- \`quality.log\` - Quality check output
- \`*.log\` - Other generation logs

## Next Steps

1. Review generated content:
   \`\`\`bash
   ls -la content/v1/workspaces/$WORKSPACE/packs/
   \`\`\`

2. Review sprint report:
   \`\`\`bash
   cat content/meta/sprints/$TIMESTAMP/sprint.md
   \`\`\`

3. Review coherence report:
   \`\`\`bash
   cat content/meta/sprints/$TIMESTAMP/coherence.md
   \`\`\`

4. If approval gate passed, publish:
   \`\`\`bash
   ./scripts/publish-content.sh --include-sprint-artifacts
   \`\`\`

EOF

echo "   ✅ Release checklist: $SPRINT_DIR/RELEASE_CHECKLIST.md"
echo ""

# Final summary
echo "✅ Expansion Sprint Complete!"
echo ""
echo "📊 Summary:"
echo "   - Generated: $GENERATED_PACKS packs, $GENERATED_DRILLS drills"
echo "   - Validation: $([ "$VALIDATION_PASSED" = true ] && echo "✅ PASSED" || echo "❌ FAILED")"
echo "   - Quality: $([ "$QUALITY_PASSED" = true ] && echo "✅ PASSED" || echo "❌ FAILED")"
echo "   - Artifacts: $SPRINT_DIR"
  echo ""
echo "📋 Next Steps:"
echo "   1. Review release checklist: $SPRINT_DIR/RELEASE_CHECKLIST.md"
echo "   2. Review sprint report: $SPRINT_DIR/sprint.md"
echo "   3. Review coherence report: $SPRINT_DIR/coherence.md"
echo "   4. If ready, publish: ./scripts/publish-content.sh --include-sprint-artifacts"
  echo ""
