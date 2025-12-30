# Backend Item Routing Contract

This document defines the backend API contract for section index item navigation and Foundation Focus filtering. This is a **backend-only** specification; frontend implementation is handled separately.

## Overview

The backend provides all necessary data for:
1. **Item routing**: Determining which screen to navigate to based on item `kind`
2. **Foundation Focus filtering**: Client-side A1-only filtering based on `level` field
3. **Pagination**: Loading additional pages via `nextPage` URLs

## Backend Endpoints

All endpoints are served via the Cloudflare Worker at:
- Base URL: `https://getverba-content-api.simpumind-apps.workers.dev`

### Available Endpoints

1. **`GET /manifest`** → Returns `meta/manifest.json`
   - Contains active version and workspace mappings
   - Entry point for content discovery

2. **`GET /release`** → Returns `meta/release.json`
   - Contains release metadata (git SHA, timestamp, content hash)

3. **`GET /active`** → 302 redirect to active catalog
   - Convenience endpoint for current workspace catalog

4. **`GET /v1/**`** → Passthrough to R2 content
   - Serves all content files (catalogs, indexes, packs)
   - Supports ETag caching (`If-None-Match` → `304 Not Modified`)

## Section Index Schema

Section index files (referenced by `itemsUrl` in catalog sections) provide the data needed for item routing and filtering.

### Schema Structure

```json
{
  "version": "v1",
  "kind": "context",
  "total": 2,
  "pageSize": 20,
  "items": [
    {
      "id": "pack-001",
      "title": "Basic German Greetings",
      "level": "A1",
      "durationMinutes": 15,
      "entryUrl": "/v1/packs/pack-001.json"
    }
  ],
  "nextPage": null
}
```

### Key Fields for Routing

#### Top-Level `kind` Field

The `kind` field at the top level of the index determines the section type and is used for routing:

- **`"context"`** → Navigate to Pack Detail screen
- **`"exams"`** → Navigate to Exam Detail screen
- **`"drill"`** → Navigate to Drill Detail screen (future)
- **`"mechanics"`** → Navigate to Mechanics Detail screen (future)

**Important**: The `kind` field in the index **must match** the `kind` field in the catalog section that references it.

#### Item-Level Fields

Each item in the `items` array contains:

- **`id`** (string): Unique identifier for the item
- **`title`** (string): Display title
- **`level`** (string): Language level (`"A1"`, `"A2"`, `"B1"`, `"B2"`, `"C1"`, `"C2"`)
- **`entryUrl`** (string): Path to the pack/entry JSON file (e.g., `/v1/packs/pack-001.json`)
- **`durationMinutes`** (number, optional): Estimated duration

### Routing Contract

The backend provides all data needed for routing via the section index schema:

1. **Section kind** → Determines target screen type
   - Available in: `index.kind` (top-level)
   - Example: `"context"` → Pack Detail screen

2. **Item identifier** → Used as route parameter
   - Available in: `item.id`
   - Example: `"pack-001"` → `{ packId: "pack-001" }`

3. **Entry URL** → Used to fetch pack content
   - Available in: `item.entryUrl`
   - Example: `"/v1/packs/pack-001.json"` → Fetch via `GET /v1/packs/pack-001.json`

4. **Workspace context** → Available from catalog
   - Available in: `catalog.workspace`, `catalog.languageCode`
   - Example: `{ workspaceId: "de", languageCode: "de" }`

### Navigation Mapping

The frontend should map section index `kind` to navigation routes as follows:

| Index `kind` | Target Screen | Route Parameters |
|--------------|---------------|------------------|
| `"context"` | Pack Detail | `{ packId: item.id, entryUrl: item.entryUrl, workspaceId, languageCode }` |
| `"exams"` | Exam Detail | `{ examId: item.id, entryUrl: item.entryUrl, workspaceId, languageCode }` |
| `"drill"` | Drill Detail | `{ drillId: item.id, entryUrl: item.entryUrl, workspaceId, languageCode }` |
| `"mechanics"` | Mechanics Detail | `{ mechanicsId: item.id, entryUrl: item.entryUrl, workspaceId, languageCode }` |

**Unknown `kind`**: If `kind` is not recognized, the backend does not provide routing guidance. Frontend should handle gracefully (no-op or console warning).

## Foundation Focus (A1-Only Filtering)

### Backend Support

The backend provides all necessary data for client-side A1 filtering:

1. **`level` field** in each item
   - Type: `string`
   - Values: `"A1"`, `"A2"`, `"B1"`, `"B2"`, `"C1"`, `"C2"` (or other level strings)
   - Always present (required field)

2. **No server-side filtering**
   - The backend does **not** filter items by level
   - All items are returned in index responses
   - Filtering is performed client-side

### Filtering Logic

The frontend should filter items as follows:

```typescript
// Pseudo-code for client-side filtering
const allItems = index.items;
const filteredItems = foundationFocusEnabled
  ? allItems.filter(item => item.level === "A1")
  : allItems;
```

### Backend Guarantees

1. ✅ Every item has a `level` field (non-empty string)
2. ✅ `level` values are consistent across all indexes
3. ✅ No backend changes needed for Foundation Focus
4. ✅ Filtering works across all sections (context, exams, drills, etc.)

## Pagination

### Backend Support

Pagination is handled via the `nextPage` field in section indexes:

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

### Pagination Contract

1. **First page**: Always available at the `itemsUrl` from catalog
   - Example: `/v1/workspaces/de/context/index.json`

2. **Subsequent pages**: Referenced via `nextPage` field
   - Format: `/v1/workspaces/{workspace}/{section}/index.page{N}.json`
   - Example: `/v1/workspaces/de/context/index.page2.json`

3. **Last page**: `nextPage` is `null`

4. **Total count**: Available in `total` field (across all pages)

### Backend Guarantees

1. ✅ `nextPage` URLs are valid and accessible via Worker
2. ✅ All pages have the same schema structure
3. ✅ `total` is consistent across all pages
4. ✅ `kind` is consistent across all pages
5. ✅ Items are deduplicated by `id` (backend does not enforce, but frontend should handle)

## Pack/Entry File Schema

When an item is tapped, the frontend fetches the pack file via `item.entryUrl`. The backend serves pack files with this structure:

```json
{
  "id": "pack-001",
  "type": "context",
  "title": "Basic German Greetings",
  "language": "de",
  "level": "A1",
  "durationMins": 15,
  "tags": ["greetings", "basics", "conversation"],
  "items": [...]
}
```

**Note**: Pack files use `type` (not `kind`) and `durationMins` (not `durationMinutes`). This is intentional for backward compatibility. The section index uses the newer field names.

## Error Handling

### Backend Error Responses

- **404 Not Found**: Index file or pack file does not exist
- **500 Internal Server Error**: Worker or R2 error
- **304 Not Modified**: Content unchanged (ETag match)

### Client-Side Error Handling

The backend does not provide error recovery guidance. Frontend should:
- Retry on network errors
- Show cached content if available
- Display user-friendly error messages

## Caching

### ETag Support

All content endpoints support ETag-based caching:

- **Request**: Include `If-None-Match: "<etag>"` header
- **Response**: `304 Not Modified` if content unchanged
- **ETag format**: Strong ETags with quotes (e.g., `"abc123"`)

### Cache Headers

Backend sets appropriate `Cache-Control` headers:
- **Meta files** (`/meta/**`): `public, max-age=30, stale-while-revalidate=300`
- **v1 content** (`/v1/**`): `public, max-age=300, stale-while-revalidate=86400`

## Validation

The backend content is validated before publishing:

1. ✅ Section index `kind` matches catalog section `kind`
2. ✅ All `entryUrl` files exist
3. ✅ All `nextPage` files exist (if not null)
4. ✅ All items have required fields (`id`, `title`, `level`, `entryUrl`)
5. ✅ `level` is non-empty string

Run validation locally:
```bash
npm run content:validate
```

## Summary

The backend provides:

1. ✅ **Section index schema** with `kind` field for routing
2. ✅ **Item-level data** (`id`, `entryUrl`, `level`) for navigation and filtering
3. ✅ **Pagination support** via `nextPage` field
4. ✅ **ETag caching** for efficient content delivery
5. ✅ **No server-side filtering** (client-side Foundation Focus filtering)

**Frontend responsibilities**:
- Map `kind` to navigation routes
- Filter items by `level` for Foundation Focus
- Handle pagination via `nextPage`
- Implement error handling and retry logic

