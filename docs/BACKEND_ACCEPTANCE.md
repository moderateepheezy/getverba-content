# Backend Acceptance Criteria

This document defines the backend acceptance criteria for item routing and Foundation Focus filtering. These criteria verify that the backend provides all necessary data and APIs for frontend implementation.

## ✅ Backend Requirements Checklist

### 1. Section Index Schema

- [x] Section index files include `kind` field at top level
- [x] Section index `kind` matches catalog section `kind`
- [x] All items include `id`, `title`, `level`, `entryUrl` fields
- [x] `level` field is always present and non-empty
- [x] `entryUrl` follows format `/v1/**/*.json`
- [x] `nextPage` is either `null` or a valid URL string
- [x] Validator enforces all schema requirements

**Verification**:
```bash
npm run content:validate
# Should pass with: "Validated X index file(s) with pagination schema"
```

### 2. Item Routing Data

- [x] Section index provides `kind` field for routing decisions
- [x] Items include `id` for route parameters
- [x] Items include `entryUrl` for fetching pack content
- [x] Catalog provides `workspace` and `languageCode` for context
- [x] All referenced `entryUrl` files exist and are accessible

**Verification**:
```bash
# Check index file structure
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json | jq '.kind, .items[0].id, .items[0].entryUrl'

# Verify entryUrl is accessible
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/packs/pack-001.json | jq '.id'
```

### 3. Foundation Focus Filtering

- [x] Every item has a `level` field
- [x] `level` values are consistent (A1, A2, B1, B2, C1, C2)
- [x] Backend does not filter by level (all items returned)
- [x] Client-side filtering is possible based on `level` field

**Verification**:
```bash
# Check all items have level field
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json | jq '.items[] | .level'

# Verify A1 items exist
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json | jq '.items[] | select(.level == "A1")'
```

### 4. Pagination Support

- [x] Section indexes include `nextPage` field
- [x] `nextPage` URLs are valid and accessible
- [x] `total` field reflects count across all pages
- [x] All pages have consistent schema structure

**Verification**:
```bash
# Check pagination fields
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json | jq '.total, .pageSize, .nextPage'

# If nextPage exists, verify it's accessible
# (Currently nextPage is null, so this is for future multi-page indexes)
```

### 5. Worker API Endpoints

- [x] `GET /manifest` returns manifest.json
- [x] `GET /release` returns release.json
- [x] `GET /active` redirects to active catalog
- [x] `GET /v1/**` serves content files
- [x] All endpoints support ETag caching (`If-None-Match`)

**Verification**:
```bash
# Test manifest endpoint
curl -I https://getverba-content-api.simpumind-apps.workers.dev/manifest

# Test ETag caching
curl -I https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json
# Get ETag from response, then:
curl -H "If-None-Match: \"<etag>\"" -I https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json
# Should return 304 Not Modified
```

### 6. Content Validation

- [x] Validator checks section index schema
- [x] Validator verifies `entryUrl` files exist
- [x] Validator verifies `nextPage` files exist (if not null)
- [x] Validator enforces required fields
- [x] CI runs validation on PRs and pushes

**Verification**:
```bash
npm run content:validate
# Should pass without errors
```

### 7. Content Publishing

- [x] Publish script uploads all content to R2
- [x] JSON files get correct `Content-Type: application/json`
- [x] JSON files get cache headers (`Cache-Control`)
- [x] Release metadata is generated and published

**Verification**:
```bash
./scripts/publish-content.sh --dry-run
# Should show all files to be uploaded

./scripts/publish-content.sh
# Should upload successfully
```

## Backend Test Scenarios

### Scenario 1: Single-Page Index with A1 Items

**Setup**: Index with 2 items (1 A1, 1 A2)

**Expected Backend Response**:
```json
{
  "version": "v1",
  "kind": "context",
  "total": 2,
  "pageSize": 20,
  "items": [
    { "id": "pack-001", "level": "A1", ... },
    { "id": "pack-002", "level": "A2", ... }
  ],
  "nextPage": null
}
```

**Verification**:
- ✅ Both items returned (no filtering)
- ✅ `level` field present on both items
- ✅ `nextPage` is `null`

### Scenario 2: Multi-Page Index

**Setup**: Index with 45 items across 3 pages

**Expected Backend Response** (Page 1):
```json
{
  "version": "v1",
  "kind": "context",
  "total": 45,
  "pageSize": 20,
  "items": [...20 items...],
  "nextPage": "/v1/workspaces/de/context/index.page2.json"
}
```

**Verification**:
- ✅ `total` reflects all pages (45)
- ✅ `nextPage` points to valid URL
- ✅ Page 2 accessible and has same schema

### Scenario 3: Item Navigation

**Setup**: User taps item with `kind: "context"`, `id: "pack-001"`

**Expected Backend Support**:
- ✅ `item.entryUrl` is accessible: `/v1/packs/pack-001.json`
- ✅ Pack file contains matching `id` and `type`
- ✅ Pack file is valid JSON

**Verification**:
```bash
# Get item entryUrl
ITEM_URL=$(curl -s https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json | jq -r '.items[0].entryUrl')

# Fetch pack file
curl "https://getverba-content-api.simpumind-apps.workers.dev$ITEM_URL" | jq '.id, .type'
```

### Scenario 4: Foundation Focus Toggle

**Setup**: User enables Foundation Focus (A1-only)

**Expected Backend Behavior**:
- ✅ Backend returns all items (no filtering)
- ✅ All items have `level` field
- ✅ Frontend filters client-side: `items.filter(i => i.level === "A1")`

**Verification**:
```bash
# Backend returns all items
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json | jq '.items | length'

# Verify A1 items exist
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/context/index.json | jq '[.items[] | select(.level == "A1")] | length'
```

## Backend Limitations

The backend **does not** provide:

1. ❌ Server-side level filtering (client-side only)
2. ❌ Navigation route definitions (frontend responsibility)
3. ❌ UI/UX error states (frontend responsibility)
4. ❌ Loading states (frontend responsibility)
5. ❌ Item deduplication enforcement (frontend should handle)

## Backend Guarantees

The backend **guarantees**:

1. ✅ All section indexes follow the canonical schema
2. ✅ All `entryUrl` files exist and are accessible
3. ✅ All `nextPage` files exist (if not null)
4. ✅ All items have required fields for routing and filtering
5. ✅ ETag caching works correctly
6. ✅ Content is validated before publishing

## Next Steps

Once backend acceptance is confirmed:

1. ✅ Frontend can implement item routing using `kind` field
2. ✅ Frontend can implement Foundation Focus using `level` field
3. ✅ Frontend can implement pagination using `nextPage` field
4. ✅ Frontend can implement error handling and retry logic

**Backend work is complete.** All necessary data and APIs are available for frontend implementation.

