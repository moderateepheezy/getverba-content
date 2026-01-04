# BE Drill Shaping — Final Spec (v4)

**Status**: Final contract FE should build against  
**Date**: 2026-01-03  
**Version**: v4

---

## Goal

Deliver user-ready drill affordances, not raw content rows.

---

## 0. Core Principle (Lock This)

**FE must never see raw drill content rows.**

BE owns aggregation, grouping, ordering, and semantics.

**Drills are machines, not lessons.**

---

## 1. Mental Model (Authoritative)

### Hierarchy (exactly 4 levels)

```
Drills Tab
└── DrillGroup (mechanic)
    └── DrillCategory (loopType variant: Pattern, Pairs, Slot, etc.)
        └── DrillTier (intensity / progression)
            └── VoiceSession (existing)
```

**There is no 5th level.**  
**There is no concept of individual drill rows exposed to FE.**

---

## 2. API Surface (High-Level)

### Endpoint

```
GET /v1/workspaces/{ws}/drills
```

Returns only DrillGroups, already shaped.

---

## 3. DrillGroup (Mechanic-Level Object)

### Purpose

Represents one mechanical concept the user can train.

### Shape

```json
{
  "id": "case_endings_akkusativ",
  "kind": "drill_group",
  "mechanic": "case_endings_akkusativ",
  "title": "Akkusativ-Endungen",
  "subtitle": "Direct object noun endings",
  "description": "Übe Akkusativ-Endungen (den, die, das, einen, eine)",
  "description_i18n": {
    "en": "Practice accusative case endings (den, die, das, einen, eine)",
    "de": "Übe Akkusativ-Endungen (den, die, das, einen, eine)"
  },
  "estimatedDuration": "3–5 min",
  "categories": [ ... ],
  "order": 10
}
```

### Rules

- `title` = what am I practicing (workspace language only, no i18n)
- `subtitle` = optional, 1 line max
- `description` = what the user will learn (required, supports i18n via `description_i18n`)
- `estimatedDuration` = human-friendly range
- `order` = stable ordering across releases
- `categories` = array of DrillCategory objects (replaces flat `tiers`)

### Workspace Language Rules

- `title` is in workspace language only (e.g., German for "de" workspace)
- No `title_i18n` field - title is workspace-language only
- `description` uses `description_i18n[workspaceLang]` or falls back to English, then `description`
- Document workspace language mapping for future workspaces:
  - `"de"` → German
  - Default to English if workspace language unknown

### ❌ Banned

- ❌ No levels
- ❌ No tiers in title
- ❌ No A1/A2 here
- ❌ No `title_i18n` (title is workspace-language only)

---

## 4. DrillCategory (LoopType Variant)

### Purpose

Represents a specific drill variant within a mechanic (e.g., Pattern, Pairs, Slot).

### Shape

```json
{
  "id": "pattern_switch",
  "category": "Muster",
  "loopType": "pattern_switch",
  "tiers": [ ... ]
}
```

### Rules

- `id` = loopType value (e.g., "pattern_switch", "contrast_pairs", "slot_substitution")
- `category` = human-readable label in workspace language only (no i18n)
- `loopType` = raw loopType value for programmatic use
- `tiers` = array of DrillTier objects for this category

### Workspace Language Rules

- `category` is in workspace language only (e.g., "Muster" for German "de" workspace)
- No `category_i18n` field - category is workspace-language only
- Category labels map to workspace language:
  - `pattern_switch` → "Muster" (de) / "Pattern" (en)
  - `contrast_pairs` → "Paare" (de) / "Pairs" (en)
  - `slot_substitution` → "Platzhalter" (de) / "Slot" (en)
  - etc.

---

## 5. DrillTier (Runnable Unit)

### Purpose

This is what the user actually starts.

### Shape

```json
{
  "id": "case_endings_akkusativ_a1_pattern_t1",
  "tier": 1,
  "level": "A1",
  "title": "Stufe 1: Grundformen",
  "title_i18n": {
    "en": "Tier 1: Basic Forms",
    "de": "Stufe 1: Grundformen"
  },
  "description": "Übe die Grundformen der Akkusativ-Endungen mit einfachen Sätzen",
  "description_i18n": {
    "en": "Practice basic accusative case endings with simple sentences",
    "de": "Übe die Grundformen der Akkusativ-Endungen mit einfachen Sätzen"
  },
  "durationMinutes": 3,
  "status": "available",
  "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ_a1_tier1_pattern-switch/drill.json"
}
```

### Rules

- One tier = one Start button
- `tier` is numeric (1,2,3…) — FE displays it
- `level` is metadata (A1/A2/B1)
- `title` = unique, descriptive title (NOT repeating drill group title, focus on what makes this tier different)
- `title_i18n` = optional i18n object for tier titles
- `description` = what the user will learn in this specific tier (required, supports i18n)
- `description_i18n` = optional i18n object for tier descriptions
- `entryUrl` launches the voice session directly
- `status` allows future gating (locked, completed)

### Title Requirements

- Must be unique and descriptive
- Must NOT repeat the drill group title
- Should focus on tier-specific content (e.g., "Basic Forms", "Extended Practice", "Complex Patterns")
- Should include tier number and category context
- Example: "Stufe 1: Grundformen" instead of "Akkusativ-Endungen: A1 (Stufe 1) - Muster"

### ❌ Banned

- ❌ No repeated rows
- ❌ No duplicated tiers
- ❌ No content IDs leaking
- ❌ No repeating drill group title in tier title

---

## 6. Full Example Response (Canonical)

```json
{
  "drillGroups": [
    {
      "id": "case_endings_akkusativ",
      "kind": "drill_group",
      "mechanic": "case_endings_akkusativ",
      "title": "Akkusativ-Endungen",
      "subtitle": "Direct object noun endings",
      "description": "Übe Akkusativ-Endungen (den, die, das, einen, eine)",
      "description_i18n": {
        "en": "Practice accusative case endings (den, die, das, einen, eine)",
        "de": "Übe Akkusativ-Endungen (den, die, das, einen, eine)"
      },
      "estimatedDuration": "3–5 min",
      "order": 10,
      "categories": [
        {
          "id": "pattern_switch",
          "category": "Muster",
          "loopType": "pattern_switch",
          "tiers": [
            {
              "id": "case_endings_akkusativ_a1_pattern_t1",
              "tier": 1,
              "level": "A1",
              "title": "Stufe 1: Grundformen",
              "title_i18n": {
                "en": "Tier 1: Basic Forms",
                "de": "Stufe 1: Grundformen"
              },
              "description": "Übe die Grundformen der Akkusativ-Endungen mit einfachen Sätzen",
              "description_i18n": {
                "en": "Practice basic accusative case endings with simple sentences",
                "de": "Übe die Grundformen der Akkusativ-Endungen mit einfachen Sätzen"
              },
              "durationMinutes": 3,
              "status": "available",
              "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ_a1_tier1_pattern-switch/drill.json"
            },
            {
              "id": "case_endings_akkusativ_a1_pattern_t2",
              "tier": 2,
              "level": "A1",
              "title": "Stufe 2: Erweiterte Formen",
              "title_i18n": {
                "en": "Tier 2: Extended Forms",
                "de": "Stufe 2: Erweiterte Formen"
              },
              "description": "Übe erweiterte Akkusativ-Endungen mit komplexeren Sätzen",
              "description_i18n": {
                "en": "Practice extended accusative case endings with more complex sentences",
                "de": "Übe erweiterte Akkusativ-Endungen mit komplexeren Sätzen"
              },
              "durationMinutes": 4,
              "status": "available",
              "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ_a1_tier2_pattern-switch/drill.json"
            }
          ]
        },
        {
          "id": "contrast_pairs",
          "category": "Paare",
          "loopType": "contrast_pairs",
          "tiers": [
            {
              "id": "case_endings_akkusativ_a1_pairs_t1",
              "tier": 1,
              "level": "A1",
              "title": "Stufe 1: Kontrastpaare",
              "title_i18n": {
                "en": "Tier 1: Contrast Pairs",
                "de": "Stufe 1: Kontrastpaare"
              },
              "description": "Übe Akkusativ-Endungen durch Kontrastpaare",
              "description_i18n": {
                "en": "Practice accusative case endings through contrast pairs",
                "de": "Übe Akkusativ-Endungen durch Kontrastpaare"
              },
              "durationMinutes": 3,
              "status": "available",
              "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ_a1_tier1_contrast-pairs/drill.json"
            }
          ]
        }
      ]
    }
  ]
}
```

**Note**: `title` and `category` are workspace-language only (German for "de" workspace, no i18n). `description` and tier `title` support i18n.

**This completely replaces what you have now.**

---

## 7. Content Mapping Rules (Very Important)

### How BE builds tiers from raw content

BE may internally have:
- 20 prompt rows
- 50 sentence variants
- multiple JSON files

**FE must never see this.**

### BE responsibilities

- Group by mechanic
- Group by loopType (category)
- Bucket by tier within each category
- Compute `durationMinutes` (rounded)
- Emit exactly one DrillTier per tier per category
- Generate unique tier titles (not repeating drill group title)
- Generate tier descriptions explaining what user learns

---

## 8. Ordering & Stability Guarantees

### Required guarantees

- `order` is stable across releases
- Tier numbering never shifts
- Tier IDs never change once shipped

### Why

- Analytics
- E2E tests
- User muscle memory
- Cached content safety

---

## 9. i18n (Forward-Compatible, No FE Break)

### Workspace Language Rules

**Important**: Titles and category names are workspace-language only (no i18n). Descriptions and tier titles support i18n.

### DrillGroup i18n

```json
{
  "title": "Akkusativ-Endungen",
  "description": "Übe Akkusativ-Endungen (den, die, das, einen, eine)",
  "description_i18n": {
    "en": "Practice accusative case endings (den, die, das, einen, eine)",
    "de": "Übe Akkusativ-Endungen (den, die, das, einen, eine)"
  }
}
```

### Rules

- `title` = workspace language only (no i18n) - e.g., German for "de" workspace
- `description` = workspace language (from `description_i18n[workspaceLang]` or fallback)
- `description_i18n` = optional but recommended for full localization
- Workspace language mapping:
  - `"de"` → German
  - Default to English if workspace language unknown
  - Document this mapping for future workspaces

### DrillCategory i18n

```json
{
  "category": "Muster"
}
```

### Rules

- `category` = workspace language only (no i18n)
- Category labels map to workspace language (e.g., "Muster" for German, "Pattern" for English)

### DrillTier i18n

```json
{
  "title": "Stufe 1: Grundformen",
  "title_i18n": {
    "en": "Tier 1: Basic Forms",
    "de": "Stufe 1: Grundformen"
  },
  "description": "Übe die Grundformen der Akkusativ-Endungen mit einfachen Sätzen",
  "description_i18n": {
    "en": "Practice basic accusative case endings with simple sentences",
    "de": "Übe die Grundformen der Akkusativ-Endungen mit einfachen Sätzen"
  }
}
```

### Rules

- `title` = workspace language (from `title_i18n[workspaceLang]` or fallback)
- `title_i18n` = optional but recommended for full localization
- `description` = workspace language (from `description_i18n[workspaceLang]` or fallback)
- `description_i18n` = optional but recommended for full localization

---

## 10. Explicit Anti-Patterns (Ban These)

BE must never return:

- ❌ `A1 · Case Endings: Akkusativ: A1 (Tier 1)`
- ❌ duplicated tier rows
- ❌ drill rows with same title repeated
- ❌ content IDs exposed to FE
- ❌ titles containing tier or level info

**If FE needs to parse strings → BE failed.**

---

## 11. Schema Reference

### DrillGroup Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Stable mechanic identifier (kebab-case) |
| `kind` | string | Yes | Must be `"drill_group"` |
| `mechanic` | string | Yes | Mechanic type identifier |
| `title` | string | Yes | What am I practicing (workspace language only, no i18n) |
| `subtitle` | string | No | Optional, 1 line max |
| `description` | string | Yes | What the user will learn (workspace language from i18n) |
| `estimatedDuration` | string | Yes | Human-friendly range (e.g., "3–5 min") |
| `order` | number | Yes | Stable ordering across releases |
| `categories` | DrillCategory[] | Yes | Array of categories (replaces flat `tiers`) |
| `description_i18n` | object | No | `{ "en": "...", "de": "..." }` |

### DrillCategory Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | LoopType identifier (e.g., "pattern_switch") |
| `category` | string | Yes | Human-readable label (workspace language only, no i18n) |
| `loopType` | string | Yes | Raw loopType value for programmatic use |
| `tiers` | DrillTier[] | Yes | Array of tiers for this category |

### DrillTier Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Stable tier identifier |
| `tier` | number | Yes | Numeric tier (1, 2, 3…) |
| `level` | string | Yes | CEFR level (A1, A2, B1, etc.) |
| `title` | string | Yes | Unique, descriptive title (NOT repeating drill group title) |
| `title_i18n` | object | No | `{ "en": "...", "de": "..." }` |
| `description` | string | Yes | What user learns in this tier (workspace language from i18n) |
| `description_i18n` | object | No | `{ "en": "...", "de": "..." }` |
| `durationMinutes` | number | Yes | Estimated duration in minutes |
| `status` | string | Yes | `"available"`, `"locked"`, `"completed"` |
| `entryUrl` | string | Yes | Direct URL to voice session |

### Response Schema

```json
{
  "drillGroups": DrillGroup[]
}
```

---

## 12. Migration Notes

### What This Replaces

This spec replaces:
- `/v1/workspaces/{ws}/mechanics/index.json`
- `/v1/workspaces/{ws}/mechanics/{mechanicId}/index.json`
- Individual drill row exposure in any index

### Backward Compatibility

- Existing drill entry URLs (`/v1/workspaces/{ws}/drills/{drillId}/drill.json`) remain unchanged
- Voice session URLs remain unchanged
- Only the listing/discovery endpoint changes

---

## 13. Implementation Checklist

### BE Must

- [ ] Aggregate all drills by `mechanicId`
- [ ] Group drills within mechanic by `loopType` (category)
- [ ] Group drills within category by `difficultyTier`
- [ ] Compute `durationMinutes` from `estimatedMinutes` (round appropriately)
- [ ] Generate stable `order` values per mechanic
- [ ] Generate stable tier IDs (never change once shipped)
- [ ] Remove level/tier from DrillGroup titles
- [ ] Use workspace language for DrillGroup `title` (no i18n)
- [ ] Use workspace language for DrillCategory `category` (no i18n)
- [ ] Generate unique tier titles (NOT repeating drill group title)
- [ ] Generate tier descriptions explaining what user learns
- [ ] Ensure exactly one DrillTier per tier per category
- [ ] Build `entryUrl` pointing to drill file
- [ ] Support `description_i18n` for DrillGroup
- [ ] Support `title_i18n` and `description_i18n` for DrillTier

### FE Must

- [ ] Never parse titles to extract level/tier
- [ ] Never access raw drill content rows
- [ ] Display DrillGroups in `order`
- [ ] Display categories within each group
- [ ] Display tiers within each category
- [ ] Use `entryUrl` to launch voice sessions
- [ ] Handle `status` for future gating
- [ ] Use workspace language for `title` and `category` (no i18n needed)
- [ ] Use i18n for `description` and tier `title` (check `*_i18n` fields)

---

## 14. Examples

### Example 1: Single Mechanic, Multiple Tiers

```json
{
  "drillGroups": [
    {
      "id": "verb_present_tense",
      "kind": "drill_group",
      "mechanic": "verb_conjugation",
      "title": "Present Tense Verbs",
      "subtitle": "Master verb conjugations",
      "description": "Practice present tense verb forms",
      "estimatedDuration": "4–6 min",
      "order": 1,
      "tiers": [
        {
          "id": "verb_present_tense_t1",
          "tier": 1,
          "level": "A1",
          "durationMinutes": 4,
          "status": "available",
          "entryUrl": "/v1/workspaces/de/drills/verb_present_tense/tier-1/session.json"
        },
        {
          "id": "verb_present_tense_t2",
          "tier": 2,
          "level": "A1",
          "durationMinutes": 5,
          "status": "available",
          "entryUrl": "/v1/workspaces/de/drills/verb_present_tense/tier-2/session.json"
        }
      ]
    }
  ]
}
```

### Example 2: Multiple Mechanics

```json
{
  "drillGroups": [
    {
      "id": "case_endings_akkusativ",
      "kind": "drill_group",
      "mechanic": "case_endings",
      "title": "Akkusativ Case Endings",
      "subtitle": "Direct object noun endings",
      "estimatedDuration": "3–5 min",
      "order": 10,
      "tiers": [
        {
          "id": "case_endings_akkusativ_t1",
          "tier": 1,
          "level": "A1",
          "durationMinutes": 3,
          "status": "available",
          "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ/tier-1/session.json"
        }
      ]
    },
    {
      "id": "modal_verbs",
      "kind": "drill_group",
      "mechanic": "modal_verbs",
      "title": "Modal Verbs",
      "subtitle": "Can, must, want",
      "description": "Practice must, should, could, would.",
      "estimatedDuration": "5–7 min",
      "order": 20,
      "tiers": [
        {
          "id": "modal_verbs_t1",
          "tier": 1,
          "level": "A1",
          "durationMinutes": 5,
          "status": "available",
          "entryUrl": "/v1/workspaces/de/drills/modal_verbs/tier-1/session.json"
        },
        {
          "id": "modal_verbs_t2",
          "tier": 2,
          "level": "A1",
          "durationMinutes": 6,
          "status": "available",
          "entryUrl": "/v1/workspaces/de/drills/modal_verbs/tier-2/session.json"
        }
      ]
    }
  ]
}
```

---

## 15. FAQ

### Q: What if a mechanic has drills at different levels?

A: BE should group by mechanic first, then by tier. If a mechanic has A1 and A2 drills, they should be separate DrillGroups or the BE should decide how to handle this (spec doesn't prescribe, but stability is key).

### Q: Can a DrillGroup have tiers from different levels?

A: The spec shows `level` on DrillTier, not DrillGroup. So yes, a single DrillGroup could have tiers at A1, A2, etc. BE decides the grouping strategy, but must maintain stability.

### Q: What about pagination?

A: Spec doesn't mention pagination. If needed, BE should add it following standard patterns, but the core shape remains: `{ drillGroups: [...] }`.

### Q: How does this relate to the existing mechanics indexes?

A: This replaces them. The old `/mechanics/` endpoints are superseded by this single `/drills` endpoint.

---

## 16. Validation Rules

### BE Validation

- Each DrillGroup must have at least one category
- Each category must have at least one tier
- Tier IDs must be unique within a workspace
- `order` must be stable (same mechanic always gets same order)
- `entryUrl` must be a valid drill file URL pattern
- `title` must not contain level or tier information
- `title` must be in workspace language only (no i18n)
- `category` must be in workspace language only (no i18n)
- Tier `title` must NOT repeat drill group title
- Tier `title` must be unique and descriptive
- Tier `description` must explain what user learns
- `estimatedDuration` must be human-readable range format

### FE Validation

- Must not attempt to parse level/tier from titles
- Must not access drill content directly
- Must use `entryUrl` as-is (no URL construction)

---

**End of Spec**

