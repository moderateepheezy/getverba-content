#!/bin/bash

# Approve Batch
# Approves top-N packs from a batch generation report, sorted by quality score
# Usage: ./scripts/approve-batch.sh --sourceRef "<pdfSlug>" --limit 5 --reviewer "<name>" [--workspace <ws>]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"
REPORTS_DIR="$SCRIPT_DIR/../reports/pdf-ingestion"

# Parse arguments
SOURCE_REF=""
LIMIT=""
REVIEWER=""
WORKSPACE=""

for i in "$@"; do
  case $i in
    --sourceRef)
      SOURCE_REF="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --reviewer)
      REVIEWER="$2"
      shift 2
      ;;
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$SOURCE_REF" ]; then
  echo "❌ Error: --sourceRef is required"
  echo "Usage: ./scripts/approve-batch.sh --sourceRef \"<pdfSlug>\" --limit 5 --reviewer \"<name>\" [--workspace <ws>]"
  exit 1
fi

if [ -z "$LIMIT" ]; then
  echo "❌ Error: --limit is required"
  echo "Usage: ./scripts/approve-batch.sh --sourceRef \"<pdfSlug>\" --limit 5 --reviewer \"<name>\" [--workspace <ws>]"
  exit 1
fi

if [ -z "$REVIEWER" ]; then
  echo "❌ Error: Reviewer name is required"
  echo "Usage: ./scripts/approve-batch.sh --sourceRef \"<pdfSlug>\" --limit 5 --reviewer \"<name>\" [--workspace <ws>]"
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required for this script"
  echo "   Install with: brew install jq"
  exit 1
fi

# Find the most recent report for this PDF slug
LATEST_REPORT=""
LATEST_TIMESTAMP=""

for report_dir in "$REPORTS_DIR"/*; do
  if [ -d "$report_dir" ]; then
    report_name=$(basename "$report_dir")
    if [[ "$report_name" == *"$SOURCE_REF"* ]]; then
      # Extract timestamp from directory name (format: timestamp-pdfSlug)
      timestamp=$(echo "$report_name" | cut -d'-' -f1-6)
      if [ -z "$LATEST_TIMESTAMP" ] || [ "$timestamp" \> "$LATEST_TIMESTAMP" ]; then
        LATEST_TIMESTAMP="$timestamp"
        LATEST_REPORT="$report_dir"
      fi
    fi
  fi
done

if [ -z "$LATEST_REPORT" ] || [ ! -f "$LATEST_REPORT/report.json" ]; then
  echo "❌ Error: No report found for sourceRef \"$SOURCE_REF\""
  echo "   Expected report at: $REPORTS_DIR/*-$SOURCE_REF/report.json"
  exit 1
fi

echo "✅ Approving batch from report: $LATEST_REPORT"
echo "   SourceRef: $SOURCE_REF"
echo "   Limit: $LIMIT"
echo "   Reviewer: $REVIEWER"
echo ""

# Load report and extract review queue
REVIEW_QUEUE=$(jq -r '.reviewQueue | sort_by(-.qualityScore) | .[0:'"$LIMIT"'] | .[] | .packId' "$LATEST_REPORT/report.json" 2>/dev/null)

if [ -z "$REVIEW_QUEUE" ]; then
  echo "❌ Error: No packs found in review queue for this report"
  exit 1
fi

# Count packs to approve
PACK_COUNT=$(echo "$REVIEW_QUEUE" | wc -l | tr -d ' ')
echo "📦 Found $PACK_COUNT pack(s) to approve:"
echo ""

# Approve each pack
APPROVED_COUNT=0
REVIEWED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

for pack_id in $REVIEW_QUEUE; do
  # Find pack file
  PACK_PATH=""
  if [ -n "$WORKSPACE" ]; then
    PACK_PATH="$CONTENT_DIR/workspaces/$WORKSPACE/packs/$pack_id/pack.json"
  else
    # Search all workspaces
    for ws_dir in "$CONTENT_DIR/workspaces"/*; do
      if [ -d "$ws_dir" ]; then
        test_path="$ws_dir/packs/$pack_id/pack.json"
        if [ -f "$test_path" ]; then
          PACK_PATH="$test_path"
          WORKSPACE=$(basename "$ws_dir")
          break
        fi
      fi
    done
  fi
  
  if [ -z "$PACK_PATH" ] || [ ! -f "$PACK_PATH" ]; then
    echo "⚠️  Warning: Pack not found: $pack_id (skipping)"
    continue
  fi
  
  # Check current review status
  CURRENT_STATUS=$(jq -r '.review.status // "needs_review"' "$PACK_PATH" 2>/dev/null || echo "needs_review")
  
  if [ "$CURRENT_STATUS" = "approved" ]; then
    echo "ℹ️  Pack $pack_id already approved (skipping)"
    continue
  fi
  
  # Update review fields
  TEMP_FILE=$(mktemp)
  jq --arg reviewer "$REVIEWER" --arg reviewedAt "$REVIEWED_AT" \
    '.review.status = "approved" | .review.reviewer = $reviewer | .review.reviewedAt = $reviewedAt' \
    "$PACK_PATH" > "$TEMP_FILE"
  
  mv "$TEMP_FILE" "$PACK_PATH"
  
  echo "✅ Approved: $pack_id"
  APPROVED_COUNT=$((APPROVED_COUNT + 1))
done

echo ""
echo "✅ Approved $APPROVED_COUNT pack(s)"
echo ""

# Run validation
echo "🔍 Running validation..."
cd "$SCRIPT_DIR/.."
if npm run content:validate > /dev/null 2>&1; then
  echo "✅ Validation passed"
else
  echo "⚠️  Validation found issues (see output above)"
fi

echo ""

# Run quality check
echo "🔍 Running quality check (includes dedupe)..."
if npm run content:quality > /dev/null 2>&1; then
  echo "✅ Quality check passed"
else
  echo "⚠️  Quality check found issues (see output above)"
fi

echo ""
echo "✅ Batch approval completed!"

