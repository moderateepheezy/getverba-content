#!/bin/bash

# Promote staging manifest to production
# Usage: ./scripts/promote-staging.sh [--dry-run] [--skip-smoke-test]
#
# This script:
# 1. Copies manifest.staging.json to manifest.json (local)
# 2. Regenerates release.json
# 3. Uploads only meta/manifest.json and meta/release.json to R2

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

# Check if staging manifest exists
STAGING_MANIFEST="$META_DIR/manifest.staging.json"
PROD_MANIFEST="$META_DIR/manifest.json"

if [ ! -f "$STAGING_MANIFEST" ]; then
  echo "❌ Error: Staging manifest not found: $STAGING_MANIFEST"
  exit 1
fi

# Determine if dry-run and skip-smoke-test
DRY_RUN=""
SKIP_SMOKE_TEST=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN="--dryrun"
      echo "🔍 DRY RUN MODE - No files will be modified or uploaded"
      ;;
    --skip-smoke-test)
      SKIP_SMOKE_TEST=true
      ;;
  esac
done

if [ "$DRY_RUN" != "--dryrun" ]; then
  echo "🚀 Promoting staging to production..."
fi

echo "   Staging manifest: $STAGING_MANIFEST"
echo "   Production manifest: $PROD_MANIFEST"

# Get git SHA for archiving (even in dry-run)
GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
if [ "$GIT_SHA" != "unknown" ]; then
  echo "   Git SHA: $GIT_SHA"
fi
echo ""

# Run smoke test before promoting (unless skipped)
if [ "$SKIP_SMOKE_TEST" = false ]; then
  if [ "$DRY_RUN" != "--dryrun" ]; then
    echo "🔍 Running smoke test before promotion..."
    if ! "$SCRIPT_DIR/smoke-test-content.sh"; then
      echo ""
      echo "❌ Smoke test failed. Promotion aborted."
      echo "   Fix the issues above, or use --skip-smoke-test to bypass (not recommended)."
      exit 1
    fi
    echo ""
  else
    echo "🔍 Smoke test will run before promotion (dry-run mode)"
    echo "   (Skipping actual smoke test in dry-run mode)"
    echo ""
  fi
else
  echo "⚠️  Skipping smoke test (--skip-smoke-test flag used)"
  echo ""
fi

# Export AWS credentials
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

if [ "$DRY_RUN" != "--dryrun" ]; then
  # Step 1: Copy staging manifest to production (local file)
  echo "📋 Copying staging manifest to production..."
  cp "$STAGING_MANIFEST" "$PROD_MANIFEST"
  echo "   ✅ Copied manifest.staging.json → manifest.json"
  
  # Step 2: Regenerate release.json
  echo "📝 Regenerating release metadata..."
  "$SCRIPT_DIR/generate-release.sh"
  echo "   ✅ Generated release.json"
  echo ""
fi

# Step 3: Upload only meta/manifest.json and meta/release.json to R2
echo "📤 Uploading production manifest and release to R2..."

if [ "$DRY_RUN" == "--dryrun" ]; then
  echo "   (dryrun) Would upload: meta/manifest.json"
  echo "   (dryrun) Would upload: meta/release.json"
  if [ "$GIT_SHA" != "unknown" ]; then
    echo "   (dryrun) Would archive: meta/manifests/${GIT_SHA}.json"
  fi
else
  # Upload manifest.json
  echo "   Uploading meta/manifest.json..."
  aws s3 cp "$PROD_MANIFEST" "s3://$BUCKET/meta/manifest.json" \
    --endpoint-url "$R2_ENDPOINT" \
    --content-type "application/json" \
    --cache-control "public, max-age=30, stale-while-revalidate=300" \
    --metadata-directive REPLACE
  
  # Archive manifest to manifests/<gitSha>.json (immutable)
  if [ "$GIT_SHA" != "unknown" ]; then
    echo "   Archiving manifest to meta/manifests/${GIT_SHA}.json..."
    aws s3 cp "$PROD_MANIFEST" "s3://$BUCKET/meta/manifests/${GIT_SHA}.json" \
      --endpoint-url "$R2_ENDPOINT" \
      --content-type "application/json" \
      --cache-control "public, max-age=31536000, immutable" \
      --metadata-directive REPLACE
    echo "   ✅ Manifest archived for rollback"
  else
    echo "   ⚠️  Warning: Could not determine git SHA, skipping archive"
  fi
  
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
  echo "To promote for real, run: ./scripts/promote-staging.sh"
else
  echo "✅ Staging promoted to production!"
  echo "   Production manifest: https://getverba-content-api.simpumind-apps.workers.dev/manifest"
  echo "   Release info: https://getverba-content-api.simpumind-apps.workers.dev/release"
fi

