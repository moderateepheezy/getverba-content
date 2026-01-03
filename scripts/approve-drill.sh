#!/bin/bash

#
# Approve a drill entry
# Usage: ./scripts/approve-drill.sh <drill-id> [--reviewer <name>] [--workspace <ws>]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"

# Defaults
WORKSPACE="de"
REVIEWER=""
DRILL_ID=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace|-w)
      WORKSPACE="$2"
      shift 2
      ;;
    --reviewer|-r)
      REVIEWER="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 <drill-id> [options]"
      echo ""
      echo "Options:"
      echo "  --workspace, -w   Workspace ID (default: de)"
      echo "  --reviewer, -r   Reviewer name (required)"
      echo ""
      echo "Example:"
      echo "  $0 verb_present_tense_a1_tier1 --reviewer 'John Doe'"
      exit 0
      ;;
    *)
      if [[ -z "$DRILL_ID" ]]; then
        DRILL_ID="$1"
      else
        echo "Unknown option: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

if [[ -z "$DRILL_ID" ]]; then
  echo "❌ Error: Drill ID is required"
  echo "Usage: $0 <drill-id> [--reviewer <name>]"
  exit 1
fi

if [[ -z "$REVIEWER" ]]; then
  echo "❌ Error: Reviewer name is required"
  echo "Usage: $0 <drill-id> --reviewer <name>"
  exit 1
fi

DRILL_FILE="$CONTENT_DIR/workspaces/$WORKSPACE/drills/$DRILL_ID/drill.json"

if [[ ! -f "$DRILL_FILE" ]]; then
  echo "❌ Error: Drill not found: $DRILL_FILE"
  exit 1
fi

# Update review status
TEMP_FILE=$(mktemp)
jq --arg reviewer "$REVIEWER" --arg reviewedAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '.review.status = "approved" | .review.reviewer = $reviewer | .review.reviewedAt = $reviewedAt' \
  "$DRILL_FILE" > "$TEMP_FILE"

mv "$TEMP_FILE" "$DRILL_FILE"

echo "✅ Approved drill: $DRILL_ID"
echo "   Reviewer: $REVIEWER"
echo "   Reviewed at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

