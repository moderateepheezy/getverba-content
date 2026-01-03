# Pagination Contract

This document defines the deterministic pagination contract for all content indexes in GetVerba.

## Overview

All paginated indexes follow a consistent schema and URL pattern. Pagination uses static page documents (not dynamic queries), making it compatible with R2 static file hosting and CDN caching.

## Pagination Schema

Every paginated index JSON must include:

```typescript
interface PaginatedIndex {
  version: "v1";
  kind: string; // e.g., "context", "exams", "scenario_items", "mechanic_drills"
  total: number; // Total items across all pages (optional but recommended)
  pageSize: number; // Items per page (required, > 0)
  page: number; // Current page number (required, 1-based)
  items: Array<IndexItem>; // Items for this page (required)
  nextPage: string | null; // URL to next page, or null if last page (required)
}
```

### Required Fields

- `version`: Must be `"v1"`
- `kind`: Index type identifier
- `pageSize`: Number of items per page (must be > 0)
- `page`: Current page number (must be >= 1)
- `items`: Array of index items (length must be <= pageSize)
- `nextPage`: URL string or `null`

### Optional Fields

- `total`: Total number of items across all pages (recommended if cheap to compute)

## URL Patterns

### Section Indexes

- **Page 1**: `/v1/workspaces/{ws}/{sectionId}/index.json`
- **Page N (N >= 2)**: `/v1/workspaces/{ws}/{sectionId}/pages/{N}.json`

Examples:
- `/v1/workspaces/de/context/index.json` (page 1)
- `/v1/workspaces/de/context/pages/2.json` (page 2)
- `/v1/workspaces/de/exams/index.json` (page 1)
- `/v1/workspaces/de/exams/pages/2.json` (page 2)

### Scenario Indexes

- **Page 1**: `/v1/workspaces/{ws}/context/{scenarioId}/index.json`
- **Page N (N >= 2)**: `/v1/workspaces/{ws}/context/{scenarioId}/pages/{N}.json`

Examples:
- `/v1/workspaces/de/context/work/index.json` (page 1)
- `/v1/workspaces/de/context/work/pages/2.json` (page 2)

### Mechanics Indexes

- **Mechanics list**: `/v1/workspaces/{ws}/mechanics/index.json` (may be non-paginated if small)
- **Per-mechanic drills (Page 1)**: `/v1/workspaces/{ws}/mechanics/{mechanicId}/index.json`
- **Per-mechanic drills (Page N)**: `/v1/workspaces/{ws}/mechanics/{mechanicId}/pages/{N}.json`

Examples:
- `/v1/workspaces/de/mechanics/index.json` (mechanics list)
- `/v1/workspaces/de/mechanics/verb_present_tense/index.json` (page 1)
- `/v1/workspaces/de/mechanics/verb_present_tense/pages/2.json` (page 2)

## How to Paginate a Section

1. **Start with page 1**: Fetch `/v1/workspaces/{ws}/{sectionId}/index.json`
2. **Check `nextPage`**: If `nextPage` is not `null`, fetch the URL it points to
3. **Continue**: Repeat step 2 until `nextPage` is `null`
4. **Ordering**: Items are stable-ordered (by `orderInGroup` if present, else by title, else by id)

## Example: Paginating Context Section

```typescript
// Page 1
const page1 = await fetch('/v1/workspaces/de/context/index.json');
// {
//   "version": "v1",
//   "kind": "context",
//   "total": 45,
//   "pageSize": 20,
//   "page": 1,
//   "items": [...20 items...],
//   "nextPage": "/v1/workspaces/de/context/pages/2.json"
// }

// Page 2
const page2 = await fetch('/v1/workspaces/de/context/pages/2.json');
// {
//   "version": "v1",
//   "kind": "context",
//   "total": 45,
//   "pageSize": 20,
//   "page": 2,
//   "items": [...20 items...],
//   "nextPage": "/v1/workspaces/de/context/pages/3.json"
// }

// Page 3 (last page)
const page3 = await fetch('/v1/workspaces/de/context/pages/3.json');
// {
//   "version": "v1",
//   "kind": "context",
//   "total": 45,
//   "pageSize": 20,
//   "page": 3,
//   "items": [...5 items...],
//   "nextPage": null
// }
```

## Caching Expectations

- **ETag support**: All index pages support ETag-based conditional requests
- **Immutable per content version**: Index pages are immutable for a given content hash/git SHA
- **CDN-friendly**: Static files work well with CDN caching
- **Incremental updates**: FE can cache pages and only re-fetch when content version changes (check `/manifest` or `/release`)

## Validation Rules

The validator enforces:

1. **Page number**: Must be >= 1
2. **Page size**: Must be > 0
3. **Items length**: `items.length <= pageSize`
4. **nextPage pattern**: Must match `/v1/workspaces/{ws}/.../pages/{n}.json` if not null
5. **nextPage file exists**: The file referenced by `nextPage` must exist in the build output
6. **Total consistency**: If `total` is present, it should match the sum of items across all pages

## Generator Responsibilities

Index generators must:

1. **Emit page 1 as `index.json`**: First page goes in the section directory
2. **Emit subsequent pages as `pages/{n}.json`**: Create `pages/` subdirectory if needed
3. **Set `nextPage` correctly**: Point to next page URL or `null` for last page
4. **Stable ordering**: Sort items deterministically (by `orderInGroup`, then title, then id)
5. **Consistent `total`**: Compute and include `total` if possible
6. **Consistent `pageSize`**: Use the same `pageSize` for all pages of an index

## Backward Compatibility

- Old index paths (e.g., `index.page2.json`) are removed during generation
- New pagination format is additive (doesn't break existing FE that reads `index.json`)
- FE can gradually migrate to using `nextPage` for pagination

