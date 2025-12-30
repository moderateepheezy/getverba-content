# Schema Compatibility Policy

This document defines the compatibility rules for GetVerba content schemas.

## Schema Versioning

All major content documents include a `schemaVersion` field:

- **Catalog**: `schemaVersion: 1`
- **Section Index Page**: `schemaVersion: 1`
- **PackEntry**: `schemaVersion: 1`
- **ExamEntry**: `schemaVersion: 1`
- **DrillEntry**: `schemaVersion: 1`
- **Manifest**: `schemaVersion: 1`

## Compatibility Rules

### Rule 1: Schema Version Bump = Breaking Change

**A `schemaVersion` bump implies a breaking change.**

When you increment `schemaVersion` (e.g., `1` → `2`), you are declaring that:
- The schema structure has changed in a way that may break existing clients
- Clients must be updated to handle the new schema version
- The `minClientVersion` in the manifest must be bumped accordingly

### Rule 2: Version 1 Must Remain Stable

**Version 1 must remain stable; only additive optional fields allowed.**

For `schemaVersion: 1`:
- ✅ **Allowed**: Adding new optional fields
- ✅ **Allowed**: Adding new optional nested objects
- ❌ **Forbidden**: Removing required fields
- ❌ **Forbidden**: Renaming required fields
- ❌ **Forbidden**: Changing field types
- ❌ **Forbidden**: Making optional fields required

### Rule 3: Removing/Renaming Required Fields

**Removing or renaming required fields in v1 is forbidden.**

If you need to remove or rename a required field:
1. Bump `schemaVersion` to `2`
2. Update `minClientVersion` in manifest
3. Migrate existing content to new schema
4. Update client apps to handle both versions (or deprecate v1)

### Rule 4: Adding New Required Fields

**Adding new required fields requires bumping `schemaVersion`.**

If you add a new required field:
1. Bump `schemaVersion` to `2`
2. Update `minClientVersion` in manifest
3. Ensure all existing content is migrated
4. Update client apps to handle the new required field

## Breaking Change Examples

### ❌ Breaking Change (Requires Version Bump)

```json
// Before (schemaVersion: 1)
{
  "schemaVersion": 1,
  "id": "pack-001",
  "title": "My Pack"
}

// After (BREAKING - removed required field)
{
  "schemaVersion": 1,  // ❌ WRONG - should be 2
  "id": "pack-001"
  // "title" removed - BREAKING
}
```

### ✅ Non-Breaking Change (Version 1 OK)

```json
// Before (schemaVersion: 1)
{
  "schemaVersion": 1,
  "id": "pack-001",
  "title": "My Pack"
}

// After (NON-BREAKING - added optional field)
{
  "schemaVersion": 1,  // ✅ OK
  "id": "pack-001",
  "title": "My Pack",
  "tags": ["new", "optional"]  // ✅ New optional field
}
```

## Required Fields by Document Type

### Catalog (schemaVersion: 1)

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | number | ✅ |
| `version` | string | ✅ |
| `workspace` | string | ✅ |
| `languageCode` | string | ✅ |
| `languageName` | string | ✅ |
| `sections` | array | ✅ |

### Section Index Page (schemaVersion: 1)

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | number | ✅ |
| `version` | string | ✅ |
| `kind` | string | ✅ |
| `total` | number | ✅ |
| `pageSize` | number | ✅ |
| `items` | array | ✅ |
| `nextPage` | string \| null | ✅ |

### PackEntry (schemaVersion: 1)

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | number | ✅ |
| `id` | string | ✅ |
| `kind` | string | ✅ |
| `title` | string | ✅ |
| `level` | string | ✅ |
| `estimatedMinutes` | number | ✅ |
| `description` | string | ✅ |
| `outline` | array | ✅ |
| `sessionPlan` | object | ✅ |

### ExamEntry (schemaVersion: 1)

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | number | ✅ |
| `id` | string | ✅ |
| `kind` | string | ✅ |
| `title` | string | ✅ |
| `level` | string | ✅ |
| `estimatedMinutes` | number | ✅ |

### DrillEntry (schemaVersion: 1)

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | number | ✅ |
| `id` | string | ✅ |
| `kind` | string | ✅ |
| `title` | string | ✅ |
| `estimatedMinutes` | number | ✅ |

### Manifest (schemaVersion: 1)

| Field | Type | Required |
|-------|------|----------|
| `schemaVersion` | number | ✅ |
| `activeVersion` | string | ✅ |
| `activeWorkspace` | string | ✅ |
| `workspaces` | object | ✅ |

## Migration Path

When bumping `schemaVersion`:

1. **Create migration script** to transform v1 → v2 content
2. **Update validator** to accept both v1 and v2 (or deprecate v1)
3. **Update manifest** `minClientVersion` to require new client
4. **Migrate all content** to new schema
5. **Test thoroughly** with staging manifest
6. **Promote** only after validation passes

## Validator Enforcement

The validator enforces:

- ✅ `schemaVersion` must be present
- ✅ `schemaVersion` must be a known version (currently: `1`)
- ✅ Required fields must exist for `schemaVersion: 1`
- ✅ Field types must match expected types
- ❌ Hard-fail on unknown `schemaVersion`
- ❌ Hard-fail on missing required fields for v1

## Related Documentation

- [Section Index Schema](../../SECTION_INDEX_SCHEMA.md)
- [Entry URL Schema](./ENTRY_URL_SCHEMA.md)
- [Rollout Workflow](./ROLLOUT.md)

