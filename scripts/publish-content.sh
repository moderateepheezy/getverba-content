#!/bin/bash

# Publish content to Cloudflare R2
# Usage: ./scripts/publish-content.sh [--dry-run|--sanity-check]

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
if [ "$1" == "--dry-run" ]; then
  DRY_RUN="--dryrun"
  echo "🔍 DRY RUN MODE - No files will be uploaded"
elif [ "$1" == "--sanity-check" ]; then
  echo "🔍 SANITY CHECK - Testing bucket access..."
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 ls "s3://$BUCKET" --endpoint-url "$R2_ENDPOINT"
  echo ""
  echo "✅ Bucket access successful!"
  exit 0
fi

echo "📦 Publishing content to R2..."
echo "   Bucket: $BUCKET"
echo "   Endpoint: $R2_ENDPOINT"
echo "   Content source: $CONTENT_DIR"
echo "   Meta source: $META_DIR"
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
aws s3 sync "$META_DIR" "s3://$BUCKET/meta/" \
  --endpoint-url "$R2_ENDPOINT" \
  --exclude ".*" \
  $DRY_RUN

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
  find "$META_DIR" -type f -name "*.json" -print0 | while IFS= read -r -d '' file; do
    # Get relative path from content/meta
    rel_path="${file#$META_DIR/}"
    s3_path="s3://$BUCKET/meta/$rel_path"
    
    echo "   Setting content-type and cache-control for: meta/$rel_path"
    aws s3 cp "$file" "$s3_path" \
      --endpoint-url "$R2_ENDPOINT" \
      --content-type "application/json" \
      --cache-control "public, max-age=300, stale-while-revalidate=86400" \
      --metadata-directive REPLACE
  done
fi

echo ""
if [ "$1" == "--dry-run" ]; then
  echo "✅ Dry run completed. No files were uploaded."
else
  echo "✅ Content published successfully!"
  echo "   Verify at: https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/catalog.json"
fi

