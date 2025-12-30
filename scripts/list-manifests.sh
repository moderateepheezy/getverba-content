#!/bin/bash
#
# List archived manifests from the Worker API
# Usage: ./scripts/list-manifests.sh [--base-url <url>]
#

set -e

# Default base URL
BASE_URL="${WORKER_BASE_URL:-https://getverba-content-api.simpumind-apps.workers.dev}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--base-url <url>]"
      echo ""
      echo "Options:"
      echo "  --base-url  Worker API base URL (default: production)"
      echo ""
      echo "Example:"
      echo "  $0"
      echo "  $0 --base-url https://staging-worker.workers.dev"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "📋 Archived Manifests"
echo "   Base URL: $BASE_URL"
echo ""

# Fetch manifests
RESPONSE=$(curl -s "$BASE_URL/manifests")

# Check if jq is available
if command -v jq &> /dev/null; then
  # Pretty print with jq
  COUNT=$(echo "$RESPONSE" | jq '.items | length')
  echo "   Total: $COUNT archived manifest(s)"
  echo ""
  
  if [ "$COUNT" -gt 0 ]; then
    echo "   Git SHA                                      | Last Modified"
    echo "   ---------------------------------------------|---------------------------"
    echo "$RESPONSE" | jq -r '.items[] | "   \(.gitSha) | \(.lastModified)"'
  else
    echo "   No archived manifests found."
    echo "   Run ./scripts/promote-staging.sh to create the first archive."
  fi
  
  # Check for cursor (pagination)
  CURSOR=$(echo "$RESPONSE" | jq -r '.cursor // empty')
  if [ -n "$CURSOR" ]; then
    echo ""
    echo "   ⚠️  More results available. Use cursor: $CURSOR"
  fi
else
  # Raw JSON output
  echo "   (Install jq for prettier output)"
  echo ""
  echo "$RESPONSE"
fi

echo ""

