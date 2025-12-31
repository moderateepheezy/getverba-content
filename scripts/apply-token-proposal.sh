#!/bin/bash

# Apply Token Proposal
# 
# Merges approved token proposal into scenario token dictionaries.
# Updates dictionaries in key files and runs validation.
#
# Usage:
#   ./scripts/apply-token-proposal.sh content/meta/token-proposals/deutschimblick.school.json

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROPOSAL_FILE="$1"

if [ -z "$PROPOSAL_FILE" ]; then
  echo "❌ Error: Missing proposal file path"
  echo "Usage: $0 <proposal-file>"
  exit 1
fi

if [ ! -f "$PROPOSAL_FILE" ]; then
  echo "❌ Error: Proposal file not found: $PROPOSAL_FILE"
  exit 1
fi

# Extract proposal data
PDF_ID=$(jq -r '.pdfId' "$PROPOSAL_FILE")
SCENARIO=$(jq -r '.scenario' "$PROPOSAL_FILE")
TOKENS=$(jq -r '.add.tokens[]' "$PROPOSAL_FILE" 2>/dev/null || echo "")
STRONG_TOKENS=$(jq -r '.add.strongTokens[]' "$PROPOSAL_FILE" 2>/dev/null || echo "")
PHRASES=$(jq -r '.add.phrases[]' "$PROPOSAL_FILE" 2>/dev/null || echo "")

if [ -z "$PDF_ID" ] || [ -z "$SCENARIO" ]; then
  echo "❌ Error: Invalid proposal file format"
  exit 1
fi

echo "📋 Applying token proposal"
echo "   PDF ID: $PDF_ID"
echo "   Scenario: $SCENARIO"
echo ""

# Files to update (key files with SCENARIO_TOKEN_DICTS)
FILES_TO_UPDATE=(
  "scripts/content-quality/computeAnalytics.ts"
  "scripts/pdf-ingestion/pdf-to-packs-batch.ts"
  "scripts/pdf-ingestion/tokenMining.ts"
)

# Collect all new tokens (dedupe)
ALL_NEW_TOKENS=$(echo -e "$TOKENS\n$PHRASES" | grep -v '^$' | sort -u)

if [ -z "$ALL_NEW_TOKENS" ]; then
  echo "⚠️  Warning: No tokens to add"
  exit 0
fi

echo "   New tokens: $(echo "$ALL_NEW_TOKENS" | wc -l | tr -d ' ')"

# Update each file
for FILE in "${FILES_TO_UPDATE[@]}"; do
  FILE_PATH="$PROJECT_ROOT/$FILE"
  
  if [ ! -f "$FILE_PATH" ]; then
    echo "⚠️  Warning: File not found: $FILE_PATH"
    continue
  fi
  
  echo "   Updating: $FILE"
  
  # Read current file
  FILE_CONTENT=$(cat "$FILE_PATH")
  
  # Find SCENARIO_TOKEN_DICTS block for this scenario
  # Extract current tokens array
  SCENARIO_PATTERN="^\\s*${SCENARIO}:\\s*\\["
  
  if ! echo "$FILE_CONTENT" | grep -q "$SCENARIO_PATTERN"; then
    echo "⚠️  Warning: Scenario '$SCENARIO' not found in $FILE"
    continue
  fi
  
  # Use Node.js script to update (more reliable than sed for TypeScript)
  node -e "
    const fs = require('fs');
    const path = '$FILE_PATH';
    const scenario = '$SCENARIO';
    const newTokens = \`$ALL_NEW_TOKENS\`.split('\\n').filter(t => t.trim());
    const newStrongTokens = \`$STRONG_TOKENS\`.split('\\n').filter(t => t.trim());
    
    let content = fs.readFileSync(path, 'utf-8');
    
    // Find SCENARIO_TOKEN_DICTS
    const dictRegex = new RegExp(\`(const SCENARIO_TOKEN_DICTS[^}]+${scenario}:\\s*\\[)([^\\]]+)(\\][^}]*)\`, 's');
    const dictMatch = content.match(dictRegex);
    
    if (dictMatch) {
      const existingTokens = dictMatch[2]
        .split(',')
        .map(t => t.trim().replace(/['\"]/g, ''))
        .filter(t => t.length > 0);
      
      // Merge and dedupe
      const allTokens = [...new Set([...existingTokens, ...newTokens])].sort();
      
      // Rebuild array
      const tokensStr = allTokens.map(t => \`'\${t}'\`).join(', ');
      const newDict = dictMatch[1] + '\\n    ' + tokensStr + '\\n  ' + dictMatch[3];
      content = content.replace(dictRegex, newDict);
    }
    
    // Update STRONG_TOKENS if it exists
    const strongRegex = new RegExp(\`(const STRONG_TOKENS[^}]+${scenario}:\\s*\\[)([^\\]]+)(\\][^}]*)\`, 's');
    const strongMatch = content.match(strongRegex);
    
    if (strongMatch && newStrongTokens.length > 0) {
      const existingStrong = strongMatch[2]
        .split(',')
        .map(t => t.trim().replace(/['\"]/g, ''))
        .filter(t => t.length > 0);
      
      const allStrong = [...new Set([...existingStrong, ...newStrongTokens])].sort();
      const strongStr = allStrong.map(t => \`'\${t}'\`).join(', ');
      const newStrong = strongMatch[1] + '\\n    ' + strongStr + '\\n  ' + strongMatch[3];
      content = content.replace(strongRegex, newStrong);
    }
    
    fs.writeFileSync(path, content, 'utf-8');
    console.log('   ✓ Updated');
  "
done

echo ""
echo "✅ Token proposal applied"
echo ""

# Run validation
echo "🔍 Running validation..."
cd "$PROJECT_ROOT"
npm run content:validate || {
  echo "⚠️  Warning: Validation failed. Please review changes."
  exit 1
}

echo ""
echo "✅ Validation passed"
echo ""
echo "💡 Next steps:"
echo "   1. Review updated files"
echo "   2. Re-run PDF batch generation:"
echo "      tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \\"
echo "        --workspace de \\"
echo "        --pdfId $PDF_ID \\"
echo "        --scenario $SCENARIO \\"
echo "        --packs 10"
echo ""

