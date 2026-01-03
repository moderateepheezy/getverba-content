# Context Scenario Pack-List Grouping Contract

> **Status**: Active (as of January 2026)  
> **Breaking Changes**: None - fully backward compatible  
> **FE Implementation**: Ready for implementation

This document defines the grouping and recommendation contract for Context Scenario Pack Lists (e.g., Doctor, Work, Housing).

## Problem Solved

1. ✅ **No mechanics groups in context feeds** - Grammar/mechanics packs (e.g., "Modal Verbs Requests") are excluded from context scenario lists
2. ✅ **Clear progress scope** - `scope` field clarifies what "X/Y completed" refers to
3. ✅ **Deterministic recommended** - Max 1 recommended item per page, stable selection

## Schema Changes

### Context Scenario Index (`/context/{scenarioId}/index.json`)

**New additive fields** (existing `items` field remains unchanged):

```typescript
interface ContextScenarioIndex {
  // Existing required fields (unchanged)
  version: string;
  kind: 'context';
  total: number;
  pageSize: number;
  page: number;
  items: SectionIndexItem[];
  nextPage: string | null;
  
  // NEW: Scope for progress tracking
  scope?: {
    scopeKind: 'scenario';
    scopeId: string;        // e.g., "doctor"
    scopeTitle: string;     // e.g., "Doctor"
  };
  
  // NEW: Recommended item (max 1 per page)
  recommended?: {
    itemId: string;
    entryUrl: string;
  };
  
  // NEW: Groups (context groups only, minimum 3 items per group)
  groups?: Array<{
    id: string;              // e.g., "booking-appointments"
    title: string;           // e.g., "Booking Appointments"
    title_i18n?: Record<string, string>;
    kind: 'context_group';   // MUST be "context_group"
    itemIds: string[];       // References to items[].id on this page
  }>;
}
```

### Section Index Item (enhanced)

```typescript
interface SectionIndexItem {
  // ... existing fields ...
  
  // NEW: Domain classification
  domainKind?: 'context' | 'mechanics' | 'exam';
  
  // NEW: Grouping metadata (for context scenario feeds)
  groupId?: string;
  groupTitle?: string;
  groupTitle_i18n?: Record<string, string>;
  
  // NEW: Recommended flag
  isRecommended?: boolean;
}
```

## Rules

### 1. No Mechanics in Context Feeds

**Rule**: Context scenario indexes (`/context/{scenarioId}/index.json`) MUST NOT include packs with `domainKind === 'mechanics'`.

**Detection Logic**:
- Packs with a `scenario` field are ALWAYS `context` (even if topicKey suggests mechanics)
- Packs without a scenario but with mechanics-focused topicKeys (e.g., "dative-case", "verb-conjugation") are `mechanics`
- Default: `context`

**Examples of mechanics topicKeys** (excluded from context feeds):
- `dative-case`, `accusative-case`, `genitive-case`
- `verb-conjugation`, `word-order`
- `prepositions`, `articles`, `adjectives`, `pronouns`

**Examples of context topicKeys** (included in context feeds):
- `making-an-appointment`, `describing-symptoms`
- `modal-verbs-requests` (when part of a scenario)
- `searching-listings`, `viewing-apartments`

### 2. Groups (Minimum 3 Items)

**Rule**: Groups only appear if they have at least 3 items on the current page.

**Behavior**:
- Groups are created from items with `groupId` field
- Only groups with ≥3 items on the page are included
- Groups can span multiple pages (same groupId can appear on multiple pages)
- Group order is determined by first appearance of groupId in items array
- Items within a group maintain their original relative order

**Example**:
```json
{
  "groups": [
    {
      "id": "booking-appointments",
      "title": "Booking Appointments",
      "title_i18n": { "en": "Booking Appointments" },
      "kind": "context_group",
      "itemIds": ["doctor_pack_1_a1", "doctor_pack_4_a1", "doctor_pack_7_a1", "doctor_pack_1_a2"]
    }
  ]
}
```

### 3. Recommended (Max 1, Deterministic)

**Rule**: At most ONE recommended item per page.

**Selection Algorithm**:
1. Sort items by: level (A1 < A2 < ...), then `orderInTopic`, then `id`
2. Select first item (deterministic)
3. Mark item with `isRecommended: true`
4. Export as `recommended: { itemId, entryUrl }`

**Future Enhancement**: When user progress data is available, prefer first incomplete pack.

### 4. Pagination with Groups

- Each page includes only items for that page
- `groups` includes only group headers that have ≥3 items on that page
- If a group spans multiple pages, it can appear again on later pages
- No "sticky headers" in v1 (each page is independent)

## Validation Rules

The validator enforces:

1. ✅ If `groups` exists:
   - Each group has `id`, `title`, `kind === "context_group"`, non-empty `itemIds`
   - Every `itemId` exists in `items[].id`
   - Each group has ≥3 items
   - No duplicate group IDs

2. ✅ If `recommended` exists:
   - `itemId` exists in `items`
   - Max 1 item with `isRecommended: true`
   - `recommended.itemId` matches item with `isRecommended: true`

3. ✅ No mechanics packs:
   - No item with `domainKind === "mechanics"` in context scenario feeds

4. ✅ If `scope` exists:
   - `scopeKind === "scenario"`
   - `scopeId` and `scopeTitle` are non-empty strings

## Example: Doctor Scenario Index

```json
{
  "version": "v1",
  "kind": "context",
  "total": 16,
  "pageSize": 12,
  "page": 1,
  "scope": {
    "scopeKind": "scenario",
    "scopeId": "doctor",
    "scopeTitle": "Doctor"
  },
  "recommended": {
    "itemId": "doctor_pack_1_a1",
    "entryUrl": "/v1/workspaces/de/packs/doctor_pack_1_a1/pack.json"
  },
  "groups": [
    {
      "id": "booking-appointments",
      "title": "Booking Appointments",
      "title_i18n": { "en": "Booking Appointments" },
      "kind": "context_group",
      "itemIds": ["doctor_pack_1_a1", "doctor_pack_4_a1", "doctor_pack_7_a1", "doctor_pack_1_a2", "doctor_pack_4_a2"]
    },
    {
      "id": "describing-symptoms",
      "title": "Describing Symptoms",
      "title_i18n": { "en": "Describing Symptoms" },
      "kind": "context_group",
      "itemIds": ["doctor_pack_2_a1", "doctor_pack_5_a1", "doctor_pack_8_a1", "doctor_pack_2_a2"]
    },
    {
      "id": "getting-prescriptions",
      "title": "Getting Prescriptions",
      "title_i18n": { "en": "Getting Prescriptions" },
      "kind": "context_group",
      "itemIds": ["doctor_pack_3_a1", "doctor_pack_6_a1", "doctor_pack_3_a2"]
    }
  ],
  "items": [
    {
      "id": "doctor_pack_1_a1",
      "kind": "pack",
      "title": "Doctor A1 — 1: Making an Appointment",
      "groupId": "booking-appointments",
      "groupTitle": "Booking Appointments",
      "domainKind": "context",
      "isRecommended": true,
      // ... other fields
    }
  ],
  "nextPage": "/v1/workspaces/de/context/doctor/index.page2.json"
}
```

## Frontend Implementation

### Backward Compatibility

**FE can continue using `items` array directly** - no changes required for basic functionality.

### Using Groups (Optional)

```typescript
// Group items by groupId
const grouped = index.groups?.map(group => ({
  ...group,
  items: group.itemIds
    .map(id => index.items.find(item => item.id === id))
    .filter(Boolean)
})) || [];

// Render groups with headers
grouped.forEach(group => {
  renderGroupHeader(group.title);
  group.items.forEach(item => renderPackCard(item));
});
```

### Using Recommended

```typescript
// Get recommended item
const recommended = index.recommended 
  ? index.items.find(item => item.id === index.recommended.itemId)
  : null;

// Or use isRecommended flag
const recommended = index.items.find(item => item.isRecommended === true);
```

### Using Scope

```typescript
// Display progress: "X/Y completed in {scopeTitle}"
const progress = `${completedCount}/${index.total} completed in ${index.scope?.scopeTitle || 'this scenario'}`;
```

## Group Definitions by Scenario

### Doctor
- `booking-appointments` - Booking Appointments
- `describing-symptoms` - Describing Symptoms
- `getting-prescriptions` - Getting Prescriptions

### Friends Small Talk
- `making-plans` - Making Plans
- `preferences-opinions` - Preferences & Opinions
- `responding-rescheduling` - Responding & Rescheduling

### Government Office
- `registration-documents` - Registration & Documents
- `permits-visas` - Permits & Visas
- `public-services` - Public Services

### Housing
- `searching-listings` - Searching & Listings
- `viewing-apartments` - Viewing Apartments
- `rental-agreements` - Rental Agreements

### Work
- `office-greetings` - Office Greetings
- `meetings-scheduling` - Meetings & Scheduling
- `tasks-requests` - Tasks & Requests

## Implementation Status

- ✅ Index generation creates groups (min 3 items)
- ✅ Mechanics packs filtered from context feeds
- ✅ Recommended selection (deterministic, max 1)
- ✅ Scope field added
- ✅ Validator enforces rules
- ✅ All scenario indexes updated

## Related Documentation

- [i18n Contract](./I18N_CONTRACT.md) - i18n fields for titles
- [Section Index Schema](./SECTION_INDEX_PAGINATION.md) - Pagination details
- [Scenario Index Schema](./SCENARIO_INDEX_SCHEMA.md) - Scenario index structure

---

**Last Updated**: January 2026  
**Backend Version**: v1 (grouping implemented)

