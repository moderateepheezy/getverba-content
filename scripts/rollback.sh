#!/bin/bash

# Rollback production to a previous manifest by git SHA
# Usage: ./scripts/rollback.sh <gitSha> [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
META_DIR="$SCRIPT_DIR/../content/meta"
BUCKET="${R2_BUCKET:-getverba-content-prod}"

# Load environment variables from .env.local if it exists
ENV_FILE="$SCRIPT_DIR/../.env.local"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Check required arguments
if [ -z "$1" ]; then
  echo "❌ Error: Git SHA is required"
  echo "   Usage: ./scripts/rollback.sh <gitSha> [--dry-run]"
  echo "   Example: ./scripts/rollback.sh abc123def"
  exit 1
fi

GIT_SHA="$1"

# Check required environment variables
if [ -z "$R2_ENDPOINT" ]; then
  echo "❌ Error: R2_ENDPOINT environment variable is required"
  exit 1
fi

if [ -z "$R2_ACCESS_KEY_ID" ]; then
  echo "❌ Error: R2_ACCESS_KEY_ID environment variable is required"
  exit 1
fi

if [ -z "$R2_SECRET_ACCESS_KEY" ]; then
  echo "❌ Error: R2_SECRET_ACCESS_KEY environment variable is required"
  exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
  echo "❌ Error: AWS CLI is not installed"
  exit 1
fi

# Determine if dry-run
DRY_RUN=""
if [ "$2" == "--dry-run" ]; then
  DRY_RUN="--dryrun"
  echo "🔍 DRY RUN MODE - No files will be modified or uploaded"
else
  echo "⏪ Rolling back to git SHA: $GIT_SHA"
fi

ARCHIVE_PATH="meta/manifests/${GIT_SHA}.json"
ARCHIVE_URL="s3://$BUCKET/$ARCHIVE_PATH"
LOCAL_ARCHIVE="$META_DIR/manifests/${GIT_SHA}.json"
PROD_MANIFEST="$META_DIR/manifest.json"

# Create manifests directory if it doesn't exist
mkdir -p "$META_DIR/manifests"

# Export AWS credentials
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

# Try to download archived manifest from R2
echo "📥 Fetching archived manifest from R2..."
if [ "$DRY_RUN" == "--dryrun" ]; then
  echo "   (dryrun) Would download: $ARCHIVE_URL"
  # In dry-run, check if it exists
  if aws s3 ls "$ARCHIVE_URL" --endpoint-url "$R2_ENDPOINT" &>/dev/null; then
    echo "   ✅ Archive exists in R2"
  else
    echo "   ❌ Archive not found in R2: $ARCHIVE_PATH"
    echo "   Available manifests:"
    aws s3 ls "s3://$BUCKET/meta/manifests/" --endpoint-url "$R2_ENDPOINT" 2>/dev/null | head -10 || echo "   (none found)"
    exit 1
  fi
else
  # Download from R2
  if aws s3 cp "$ARCHIVE_URL" "$LOCAL_ARCHIVE" --endpoint-url "$R2_ENDPOINT" 2>/dev/null; then
    echo "   ✅ Downloaded archived manifest"
  else
    echo "   ❌ Error: Could not download archived manifest from R2"
    echo "   Path: $ARCHIVE_PATH"
    echo ""
    echo "   Available manifests:"
    aws s3 ls "s3://$BUCKET/meta/manifests/" --endpoint-url "$R2_ENDPOINT" 2>/dev/null | head -10 || echo "   (none found)"
    exit 1
  fi
fi

# Validate archived manifest
if [ "$DRY_RUN" != "--dryrun" ]; then
  if [ ! -f "$LOCAL_ARCHIVE" ]; then
    echo "❌ Error: Archived manifest file not found locally: $LOCAL_ARCHIVE"
    exit 1
  fi
  
  # Validate JSON
  if ! jq empty "$LOCAL_ARCHIVE" 2>/dev/null; then
    echo "❌ Error: Archived manifest is not valid JSON"
    exit 1
  fi
  
  # Validate required fields
  if ! jq -e '.activeVersion and .workspaces' "$LOCAL_ARCHIVE" >/dev/null 2>&1; then
    echo "❌ Error: Archived manifest missing required fields"
    exit 1
  fi
  
  echo "   ✅ Archived manifest is valid"
fi

if [ "$DRY_RUN" != "--dryrun" ]; then
  # Step 1: Copy archived manifest to production (local file)
  echo "📋 Restoring archived manifest to production..."
  cp "$LOCAL_ARCHIVE" "$PROD_MANIFEST"
  echo "   ✅ Copied archived manifest → manifest.json"
  
  # Step 2: Regenerate release.json
  echo "📝 Regenerating release metadata..."
  "$SCRIPT_DIR/generate-release.sh"
  echo "   ✅ Generated release.json"
  echo ""
fi

# Step 3: Upload only meta/manifest.json and meta/release.json to R2
echo "📤 Uploading rolled-back manifest and release to R2..."

if [ "$DRY_RUN" == "--dryrun" ]; then
  echo "   (dryrun) Would upload: meta/manifest.json"
  echo "   (dryrun) Would upload: meta/release.json"
else
  # Upload manifest.json
  echo "   Uploading meta/manifest.json..."
  aws s3 cp "$PROD_MANIFEST" "s3://$BUCKET/meta/manifest.json" \
    --endpoint-url "$R2_ENDPOINT" \
    --content-type "application/json" \
    --cache-control "public, max-age=30, stale-while-revalidate=300" \
    --metadata-directive REPLACE
  
  # Upload release.json
  RELEASE_FILE="$META_DIR/release.json"
  if [ -f "$RELEASE_FILE" ]; then
    echo "   Uploading meta/release.json..."
    aws s3 cp "$RELEASE_FILE" "s3://$BUCKET/meta/release.json" \
      --endpoint-url "$R2_ENDPOINT" \
      --content-type "application/json" \
      --cache-control "public, max-age=30, stale-while-revalidate=300" \
      --metadata-directive REPLACE
  else
    echo "   ⚠️  Warning: release.json not found, skipping upload"
  fi
fi

echo ""
if [ "$DRY_RUN" == "--dryrun" ]; then
  echo "✅ Dry run completed. No files were modified or uploaded."
  echo ""
  echo "To rollback for real, run: ./scripts/rollback.sh $GIT_SHA"
else
  echo "✅ Rollback complete! Production restored to git SHA: $GIT_SHA"
  echo "   Production manifest: https://getverba-content-api.simpumind-apps.workers.dev/manifest"
  echo "   Release info: https://getverba-content-api.simpumind-apps.workers.dev/release"
fi

