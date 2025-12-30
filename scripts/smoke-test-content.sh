#!/bin/bash

# Smoke test content before promotion
# Verifies all referenced content exists and is valid
# Usage: ./scripts/smoke-test-content.sh [--base-url <worker>] [--sample <N>]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_DIR="$SCRIPT_DIR/../content/meta"
STAGING_MANIFEST="$META_DIR/manifest.staging.json"

# Default values
BASE_URL="${WORKER_BASE_URL:-https://getverba-content-api.simpumind-apps.workers.dev}"
SAMPLE_SIZE=5

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --base-url=*)
      BASE_URL="${arg#*=}"
      ;;
    --sample=*)
      SAMPLE_SIZE="${arg#*=}"
      ;;
    --base-url)
      shift
      BASE_URL="$1"
      ;;
    --sample)
      shift
      SAMPLE_SIZE="$1"
      ;;
  esac
done

# Check if staging manifest exists
if [ ! -f "$STAGING_MANIFEST" ]; then
  echo "❌ Error: Staging manifest not found: $STAGING_MANIFEST"
  exit 1
fi

echo "🔍 Smoke testing content before promotion..."
echo "   Base URL: $BASE_URL"
echo "   Sample size: $SAMPLE_SIZE"
echo "   Staging manifest: $STAGING_MANIFEST"
echo ""

# Read staging manifest
STAGING_CONTENT=$(cat "$STAGING_MANIFEST")
ACTIVE_WORKSPACE=$(echo "$STAGING_CONTENT" | jq -r '.activeWorkspace // ""')

if [ -z "$ACTIVE_WORKSPACE" ]; then
  echo "❌ Error: Could not determine activeWorkspace from staging manifest"
  exit 1
fi

# Get all workspaces from manifest
WORKSPACES=$(echo "$STAGING_CONTENT" | jq -r '.workspaces | keys[]')
WORKSPACE_COUNT=$(echo "$WORKSPACES" | wc -l | tr -d ' ')

echo "📦 Found $WORKSPACE_COUNT workspace(s) in staging manifest"
echo "   Active workspace: $ACTIVE_WORKSPACE"
echo ""

# Track overall success
OVERALL_SUCCESS=true

# Test each workspace
test_workspace() {
  local WORKSPACE="$1"
  local CATALOG_PATH=$(echo "$STAGING_CONTENT" | jq -r ".workspaces[\"$WORKSPACE\"] // \"\"")
  
  if [ -z "$CATALOG_PATH" ]; then
    echo "❌ Error: Could not find catalog path for workspace: $WORKSPACE"
    return 1
  fi
  
  local CATALOG_URL="${BASE_URL}${CATALOG_PATH}"
  
  echo "📋 Testing workspace: $WORKSPACE"
  echo "   Catalog: $CATALOG_URL"
  
  # Test 1: Fetch catalog
  local CATALOG_RESPONSE=$(curl -s -w "\n%{http_code}" "$CATALOG_URL")
  local CATALOG_HTTP_CODE=$(echo "$CATALOG_RESPONSE" | tail -n1)
  local CATALOG_BODY=$(echo "$CATALOG_RESPONSE" | sed '$d')
  
  if [ "$CATALOG_HTTP_CODE" != "200" ] && [ "$CATALOG_HTTP_CODE" != "304" ]; then
    echo "   ❌ Error: Catalog returned HTTP $CATALOG_HTTP_CODE"
    return 1
  fi
  
  # Validate catalog JSON
  if ! echo "$CATALOG_BODY" | jq empty 2>/dev/null; then
    echo "   ❌ Error: Catalog is not valid JSON"
    return 1
  fi
  
  echo "   ✅ Catalog accessible and valid JSON"
  
  # Extract sections from catalog
  local SECTIONS=$(echo "$CATALOG_BODY" | jq -r '.sections[]? | @json')
  
  if [ -z "$SECTIONS" ]; then
    echo "   ⚠️  Warning: Catalog has no sections"
    return 0
  fi
  
  local SECTION_COUNT=$(echo "$CATALOG_BODY" | jq '.sections | length')
  echo "   Found $SECTION_COUNT section(s)"
  
  # Test 2: For each section, test index and sample entries
  local SECTION_INDEX=0
  echo "$CATALOG_BODY" | jq -c '.sections[]' | while IFS= read -r section; do
    SECTION_INDEX=$((SECTION_INDEX + 1))
    local SECTION_ID=$(echo "$section" | jq -r '.id // "unknown"')
    local ITEMS_URL=$(echo "$section" | jq -r '.itemsUrl // ""')
    
    if [ -z "$ITEMS_URL" ]; then
      echo "   ⚠️  Section $SECTION_INDEX ($SECTION_ID): Missing itemsUrl, skipping"
      continue
    fi
    
    local INDEX_URL="${BASE_URL}${ITEMS_URL}"
    echo "   📄 Testing section $SECTION_INDEX ($SECTION_ID): $INDEX_URL"
    
    # Fetch index
    local INDEX_RESPONSE=$(curl -s -w "\n%{http_code}" "$INDEX_URL")
    local INDEX_HTTP_CODE=$(echo "$INDEX_RESPONSE" | tail -n1)
    local INDEX_BODY=$(echo "$INDEX_RESPONSE" | sed '$d')
    
    if [ "$INDEX_HTTP_CODE" != "200" ] && [ "$INDEX_HTTP_CODE" != "304" ]; then
      echo "      ❌ Error: Index returned HTTP $INDEX_HTTP_CODE"
      exit 1
    fi
    
    # Validate index JSON
    if ! echo "$INDEX_BODY" | jq empty 2>/dev/null; then
      echo "      ❌ Error: Index is not valid JSON"
      exit 1
    fi
    
    local ITEM_COUNT=$(echo "$INDEX_BODY" | jq '.items | length // 0')
    echo "      ✅ Index accessible, found $ITEM_COUNT item(s)"
    
    # Sample items (up to SAMPLE_SIZE)
    local SAMPLE_COUNT=$((ITEM_COUNT < SAMPLE_SIZE ? ITEM_COUNT : SAMPLE_SIZE))
    
    if [ "$SAMPLE_COUNT" -eq 0 ]; then
      echo "      ⚠️  No items to sample"
      continue
    fi
    
    echo "      Testing $SAMPLE_COUNT sample item(s)..."
    
    # Test each sampled item's entryUrl
    local ITEM_INDEX=0
    echo "$INDEX_BODY" | jq -c ".items[0:$SAMPLE_COUNT][]" | while IFS= read -r item; do
      ITEM_INDEX=$((ITEM_INDEX + 1))
      local ITEM_ID=$(echo "$item" | jq -r '.id // "unknown"')
      local ENTRY_URL=$(echo "$item" | jq -r '.entryUrl // ""')
      
      if [ -z "$ENTRY_URL" ]; then
        echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): Missing entryUrl"
        exit 1
      fi
      
      local ENTRY_FULL_URL="${BASE_URL}${ENTRY_URL}"
      
      # Fetch entry
      local ENTRY_RESPONSE=$(curl -s -w "\n%{http_code}" "$ENTRY_FULL_URL")
      local ENTRY_HTTP_CODE=$(echo "$ENTRY_RESPONSE" | tail -n1)
      local ENTRY_BODY=$(echo "$ENTRY_RESPONSE" | sed '$d')
      
      if [ "$ENTRY_HTTP_CODE" != "200" ] && [ "$ENTRY_HTTP_CODE" != "304" ]; then
        echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): Entry returned HTTP $ENTRY_HTTP_CODE"
        echo "            URL: $ENTRY_FULL_URL"
        exit 1
      fi
      
      # Validate entry JSON
      if ! echo "$ENTRY_BODY" | jq empty 2>/dev/null; then
        echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): Entry is not valid JSON"
        echo "            URL: $ENTRY_FULL_URL"
        exit 1
      fi
      
      # Validate entry has required fields
      local ENTRY_ID=$(echo "$ENTRY_BODY" | jq -r '.id // ""')
      local ENTRY_KIND=$(echo "$ENTRY_BODY" | jq -r '.kind // ""')
      
      if [ -z "$ENTRY_ID" ] || [ -z "$ENTRY_KIND" ]; then
        echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): Entry missing required fields (id or kind)"
        exit 1
      fi
      
      echo "         ✅ Item $ITEM_INDEX ($ITEM_ID): Entry accessible and valid"
    done
    
    if [ $? -ne 0 ]; then
      exit 1
    fi
  done
  
  if [ $? -ne 0 ]; then
    return 1
  fi
  
  return 0
}

# Test all workspaces
for ws in $WORKSPACES; do
  if ! test_workspace "$ws"; then
    OVERALL_SUCCESS=false
    break
  fi
  echo ""
done

if [ "$OVERALL_SUCCESS" = false ]; then
  echo ""
  echo "❌ Smoke test failed. Do not promote."
  exit 1
fi

echo ""
echo "✅ Smoke test passed! All referenced content is accessible and valid."
echo "   Safe to promote."

