# Session Plan Schema

This document defines the canonical schema for session plans within Pack entry documents.

## Schema Version

Session plans use `version: 1`.

## Structure

```json
{
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "step-id",
        "title": "Step Title",
        "promptIds": ["prompt-001", "prompt-002"]
      }
    ]
  }
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Must be `1` |
| `steps` | array | Array of step objects (non-empty) |

## Step Object

Each step in `steps` must have:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique step identifier (kebab-case) |
| `title` | string | Step title |
| `promptIds` | array | Array of prompt IDs (non-empty, strings) |

## Validation Rules

1. **Version**: Must be exactly `1`
2. **Steps**: Must be a non-empty array
3. **Step IDs**: Must be unique within the session plan
4. **Prompt IDs**: All referenced `promptIds` must exist in the pack's `prompts` array
5. **Outline Alignment**: `outline.length` should match `steps.length` (warning if mismatch)

## Relationship to Primary Structure

The session plan should align with the pack's `primaryStructure` (if present):

- Steps should progressively build understanding of the primary structure
- The sequence should reinforce the grammatical concept declared in `primaryStructure`
- Steps can be organized to scaffold from simple to complex applications

**Example:**

```json
{
  "primaryStructure": {
    "id": "verb-second-position",
    "label": "Verb position in main clauses"
  },
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "intro",
        "title": "Introduction: Basic word order",
        "promptIds": ["prompt-001", "prompt-002"]
      },
      {
        "id": "practice",
        "title": "Practice: Verb second rule",
        "promptIds": ["prompt-003", "prompt-004"]
      },
      {
        "id": "application",
        "title": "Application: Complex sentences",
        "promptIds": ["prompt-005"]
      }
    ]
  }
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
      "audioUrl": "/v1/audio/restaurant_conversations/prompt-001.mp3"
    },
    {
      "id": "prompt-002",
      "text": "Können wir die Speisekarte sehen?",
      "translation": "Can we see the menu?",
      "audioUrl": "/v1/audio/restaurant_conversations/prompt-002.mp3"
    }
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "reservation",
        "title": "Making a Reservation",
        "promptIds": ["prompt-001"]
      },
      {
        "id": "ordering",
        "title": "Ordering Food",
        "promptIds": ["prompt-002"]
      }
    ]
  }
}
```

## Best Practices

1. **Step Progression**: Steps should build on each other logically
2. **Prompt Distribution**: Distribute prompts evenly across steps
3. **Title Clarity**: Step titles should clearly indicate the learning objective
4. **Primary Structure Alignment**: Steps should reinforce the pack's primary structure
5. **Outline Consistency**: `outline` array should match `steps` structure

## Related Documentation

- [Pack Schema](./PACK_SCHEMA.md)
- [Schema Compatibility Policy](./SCHEMA_COMPATIBILITY.md)

