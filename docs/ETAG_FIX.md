# Worker ETag Normalization Fix

## Problem

The Cloudflare Worker was not returning `304 Not Modified` responses when the client sent `If-None-Match` headers, even when the ETags matched. This caused unnecessary network traffic and prevented proper caching.

## Root Cause

ETags can come in different formats:
- Strong ETag: `"abc123"`
- Weak ETag: `W/"abc123"`
- With or without quotes

The previous implementation only stripped quotes, but didn't handle the `W/` prefix for weak ETags.

## Solution

Added `normalizeEtag()` function that:
1. Removes `W/` prefix (weak ETag format)
2. Removes surrounding quotes
3. Trims whitespace

Both client and server ETags are normalized before comparison.

## Implementation

### Updated Code

```javascript
/**
 * Normalize ETag for comparison
 * Strips W/ prefix (weak ETag) and surrounding quotes
 */
function normalizeEtag(etag) {
  if (!etag) return null;
  // Remove W/ prefix if present (weak ETag format)
  let normalized = etag.replace(/^W\//i, "");
  // Remove surrounding quotes
  normalized = normalized.replace(/^"|"$/g, "");
  return normalized.trim() || null;
}
```

### Updated serveKey Function

```javascript
// Get server ETag (try both etag and httpEtag properties)
const serverEtag = object.etag || object.httpEtag;

if (clientETag && serverEtag) {
  // Normalize both for comparison
  const normalizedClient = normalizeEtag(clientETag);
  const normalizedServer = normalizeEtag(serverEtag);
  
  // If they match, return 304
  if (normalizedClient && normalizedServer && normalizedClient === normalizedServer) {
    // Return 304 with proper headers
  }
}
```

## Testing

Use the provided test script:

```bash
./docs/worker-etag-test.sh
```

Or test manually:

```bash
# First request (should return 200)
curl -i https://getverba-content-api.simpumind-apps.workers.dev/manifest

# Second request with If-None-Match (should return 304)
curl -i -H 'If-None-Match: "etag-from-first-request"' \
  https://getverba-content-api.simpumind-apps.workers.dev/manifest
```

## Expected Behavior

- **First app launch:** `200 OK` responses, ETags cached
- **Subsequent launches (unchanged content):** `304 Not Modified` responses
- **After content update:** `200 OK` with new ETag, cache updated

## ETag Format

The Worker now uses **strong ETags** with quotes: `"abc123"`

This is consistent and works with all HTTP clients. Weak ETags (`W/"abc123"`) are normalized during comparison but responses always use strong ETags.

## Cache Headers

- **Meta files (manifest/release):** `max-age=300` (5 minutes) - changes more frequently
- **v1 content:** `max-age=300, stale-while-revalidate=86400` (5 min fresh, 24h stale)
- **Other files:** `max-age=60` (1 minute)

