#!/bin/bash

# Review Queue
# Lists all packs/drills with review.status="needs_review", grouped by scenario/level or mechanicId
# Usage: ./scripts/review-queue.sh [--kind <pack|drill>] [--sourceRef "<pdfSlug>"]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Parse arguments
SOURCE_REF_FILTER=""
KIND_FILTER=""

for i in "$@"; do
  case $i in
    --sourceRef)
      SOURCE_REF_FILTER="$2"
      shift 2
      ;;
    --kind)
      KIND_FILTER="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

echo "📋 Review Queue"
if [ -n "$KIND_FILTER" ]; then
  echo "   Filter: kind = \"$KIND_FILTER\""
fi
if [ -n "$SOURCE_REF_FILTER" ]; then
  echo "   Filter: sourceRef contains \"$SOURCE_REF_FILTER\""
fi
echo ""

# Find all pack.json and drill.json files
find "$CONTENT_DIR/workspaces" -name "pack.json" -o -name "drill.json" | while read -r file; do
  # Extract workspace and entry type
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
    # Filter by kind if specified
    if [ -n "$KIND_FILTER" ] && [ "$entry_type" != "$KIND_FILTER" ]; then
      continue
    fi
    
    # Extract metadata
    id=$(jq -r '.id' "$file" 2>/dev/null || echo "unknown")
    title=$(jq -r '.title' "$file" 2>/dev/null || echo "Untitled")
    scenario=$(jq -r '.scenario // .mechanicId // "unknown"' "$file" 2>/dev/null || echo "unknown")
    level=$(jq -r '.level // "unknown"' "$file" 2>/dev/null || echo "unknown")
    mechanicId=$(jq -r '.mechanicId // ""' "$file" 2>/dev/null || echo "")
    provenance_source=$(jq -r '.provenance.source // "unknown"' "$file" 2>/dev/null || echo "unknown")
    provenance_sourceRef=$(jq -r '.provenance.sourceRef // ""' "$file" 2>/dev/null || echo "")
    
    # Filter by sourceRef if specified
    if [ -n "$SOURCE_REF_FILTER" ]; then
      if [[ "$provenance_sourceRef" != *"$SOURCE_REF_FILTER"* ]]; then
        continue
      fi
    fi
    
    echo "  $entry_type/$id"
    echo "    Title: $title"
    if [ "$entry_type" = "drill" ] && [ -n "$mechanicId" ]; then
      echo "    Mechanic: $mechanicId | Level: $level"
    else
      echo "    Scenario: $scenario | Level: $level"
    fi
    echo "    Source: $provenance_source"
    if [ -n "$provenance_sourceRef" ]; then
      echo "    SourceRef: $provenance_sourceRef"
    fi
    echo "    Path: $file"
    echo ""
  fi
done | {
  # Group by scenario/level
  current_scenario=""
  current_level=""
  has_entries=false
  
  while IFS= read -r line; do
    if [[ "$line" == *"Mechanic:"* ]] || [[ "$line" == *"Scenario:"* ]]; then
      if [[ "$line" == *"Mechanic:"* ]]; then
        mechanic=$(echo "$line" | sed 's/.*Mechanic: \([^|]*\).*/\1/' | xargs)
        level=$(echo "$line" | sed 's/.*Level: \([^|]*\).*/\1/' | xargs)
        group_key="$mechanic|$level"
        group_label="$mechanic / $level"
      else
        scenario=$(echo "$line" | sed 's/.*Scenario: \([^|]*\).*/\1/' | xargs)
        level=$(echo "$line" | sed 's/.*Level: \([^|]*\).*/\1/' | xargs)
        group_key="$scenario|$level"
        group_label="$scenario / $level"
      fi
      
      if [ "$group_key" != "$current_group" ]; then
        if [ "$has_entries" = true ]; then
          echo ""
        fi
        current_group="$group_key"
        echo "## $group_label"
        echo ""
        has_entries=true
      fi
    fi
    echo "$line"
  done
  
  if [ "$has_entries" = false ]; then
    echo "✅ No entries need review!"
  fi
}

