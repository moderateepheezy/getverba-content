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

## Item Routing

The `kind` field at the top level of the index determines the navigation target:

- **`"context"`** → Navigate to Pack Detail screen
- **`"exams"`** → Navigate to Exam Detail screen
- **`"drill"`** → Navigate to Drill Detail screen (future)
- **`"mechanics"`** → Navigate to Mechanics Detail screen (future)

The frontend should use `item.id` and `item.entryUrl` for route parameters and content fetching.

## Foundation Focus (A1-Only Filtering)

The `level` field in each item enables client-side A1 filtering:

- Every item has a `level` field (required, non-empty string)
- Common values: `"A1"`, `"A2"`, `"B1"`, `"B2"`, `"C1"`, `"C2"`
- Backend does **not** filter by level (all items returned)
- Frontend filters client-side: `items.filter(item => item.level === "A1")`

## Usage in Frontend

The frontend should:

1. Load index from `itemsUrl` in catalog section
2. Use `kind` field to determine navigation target
3. Check `nextPage` for pagination
4. Filter items by `level` for A1-only mode (Foundation Focus)
5. Use `entryUrl` to load individual packs

Example:
```typescript
const index = await contentClient.fetchIndex(section.itemsUrl);

// Routing: use index.kind to determine target screen
const targetScreen = index.kind === "context" ? "PackDetail" : "ExamDetail";

// Filtering: apply Foundation Focus if enabled
const visibleItems = foundationFocusEnabled
  ? index.items.filter(item => item.level === "A1")
  : index.items;

// Pagination: load additional pages
if (index.nextPage) {
  const nextIndex = await contentClient.fetchIndex(index.nextPage);
  visibleItems.push(...nextIndex.items);
}
```

## Backend Documentation

For complete backend API contract and acceptance criteria, see:
- [`BACKEND_ITEM_ROUTING.md`](./BACKEND_ITEM_ROUTING.md) - Backend API contract for routing and filtering
- [`BACKEND_ACCEPTANCE.md`](./BACKEND_ACCEPTANCE.md) - Backend acceptance criteria and test scenarios

