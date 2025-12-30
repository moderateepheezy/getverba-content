# Section Index Schema

This document defines the canonical schema for Section Index JSON files (the files referenced by `itemsUrl` in catalog sections).

## Schema

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

## Required Fields

### Top Level

- `version` (string): Content version, currently `"v1"`
- `kind` (string): Section kind, must match the section's `kind` field (e.g., `"context"`, `"exams"`, `"mechanics"`)
- `total` (number): Total number of items across all pages. For now, can be set to `items.length` if only one page exists
- `pageSize` (number): Number of items per page (typically 20)
- `items` (array): Array of item objects
- `nextPage` (null | string): URL to next page, or `null` if this is the last page. Format: `/v1/workspaces/{workspace}/{section}/index.page{N}.json`

### Item Object

Each item in the `items` array must have:

- `id` (string): Unique identifier for the item
- `title` (string): Display title
- `level` (string): Language level. Common values: `"A1"`, `"A2"`, `"B1"`, `"B2"`, `"C1"`, `"C2"`. Must be non-empty string
- `entryUrl` (string): Path to the pack/entry JSON file. Must start with `/v1/` and end with `.json`
- `durationMinutes` (number, optional): Estimated duration in minutes. Recommended but optional

## Pagination

### Single Page

When all items fit on one page:

```json
{
  "version": "v1",
  "kind": "context",
  "total": 2,
  "pageSize": 20,
  "items": [...],
  "nextPage": null
}
```

### Multiple Pages

When items span multiple pages:

**Page 1** (`index.json`):
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

**Page 2** (`index.page2.json`):
```json
{
  "version": "v1",
  "kind": "context",
  "total": 45,
  "pageSize": 20,
  "items": [...20 items...],
  "nextPage": "/v1/workspaces/de/context/index.page3.json"
}
```

**Page 3** (`index.page3.json`):
```json
{
  "version": "v1",
  "kind": "context",
  "total": 45,
  "pageSize": 20,
  "items": [...5 items...],
  "nextPage": null
}
```

## Validation Rules

The validator enforces:

1. ✅ `version` exists and is a string
2. ✅ `kind` exists and is a string
3. ✅ `total` exists and is a number
4. ✅ `pageSize` exists and is a number
5. ✅ `items` exists and is an array
6. ✅ `nextPage` is either `null` or a string
7. ✅ Each item has required fields: `id`, `title`, `level`, `entryUrl`
8. ✅ `entryUrl` starts with `/v1/` and ends with `.json`
9. ✅ `entryUrl` file exists locally
10. ✅ If `nextPage` is a string, the file exists locally
11. ✅ `level` is a non-empty string
12. ✅ `durationMinutes` is a number if present

## Migration from Old Schema

**Old schema:**
```json
{
  "items": [
    {
      "id": "pack-001",
      "title": "Basic German Greetings",
      "type": "context",
      "level": "A1",
      "durationMins": 15,
      "packUrl": "/v1/packs/pack-001.json"
    }
  ]
}
```

**New schema:**
```json
{
  "version": "v1",
  "kind": "context",
  "total": 1,
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

**Changes:**
- Added `version`, `kind`, `total`, `pageSize`, `nextPage` at top level
- Removed `type` from items (moved to top-level `kind`)
- Renamed `durationMins` → `durationMinutes`
- Renamed `packUrl` → `entryUrl`

## Usage in Frontend

The frontend should:

1. Load index from `itemsUrl` in catalog section
2. Check `nextPage` for pagination
3. Filter items by `level` for A1-only mode
4. Use `entryUrl` to load individual packs

Example:
```typescript
const index = await contentClient.fetchIndex(section.itemsUrl);
const items = index.items;
if (index.nextPage) {
  // Load next page
  const nextIndex = await contentClient.fetchIndex(index.nextPage);
  items.push(...nextIndex.items);
}
```

