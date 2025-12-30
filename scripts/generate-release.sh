#!/bin/bash

# Generate release.json with current git SHA and timestamp
# This script is called during CI/CD to populate release metadata

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_FILE="$SCRIPT_DIR/../content/meta/release.json"

# Get git SHA (or use placeholder if not in git repo)
GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "not-in-git")
RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Generate a simple content hash (hash of all JSON files)
CONTENT_HASH=$(find "$SCRIPT_DIR/../content" -type f -name "*.json" -exec cat {} \; | shasum -a 256 | cut -d' ' -f1 || echo "unknown")

# Create release.json
cat > "$RELEASE_FILE" <<EOF
{
  "releasedAt": "$RELEASED_AT",
  "gitSha": "$GIT_SHA",
  "contentHash": "$CONTENT_HASH"
}
EOF

echo "✅ Generated release.json:"
echo "   Released at: $RELEASED_AT"
echo "   Git SHA: $GIT_SHA"
echo "   Content hash: $CONTENT_HASH"

