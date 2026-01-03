# Drill Schema v4

This document defines the Drill v4 schema for GetVerba content pipeline.

## Overview

Drills v4 train exactly ONE mechanical struggle (the "muscle"). Unlike Context packs (which train situations), drills focus on discrete grammar mechanics with deterministic grouping, loop types, and difficulty tiers.

## Key Principles

- **One struggle per drill**: Each drill trains exactly one mechanic
- **Authoritative grouping**: Backend groups drills by mechanic + difficulty + loop
- **Deterministic metadata**: "Why this drill works" is computed and validated
- **No ML, no cloud compute**: Everything is static content + local client metrics

## API Endpoints

### Mechanics Index
```
GET /v1/workspaces/{workspace}/mechanics/index.json
```

Returns a list of mechanic groups, each with an `itemsUrl` pointing to per-mechanic drill indexes.

### Per-Mechanic Drill Index
```
GET /v1/workspaces/{workspace}/mechanics/{mechanicId}/index.json
GET /v1/workspaces/{workspace}/mechanics/{mechanicId}/pages/{n}.json
```

Returns a paginated index of drills for a specific mechanic. See [PAGINATION_CONTRACT.md](./PAGINATION_CONTRACT.md) for pagination details.

### Drill Entry Document
```
GET /v1/workspaces/{workspace}/drills/{drillId}/drill.json
```

Returns the full drill entry document.

## Drill Entry Schema v4

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Must be `1` |
| `id` | string | Unique drill identifier (kebab-case) |
| `kind` | string | Must be `"drill"` |
| `drillVersion` | string | Must be `"v4"` |
| `workspace` | string | Workspace identifier (e.g., "de") |
| `language` | string | Language code (e.g., "de", "en") |
| `level` | string | CEFR level: `"A1"`, `"A2"`, `"B1"`, `"B2"`, `"C1"`, `"C2"` |
| `title` | string | Full title (stable, descriptive) |
| `shortTitle` | string | Card title (max 28 chars) |
| `subtitle` | string | 40-60 chars max (tight description) |
| `estimatedMinutes` | number | Expected duration (2-6 minutes) |
| `mechanicId` | string | Stable mechanic identifier (kebab-case) |
| `mechanicLabel` | string | Human-readable mechanic name |
| `loopType` | string | Loop type enum (see below) |
| `difficultyTier` | number | Cognitive load tier: `1`, `2`, or `3` |
| `variationSlots` | array | Array of slot enums (required, non-empty) |
| `sessionPlan` | object | Session plan v1 (required) |
| `prompts` OR `promptsUrl` | array/string | Prompts array or URL to external file |
| `analytics` | object | Analytics metadata (required, deterministic) |
| `provenance` | object | Provenance metadata (required for generated) |
| `review` | object | Review status (required for generated) |
| `contentId` | string | Telemetry identifier: `{workspace}:drill:{id}` |
| `contentHash` | string | SHA256 hash (64 hex chars) |
| `revisionId` | string | First 12 chars of contentHash |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `title_i18n` | object | Internationalized titles: `{ "en": "..." }` |
| `subtitle_i18n` | object | Internationalized subtitles |
| `tags` | array | Filter tags (string[]) |
| `register` | string | Formality: `"formal"`, `"neutral"`, `"informal"` |
| `primaryStructure` | string | Primary grammatical structure identifier |

### Loop Types (enum)

| Value | Description |
|-------|-------------|
| `pattern_switch` | Rapid switching between 2-4 patterns |
| `slot_substitution` | Single template; swap 1-3 slots |
| `micro_transform` | Rewrite: statement→question / present→past / affirmative→negative |
| `fast_recall` | Prompt → immediate response; strict gating |
| `contrast_pairs` | Minimal pairs, e.g., "ich gehe" vs "du gehst" |
| `error_trap` | High-frequency confusion traps; deterministic |

### Variation Slots (enum)

Allowed values:
- `subject`
- `verb`
- `object`
- `modifier`
- `tense`
- `polarity`
- `time`
- `location`

### Session Plan Schema

Same as pack sessionPlan v1:

```json
{
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "step-id",
        "title": "Step Title",
        "promptIds": ["prompt-001", "prompt-002"],
        "title_i18n": { "en": "Step Title" }
      }
    ]
  }
}
```

### Analytics Schema (Required)

```json
{
  "analytics": {
    "version": 1,
    "mechanicId": "verb_present_tense",
    "loopType": "pattern_switch",
    "targetStructures": ["present_tense_conjugation"],
    "variationSlots": ["subject", "verb"],
    "coverage": {
      "verbs": ["spielen", "lernen", "arbeiten"],
      "patterns": ["ich -e", "du -st", "er -t"]
    },
    "difficultyTier": 1,
    "recommendedReps": 2,
    "estPromptCount": 8,
    "timeboxMinutes": 4,
    "qualitySignals": {
      "tokenHitsCount": 8,
      "multiSlotRate": 1.0,
      "uniqueVerbCount": 3,
      "uniqueSubjectCount": 6,
      "trapPairCount": 0,
      "bannedPhraseCheckPassed": true
    }
  }
}
```

### Provenance Schema (Required for Generated)

```json
{
  "provenance": {
    "source": "template",
    "sourceRef": "mechanics/verb_present_tense",
    "extractorVersion": "v4.0.0",
    "generatedAt": "2026-01-02T12:00:00Z"
  }
}
```

### Review Schema (Required for Generated)

```json
{
  "review": {
    "status": "needs_review",
    "reviewer": null,
    "reviewedAt": null
  }
}
```

## Mechanics Index Schema

```json
{
  "version": "v1",
  "kind": "mechanics_index",
  "total": 6,
  "mechanics": [
    {
      "id": "verb_present_tense",
      "title": "Verb Present Tense",
      "subtitle": "Master present tense conjugations",
      "itemsUrl": "/v1/workspaces/de/mechanics/verb_present_tense/index.json",
      "order": 1,
      "levelRange": ["A1", "A2"],
      "tags": ["verbs", "conjugation"]
    }
  ]
}
```

## Per-Mechanic Drill Index Schema

```json
{
  "version": "v1",
  "kind": "mechanic_drills",
  "mechanicId": "verb_present_tense",
  "title": "Verb Present Tense",
  "total": 3,
  "pageSize": 20,
  "items": [
    {
      "id": "verb_present_tense_a1_tier1",
      "kind": "drill",
      "entryUrl": "/v1/workspaces/de/drills/verb_present_tense_a1_tier1/drill.json",
      "shortTitle": "Present Tense Basics",
      "subtitle": "Ich, du, er forms",
      "level": "A1",
      "estimatedMinutes": 4,
      "loopType": "pattern_switch",
      "difficultyTier": 1,
      "orderInGroup": 1,
      "tags": ["verbs", "conjugation"]
    }
  ],
  "nextPage": null
}
```

## Validation Rules

1. **drillVersion**: Must be exactly `"v4"`
2. **shortTitle**: Max 28 characters
3. **subtitle**: 40-60 characters
4. **estimatedMinutes**: 2-6 minutes
5. **difficultyTier**: Must be 1, 2, or 3
6. **loopType**: Must be one of the enum values
7. **variationSlots**: Must be non-empty array
8. **sessionPlan**: Required when prompts/promptsUrl present
9. **analytics**: Required with all specified fields
10. **provenance**: Required for generated drills
11. **review**: Required for generated drills, defaults to `"needs_review"`

## Quality Gates

Drills must pass:
1. Generic phrase denylist (drill-specific)
2. Mechanic token requirements (each prompt contains >=1 token from mechanic dictionary)
3. Variation requirement (>=30% of transitions have 2+ slotsChanged)
4. Coverage requirement (e.g., uniqueVerbCount >= N for verb drills)
5. SessionPlan coherence (all promptIds exist)
6. Title integrity (shortTitle unique within mechanicId + level)
7. Dedupe (no duplicate prompts across workspace)

## Example Drill Entry v4

```json
{
  "schemaVersion": 1,
  "id": "verb_present_tense_a1_tier1",
  "kind": "drill",
  "drillVersion": "v4",
  "workspace": "de",
  "language": "de",
  "level": "A1",
  "title": "Verb Endings: Present Tense Basics (A1)",
  "shortTitle": "Present Tense Basics",
  "subtitle": "Ich, du, er forms - rapid pattern switching",
  "estimatedMinutes": 4,
  "mechanicId": "verb_present_tense",
  "mechanicLabel": "Verb Present Tense",
  "loopType": "pattern_switch",
  "difficultyTier": 1,
  "variationSlots": ["subject", "verb"],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "ich-du-forms",
        "title": "Ich & Du Forms",
        "promptIds": ["prompt-001", "prompt-002"]
      }
    ]
  },
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich spiele Fußball.",
      "intent": "practice",
      "gloss_en": "I am practicing verb conjugation.",
      "natural_en": "I play soccer.",
      "slotsChanged": ["subject", "verb"],
      "slots": {
        "subject": ["Ich"],
        "verb": ["spiele"]
      }
    }
  ],
  "analytics": {
    "version": 1,
    "mechanicId": "verb_present_tense",
    "loopType": "pattern_switch",
    "targetStructures": ["present_tense_conjugation"],
    "variationSlots": ["subject", "verb"],
    "coverage": {
      "verbs": ["spielen", "lernen"],
      "patterns": ["ich -e", "du -st"]
    },
    "difficultyTier": 1,
    "recommendedReps": 2,
    "estPromptCount": 8,
    "timeboxMinutes": 4,
    "qualitySignals": {
      "tokenHitsCount": 8,
      "multiSlotRate": 1.0,
      "uniqueVerbCount": 2,
      "uniqueSubjectCount": 6,
      "trapPairCount": 0,
      "bannedPhraseCheckPassed": true
    }
  },
  "provenance": {
    "source": "template",
    "sourceRef": "mechanics/verb_present_tense",
    "extractorVersion": "v4.0.0",
    "generatedAt": "2026-01-02T12:00:00Z"
  },
  "review": {
    "status": "needs_review"
  },
  "contentId": "de:drill:verb_present_tense_a1_tier1",
  "contentHash": "...",
  "revisionId": "..."
}
```

