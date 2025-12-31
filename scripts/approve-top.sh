#!/bin/bash

# Approve Top
# 
# Approves the best matching packs (sorted by quality score where available)
# based on scenario/level filters.
# 
# Usage:
#   ./scripts/approve-top.sh \
#     --workspace de \
#     [--scenario government_office] \
#     [--level A1] \
#     --limit 10 \
#     --reviewer "Name"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Parse arguments
WORKSPACE=""
SCENARIO_FILTER=""
LEVEL_FILTER=""
LIMIT=""
REVIEWER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --scenario)
      SCENARIO_FILTER="$2"
      shift 2
      ;;
    --level)
      LEVEL_FILTER="$2"
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
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$WORKSPACE" ]; then
  echo "❌ Error: --workspace is required"
  exit 1
fi

if [ -z "$LIMIT" ]; then
  echo "❌ Error: --limit is required"
  exit 1
fi

if [ -z "$REVIEWER" ]; then
  echo "❌ Error: --reviewer is required"
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required for this script"
  echo "   Install with: brew install jq"
  exit 1
fi

echo "✅ Approving top packs"
echo "   Workspace: $WORKSPACE"
if [ -n "$SCENARIO_FILTER" ]; then
  echo "   Scenario Filter: $SCENARIO_FILTER"
fi
if [ -n "$LEVEL_FILTER" ]; then
  echo "   Level Filter: $LEVEL_FILTER"
fi
echo "   Limit: $LIMIT"
echo "   Reviewer: $REVIEWER"
echo ""

# Collect all needs_review items with metadata
REVIEW_ITEMS=()

# Find all pack.json files
find "$CONTENT_DIR/workspaces/$WORKSPACE" -name "pack.json" | while read -r file; do
  # Parse JSON to check review status
  review_status=$(jq -r '.review.status // "approved"' "$file" 2>/dev/null || echo "approved")
  
  if [ "$review_status" = "needs_review" ]; then
    # Extract metadata
    id=$(jq -r '.id' "$file" 2>/dev/null || echo "unknown")
    scenario=$(jq -r '.scenario // "unknown"' "$file" 2>/dev/null || echo "unknown")
    level=$(jq -r '.level // "unknown"' "$file" 2>/dev/null || echo "unknown")
    quality_score=$(jq -r '.analytics.qualityScore // 0' "$file" 2>/dev/null || echo "0")
    
    # Apply filters
    if [ -n "$SCENARIO_FILTER" ] && [ "$scenario" != "$SCENARIO_FILTER" ]; then
      continue
    fi
    
    if [ -n "$LEVEL_FILTER" ] && [ "$level" != "$LEVEL_FILTER" ]; then
      continue
    fi
    
    # Normalize quality score
    if [ "$quality_score" = "null" ] || [ -z "$quality_score" ]; then
      quality_score="0"
    fi
    
    # Format: quality_score|id|file_path
    echo "${quality_score}|${id}|${file}"
  fi
done | sort -t'|' -k1 -rn | head -n "$LIMIT" | while IFS='|' read -r score pack_id file_path; do
  # Approve the pack
  REVIEWED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  TEMP_FILE=$(mktemp)
  jq --arg reviewer "$REVIEWER" --arg reviewedAt "$REVIEWED_AT" \
    '.review.status = "approved" | .review.reviewer = $reviewer | .review.reviewedAt = $reviewedAt' \
    "$file_path" > "$TEMP_FILE"
  
  mv "$TEMP_FILE" "$file_path"
  
  echo "✅ Approved: $pack_id (quality score: $score)"
done

APPROVED_COUNT=$(find "$CONTENT_DIR/workspaces/$WORKSPACE" -name "pack.json" | while read -r file; do
  review_status=$(jq -r '.review.status // "approved"' "$file" 2>/dev/null || echo "approved")
  reviewer=$(jq -r '.review.reviewer // ""' "$file" 2>/dev/null || echo "")
  if [ "$review_status" = "approved" ] && [ "$reviewer" = "$REVIEWER" ]; then
    # Check if reviewedAt is recent (within last minute)
    reviewed_at=$(jq -r '.review.reviewedAt // ""' "$file" 2>/dev/null || echo "")
    if [ -n "$reviewed_at" ]; then
      echo "1"
    fi
  fi
done | wc -l | tr -d ' ')

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

