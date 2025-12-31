# Track Entry Schema

This document defines the canonical schema for Track entry documents (`track.json`).

## Schema Version

All track entries must include `schemaVersion: 1`.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Must be `1` |
| `id` | string | Unique track identifier (kebab-case) |
| `kind` | string | Must be `"track"` |
| `title` | string | Track title (max 100 chars) |
| `level` | string | CEFR level: `A1`, `A2`, `B1`, `B2`, `C1`, or `C2` |
| `scenario` | string | Content scenario identifier (3-40 chars, lowercase snake_case recommended) |
| `estimatedMinutes` | number | Estimated duration in minutes (sum of all items) |
| `description` | string | Track description (1-3 lines) |
| `items` | array | Array of track item objects (6-14 items recommended) |
| `ordering` | object | Ordering configuration (must have `type: "fixed"` for deterministic tracks) |
| `version` | number | Track version (currently `1`) |

## Track Items

Each item in the `items` array must have:

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Must be `"pack"` or `"drill"` |
| `entryUrl` | string | Canonical entry URL (must match pattern for kind) |
| `required` | boolean | Whether this item is required (default: `true`) |

### Entry URL Patterns

- **Pack**: `/v1/workspaces/{workspace}/packs/{packId}/pack.json`
- **Drill**: `/v1/workspaces/{workspace}/drills/{drillId}/drill.json`

## Ordering

The `ordering` object defines how items are sequenced:

```json
{
  "type": "fixed"
}
```

**Fixed Ordering** (`type: "fixed"`):
- Items must be completed in the exact order specified
- No duplicates allowed (each `entryUrl` must be unique)
- Deterministic sequence for consistent user experience

## Validation Rules

1. ✅ `items` array must have 6-14 items (recommended range)
2. ✅ Each `items[].entryUrl` must exist locally
3. ✅ Each `items[].entryUrl` must match the pattern for `items[].kind`
4. ✅ No duplicate `entryUrl` values in `items` array
5. ✅ If `scenario` is set, all pack items must have matching `scenario` (drills may omit scenario)
6. ✅ All referenced entry documents must exist and be valid
7. ✅ `estimatedMinutes` should approximately equal sum of item durations

## Example

```json
{
  "schemaVersion": 1,
  "id": "gov_office_a1_default",
  "kind": "track",
  "title": "Government Office Basics (A1)",
  "level": "A1",
  "scenario": "government_office",
  "estimatedMinutes": 25,
  "description": "Essential routines for navigating German government offices: address registration, appointments, residence permits, and basic counter interactions.",
  "items": [
    {
      "kind": "pack",
      "entryUrl": "/v1/workspaces/de/packs/anmeldung_basics/pack.json",
      "required": true
    },
    {
      "kind": "pack",
      "entryUrl": "/v1/workspaces/de/packs/terminvereinbarung/pack.json",
      "required": true
    },
    {
      "kind": "drill",
      "entryUrl": "/v1/workspaces/de/drills/formal_address_a1/drill.json",
      "required": true
    }
  ],
  "ordering": {
    "type": "fixed"
  },
  "version": 1
}
```

## Track Index Schema

Tracks are exposed via a section index in the catalog:

### Catalog Section

```json
{
  "id": "tracks",
  "kind": "tracks",
  "title": "Guided Tracks",
  "itemsUrl": "/v1/workspaces/de/tracks/index.json"
}
```

### Index File

```json
{
  "version": "v1",
  "kind": "tracks",
  "total": 1,
  "pageSize": 20,
  "items": [
    {
      "id": "gov_office_a1_default",
      "kind": "track",
      "title": "Government Office Basics (A1)",
      "level": "A1",
      "durationMinutes": 25,
      "entryUrl": "/v1/workspaces/de/tracks/gov_office_a1_default/track.json",
      "scenario": "government_office"
    }
  ],
  "nextPage": null
}
```

### Index Item Fields

**Required:**
- `id` (string): Track identifier
- `kind` (string): Must be `"track"`
- `title` (string): Display title
- `level` (string): CEFR level
- `durationMinutes` (number): Estimated duration
- `entryUrl` (string): Path to track.json file

**Optional:**
- `scenario` (string): Content scenario identifier
- `tags` (string[]): Taxonomy tags for filtering

## Usage in Frontend

The frontend should:

1. Load track index from `itemsUrl` in catalog section
2. Use `entryUrl` to fetch track.json
3. Render track items in order (respecting `ordering.type`)
4. Navigate to each item's `entryUrl` when user progresses
5. Track completion state per item

Example:
```typescript
const track = await contentClient.fetchEntry(trackItem.entryUrl);

// Render track items in order
for (const item of track.items) {
  // Navigate to item.entryUrl when user starts this item
  await navigateToItem(item.entryUrl);
}
```

