#!/bin/bash

# Load environment variables from .env.local if it exists
# Usage: source scripts/load-env.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [ -f "$ENV_FILE" ]; then
  echo "📝 Loading environment variables from .env.local..."
  # Export variables from .env.local, ignoring comments and empty lines
  export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)
  echo "✅ Environment variables loaded"
else
  echo "⚠️  .env.local not found. Using environment variables from shell."
fi

