# i18n Scaffolding + Pagination Implementation Summary

## ✅ Implementation Complete

Both i18n scaffolding and deterministic pagination contract have been implemented and are ready for use.

## Files Modified

### Core Scripts

1. **`scripts/generate-indexes.ts`**
   - Added i18n field extraction (`title_i18n`, `subtitle_i18n`, `shortTitle_i18n`, `topicLabel_i18n`)
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
   - Auto-populates `title_i18n.en`, `shortTitle_i18n.en`, `subtitle_i18n.en` for new drills

4. **`scripts/validate-content.ts`**
   - Added `validateI18nObject()` function for i18n structure validation
   - Added pagination validation (page, pageSize, nextPage pattern, nextPage file existence)
   - Added i18n validation for index items (shortTitle_i18n max length: 28 chars)

### Documentation

1. **`docs/content-pipeline/PAGINATION_CONTRACT.md`** (new)
   - Complete pagination contract specification
   - URL patterns for all index types
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

5. **`I18N_PAGINATION_IMPLEMENTATION.md`** (new)
   - Detailed implementation summary

## Commands to Run

### Generate Indexes (with pagination + i18n extraction)

```bash
npm run content:generate-indexes
```

### Generate Mechanics Indexes

```bash
tsx scripts/generate-mechanics-indexes.ts --workspace de
```

### Validate (i18n + pagination)

```bash
npm run content:validate
```

### Generate Drills (with i18n auto-population)

```bash
tsx scripts/generate-drills-v4.ts --workspace de --all
```

## Sample Output Paths

### Section Index (Context)

- **Page 1**: `/v1/workspaces/de/context/index.json`
- **Page 2**: `/v1/workspaces/de/context/pages/2.json`
- **Page 3**: `/v1/workspaces/de/context/pages/3.json`

### Scenario Index

- **Page 1**: `/v1/workspaces/de/context/work/index.json`
- **Page 2**: `/v1/workspaces/de/context/work/pages/2.json`

### Mechanics Index

- **Page 1**: `/v1/workspaces/de/mechanics/verb_present_tense/index.json`
- **Page 2**: `/v1/workspaces/de/mechanics/verb_present_tense/pages/2.json`

## Verification

Run these commands to verify:

```bash
# Check pagination structure
jq '{version, kind, total, pageSize, page, itemsCount: (.items | length), nextPage}' content/v1/workspaces/de/context/index.json

# Check page 2
jq '{version, kind, total, pageSize, page, itemsCount: (.items | length), nextPage}' content/v1/workspaces/de/context/pages/2.json

# Check i18n fields in index items (if present)
jq '.items[0] | {title, title_i18n, shortTitle, shortTitle_i18n}' content/v1/workspaces/de/context/index.json
```

## Backward Compatibility

✅ **No breaking changes**:
- Existing `title`, `subtitle`, `shortTitle` fields remain
- i18n fields are optional
- Old `index.page{n}.json` files are cleaned up during generation
- FE can gradually adopt i18n and pagination

## Next Steps

1. **Frontend**: Implement `pickI18n()` helper and use i18n fields when available
2. **Frontend**: Use `nextPage` for pagination instead of manual page number calculation
3. **Content**: Gradually add translations to `*_i18n` fields (e.g., `de`, `es`)
4. **Tests**: Add unit tests for i18n validation and pagination validation (pending)

## Testing

To test with strict i18n validation:

```bash
# Require "en" key in i18n objects
REQUIRE_I18N_EN=true npm run content:validate
```

Normal validation (warns if "en" missing):

```bash
npm run content:validate
```

