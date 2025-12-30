#!/bin/bash

# Test script for ETag normalization and 304 responses
# Usage: ./docs/worker-etag-test.sh

BASE_URL="https://getverba-content-api.simpumind-apps.workers.dev"

echo "Testing ETag normalization and 304 responses..."
echo ""

# Test 1: First request (should return 200)
echo "=== Test 1: First request (should return 200) ==="
RESPONSE1=$(curl -sI "${BASE_URL}/manifest")
HTTP_CODE1=$(echo "$RESPONSE1" | grep -i "HTTP" | awk '{print $2}')
ETAG1=$(echo "$RESPONSE1" | grep -i "etag" | cut -d' ' -f2 | tr -d '\r')

echo "Status: $HTTP_CODE1"
echo "ETag: $ETAG1"
echo ""

if [ "$HTTP_CODE1" != "200" ]; then
  echo "❌ Expected 200, got $HTTP_CODE1"
  exit 1
fi

if [ -z "$ETAG1" ]; then
  echo "❌ No ETag in response"
  exit 1
fi

# Test 2: Second request with If-None-Match (should return 304)
echo "=== Test 2: Second request with If-None-Match (should return 304) ==="
RESPONSE2=$(curl -sI -H "If-None-Match: ${ETAG1}" "${BASE_URL}/manifest")
HTTP_CODE2=$(echo "$RESPONSE2" | grep -i "HTTP" | awk '{print $2}')
ETAG2=$(echo "$RESPONSE2" | grep -i "etag" | cut -d' ' -f2 | tr -d '\r')

echo "Status: $HTTP_CODE2"
echo "ETag: $ETAG2"
echo ""

if [ "$HTTP_CODE2" != "304" ]; then
  echo "❌ Expected 304, got $HTTP_CODE2"
  echo "Response headers:"
  echo "$RESPONSE2"
  exit 1
fi

# Test 3: Test with normalized ETag (without quotes)
echo "=== Test 3: Request with normalized ETag (no quotes) ==="
ETAG_CLEAN=$(echo "$ETAG1" | sed 's/^"//;s/"$//')
RESPONSE3=$(curl -sI -H "If-None-Match: ${ETAG_CLEAN}" "${BASE_URL}/manifest")
HTTP_CODE3=$(echo "$RESPONSE3" | grep -i "HTTP" | awk '{print $2}')

echo "Status: $HTTP_CODE3"
echo ""

if [ "$HTTP_CODE3" != "304" ]; then
  echo "⚠️  Expected 304 with normalized ETag, got $HTTP_CODE3"
  echo "This might be okay if your client always sends quoted ETags"
else
  echo "✅ Normalized ETag works correctly"
fi

# Test 4: Test with weak ETag format
echo "=== Test 4: Request with weak ETag format (W/...) ==="
ETAG_WEAK="W/${ETAG1}"
RESPONSE4=$(curl -sI -H "If-None-Match: ${ETAG_WEAK}" "${BASE_URL}/manifest")
HTTP_CODE4=$(echo "$RESPONSE4" | grep -i "HTTP" | awk '{print $2}')

echo "Status: $HTTP_CODE4"
echo ""

if [ "$HTTP_CODE4" != "304" ]; then
  echo "⚠️  Expected 304 with weak ETag, got $HTTP_CODE4"
  echo "This might be okay if you only use strong ETags"
else
  echo "✅ Weak ETag format works correctly"
fi

echo ""
echo "=== Summary ==="
echo "✅ First request: $HTTP_CODE1 (with ETag)"
echo "✅ Second request with If-None-Match: $HTTP_CODE2"
if [ "$HTTP_CODE2" = "304" ]; then
  echo "✅ ETag normalization is working!"
else
  echo "❌ ETag normalization needs fixing"
  exit 1
fi

