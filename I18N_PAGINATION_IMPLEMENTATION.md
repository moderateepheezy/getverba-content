# i18n Scaffolding + Pagination Implementation Summary

## Overview

This document summarizes the implementation of:
1. **i18n scaffolding** for user-visible strings in content
2. **Deterministic pagination contract** across all index types

Both features are backward compatible and optional.

## Changes Summary

### Part A: i18n Scaffolding

#### 1. Schema Updates ✅

Added optional i18n fields to:
- **Entry documents**: `title_i18n`, `subtitle_i18n`, `shortTitle_i18n` (drills)
- **Index items**: `title_i18n`, `subtitle_i18n`, `shortTitle_i18n`, `topicLabel_i18n`
- **Mechanics index items**: `shortTitle_i18n`, `subtitle_i18n`

#### 2. Validator Updates ✅

- Added `validateI18nObject()` function for i18n structure validation
- Validates i18n objects are `Record<string, string>`
- Enforces max length for `shortTitle_i18n[lang]` (28 chars)
- Soft rule: warns if "en" key missing (hard rule if `REQUIRE_I18N_EN=true`)
- Integrated with existing `validateI18nAndGrouping()` for index items

#### 3. Generator Updates ✅

- **Drill generator**: Auto-populates `title_i18n.en`, `shortTitle_i18n.en`, `subtitle_i18n.en`
- **Index generator**: Extracts i18n fields from entry documents to index items
- **Mechanics index generator**: Extracts i18n fields from drill entries

### Part B: Pagination Contract

#### 1. Standardized Schema ✅

All indexes now include:
- `page: number` (1-based, required)
- `pageSize: number` (required, > 0)
- `nextPage: string | null` (required)
- `total: number` (optional but recommended)

#### 2. URL Patterns ✅

Standardized to:
- **Page 1**: `{sectionId}/index.json`
- **Page N**: `{sectionId}/pages/{N}.json`

Applied to:
- Section indexes (`/context/index.json`, `/context/pages/2.json`)
- Scenario indexes (`/context/{scenarioId}/index.json`, `/context/{scenarioId}/pages/2.json`)
- Mechanics indexes (`/mechanics/{mechanicId}/index.json`, `/mechanics/{mechanicId}/pages/2.json`)

#### 3. Generator Updates ✅

- **generate-indexes.ts**: Updated to emit `pages/{n}.json` files
- **generate-mechanics-indexes.ts**: Updated to emit `pages/{n}.json` files
- Removes old `index.page{n}.json` format
- Creates `pages/` subdirectory when needed

#### 4. Validator Updates ✅

- Validates `page` >= 1
- Validates `pageSize` > 0
- Validates `items.length <= pageSize`
- Validates `nextPage` URL pattern matches `/v1/workspaces/{ws}/.../pages/{n}.json`
- **Hard fails** if `nextPage` points to non-existent file

## Files Modified

### Core Scripts

1. **`scripts/generate-indexes.ts`**
   - Added i18n field extraction in `readEntryDocument()`
   - Updated pagination to use `pages/{n}.json` format
   - Added `page` number to `SectionIndex` interface
   - Updated section and scenario index generation

2. **`scripts/generate-mechanics-indexes.ts`**
   - Added i18n fields to `MechanicDrillIndexItem` interface
   - Updated pagination to use `pages/{n}.json` format
   - Added `page` number to `MechanicDrillIndex` interface
   - Extracts i18n fields from drill entries

3. **`scripts/generate-drills-v4.ts`**
   - Added i18n fields to `DrillEntry` interface
   - Auto-populates `title_i18n.en`, `shortTitle_i18n.en`, `subtitle_i18n.en`

4. **`scripts/validate-content.ts`**
   - Added `validateI18nObject()` function
   - Added pagination validation (page, pageSize, nextPage pattern, nextPage file existence)
   - Added i18n validation for index items (shortTitle_i18n max length)

### Documentation

1. **`docs/content-pipeline/PAGINATION_CONTRACT.md`** (new)
   - Complete pagination contract specification
   - URL patterns
   - Caching expectations
   - Validation rules

2. **`docs/content-pipeline/I18N_SCAFFOLDING.md`** (new)
   - i18n field schema
   - Validation rules
   - Frontend usage patterns
   - Migration strategy

3. **`docs/content-pipeline/PACK_SCHEMA.md`** (updated)
   - Added i18n fields section

4. **`docs/content-pipeline/DRILL_SCHEMA_V4.md`** (updated)
   - Added pagination URL examples

## Commands to Run

### Generate Indexes (with pagination)

```bash
npm run content:generate-indexes
```

This will:
- Generate section indexes with `pages/{n}.json` format
- Generate mechanics indexes with `pages/{n}.json` format
- Extract i18n fields from entries to index items

### Validate

```bash
npm run content:validate
```

This will:
- Validate i18n structure and length constraints
- Validate pagination schema (page, pageSize, nextPage)
- Hard fail if nextPage points to missing file

### Generate Drills (with i18n)

```bash
tsx scripts/generate-drills-v4.ts --workspace de --all
```

This will:
- Auto-populate `*_i18n.en` fields for new drills

## Sample Output Paths

### Section Index

- Page 1: `/v1/workspaces/de/context/index.json`
- Page 2: `/v1/workspaces/de/context/pages/2.json`
- Page 3: `/v1/workspaces/de/context/pages/3.json`

### Scenario Index

- Page 1: `/v1/workspaces/de/context/work/index.json`
- Page 2: `/v1/workspaces/de/context/work/pages/2.json`

### Mechanics Index

- Page 1: `/v1/workspaces/de/mechanics/verb_present_tense/index.json`
- Page 2: `/v1/workspaces/de/mechanics/verb_present_tense/pages/2.json`

## Backward Compatibility

✅ **No breaking changes**:
- Existing `title`, `subtitle`, `shortTitle` fields remain
- i18n fields are optional
- Old index paths are cleaned up during generation
- FE can gradually adopt i18n and pagination

## Next Steps

1. **Frontend**: Implement `pickI18n()` helper and use i18n fields when available
2. **Frontend**: Use `nextPage` for pagination instead of manual page number calculation
3. **Content**: Gradually add translations to `*_i18n` fields (e.g., `de`, `es`)
4. **Tests**: Add unit tests for i18n validation and pagination validation

## Testing

To test pagination validation:

```bash
# Set environment variable to require "en" key
REQUIRE_I18N_EN=true npm run content:validate

# Normal validation (warns if "en" missing)
npm run content:validate
```

