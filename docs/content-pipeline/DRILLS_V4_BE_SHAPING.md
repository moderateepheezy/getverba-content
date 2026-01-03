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

### Hierarchy (exactly 3 levels)

```
Drills Tab
└── DrillGroup (mechanic)
    └── DrillTier (intensity / progression)
        └── VoiceSession (existing)
```

**There is no 4th level.**  
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
  "mechanic": "case_endings",
  "title": "Akkusativ Case Endings",
  "subtitle": "Direct object noun endings",
  "description": "Practice must, should, could, would.",
  "estimatedDuration": "3–5 min",
  "tiers": [ ... ],
  "order": 10
}
```

### Rules

- `title` = what am I practicing
- `subtitle` = optional, 1 line max
- `description` = what the user will learn (required, supports i18n)
- `estimatedDuration` = human-friendly range
- `order` = stable ordering across releases

### ❌ Banned

- ❌ No levels
- ❌ No tiers in title
- ❌ No A1/A2 here

---

## 4. DrillTier (Runnable Unit)

### Purpose

This is what the user actually starts.

### Shape

```json
{
  "id": "case_endings_akkusativ_t1",
  "tier": 1,
  "level": "A1",
  "durationMinutes": 3,
  "status": "available",
  "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ/tier-1/session.json"
}
```

### Rules

- One tier = one Start button
- `tier` is numeric (1,2,3…) — FE displays it
- `level` is metadata (A1/A2/B1)
- `entryUrl` launches the voice session directly
- `status` allows future gating (locked, completed)

### ❌ Banned

- ❌ No repeated rows
- ❌ No duplicated tiers
- ❌ No content IDs leaking

---

## 5. Full Example Response (Canonical)

```json
{
  "drillGroups": [
    {
      "id": "case_endings_akkusativ",
      "kind": "drill_group",
      "mechanic": "case_endings",
      "title": "Akkusativ Case Endings",
      "subtitle": "Direct object noun endings",
      "description": "Practice must, should, could, would.",
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
        },
        {
          "id": "case_endings_akkusativ_t2",
          "tier": 2,
          "level": "A1",
          "durationMinutes": 4,
          "status": "available",
          "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ/tier-2/session.json"
        },
        {
          "id": "case_endings_akkusativ_t3",
          "tier": 3,
          "level": "A1",
          "durationMinutes": 5,
          "status": "available",
          "entryUrl": "/v1/workspaces/de/drills/case_endings_akkusativ/tier-3/session.json"
        }
      ]
    }
  ]
}
```

**This completely replaces what you have now.**

---

## 6. Content Mapping Rules (Very Important)

### How BE builds tiers from raw content

BE may internally have:
- 20 prompt rows
- 50 sentence variants
- multiple JSON files

**FE must never see this.**

### BE responsibilities

- Group by mechanic
- Bucket by tier
- Compute `durationMinutes` (rounded)
- Emit exactly one DrillTier per tier

---

## 7. Ordering & Stability Guarantees

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

## 8. i18n (Forward-Compatible, No FE Break)

### DrillGroup supports

```json
{
  "title": "Akkusativ Case Endings",
  "title_i18n": {
    "en": "Akkusativ Case Endings",
    "de": "Akkusativ-Endungen",
    "ar": "نهايات حالة النصب"
  },
  "description": "Practice must, should, could, would.",
  "description_i18n": {
    "en": "Practice must, should, could, would.",
    "de": "Übe müssen, sollen, können, wollen.",
    "ar": "تدرب على يجب، ينبغي، يمكن، سوف"
  }
}
```

### Rules

- `title` = fallback
- `title_i18n` optional
- `description` = fallback (required)
- `description_i18n` optional but recommended for full localization
- FE does nothing special yet
- BE can ship English-only now

Same applies later to `subtitle`.

---

## 9. Explicit Anti-Patterns (Ban These)

BE must never return:

- ❌ `A1 · Case Endings: Akkusativ: A1 (Tier 1)`
- ❌ duplicated tier rows
- ❌ drill rows with same title repeated
- ❌ content IDs exposed to FE
- ❌ titles containing tier or level info

**If FE needs to parse strings → BE failed.**

---

## 10. Schema Reference

### DrillGroup Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Stable mechanic identifier (kebab-case) |
| `kind` | string | Yes | Must be `"drill_group"` |
| `mechanic` | string | Yes | Mechanic type identifier |
| `title` | string | Yes | What am I practicing (no level/tier) |
| `subtitle` | string | No | Optional, 1 line max |
| `description` | string | Yes | What the user will learn |
| `estimatedDuration` | string | Yes | Human-friendly range (e.g., "3–5 min") |
| `order` | number | Yes | Stable ordering across releases |
| `tiers` | DrillTier[] | Yes | Array of available tiers |
| `title_i18n` | object | No | `{ "en": "...", "de": "..." }` |
| `subtitle_i18n` | object | No | `{ "en": "...", "de": "..." }` |
| `description_i18n` | object | No | `{ "en": "...", "de": "..." }` |

### DrillTier Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Stable tier identifier |
| `tier` | number | Yes | Numeric tier (1, 2, 3…) |
| `level` | string | Yes | CEFR level (A1, A2, B1, etc.) |
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

## 11. Migration Notes

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

## 12. Implementation Checklist

### BE Must

- [ ] Aggregate all drills by `mechanicId`
- [ ] Group drills within mechanic by `difficultyTier`
- [ ] Compute `durationMinutes` from `estimatedMinutes` (round appropriately)
- [ ] Generate stable `order` values per mechanic
- [ ] Generate stable tier IDs (never change once shipped)
- [ ] Remove level/tier from DrillGroup titles
- [ ] Ensure exactly one DrillTier per tier per mechanic
- [ ] Build `entryUrl` pointing to voice session endpoint
- [ ] Support `title_i18n` and `subtitle_i18n` (optional for now)

### FE Must

- [ ] Never parse titles to extract level/tier
- [ ] Never access raw drill content rows
- [ ] Display DrillGroups in `order`
- [ ] Display tiers within each group
- [ ] Use `entryUrl` to launch voice sessions
- [ ] Handle `status` for future gating

---

## 13. Examples

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

## 14. FAQ

### Q: What if a mechanic has drills at different levels?

A: BE should group by mechanic first, then by tier. If a mechanic has A1 and A2 drills, they should be separate DrillGroups or the BE should decide how to handle this (spec doesn't prescribe, but stability is key).

### Q: Can a DrillGroup have tiers from different levels?

A: The spec shows `level` on DrillTier, not DrillGroup. So yes, a single DrillGroup could have tiers at A1, A2, etc. BE decides the grouping strategy, but must maintain stability.

### Q: What about pagination?

A: Spec doesn't mention pagination. If needed, BE should add it following standard patterns, but the core shape remains: `{ drillGroups: [...] }`.

### Q: How does this relate to the existing mechanics indexes?

A: This replaces them. The old `/mechanics/` endpoints are superseded by this single `/drills` endpoint.

---

## 15. Validation Rules

### BE Validation

- Each DrillGroup must have at least one tier
- Tier IDs must be unique within a workspace
- `order` must be stable (same mechanic always gets same order)
- `entryUrl` must be a valid voice session URL pattern
- `title` must not contain level or tier information
- `estimatedDuration` must be human-readable range format

### FE Validation

- Must not attempt to parse level/tier from titles
- Must not access drill content directly
- Must use `entryUrl` as-is (no URL construction)

---

**End of Spec**

