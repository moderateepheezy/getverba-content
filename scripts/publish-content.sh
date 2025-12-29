#!/bin/bash

# Publish content to Cloudflare R2
# Usage: ./scripts/publish-content.sh [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTENT_DIR="$SCRIPT_DIR/../content/v1"
BUCKET="${R2_BUCKET:-getverba-content-prod}"

# Check required environment variables
if [ -z "$R2_ENDPOINT" ]; then
  echo "❌ Error: R2_ENDPOINT environment variable is required"
  echo "   Example: R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com"
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

# Determine if dry-run
DRY_RUN=""
if [ "$1" == "--dry-run" ]; then
  DRY_RUN="--dryrun"
  echo "🔍 DRY RUN MODE - No files will be uploaded"
fi

echo "📦 Publishing content to R2..."
echo "   Bucket: $BUCKET"
echo "   Endpoint: $R2_ENDPOINT"
echo "   Source: $CONTENT_DIR"
echo ""

# Export AWS credentials for this session
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

# Sync files to R2
# Note: aws s3 sync doesn't support setting content-type per file type easily
# We'll sync first, then update content-type for JSON files
echo "📤 Syncing files to R2..."
aws s3 sync "$CONTENT_DIR" "s3://$BUCKET/v1/" \
  --endpoint-url "$R2_ENDPOINT" \
  --exclude ".*" \
  $DRY_RUN

if [ "$1" != "--dry-run" ]; then
  echo ""
  echo "📝 Setting content-type for JSON files..."
  
  # Find all JSON files and set content-type
  find "$CONTENT_DIR" -type f -name "*.json" | while read -r file; do
    # Get relative path from content/v1
    rel_path="${file#$CONTENT_DIR/}"
    s3_path="s3://$BUCKET/v1/$rel_path"
    
    echo "   Setting content-type for: $rel_path"
    aws s3 cp "$file" "$s3_path" \
      --endpoint-url "$R2_ENDPOINT" \
      --content-type "application/json" \
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

