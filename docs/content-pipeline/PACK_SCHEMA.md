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

## Optional Fields

### `primaryStructure` (Optional, Encouraged)

Declares the primary grammatical structure or concept the pack trains.

```json
{
  "primaryStructure": {
    "id": "verb-second-position",
    "label": "Verb position in main clauses"
  }
}
```

**Validation Rules:**
- Optional but encouraged
- `id`: kebab-case string, max 40 chars
- `label`: string, max 80 chars

**Purpose:**
- Makes each pack's intent explicit
- Prevents "topic-only" packs from creeping in
- Enables future search, analytics, and QA

### `prompts` (Optional)

Array of prompt objects for practice.

```json
{
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich gehe morgen zur Arbeit.",
      "translation": "I go to work tomorrow.",
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
| `translation` | string | ❌ | English translation |
| `audioUrl` | string | ❌ | Audio file URL |
| `slots` | object | ❌ | Slot metadata (see below) |

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

