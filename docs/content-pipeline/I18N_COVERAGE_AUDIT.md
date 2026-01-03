# i18n Coverage Audit

## ✅ Fully Covered (Have i18n fields)

### Entry Documents
- ✅ `pack.json` - `title_i18n`, `description_i18n`
- ✅ `exam.json` - `title_i18n`, `description_i18n`
- ✅ `drill.json` - `title_i18n`, `description_i18n` (if description exists)

### Index Items
- ✅ Section index items - `title_i18n`, `shortTitle_i18n`
- ✅ Scenario index items - `title_i18n`, `subtitle_i18n`
- ✅ Catalog sections - `title_i18n`

### Nested Structures (Titles)
- ✅ Exam sections - `title_i18n`
- ✅ Exam parts - `title_i18n`
- ✅ Practice modules - `title_i18n`
- ✅ Session plan steps - `title_i18n`

## ⚠️ Missing i18n Fields (Descriptions)

### Exam Parts
- ❌ `description` → Missing `description_i18n`
- **Location**: `exam.json` → `sections[].parts[].description`
- **Impact**: User-facing descriptions of exam parts are not localized
- **Example**: "Listen to short announcements and match them to pictures"

### Practice Modules
- ❌ `description` → Missing `description_i18n`
- **Location**: `exam.json` → `practiceModules[].description`
- **Impact**: User-facing descriptions of practice modules are not localized
- **Example**: "Master key vocabulary for self-introduction"

## 📋 Complete List of User-Facing Text Fields

### Entry Documents
| Field | i18n Field | Status | Notes |
|-------|------------|--------|-------|
| `title` | `title_i18n` | ✅ Complete | All entries have this |
| `description` | `description_i18n` | ✅ Complete | All entries with description have this |
| `shortTitle` | `shortTitle_i18n` | ✅ Complete | Index items only |

### Index Items
| Field | i18n Field | Status | Notes |
|-------|------------|--------|-------|
| `title` | `title_i18n` | ✅ Complete | All index items |
| `shortTitle` | `shortTitle_i18n` | ✅ Complete | When shortTitle exists |
| `subtitle` | `subtitle_i18n` | ✅ Complete | Scenario index only |
| `groupTitle` | `groupTitle_i18n` | ✅ Complete | All grouped items |

### Exam Structure
| Field | i18n Field | Status | Notes |
|-------|------------|--------|-------|
| `sections[].title` | `sections[].title_i18n` | ✅ Complete | All exam sections |
| `sections[].parts[].title` | `sections[].parts[].title_i18n` | ✅ Complete | All exam parts |
| `sections[].parts[].description` | `sections[].parts[].description_i18n` | ❌ **MISSING** | Need to add |
| `practiceModules[].title` | `practiceModules[].title_i18n` | ✅ Complete | All practice modules |
| `practiceModules[].description` | `practiceModules[].description_i18n` | ❌ **MISSING** | Need to add |

### Pack Structure
| Field | i18n Field | Status | Notes |
|-------|------------|--------|-------|
| `sessionPlan.steps[].title` | `sessionPlan.steps[].title_i18n` | ✅ Complete | All session plan steps |
| `sessionPlan.steps[].description` | N/A | N/A | Steps don't have descriptions |

## 🔧 Required Fixes

### 1. Update Backfill Script

The `addI18nFields` function needs to also add `description_i18n` to nested objects (exam parts, practice modules), not just root-level entry documents.

**Current logic:**
```typescript
// Only adds description_i18n if this looks like an entry document
if (obj.schemaVersion !== undefined || (obj.kind && !obj.items)) {
  obj.description_i18n = { en: obj.description };
}
```

**Should be:**
```typescript
// Add description_i18n to any object with description (including nested)
if (typeof obj.description === 'string' && obj.description.trim() && !obj.description_i18n) {
  obj.description_i18n = { en: obj.description };
}
```

### 2. Update Frontend Documentation

Add examples for:
- Exam part descriptions
- Practice module descriptions
- Nested structure handling

## 📊 Statistics

### Current Coverage
- **Titles**: 100% coverage (all user-facing titles have i18n)
- **Descriptions (root)**: 100% coverage (entry documents)
- **Descriptions (nested)**: 0% coverage (exam parts, practice modules)

### Missing Fields Count (Estimated)
- Exam parts with descriptions: ~50-100 fields
- Practice modules with descriptions: ~20-30 fields
- **Total missing**: ~70-130 `description_i18n` fields

## 🎯 Recommendation

**Priority: Medium**

While exam part and practice module descriptions are user-facing, they are:
1. Less frequently displayed than titles
2. Often shown in context where the title is already localized
3. Can be added in a follow-up pass

**Action Plan:**
1. ✅ Document the gap (this file)
2. ⏳ Update backfill script to handle nested descriptions
3. ⏳ Re-run backfill script
4. ⏳ Update FE documentation with nested structure examples

## Related Files

- `scripts/backfill-title-i18n.ts` - Backfill script (needs update)
- `docs/app-implementation/I18N_IMPLEMENTATION.md` - FE guide (needs nested examples)
- `docs/content-pipeline/I18N_CONTRACT.md` - Backend contract

