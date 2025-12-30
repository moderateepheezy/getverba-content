# Bundle Definition Schema

This document defines the schema for bundle definition files that specify which content items to include in curriculum exports.

## Schema Version

All bundle definitions must include `version: 1`.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Must be `1` |
| `id` | string | Unique bundle identifier (kebab-case, e.g., `de_government_office_a1`) |
| `workspace` | string | Workspace code (e.g., `"de"`, `"en"`) |
| `title` | string | Human-readable bundle title |
| `description` | string | Bundle description (1-500 chars) |
| `filters` | object | Filter criteria (see below) |
| `includeKinds` | string[] | Array of item kinds to include: `"pack"`, `"drill"`, `"exam"` |
| `ordering` | object | Ordering specification (see below) |

## Filters Object

| Field | Type | Description |
|-------|------|-------------|
| `scenario` | string | Optional. Filter by scenario (e.g., `"government_office"`, `"work"`) |
| `levels` | string[] | Optional. Filter by CEFR levels (e.g., `["A1"]`, `["A1", "A2"]`) |
| `register` | string | Optional. Filter by register (`"formal"`, `"neutral"`, `"informal"`) |
| `primaryStructure` | string | Optional. Filter by primary structure |

## Ordering Object

| Field | Type | Description |
|-------|------|-------------|
| `by` | string[] | Array of sort keys: `"level"`, `"kind"`, `"title"`, `"scenario"`, `"primaryStructure"` |
| `stable` | boolean | Must be `true` (ensures deterministic ordering) |

## Example

```json
{
  "version": 1,
  "id": "de_government_office_a1",
  "workspace": "de",
  "title": "Government Office (A1) — Spoken Survival",
  "description": "Routine office conversations: Anmeldung, residence permit, passport, documents.",
  "filters": {
    "scenario": "government_office",
    "levels": ["A1"]
  },
  "includeKinds": ["pack", "drill"],
  "ordering": {
    "by": ["level", "kind", "title"],
    "stable": true
  }
}
```

## Validation Rules

1. **Bundle ID**: Must be unique, kebab-case, and match pattern `{workspace}_{scenario}_{level}` or similar
2. **Filters**: Must produce at least 1 item when resolved
3. **Ordering**: Must be stable (deterministic)
4. **includeKinds**: Must include at least one kind
5. **Workspace**: Must match an existing workspace

## Related Documentation

- [Bundle Export Script](../../../scripts/export-bundle.ts)
- [Bundle Validation](../../../scripts/validate-bundles.ts)

