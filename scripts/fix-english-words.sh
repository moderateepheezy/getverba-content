#!/bin/bash

# Fix English words embedded in German text
# Removes English words that appear before German translations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKS_DIR="$SCRIPT_DIR/../content/v1/workspaces/de/packs"

echo "🔧 Fixing English words in German text..."

for pack_dir in "$PACKS_DIR"/*/; do
  pack_file="$pack_dir/pack.json"
  if [ -f "$pack_file" ]; then
    # Check if file contains English words
    if grep -qE "(price |store |appointment |examination |patient |clinic |diagnosis |symptom |apartment |address |discount |buy |payment |checkout |cashier |receipt |cart |landlord |tenant |deposit |utilities |furniture |neighborhood |rent |lease |health |treatment |medicine |prescription |meeting |shift |manager |schedule |invoice |deadline |office |colleague |project |task )" "$pack_file"; then
      echo "  Fixing: $(basename "$pack_dir")"
      
      # Create temp file
      temp_file=$(mktemp)
      
      # Apply fixes - remove English words followed by space
      sed -E 's/(price |store |appointment |examination |patient |clinic |diagnosis |symptom |apartment |address |discount |buy |payment |checkout |cashier |receipt |cart |landlord |tenant |deposit |utilities |furniture |neighborhood |rent |lease |health |treatment |medicine |prescription |meeting |shift |manager |schedule |invoice |deadline |office |colleague |project |task )//g' "$pack_file" > "$temp_file"
      
      # Replace original file
      mv "$temp_file" "$pack_file"
    fi
  fi
done

echo "✅ Done fixing English words"
