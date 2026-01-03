# Internationalization (i18n) Contract

> **Status**: Active (as of January 2026)  
> **Breaking Changes**: None - fully backward compatible  
> **FE Implementation**: Pending (dedicated sprint)

This document defines the i18n contract for user-facing content titles and descriptions across the GetVerba content system.

## Overview

The i18n system adds optional localization fields alongside existing English fields. This enables:

1. **Multi-language support** for titles, descriptions, and UI strings
2. **Graceful degradation** to English when translations are unavailable
3. **Backward compatibility** with existing FE that reads `title` directly

## Schema Changes

### Entry Documents (pack.json, exam.json, drill.json)

```typescript
interface EntryDocument {
  // Existing required fields (unchanged)
  title: string;                    // English title (max 80 chars)
  description?: string;             // English description
  
  // NEW optional i18n fields
  title_i18n?: Record<string, string>;        // { "en": "...", "de": "...", ... }
  description_i18n?: Record<string, string>;  // { "en": "...", "de": "...", ... }
}
```

### Section Index Items

```typescript
interface SectionIndexItem {
  // Existing required fields (unchanged)
  title: string;                    // English title
  shortTitle?: string;              // Short display title (max 28 chars)
  
  // NEW optional i18n fields
  title_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  
  // NEW optional grouping fields (for scenario lists)
  groupId?: string;                 // Stable identifier (kebab-case, max 40 chars)
  groupTitle?: string;              // English display label (max 60 chars)
  groupTitle_i18n?: Record<string, string>;
}
```

### Scenario Index

```typescript
interface ScenarioItem {
  // Existing required fields (unchanged)
  title: string;
  subtitle?: string;
  
  // NEW optional i18n fields
  title_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
}
```

## Validation Rules

### Locale Keys

- Must be BCP-47 short form: `[a-z]{2}` or `[a-z]{2}-[A-Z]{2}`
- Examples: `"en"`, `"de"`, `"de-AT"`, `"pt-BR"`
- Invalid: `"english"`, `"EN"`, `"en-us"`, `"en_US"`

### Required English Locale

When any `*_i18n` field is present, it **MUST** include the `"en"` key:

```json
// ✅ Valid
{ "title_i18n": { "en": "Doctor Appointment", "de": "Arzttermin" } }

// ❌ Invalid - missing "en"
{ "title_i18n": { "de": "Arzttermin" } }
```

### Value Constraints

| Field | Max Length | Notes |
|-------|------------|-------|
| `title_i18n` values | 80 chars | Same as `title` |
| `shortTitle_i18n` values | 28 chars | Same as `shortTitle` |
| `description_i18n` values | 500 chars | Reasonable description limit |
| `groupTitle_i18n` values | 60 chars | Same as `groupTitle` |

### Value Format

- Must be non-empty after trimming
- Leading/trailing whitespace generates a warning
- Values should match the corresponding base field (warning if mismatch)

## Grouping Metadata

Grouping allows scenario pack lists to display section headers.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `groupId` | string | If `groupTitle` present | Stable kebab-case identifier |
| `groupTitle` | string | If `groupId` present | English display label |
| `groupTitle_i18n` | Record<string, string> | Optional | Localized group titles |

### groupId Format

- Must be kebab-case or snake_case: `[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*`
- Max 40 characters
- Examples: `"booking-appointments"`, `"describing_symptoms"`

### Scenario Groups

**100% coverage required** - every pack in EVERY scenario belongs to a group. NO orphans allowed.

#### Doctor (16 packs)

| groupId | groupTitle | Purpose |
|---------|------------|---------|
| `booking-appointments` | Booking Appointments | Making/scheduling appointments |
| `describing-symptoms` | Describing Symptoms | Describing health symptoms |
| `getting-prescriptions` | Getting Prescriptions | Prescriptions and medication |

#### Friends Small Talk (24 packs)

| groupId | groupTitle | Purpose |
|---------|------------|---------|
| `making-plans` | Making Plans | Opening, suggestions, planning meetups |
| `preferences-opinions` | Preferences & Opinions | Movies, recommendations, preferences |
| `responding-rescheduling` | Responding & Rescheduling | Declining politely, rescheduling |

#### Government Office (6 packs)

| groupId | groupTitle | Purpose |
|---------|------------|---------|
| `registration-documents` | Registration & Documents | Anmeldung, address registration |
| `permits-visas` | Permits & Visas | Residence permit, immigration office |
| `public-services` | Public Services | Health insurance, Jobcenter, passport |

#### Housing (20 packs)

| groupId | groupTitle | Purpose |
|---------|------------|---------|
| `searching-listings` | Searching & Listings | Searching for housing |
| `viewing-apartments` | Viewing Apartments | Apartment viewings |
| `rental-agreements` | Rental Agreements | Rental contracts, agreements |

#### Work (23 packs)

| groupId | groupTitle | Purpose |
|---------|------------|---------|
| `office-greetings` | Office Greetings | Greetings, introductions |
| `meetings-scheduling` | Meetings & Scheduling | Meeting phrases, scheduling |
| `tasks-requests` | Tasks & Requests | Work requests, problem solving |

## Frontend Implementation Guide

### Fallback Logic (Proposed)

```typescript
function getLocalizedTitle(
  item: { title: string; title_i18n?: Record<string, string> },
  userLocale: string
): string {
  // 1. Try exact locale match
  if (item.title_i18n?.[userLocale]) {
    return item.title_i18n[userLocale];
  }
  
  // 2. Try language-only match (e.g., "de" from "de-AT")
  const lang = userLocale.split('-')[0];
  if (item.title_i18n?.[lang]) {
    return item.title_i18n[lang];
  }
  
  // 3. Fall back to English i18n
  if (item.title_i18n?.en) {
    return item.title_i18n.en;
  }
  
  // 4. Ultimate fallback to base field
  return item.title;
}
```

Apply the same pattern for:
- `shortTitle` / `shortTitle_i18n`
- `description` / `description_i18n`
- `groupTitle` / `groupTitle_i18n`
- `subtitle` / `subtitle_i18n`

### Grouping Algorithm (Proposed)

```typescript
interface GroupedItems<T> {
  groupId: string;
  groupTitle: string;
  items: T[];
}

function groupItems<T extends { groupId?: string; groupTitle?: string }>(
  items: T[],
  userLocale: string
): GroupedItems<T>[] {
  const groups: Map<string, GroupedItems<T>> = new Map();
  const groupOrder: string[] = [];
  
  for (const item of items) {
    const groupId = item.groupId || '__ungrouped__';
    
    if (!groups.has(groupId)) {
      groupOrder.push(groupId);
      groups.set(groupId, {
        groupId,
        groupTitle: getLocalizedGroupTitle(item, userLocale),
        items: []
      });
    }
    
    groups.get(groupId)!.items.push(item);
  }
  
  // Return groups in order of first appearance
  return groupOrder.map(id => groups.get(id)!);
}
```

**Important**:
- Groups appear in the order of their first item in the list
- Items within a group maintain their original relative order
- Items without groupId are not grouped (flat display)

## Current State

### What's Populated Now

- **English only**: All `*_i18n` fields contain only `"en"` locale
- **Backfill complete**: All existing `title`, `shortTitle`, `description` fields have corresponding `*_i18n` fields
- **Grouping complete**: ALL scenario packs have grouping metadata (89 packs total):
  - Doctor: 16 packs across 3 groups
  - Friends Small Talk: 24 packs across 3 groups
  - Government Office: 6 packs across 3 groups
  - Housing: 20 packs across 3 groups
  - Work: 23 packs across 3 groups

### Running Backfill

```bash
# Dry run (preview changes)
pnpm backfill:i18n

# Apply changes
pnpm backfill:i18n --write
```

### Running Grouping Seed (All Scenarios)

```bash
# Dry run - preview all changes
npm run seed:all-grouping

# Apply changes to all scenarios
npm run seed:all-grouping -- --write
```

### Running Doctor Grouping Only (Legacy)

```bash
# Dry run
npm run seed:doctor-grouping

# Apply changes
npm run seed:doctor-grouping -- --write
```

## Validation

### Running i18n Validation Tests

```bash
pnpm test:i18n
```

### Validation in Content Pipeline

The validator (`scripts/validate-content.ts`) enforces:
- Valid locale keys when `*_i18n` fields present
- Required `"en"` key when any i18n field present
- Value length constraints
- Grouping field dependencies (`groupId` ↔ `groupTitle`)

## Migration Path

### Phase 1: Backend (Current Sprint) ✅

- [x] Add optional i18n fields to schema
- [x] Create validation utilities
- [x] Backfill English values
- [x] Add grouping metadata to Doctor scenario
- [x] Update documentation

### Phase 2: Frontend (Dedicated Sprint)

- [ ] Implement `getLocalizedTitle()` helper
- [ ] Update UI to use i18n fields with fallback
- [ ] Implement grouping UI for scenario lists
- [ ] Add language switcher (if applicable)

### Phase 3: Multi-Language Content

- [ ] Add German translations (`"de"` locale)
- [ ] Add other supported languages
- [ ] Implement translation workflow

## API Compatibility

The Worker API is **unchanged**:
- All existing endpoints continue to work
- New fields are included in responses
- No URL pattern changes
- Caching behavior unchanged

## Related Documentation

- [Schema Compatibility](./SCHEMA_COMPATIBILITY.md)
- [Section Index Schema](./SECTION_INDEX_PAGINATION.md)
- [Scenario Index Schema](./SCENARIO_INDEX_SCHEMA.md)

