#!/bin/bash

# Publish content to Cloudflare R2
# Usage: ./scripts/publish-content.sh [--dry-run|--sanity-check|--publish-prod-manifest|--include-sprint-artifacts]
# 
# By default, publishes staging manifest (manifest.staging.json).
# Use --publish-prod-manifest to also publish production manifest (manifest.json).
# Use --include-sprint-artifacts to publish sprint reports and coherence artifacts (staging only).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"
META_DIR="$SCRIPT_DIR/../content/meta"
BUCKET="${R2_BUCKET:-getverba-content-prod}"

# Load environment variables from .env.local if it exists
ENV_FILE="$SCRIPT_DIR/../.env.local"
if [ -f "$ENV_FILE" ]; then
  # Source the env file (export variables)
  set -a
  source "$ENV_FILE"
  set +a
fi

# Check required environment variables
if [ -z "$R2_ENDPOINT" ]; then
  echo "❌ Error: R2_ENDPOINT environment variable is required"
  echo "   Example: R2_ENDPOINT=https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"
  echo "   Note: This is the host-only endpoint URL, not the bucket URL"
  exit 1
fi

# Detect if R2_ENDPOINT looks like a bucket path URL (ends with /bucket-name)
# Check if it ends with /getverba-content-prod or /$BUCKET or has a path after .r2.cloudflarestorage.com
if [[ "$R2_ENDPOINT" == *"/$BUCKET" ]] || \
   [[ "$R2_ENDPOINT" == *"/getverba-content-prod" ]] || \
   [[ "$R2_ENDPOINT" =~ \.r2\.cloudflarestorage\.com/[^/]+ ]]; then
  echo "❌ Error: R2_ENDPOINT appears to be a bucket path URL, not the account endpoint"
  echo "   Current value: $R2_ENDPOINT"
  echo "   Expected format: https://<account-id>.r2.cloudflarestorage.com"
  echo "   Example: https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"
  echo "   Note: Do not include the bucket name in the endpoint URL"
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
  echo "   Install with: brew install awscli"
  exit 1
fi

# Check if content directory exists
if [ ! -d "$CONTENT_DIR" ]; then
  echo "❌ Error: Content directory not found: $CONTENT_DIR"
  exit 1
fi

# Check if meta directory exists
if [ ! -d "$META_DIR" ]; then
  echo "❌ Error: Meta directory not found: $META_DIR"
  exit 1
fi

# Generate release.json before publishing
if [ "$1" != "--dry-run" ] && [ "$1" != "--sanity-check" ]; then
  echo "📝 Generating release metadata..."
  "$SCRIPT_DIR/generate-release.sh"
  echo ""
fi

# Determine if dry-run or sanity-check
DRY_RUN=""
PUBLISH_PROD_MANIFEST=false
INCLUDE_SPRINT_ARTIFACTS=false
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN="--dryrun"
      echo "🔍 DRY RUN MODE - No files will be uploaded"
      ;;
    --sanity-check)
      echo "🔍 SANITY CHECK - Testing bucket access..."
      AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
      AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      aws s3 ls "s3://$BUCKET" --endpoint-url "$R2_ENDPOINT"
      echo ""
      echo "✅ Bucket access successful!"
      exit 0
      ;;
    --publish-prod-manifest)
      PUBLISH_PROD_MANIFEST=true
      ;;
    --include-sprint-artifacts)
      INCLUDE_SPRINT_ARTIFACTS=true
      ;;
  esac
done

echo "📦 Publishing content to R2..."
echo "   Bucket: $BUCKET"
echo "   Endpoint: $R2_ENDPOINT"
echo "   Content source: $CONTENT_DIR"
echo "   Meta source: $META_DIR"
if [ "$INCLUDE_SPRINT_ARTIFACTS" = true ]; then
  echo "   Including sprint artifacts: Yes"
fi
echo ""

# Export AWS credentials for this session
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

# Sync files to R2
# Note: aws s3 sync doesn't support setting content-type per file type easily
# We'll sync first, then update content-type for JSON files
echo "📤 Syncing content files to R2..."
aws s3 sync "$CONTENT_DIR" "s3://$BUCKET/v1/" \
  --endpoint-url "$R2_ENDPOINT" \
  --exclude ".*" \
  $DRY_RUN

echo "📤 Syncing meta files to R2..."
# By default, exclude production manifest (only publish staging)
# Use --publish-prod-manifest to include production manifest
if [ "$PUBLISH_PROD_MANIFEST" = false ]; then
  echo "   (Excluding manifest.json - use --publish-prod-manifest to include)"
  aws s3 sync "$META_DIR" "s3://$BUCKET/meta/" \
    --endpoint-url "$R2_ENDPOINT" \
    --exclude ".*" \
    --exclude "manifest.json" \
    $DRY_RUN
else
  echo "   (Including production manifest.json)"
  aws s3 sync "$META_DIR" "s3://$BUCKET/meta/" \
    --endpoint-url "$R2_ENDPOINT" \
    --exclude ".*" \
    $DRY_RUN
fi

if [ "$1" != "--dry-run" ]; then
  echo ""
  echo "📝 Setting content-type and cache-control for JSON files..."
  
  # Find all JSON files in content/v1 and set content-type and cache-control
  # Use -print0 and read -d '' to safely handle filenames with spaces/newlines
  find "$CONTENT_DIR" -type f -name "*.json" -print0 | while IFS= read -r -d '' file; do
    # Get relative path from content/v1
    rel_path="${file#$CONTENT_DIR/}"
    s3_path="s3://$BUCKET/v1/$rel_path"
    
    echo "   Setting content-type and cache-control for: v1/$rel_path"
    aws s3 cp "$file" "$s3_path" \
      --endpoint-url "$R2_ENDPOINT" \
      --content-type "application/json" \
      --cache-control "public, max-age=300, stale-while-revalidate=86400" \
      --metadata-directive REPLACE
  done

  # Find all JSON files in content/meta and set content-type and cache-control
  # Skip manifest.json unless --publish-prod-manifes is set
  find "$META_DIR" -type f -name "*.json" -print0 | while IFS= read -r -d '' file; do
    # Get relative path from content/meta
    rel_path="${file#$META_DIR/}"
    
    # Skip production manifest unless explicitly requested
    if [ "$rel_path" = "manifest.json" ] && [ "$PUBLISH_PROD_MANIFEST" = false ]; then
      continue
    fi
    
    s3_path="s3://$BUCKET/meta/$rel_path"
    
    echo "   Setting content-type and cache-control for: meta/$rel_path"
    aws s3 cp "$file" "$s3_path" \
      --endpoint-url "$R2_ENDPOINT" \
      --content-type "application/json" \
      --cache-control "public, max-age=300, stale-while-revalidate=86400" \
      --metadata-directive REPLACE
  done
  
  # Publish sprint artifacts if requested (staging manifest only)
  if [ "$INCLUDE_SPRINT_ARTIFACTS" = true ] && [ "$PUBLISH_PROD_MANIFEST" = false ]; then
    SPRINTS_DIR="$META_DIR/sprints"
    if [ -d "$SPRINTS_DIR" ]; then
      echo ""
      echo "📤 Publishing sprint artifacts..."
      
      # Sync all sprint directories
      find "$SPRINTS_DIR" -type f \( -name "*.json" -o -name "*.md" \) -print0 | while IFS= read -r -d '' file; do
        # Get relative path from content/meta
        rel_path="${file#$META_DIR/}"
        s3_path="s3://$BUCKET/meta/$rel_path"
        
        # Determine content type
        if [[ "$file" == *.json ]]; then
          content_type="application/json"
        else
          content_type="text/markdown"
        fi
        
        echo "   Uploading: meta/$rel_path"
        aws s3 cp "$file" "$s3_path" \
          --endpoint-url "$R2_ENDPOINT" \
          --content-type "$content_type" \
          --cache-control "public, max-age=31536000, immutable" \
          --metadata-directive REPLACE
      done
      
      echo "   ✅ Sprint artifacts published"
    else
      echo ""
      echo "⚠️  Sprint artifacts directory not found: $SPRINTS_DIR"
    fi
  fi
fi

echo ""
if [ "$1" == "--dry-run" ]; then
  echo "✅ Dry run completed. No files were uploaded."
else
  echo "✅ Content published successfully!"
  echo "   Verify at: https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/catalog.json"
fi

