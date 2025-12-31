#!/bin/bash
#
# Generate 6 friends_small_talk packs deterministically
# Usage: ./scripts/generate-friends-small-talk-packs.sh [--workspace <ws>]
#
# This script generates:
# 1. friends_plans_weekend_a1
# 2. friends_cafe_meetup_a1
# 3. friends_movies_series_a1
# 4. friends_suggestions_activity_a2
# 5. friends_opinions_recommendations_a2
# 6. friends_reschedule_and_decline_a2

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${1:-de}"

# Pack configurations: packId, level, seed, title
declare -a PACKS=(
  "friends_plans_weekend_a1|A1|1001|Plans for the Weekend"
  "friends_cafe_meetup_a1|A1|1002|Café Meetup"
  "friends_movies_series_a1|A1|1003|Movies & Series"
  "friends_suggestions_activity_a2|A2|2001|Activity Suggestions"
  "friends_opinions_recommendations_a2|A2|2002|Opinions & Recommendations"
  "friends_reschedule_and_decline_a2|A2|2003|Rescheduling & Declining"
)

echo "📦 Generating 6 friends_small_talk packs..."
echo "   Workspace: $WORKSPACE"
echo ""

for pack_config in "${PACKS[@]}"; do
  IFS='|' read -r pack_id level seed title <<< "$pack_config"
  
  echo "🔨 Generating: $pack_id (Level: $level, Seed: $seed)"
  
  npx tsx "$SCRIPT_DIR/generate-pack.ts" \
    --workspace "$WORKSPACE" \
    --packId "$pack_id" \
    --scenario "friends_small_talk" \
    --level "$level" \
    --seed "$seed" \
    --title "$title"
  
  echo "✅ Generated: $pack_id"
  echo ""
done

echo "🔄 Regenerating section indexes..."
npm run content:generate-indexes -- --workspace "$WORKSPACE"

echo ""
echo "🔍 Running validation..."
npm run content:validate || {
  echo "❌ Validation failed. Please fix errors before continuing."
  exit 1
}

echo ""
echo "🔍 Running quality check..."
npm run content:quality || {
  echo "❌ Quality check failed. Please fix errors before continuing."
  exit 1
}

echo ""
echo "✅ All 6 packs generated successfully!"
echo ""
echo "📋 Generated packs:"
for pack_config in "${PACKS[@]}"; do
  IFS='|' read -r pack_id level seed title <<< "$pack_config"
  echo "   - $pack_id (Level: $level)"
done
echo ""
echo "📋 Entry URLs: /v1/workspaces/$WORKSPACE/packs/<pack-id>/pack.json"
echo "📋 Section index: content/v1/workspaces/$WORKSPACE/context/index.json"

