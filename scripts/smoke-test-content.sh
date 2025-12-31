#!/bin/bash

# Smoke test content before promotion
# Verifies all referenced content exists and is valid
# Follows pagination nextPage chains
#
# Usage: ./scripts/smoke-test-content.sh [options]
#
# Options:
#   --base-url <url>        Worker API base URL
#   --sample <N>            Number of entry items to sample per section (default: 5)
#   --follow-next-page      Follow nextPage pagination chains (default: on)
#   --no-follow-next-page   Skip nextPage following
#   --max-pages <N>         Maximum pages to follow per section (default: 20)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_DIR="$SCRIPT_DIR/../content/meta"
STAGING_MANIFEST="$META_DIR/manifest.staging.json"

# Default values
BASE_URL="${WORKER_BASE_URL:-https://getverba-content-api.simpumind-apps.workers.dev}"
SAMPLE_SIZE=5
FOLLOW_NEXT_PAGE=true
MAX_PAGES=20

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url=*)
      BASE_URL="${1#*=}"
      shift
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --sample=*)
      SAMPLE_SIZE="${1#*=}"
      shift
      ;;
    --sample)
      SAMPLE_SIZE="$2"
      shift 2
      ;;
    --follow-next-page)
      FOLLOW_NEXT_PAGE=true
      shift
      ;;
    --no-follow-next-page)
      FOLLOW_NEXT_PAGE=false
      shift
      ;;
    --max-pages=*)
      MAX_PAGES="${1#*=}"
      shift
      ;;
    --max-pages)
      MAX_PAGES="$2"
      shift 2
      ;;
    *)
      shift
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
echo "   Follow nextPage: $FOLLOW_NEXT_PAGE"
echo "   Max pages: $MAX_PAGES"
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
  
  # Test 2: For each section, test index and sample entries (with pagination)
  local SECTION_INDEX=0
  echo "$CATALOG_BODY" | jq -c '.sections[]' | while IFS= read -r section; do
    SECTION_INDEX=$((SECTION_INDEX + 1))
    local SECTION_ID=$(echo "$section" | jq -r '.id // "unknown"')
    local ITEMS_URL=$(echo "$section" | jq -r '.itemsUrl // ""')
    
    if [ -z "$ITEMS_URL" ]; then
      echo "   ⚠️  Section $SECTION_INDEX ($SECTION_ID): Missing itemsUrl, skipping"
      continue
    fi
    
    # Follow pagination chain
    local CURRENT_PAGE_URL="$ITEMS_URL"
    local PAGE_NUM=0
    local TOTAL_ITEMS=0
    local VISITED_PAGES=""
    local FIRST_PAGE_VERSION=""
    local FIRST_PAGE_KIND=""
    local FIRST_PAGE_PAGESIZE=""
    local FIRST_PAGE_TOTAL=""
    
    while [ -n "$CURRENT_PAGE_URL" ] && [ "$PAGE_NUM" -lt "$MAX_PAGES" ]; do
      PAGE_NUM=$((PAGE_NUM + 1))
      
      # Loop detection
      if echo "$VISITED_PAGES" | grep -q "^${CURRENT_PAGE_URL}$"; then
        echo "      ❌ Error: Pagination loop detected at $CURRENT_PAGE_URL"
        exit 1
      fi
      VISITED_PAGES="${VISITED_PAGES}${CURRENT_PAGE_URL}
"
      
      local INDEX_URL="${BASE_URL}${CURRENT_PAGE_URL}"
      
      if [ "$PAGE_NUM" -eq 1 ]; then
        echo "   📄 Testing section $SECTION_INDEX ($SECTION_ID): $INDEX_URL"
      else
        echo "      📄 Page $PAGE_NUM: $CURRENT_PAGE_URL"
      fi
      
      # Fetch page
      local INDEX_RESPONSE=$(curl -s -w "\n%{http_code}" "$INDEX_URL")
      local INDEX_HTTP_CODE=$(echo "$INDEX_RESPONSE" | tail -n1)
      local INDEX_BODY=$(echo "$INDEX_RESPONSE" | sed '$d')
      
      if [ "$INDEX_HTTP_CODE" != "200" ] && [ "$INDEX_HTTP_CODE" != "304" ]; then
        echo "      ❌ Error: Page returned HTTP $INDEX_HTTP_CODE"
        exit 1
      fi
      
      # Validate JSON
      if ! echo "$INDEX_BODY" | jq empty 2>/dev/null; then
        echo "      ❌ Error: Page is not valid JSON"
        exit 1
      fi
      
      local PAGE_ITEM_COUNT=$(echo "$INDEX_BODY" | jq '.items | length // 0')
      TOTAL_ITEMS=$((TOTAL_ITEMS + PAGE_ITEM_COUNT))
      
      # Store first page metadata for invariant checks
      if [ "$PAGE_NUM" -eq 1 ]; then
        FIRST_PAGE_VERSION=$(echo "$INDEX_BODY" | jq -r '.version // ""')
        FIRST_PAGE_KIND=$(echo "$INDEX_BODY" | jq -r '.kind // ""')
        FIRST_PAGE_PAGESIZE=$(echo "$INDEX_BODY" | jq -r '.pageSize // 0')
        FIRST_PAGE_TOTAL=$(echo "$INDEX_BODY" | jq -r '.total // 0')
        echo "      ✅ Page 1 accessible, found $PAGE_ITEM_COUNT item(s)"
      else
        # Check invariants match first page
        local THIS_VERSION=$(echo "$INDEX_BODY" | jq -r '.version // ""')
        local THIS_KIND=$(echo "$INDEX_BODY" | jq -r '.kind // ""')
        local THIS_PAGESIZE=$(echo "$INDEX_BODY" | jq -r '.pageSize // 0')
        local THIS_TOTAL=$(echo "$INDEX_BODY" | jq -r '.total // 0')
        
        if [ "$THIS_VERSION" != "$FIRST_PAGE_VERSION" ]; then
          echo "      ❌ Error: version mismatch (page $PAGE_NUM: $THIS_VERSION vs page 1: $FIRST_PAGE_VERSION)"
          exit 1
        fi
        if [ "$THIS_KIND" != "$FIRST_PAGE_KIND" ]; then
          echo "      ❌ Error: kind mismatch (page $PAGE_NUM: $THIS_KIND vs page 1: $FIRST_PAGE_KIND)"
          exit 1
        fi
        if [ "$THIS_PAGESIZE" != "$FIRST_PAGE_PAGESIZE" ]; then
          echo "      ❌ Error: pageSize mismatch (page $PAGE_NUM: $THIS_PAGESIZE vs page 1: $FIRST_PAGE_PAGESIZE)"
          exit 1
        fi
        if [ "$THIS_TOTAL" != "$FIRST_PAGE_TOTAL" ]; then
          echo "      ❌ Error: total mismatch (page $PAGE_NUM: $THIS_TOTAL vs page 1: $FIRST_PAGE_TOTAL)"
          exit 1
        fi
        
        echo "      ✅ Page $PAGE_NUM accessible, found $PAGE_ITEM_COUNT item(s)"
      fi
      
      # Sample items from this page (only sample from first page to keep it quick)
      if [ "$PAGE_NUM" -eq 1 ]; then
        local SAMPLE_COUNT=$((PAGE_ITEM_COUNT < SAMPLE_SIZE ? PAGE_ITEM_COUNT : SAMPLE_SIZE))
        
        if [ "$SAMPLE_COUNT" -gt 0 ]; then
          echo "      Testing $SAMPLE_COUNT sample item(s)..."
          
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
            
            if ! echo "$ENTRY_BODY" | jq empty 2>/dev/null; then
              echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): Entry is not valid JSON"
              exit 1
            fi
            
            local ENTRY_ID=$(echo "$ENTRY_BODY" | jq -r '.id // ""')
            local ENTRY_KIND=$(echo "$ENTRY_BODY" | jq -r '.kind // ""')
            
            if [ -z "$ENTRY_ID" ] || [ -z "$ENTRY_KIND" ]; then
              echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): Entry missing required fields"
              exit 1
            fi
            
            # Validate analyticsSummary for pack items
            if [ "$ENTRY_KIND" = "pack" ] || [ "$ENTRY_KIND" = "context" ]; then
              local HAS_ANALYTICS=$(echo "$item" | jq -r '.analyticsSummary // empty')
              if [ -z "$HAS_ANALYTICS" ]; then
                echo "         ⚠️  Item $ITEM_INDEX ($ITEM_ID): Pack item missing analyticsSummary (may not be regenerated yet)"
              else
                local GOAL=$(echo "$item" | jq -r '.analyticsSummary.goal // ""')
                if [ -z "$GOAL" ]; then
                  echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): analyticsSummary missing goal"
                  exit 1
                fi
                local WHY_COUNT=$(echo "$item" | jq '.analyticsSummary.whyThisWorks | length // 0')
                if [ "$WHY_COUNT" -lt 2 ] || [ "$WHY_COUNT" -gt 4 ]; then
                  echo "         ❌ Item $ITEM_INDEX ($ITEM_ID): analyticsSummary.whyThisWorks must have 2-4 items, got $WHY_COUNT"
                  exit 1
                fi
              fi
            fi
            
            echo "         ✅ Item $ITEM_INDEX ($ITEM_ID): Entry accessible and valid"
          done
          
          if [ $? -ne 0 ]; then
            exit 1
          fi
        fi
      fi
      
      # Get next page URL
      if [ "$FOLLOW_NEXT_PAGE" = true ]; then
        CURRENT_PAGE_URL=$(echo "$INDEX_BODY" | jq -r '.nextPage // ""')
        if [ "$CURRENT_PAGE_URL" = "null" ]; then
          CURRENT_PAGE_URL=""
        fi
      else
        CURRENT_PAGE_URL=""
      fi
    done
    
    if [ "$PAGE_NUM" -gt 1 ]; then
      echo "      📊 Total: $PAGE_NUM pages, $TOTAL_ITEMS items"
      
      # Validate total matches
      if [ "$TOTAL_ITEMS" -ne "$FIRST_PAGE_TOTAL" ]; then
        echo "      ❌ Error: Declared total ($FIRST_PAGE_TOTAL) doesn't match actual items ($TOTAL_ITEMS)"
        exit 1
      fi
    fi
    
    if [ $? -ne 0 ]; then
      exit 1
    fi
  done
  
  if [ $? -ne 0 ]; then
    return 1
  fi
  
  # Test 2.5: Test scenario index if it exists (for context section)
  echo "   🎯 Testing scenario index..."
  local SCENARIO_INDEX_URL="${BASE_URL}/v1/workspaces/${WORKSPACE}/context/scenarios.json"
  local SCENARIO_RESPONSE=$(curl -s -w "\n%{http_code}" "$SCENARIO_INDEX_URL")
  local SCENARIO_HTTP_CODE=$(echo "$SCENARIO_RESPONSE" | tail -n1)
  local SCENARIO_BODY=$(echo "$SCENARIO_RESPONSE" | sed '$d')
  
  if [ "$SCENARIO_HTTP_CODE" != "200" ] && [ "$SCENARIO_HTTP_CODE" != "304" ]; then
    echo "      ⚠️  Warning: Scenario index returned HTTP $SCENARIO_HTTP_CODE (may not exist yet)"
  else
    if ! echo "$SCENARIO_BODY" | jq empty 2>/dev/null; then
      echo "      ❌ Error: Scenario index is not valid JSON"
      return 1
    fi
    
    # Validate scenario index structure
    local SCENARIO_VERSION=$(echo "$SCENARIO_BODY" | jq -r '.version // ""')
    local SCENARIO_KIND=$(echo "$SCENARIO_BODY" | jq -r '.kind // ""')
    
    if [ "$SCENARIO_VERSION" != "1" ]; then
      echo "      ❌ Error: Scenario index version must be 1, got $SCENARIO_VERSION"
      return 1
    fi
    if [ "$SCENARIO_KIND" != "scenario_index" ]; then
      echo "      ❌ Error: Scenario index kind must be scenario_index, got $SCENARIO_KIND"
      return 1
    fi
    
    local SCENARIO_COUNT=$(echo "$SCENARIO_BODY" | jq '.items | length // 0')
    echo "      ✅ Scenario index accessible, found $SCENARIO_COUNT scenario(s)"
    
    # Test each scenario's itemsUrl and follow pagination
    if [ "$SCENARIO_COUNT" -gt 0 ]; then
      echo "      Testing scenario pages..."
      local SCENARIO_INDEX=0
      echo "$SCENARIO_BODY" | jq -c '.items[]' | while IFS= read -r scenario; do
        SCENARIO_INDEX=$((SCENARIO_INDEX + 1))
        local SCENARIO_ID=$(echo "$scenario" | jq -r '.id // "unknown"')
        local SCENARIO_ITEMS_URL=$(echo "$scenario" | jq -r '.itemsUrl // ""')
        local SCENARIO_ITEM_COUNT=$(echo "$scenario" | jq -r '.itemCount // 0')
        
        if [ -z "$SCENARIO_ITEMS_URL" ]; then
          echo "         ❌ Scenario $SCENARIO_INDEX ($SCENARIO_ID): Missing itemsUrl"
          exit 1
        fi
        
        # Follow pagination chain for this scenario
        local SCENARIO_CURRENT_PAGE="$SCENARIO_ITEMS_URL"
        local SCENARIO_PAGE_NUM=0
        local SCENARIO_TOTAL_ITEMS=0
        local SCENARIO_VISITED_PAGES=""
        
        while [ -n "$SCENARIO_CURRENT_PAGE" ] && [ "$SCENARIO_PAGE_NUM" -lt "$MAX_PAGES" ]; do
          SCENARIO_PAGE_NUM=$((SCENARIO_PAGE_NUM + 1))
          
          # Loop detection
          if echo "$SCENARIO_VISITED_PAGES" | grep -q "^${SCENARIO_CURRENT_PAGE}$"; then
            echo "         ❌ Error: Pagination loop detected at $SCENARIO_CURRENT_PAGE"
            exit 1
          fi
          SCENARIO_VISITED_PAGES="${SCENARIO_VISITED_PAGES}${SCENARIO_CURRENT_PAGE}
"
          
          local SCENARIO_PAGE_URL="${BASE_URL}${SCENARIO_CURRENT_PAGE}"
          
          # Fetch page
          local SCENARIO_PAGE_RESPONSE=$(curl -s -w "\n%{http_code}" "$SCENARIO_PAGE_URL")
          local SCENARIO_PAGE_HTTP_CODE=$(echo "$SCENARIO_PAGE_RESPONSE" | tail -n1)
          local SCENARIO_PAGE_BODY=$(echo "$SCENARIO_PAGE_RESPONSE" | sed '$d')
          
          if [ "$SCENARIO_PAGE_HTTP_CODE" != "200" ] && [ "$SCENARIO_PAGE_HTTP_CODE" != "304" ]; then
            echo "         ❌ Error: Scenario $SCENARIO_ID page $SCENARIO_PAGE_NUM returned HTTP $SCENARIO_PAGE_HTTP_CODE"
            exit 1
          fi
          
          if ! echo "$SCENARIO_PAGE_BODY" | jq empty 2>/dev/null; then
            echo "         ❌ Error: Scenario $SCENARIO_ID page $SCENARIO_PAGE_NUM is not valid JSON"
            exit 1
          fi
          
          local SCENARIO_PAGE_ITEM_COUNT=$(echo "$SCENARIO_PAGE_BODY" | jq '.items | length // 0')
          SCENARIO_TOTAL_ITEMS=$((SCENARIO_TOTAL_ITEMS + SCENARIO_PAGE_ITEM_COUNT))
          
          # Get next page URL
          if [ "$FOLLOW_NEXT_PAGE" = true ]; then
            SCENARIO_CURRENT_PAGE=$(echo "$SCENARIO_PAGE_BODY" | jq -r '.nextPage // ""')
            if [ "$SCENARIO_CURRENT_PAGE" = "null" ]; then
              SCENARIO_CURRENT_PAGE=""
            fi
          else
            SCENARIO_CURRENT_PAGE=""
          fi
        done
        
        # Validate itemCount matches actual items
        if [ "$SCENARIO_TOTAL_ITEMS" -ne "$SCENARIO_ITEM_COUNT" ]; then
          echo "         ❌ Error: Scenario $SCENARIO_ID itemCount ($SCENARIO_ITEM_COUNT) doesn't match actual items ($SCENARIO_TOTAL_ITEMS)"
          exit 1
        fi
        
        echo "         ✅ Scenario $SCENARIO_ID: $SCENARIO_TOTAL_ITEMS items across $SCENARIO_PAGE_NUM page(s)"
      done
      
      if [ $? -ne 0 ]; then
        return 1
      fi
    fi
    
    echo "      ✅ Scenario index accessible and valid"
  fi
  
  # Test 3: Test featured.json if it exists
  echo "   🎯 Testing featured content..."
  
  local FEATURED_URL="${BASE_URL}/v1/workspaces/${WORKSPACE}/featured/featured.json"
  local FEATURED_RESPONSE=$(curl -s -w "\n%{http_code}" "$FEATURED_URL")
  local FEATURED_HTTP_CODE=$(echo "$FEATURED_RESPONSE" | tail -n1)
  local FEATURED_BODY=$(echo "$FEATURED_RESPONSE" | sed '$d')
  
  if [ "$FEATURED_HTTP_CODE" != "200" ] && [ "$FEATURED_HTTP_CODE" != "304" ]; then
    echo "      ⚠️  Warning: Featured content returned HTTP $FEATURED_HTTP_CODE (may not be published yet)"
  else
    if ! echo "$FEATURED_BODY" | jq empty 2>/dev/null; then
      echo "      ❌ Error: Featured content is not valid JSON"
      return 1
    fi
    
    # Validate featured structure
    local HERO_URL=$(echo "$FEATURED_BODY" | jq -r '.hero.entryUrl // ""')
    if [ -z "$HERO_URL" ]; then
      echo "      ❌ Error: Featured content missing hero.entryUrl"
      return 1
    fi
    
    # Test hero entry
    local HERO_FULL_URL="${BASE_URL}${HERO_URL}"
    local HERO_RESPONSE=$(curl -s -w "\n%{http_code}" "$HERO_FULL_URL")
    local HERO_HTTP_CODE=$(echo "$HERO_RESPONSE" | tail -n1)
    
    if [ "$HERO_HTTP_CODE" != "200" ] && [ "$HERO_HTTP_CODE" != "304" ]; then
      echo "      ❌ Error: Hero entry returned HTTP $HERO_HTTP_CODE"
      echo "         URL: $HERO_FULL_URL"
      return 1
    fi
    
    echo "      ✅ Featured hero accessible"
    
    # Test cards entries
    local CARD_COUNT=$(echo "$FEATURED_BODY" | jq '.cards | length // 0')
    if [ "$CARD_COUNT" -gt 4 ]; then
      echo "      ❌ Error: Featured cards length ($CARD_COUNT) exceeds maximum of 4"
      return 1
    fi
    
    if [ "$CARD_COUNT" -gt 0 ]; then
      echo "      Testing $CARD_COUNT card(s)..."
      local CARD_INDEX=0
      echo "$FEATURED_BODY" | jq -c '.cards[]' | while IFS= read -r card; do
        CARD_INDEX=$((CARD_INDEX + 1))
        local CARD_ENTRY_URL=$(echo "$card" | jq -r '.entryUrl // ""')
        
        if [ -z "$CARD_ENTRY_URL" ]; then
          echo "         ❌ Card $CARD_INDEX: Missing entryUrl"
          exit 1
        fi
        
        local CARD_FULL_URL="${BASE_URL}${CARD_ENTRY_URL}"
        local CARD_RESPONSE=$(curl -s -w "\n%{http_code}" "$CARD_FULL_URL")
        local CARD_HTTP_CODE=$(echo "$CARD_RESPONSE" | tail -n1)
        
        if [ "$CARD_HTTP_CODE" != "200" ] && [ "$CARD_HTTP_CODE" != "304" ]; then
          echo "         ❌ Card $CARD_INDEX: Entry returned HTTP $CARD_HTTP_CODE"
          echo "            URL: $CARD_FULL_URL"
          exit 1
        fi
        
        echo "         ✅ Card $CARD_INDEX: Entry accessible"
      done
      
      if [ $? -ne 0 ]; then
        return 1
      fi
    fi
    
    echo "      ✅ Featured content accessible and valid"
  fi
  
  # Test 4: Validate exports exist and parse
  echo "   📊 Testing exports..."
  
  local EXPORTS_JSON_URL="${BASE_URL}/v1/workspaces/${WORKSPACE}/exports/catalog_export.json"
  local EXPORTS_CSV_URL="${BASE_URL}/v1/workspaces/${WORKSPACE}/exports/catalog_export.csv"
  
  # Test JSON export
  local JSON_RESPONSE=$(curl -s -w "\n%{http_code}" "$EXPORTS_JSON_URL")
  local JSON_HTTP_CODE=$(echo "$JSON_RESPONSE" | tail -n1)
  local JSON_BODY=$(echo "$JSON_RESPONSE" | sed '$d')
  
  if [ "$JSON_HTTP_CODE" != "200" ] && [ "$JSON_HTTP_CODE" != "304" ]; then
    echo "      ⚠️  Warning: JSON export returned HTTP $JSON_HTTP_CODE (may not be published yet)"
  else
    if ! echo "$JSON_BODY" | jq empty 2>/dev/null; then
      echo "      ❌ Error: JSON export is not valid JSON"
      return 1
    fi
    
    local EXPORT_TOTAL=$(echo "$JSON_BODY" | jq -r '.total // 0')
    local EXPORT_ITEMS_COUNT=$(echo "$JSON_BODY" | jq '.items | length // 0')
    
    if [ "$EXPORT_TOTAL" != "$EXPORT_ITEMS_COUNT" ]; then
      echo "      ❌ Error: JSON export total ($EXPORT_TOTAL) doesn't match items count ($EXPORT_ITEMS_COUNT)"
      return 1
    fi
    
    echo "      ✅ JSON export accessible and valid (${EXPORT_TOTAL} items)"
  fi
  
  # Test CSV export
  local CSV_RESPONSE=$(curl -s -w "\n%{http_code}" "$EXPORTS_CSV_URL")
  local CSV_HTTP_CODE=$(echo "$CSV_RESPONSE" | tail -n1)
  local CSV_BODY=$(echo "$CSV_RESPONSE" | sed '$d')
  
  if [ "$CSV_HTTP_CODE" != "200" ] && [ "$CSV_HTTP_CODE" != "304" ]; then
    echo "      ⚠️  Warning: CSV export returned HTTP $CSV_HTTP_CODE (may not be published yet)"
  else
    # Check CSV has headers
    local FIRST_LINE=$(echo "$CSV_BODY" | head -n1)
    if [ -z "$FIRST_LINE" ] || [ "$FIRST_LINE" != "${FIRST_LINE%,*}" ]; then
      echo "      ✅ CSV export accessible and has headers"
    else
      echo "      ⚠️  Warning: CSV export may be missing headers"
    fi
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

