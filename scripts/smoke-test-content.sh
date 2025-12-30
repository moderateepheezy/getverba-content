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
ACTIVE_WORKSPACE=$(echo "$STAGING_CONTENT" | grep -o '"activeWorkspace"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

if [ -z "$ACTIVE_WORKSPACE" ]; then
  echo "❌ Error: Could not determine activeWorkspace from staging manifest"
  exit 1
fi

# Extract catalog path for active workspace
CATALOG_PATH=$(echo "$STAGING_CONTENT" | grep -o "\"$ACTIVE_WORKSPACE\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | cut -d'"' -f4)

if [ -z "$CATALOG_PATH" ]; then
  echo "❌ Error: Could not find catalog path for workspace: $ACTIVE_WORKSPACE"
  exit 1
fi

CATALOG_URL="${BASE_URL}${CATALOG_PATH}"

echo "📋 Testing catalog: $CATALOG_URL"

# Test 1: Fetch catalog
CATALOG_RESPONSE=$(curl -s -w "\n%{http_code}" "$CATALOG_URL")
CATALOG_HTTP_CODE=$(echo "$CATALOG_RESPONSE" | tail -n1)
CATALOG_BODY=$(echo "$CATALOG_RESPONSE" | sed '$d')

if [ "$CATALOG_HTTP_CODE" != "200" ] && [ "$CATALOG_HTTP_CODE" != "304" ]; then
  echo "❌ Error: Catalog returned HTTP $CATALOG_HTTP_CODE"
  exit 1
fi

# Validate catalog JSON
if ! echo "$CATALOG_BODY" | jq empty 2>/dev/null; then
  echo "❌ Error: Catalog is not valid JSON"
  exit 1
fi

echo "   ✅ Catalog accessible and valid JSON"

# Extract sections from catalog
SECTIONS=$(echo "$CATALOG_BODY" | jq -r '.sections[]? | @json')

if [ -z "$SECTIONS" ]; then
  echo "❌ Error: Catalog has no sections"
  exit 1
fi

SECTION_COUNT=$(echo "$CATALOG_BODY" | jq '.sections | length')
echo "   Found $SECTION_COUNT section(s)"

# Test 2: For each section, test index and sample entries
SECTION_INDEX=0
echo "$CATALOG_BODY" | jq -c '.sections[]' | while IFS= read -r section; do
  SECTION_INDEX=$((SECTION_INDEX + 1))
  SECTION_ID=$(echo "$section" | jq -r '.id // "unknown"')
  ITEMS_URL=$(echo "$section" | jq -r '.itemsUrl // ""')
  
  if [ -z "$ITEMS_URL" ]; then
    echo "   ⚠️  Section $SECTION_INDEX ($SECTION_ID): Missing itemsUrl, skipping"
    continue
  fi
  
  INDEX_URL="${BASE_URL}${ITEMS_URL}"
  echo "   📄 Testing section $SECTION_INDEX ($SECTION_ID): $INDEX_URL"
  
  # Fetch index
  INDEX_RESPONSE=$(curl -s -w "\n%{http_code}" "$INDEX_URL")
  INDEX_HTTP_CODE=$(echo "$INDEX_RESPONSE" | tail -n1)
  INDEX_BODY=$(echo "$INDEX_RESPONSE" | sed '$d')
  
  if [ "$INDEX_HTTP_CODE" != "200" ] && [ "$INDEX_HTTP_CODE" != "304" ]; then
    echo "   ❌ Error: Index returned HTTP $INDEX_HTTP_CODE"
    exit 1
  fi
  
  # Validate index JSON
  if ! echo "$INDEX_BODY" | jq empty 2>/dev/null; then
    echo "   ❌ Error: Index is not valid JSON"
    exit 1
  fi
  
  ITEM_COUNT=$(echo "$INDEX_BODY" | jq '.items | length // 0')
  echo "      ✅ Index accessible, found $ITEM_COUNT item(s)"
  
  # Sample items (up to SAMPLE_SIZE)
  SAMPLE_COUNT=$((ITEM_COUNT < SAMPLE_SIZE ? ITEM_COUNT : SAMPLE_SIZE))
  
  if [ "$SAMPLE_COUNT" -eq 0 ]; then
    echo "      ⚠️  No items to sample"
    continue
  fi
  
  echo "      Testing $SAMPLE_COUNT sample item(s)..."
  
  # Test each sampled item's entryUrl
  ITEM_INDEX=0
  echo "$INDEX_BODY" | jq -c ".items[0:$SAMPLE_COUNT][]" | while IFS= read -r item; do
    ITEM_INDEX=$((ITEM_INDEX + 1))
    ITEM_ID=$(echo "$item" | jq -r '.id // "unknown"')
    ENTRY_URL=$(echo "$item" | jq -r '.entryUrl // ""')
    
    if [ -z "$ENTRY_URL" ]; then
      echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): Missing entryUrl"
      exit 1
    fi
    
    ENTRY_FULL_URL="${BASE_URL}${ENTRY_URL}"
    
    # Fetch entry
    ENTRY_RESPONSE=$(curl -s -w "\n%{http_code}" "$ENTRY_FULL_URL")
    ENTRY_HTTP_CODE=$(echo "$ENTRY_RESPONSE" | tail -n1)
    ENTRY_BODY=$(echo "$ENTRY_RESPONSE" | sed '$d')
    
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
    ENTRY_ID=$(echo "$ENTRY_BODY" | jq -r '.id // ""')
    ENTRY_KIND=$(echo "$ENTRY_BODY" | jq -r '.kind // ""')
    
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
  echo ""
  echo "❌ Smoke test failed. Do not promote."
  exit 1
fi

echo ""
echo "✅ Smoke test passed! All referenced content is accessible and valid."
echo "   Safe to promote."

