# Pack Entry Schema

This document defines the canonical schema for Pack entry documents (`pack.json`).

## Schema Version

All pack entries must include `schemaVersion: 1`.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Must be `1` |
| `id` | string | Unique pack identifier (kebab-case) |
| `kind` | string | Must be `"pack"` |
| `title` | string | Pack title (max 100 chars) |
| `level` | string | CEFR level: `A1`, `A2`, `B1`, `B2`, `C1`, or `C2` |
| `estimatedMinutes` | number | Estimated duration in minutes (1-120) |
| `description` | string | Pack description |
| `outline` | array | Array of outline step titles |
| `sessionPlan` | object | Session plan structure (see [SESSION_PLAN_SCHEMA.md](./SESSION_PLAN_SCHEMA.md)) |
| `scenario` | string | Content scenario identifier (3-40 chars, lowercase snake_case recommended) |
| `register` | string | Formality level: `"formal"`, `"neutral"`, or `"informal"` |
| `primaryStructure` | string | Primary grammatical structure identifier (3-60 chars, lowercase snake_case recommended) |
| `variationSlots` | string[] | Array of slot types that can be varied in prompts. Allowed values: `"subject"`, `"verb"`, `"object"`, `"modifier"`, `"tense"`, `"polarity"`, `"time"`, `"location"`. Must be non-empty. |
| `analytics` | object | Analytics metadata block (required). See [ANALYTICS_METADATA.md](./ANALYTICS_METADATA.md) for details. |

## Quality Gates

All packs must pass Content Quality Gates v1. See [QUALITY_GATES.md](./QUALITY_GATES.md) for detailed rules and examples.

**Quick Summary:**
- **Generic Template Denylist**: Hard fail if prompts contain generic template phrases
- **Multi-slot Variation**: Hard fail if <2 distinct verbs or <2 distinct subjects across prompts
- **Register Consistency**: Hard fail if `register === "formal"` but no prompts contain "Sie" or "Ihnen"
- **Concreteness Marker**: Hard fail if <2 prompts contain digits, currency, time, or weekday markers

## Optional Fields

### `prompts` (Optional)

Array of prompt objects for practice.

```json
{
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich gehe morgen zur Arbeit.",
      "intent": "inform",
      "register": "neutral",
      "gloss_en": "I'm going to work tomorrow.",
      "alt_de": "Morgen fahre ich ins Büro.",
      "audioUrl": "/v1/audio/pack-id/prompt-001.mp3",
      "slots": {
        "subject": ["Ich"],
        "verb": ["gehe"],
        "modifier": ["morgen"],
        "object": ["zur Arbeit"]
      }
    }
  ]
}
```

**Prompt Object Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique prompt identifier |
| `text` | string | ✅ | Prompt text (12-140 chars) |
| `intent` | string | ✅ | Intent category (enum: "greet", "request", "apologize", "inform", "ask", "confirm", "schedule", "order", "ask_price", "thank", "goodbye") |
| `register` | string | ❌ | Formality level (enum: "formal", "neutral", "informal", "casual"). Defaults to pack-level register if missing. |
| `gloss_en` | string | ✅ | Natural English meaning anchor (6-180 chars). Must be genuine English, not literal translation. |
| `natural_en` | string | ⚠️ | Native English paraphrase (6-180 chars). Required for `government_office` scenario or A2+ level. Optional but recommended for A1 non-government scenarios. Must be idiomatic English, not identical to `gloss_en`. |
| `alt_de` | string | ❌ | Optional native German paraphrase (6-240 chars). Should differ meaningfully from main prompt. |
| `translation` | string | ❌ | English translation (deprecated, use gloss_en instead) |
| `audioUrl` | string | ❌ | Audio file URL |
| `slots` | object | ❌ | Slot metadata (see below) |
| `slotsChanged` | string[] | ❌ | Array of slot types that differ from previous prompt in the same step. Values must be from `variationSlots`. Used for multi-slot variation enforcement. |

**Prompt Quality Guardrails:**

- **Min length**: 12 chars (hard fail)
- **Max length**: 140 chars (hard fail)
- **Verb-like token**: Warning if missing (staging), may fail in production later

**Slots Metadata (Optional):**

Enables multi-slot substitution for drills.

```json
{
  "slots": {
    "subject": ["Ich"],
    "verb": ["gehe"],
    "object": ["zur Arbeit"],
    "modifier": ["morgen"],
    "complement": []
  }
}
```

**Validation Rules:**
- Optional
- Allowed keys: `subject`, `verb`, `object`, `modifier`, `complement`
- Each slot value must be an array of strings
- Each slot string must be a substring of `text`
- No requirement to cover all words

**Purpose:**
- Enables multi-slot substitution
- Keeps drills from degenerating into chanting
- Zero engine impact today

### `microNotes` (Optional, Reserved)

Reserved for future "10-second explanation" escape hatch. Currently disabled by design.

```json
{
  "microNotes": [
    {
      "id": "note-verb-second",
      "text": "In German main clauses, the verb usually comes second."
    }
  ]
}
```

**Validation Rules:**
- Optional
- Max 240 chars per note
- No references from `sessionPlan`
- Cannot be required

**Purpose:**
- Supports the "10-second explanation" escape hatch
- Prevents explanation creep
- Avoids future schema migration

### `tags` (Optional)

Array of tag strings for categorization.

```json
{
  "tags": ["greetings", "basics", "conversation"]
}
```

## Complete Example

```json
{
  "id": "restaurant_conversations",
  "schemaVersion": 1,
  "kind": "pack",
  "title": "Restaurant Conversations",
  "level": "A2",
  "estimatedMinutes": 20,
  "description": "Master essential phrases for dining out in Germany.",
  "primaryStructure": {
    "id": "modal-verbs-requests",
    "label": "Modal verbs for polite requests"
  },
  "outline": [
    "Making a Reservation",
    "Ordering Food",
    "Asking Questions",
    "Paying the Bill"
  ],
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich hätte gern einen Tisch für zwei",
      "translation": "I would like a table for two",
      "audioUrl": "/v1/audio/restaurant_conversations/prompt-001.mp3",
      "slots": {
        "subject": ["Ich"],
        "verb": ["hätte"],
        "object": ["einen Tisch für zwei"]
      }
    }
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "reservation",
        "title": "Making a Reservation",
        "promptIds": ["prompt-001"]
      }
    ]
  },
  "microNotes": [
    {
      "id": "note-modal-verbs",
      "text": "Modal verbs like 'hätte' (would like) are used for polite requests in German."
    }
  ],
  "tags": ["restaurant", "conversation", "requests"]
}
```

## Related Documentation

- [Session Plan Schema](./SESSION_PLAN_SCHEMA.md)
- [Entry URL Schema](./ENTRY_URL_SCHEMA.md)
- [Schema Compatibility Policy](./SCHEMA_COMPATIBILITY.md)

