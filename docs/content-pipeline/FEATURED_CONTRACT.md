# Featured / Home Hero Content Contract

This document defines the FeaturedV1 content contract that tells the app what to feature on Home (hero card + 2–4 secondary cards), deterministically, as data.

## Overview

The Featured contract provides a single, deterministic JSON entrypoint that answers: "What should Home show right now?" without frontend guessing or hardcoding IDs.

## Schema

### FeaturedV1

**Path**: `/v1/workspaces/{workspace}/featured/featured.json`

```json
{
  "version": 1,
  "workspace": "de",
  "generatedAt": "2025-12-31T00:00:00.000Z",
  "hero": {
    "kind": "track" | "pack" | "exam" | "drill",
    "titleOverride": "Optional",
    "subtitle": "Optional",
    "entryUrl": "/v1/workspaces/de/tracks/gov_office_a1_default/track.json",
    "cta": { "label": "Start", "action": "open_entry" }
  },
  "cards": [
    {
      "id": "gov-office-checklist",
      "kind": "pack" | "drill" | "exam" | "track",
      "titleOverride": "Optional",
      "entryUrl": "/v1/workspaces/de/packs/work_1/pack.json",
      "tag": "Optional short tag"
    }
  ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Must be `1` |
| `workspace` | string | Workspace identifier (e.g., "de") |
| `generatedAt` | string | ISO 8601 timestamp when featured.json was generated |
| `hero` | object | Hero card entry (required) |
| `hero.kind` | string | Entry kind: `"track"`, `"pack"`, `"exam"`, or `"drill"` |
| `hero.entryUrl` | string | Canonical entry URL (must match kind pattern) |
| `hero.cta` | object | Call-to-action button |
| `hero.cta.label` | string | Button label (e.g., "Start") |
| `hero.cta.action` | string | Must be `"open_entry"` |
| `cards` | array | Secondary cards (0-4 items) |
| `cards[].id` | string | Unique card identifier |
| `cards[].kind` | string | Entry kind: `"pack"`, `"drill"`, `"exam"`, or `"track"` |
| `cards[].entryUrl` | string | Canonical entry URL (must match kind pattern) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `hero.titleOverride` | string | Override entry title (UI copy control) |
| `hero.subtitle` | string | Hero subtitle text |
| `cards[].titleOverride` | string | Override entry title (UI copy control) |
| `cards[].tag` | string | Short tag for card (e.g., "Mechanics", "Assessment") |

## Validation Rules

1. **Required fields**: All required fields must be present and valid
2. **ISO dates**: `generatedAt` must be valid ISO 8601 format
3. **entryUrl existence**: All `entryUrl` values must resolve to existing files
4. **Kind match**: `entryUrl` pattern must match `kind`:
   - `pack` → `/v1/workspaces/{workspace}/packs/{id}/pack.json`
   - `exam` → `/v1/workspaces/{workspace}/exams/{id}/exam.json`
   - `drill` → `/v1/workspaces/{workspace}/drills/{id}/drill.json`
   - `track` → `/v1/workspaces/{workspace}/tracks/{id}/track.json`
5. **No duplicates**: No duplicate `entryUrl` across `hero` and `cards`
6. **Cards max length**: `cards` array must have 0-4 items
7. **Approval gate**: If referenced entry is generated content, it must have `review.status="approved"` (handcrafted entries are auto-approved)

## Generation Rules

The `generate-featured.ts` script selects content deterministically using these rules:

### Hero Selection

1. **Default for de workspace**: `gov_office_a1_default` track if it exists and is approved
2. **Fallback**: First approved pack in context section at A1/A2 (stable sorting: level → title → id)
3. **Last resort**: First approved drill at A1/A2 (stable sorting)

### Cards Selection

1. **Mechanics drills** (1-2): A1 drills that match hero scenario (if scenario match available)
2. **Context pack** (1): Pack from context at same level as hero (stable sorting)
3. **Exam** (0-1): Optional A1 exam (only if cards.length < 4)

### Stability

Selection is **deterministic** and **stable** across runs given the same content:
- Same inputs (workspace, content state) → same output
- Stable sorting: level (primary), title (secondary), id (tertiary)
- No random selection or LLM calls

## Examples

### Example 1: Track Hero with Supporting Cards

```json
{
  "version": 1,
  "workspace": "de",
  "generatedAt": "2025-12-31T00:00:00.000Z",
  "hero": {
    "kind": "track",
    "entryUrl": "/v1/workspaces/de/tracks/gov_office_a1_default/track.json",
    "cta": {
      "label": "Start",
      "action": "open_entry"
    }
  },
  "cards": [
    {
      "id": "drill-formal-address",
      "kind": "drill",
      "entryUrl": "/v1/workspaces/de/drills/formal_address_a1/drill.json",
      "tag": "Mechanics"
    },
    {
      "id": "pack-anmeldung",
      "kind": "pack",
      "entryUrl": "/v1/workspaces/de/packs/anmeldung_basics/pack.json",
      "tag": "Government Office"
    }
  ]
}
```

### Example 2: Pack Hero with Exam Card

```json
{
  "version": 1,
  "workspace": "de",
  "generatedAt": "2025-12-31T00:00:00.000Z",
  "hero": {
    "kind": "pack",
    "titleOverride": "Essential Work Conversations",
    "subtitle": "Master professional German for the office",
    "entryUrl": "/v1/workspaces/de/packs/work_1/pack.json",
    "cta": {
      "label": "Start",
      "action": "open_entry"
    }
  },
  "cards": [
    {
      "id": "pack-work-2",
      "kind": "pack",
      "entryUrl": "/v1/workspaces/de/packs/work_2/pack.json",
      "tag": "Work"
    },
    {
      "id": "exam-a1-level",
      "kind": "exam",
      "entryUrl": "/v1/workspaces/de/exams/a1_level_test/exam.json",
      "tag": "Assessment"
    }
  ]
}
```

## Generation

Generate featured.json for a workspace:

```bash
npm run content:generate-featured -- --workspace de
```

This creates:
- `content/v1/workspaces/de/featured/featured.json`

## Integration

### Frontend Usage

The frontend can fetch featured content:

```typescript
const response = await fetch('/v1/workspaces/de/featured/featured.json');
const featured = await response.json();

// Render hero
const hero = featured.hero;
// Render cards
const cards = featured.cards;
```

### Pipeline Integration

Featured generation is integrated into the content pipeline:

1. **Generate**: `npm run content:generate-featured -- --workspace de`
2. **Validate**: `npm run content:validate` (validates featured.json)
3. **Publish**: `./scripts/publish-content.sh` (uploads to R2)
4. **Smoke test**: `./scripts/smoke-test-content.sh` (tests featured.json endpoint)

## Determinism

The generator produces **identical output** across runs given the same content state:

- ✅ Same workspace + same content → same featured.json
- ✅ Stable sorting (level → title → id)
- ✅ No random selection
- ✅ No LLM calls
- ✅ Version-controlled output

This enables:
- Reproducible builds
- Predictable content selection
- Safe content updates

## Future Enhancements

Potential future enhancements (not in v1):

- A/B testing support (multiple featured variants)
- Time-based rotation (feature different content by date)
- User preference-based selection
- Analytics-driven selection (feature popular content)

