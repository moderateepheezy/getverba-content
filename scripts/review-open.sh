#!/bin/bash

# Review Open
# 
# Lists packs/drills that need review, ranked by quality score (if available),
# including provenance and scenario information.
# 
# Usage:
#   ./scripts/review-open.sh --workspace de [--sourceRef "deutschimblick"] [--limit 20]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Parse arguments
WORKSPACE=""
SOURCE_REF_FILTER=""
LIMIT=20

while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --sourceRef)
      SOURCE_REF_FILTER="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
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

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required for this script"
  echo "   Install with: brew install jq"
  exit 1
fi

echo "📋 Review Queue"
echo "   Workspace: $WORKSPACE"
if [ -n "$SOURCE_REF_FILTER" ]; then
  echo "   Filter: sourceRef contains \"$SOURCE_REF_FILTER\""
fi
echo "   Limit: $LIMIT"
echo ""

# Collect all needs_review items with metadata
REVIEW_ITEMS=()

# Find all pack.json and drill.json files
find "$CONTENT_DIR/workspaces/$WORKSPACE" -name "pack.json" -o -name "drill.json" | while read -r file; do
  # Extract entry type
  if [[ "$file" == *"/packs/"* ]]; then
    entry_type="pack"
  elif [[ "$file" == *"/drills/"* ]]; then
    entry_type="drill"
  else
    continue
  fi
  
  # Parse JSON to check review status
  review_status=$(jq -r '.review.status // "approved"' "$file" 2>/dev/null || echo "approved")
  
  if [ "$review_status" = "needs_review" ]; then
    # Extract metadata
    id=$(jq -r '.id' "$file" 2>/dev/null || echo "unknown")
    title=$(jq -r '.title' "$file" 2>/dev/null || echo "Untitled")
    scenario=$(jq -r '.scenario // "unknown"' "$file" 2>/dev/null || echo "unknown")
    level=$(jq -r '.level // "unknown"' "$file" 2>/dev/null || echo "unknown")
    provenance_source=$(jq -r '.provenance.source // "unknown"' "$file" 2>/dev/null || echo "unknown")
    provenance_sourceRef=$(jq -r '.provenance.sourceRef // ""' "$file" 2>/dev/null || echo "")
    quality_score=$(jq -r '.analytics.qualityScore // 0' "$file" 2>/dev/null || echo "0")
    
    # Filter by sourceRef if specified
    if [ -n "$SOURCE_REF_FILTER" ]; then
      if [[ "$provenance_sourceRef" != *"$SOURCE_REF_FILTER"* ]]; then
        continue
      fi
    fi
    
    # Store item (use quality score for ranking, default to 0)
    if [ "$quality_score" = "null" ] || [ -z "$quality_score" ]; then
      quality_score="0"
    fi
    
    # Format: quality_score|entry_type|id|title|scenario|level|provenance_source|provenance_sourceRef|file_path
    echo "${quality_score}|${entry_type}|${id}|${title}|${scenario}|${level}|${provenance_source}|${provenance_sourceRef}|${file}"
  fi
done | sort -t'|' -k1 -rn | head -n "$LIMIT" | while IFS='|' read -r score entry_type id title scenario level prov_source prov_ref file_path; do
  echo "  $entry_type/$id"
  echo "    Title: $title"
  echo "    Scenario: $scenario | Level: $level"
  echo "    Source: $prov_source"
  if [ -n "$prov_ref" ] && [ "$prov_ref" != "null" ]; then
    echo "    SourceRef: $prov_ref"
  fi
  if [ "$score" != "0" ] && [ "$score" != "null" ]; then
    echo "    Quality Score: $score"
  fi
  echo "    Path: $file_path"
  echo ""
done | {
  # Check if we have any output
  has_output=false
  while IFS= read -r line; do
    has_output=true
    echo "$line"
  done
  
  if [ "$has_output" = false ]; then
    echo "✅ No entries need review!"
  fi
}

