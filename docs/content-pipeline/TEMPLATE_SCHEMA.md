# Template Schema

This document defines the canonical schema for Pack Template documents (`{templateId}.json`).

## Schema Version

All template documents must include `schemaVersion: 1`.

## Purpose

Templates enable deterministic, scalable pack generation by defining:
- Scenario-specific content structure
- Slot dictionaries for multi-slot variation
- Generation rules for combining slots into prompts
- Step plans that map to session plans

**Important**: Templates are **dev-time only**. They are used to generate static JSON pack files. No runtime AI is involved.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Must be `1` |
| `id` | string | Unique template identifier (kebab-case) |
| `kind` | string | Must be `"template"` |
| `title` | string | Template title (max 100 chars) |
| `level` | string | CEFR level: `A1`, `A2`, `B1`, `B2`, `C1`, or `C2` |
| `scenario` | string | Content scenario identifier (3-40 chars, lowercase snake_case) |
| `register` | string | Formality level: `"formal"`, `"neutral"`, or `"informal"` |
| `primaryStructure` | string | Primary grammatical structure identifier (3-60 chars, lowercase snake_case) |
| `variationSlots` | string[] | Array of slot types that can be varied. Allowed values: `"subject"`, `"verb"`, `"object"`, `"modifier"`, `"tense"`, `"polarity"`, `"time"`, `"location"`. Must be non-empty. |
| `requiredScenarioTokens` | string[] | Array of scenario tokens that must be present in generated prompts. Must be a subset of the scenario's token dictionary used by quality gates. |
| `steps` | array | Array of step definitions (see below) |
| `slots` | object | Slot dictionary (see below) |
| `format` | object | Sentence assembly format (see below) |

## Step Definition

Each step in `steps` defines:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique step identifier (kebab-case) |
| `title` | string | Step title (maps to sessionPlan.steps[].title) |
| `promptCount` | number | Number of prompts to generate for this step (min 1) |
| `slots` | string[] | Allowed slot types for this step (subset of `variationSlots`) |

## Slot Dictionary

The `slots` object defines available values for each slot type:

```json
{
  "slots": {
    "subject": ["Ich", "Du", "Wir", "Sie"],
    "verb": ["gehe", "komme", "mache"],
    "object": ["zur Arbeit", "zum Büro", "zur Besprechung"],
    "modifier": ["morgen", "heute", "am Montag"],
    "time": ["um 9 Uhr", "um 14:30", "am Dienstag"],
    "location": ["im Büro", "im Meetingraum", "zu Hause"],
    "polarity": ["affirmative", "negative"],
    "tense": ["present", "past"]
  }
}
```

**Slot Types:**
- `subject`: Subject pronouns or nouns
- `verb`: Verb forms (conjugated appropriately)
- `object`: Direct/indirect objects
- `modifier`: Adverbs, adjectives, or modifying phrases
- `time`: Time expressions
- `location`: Location expressions
- `polarity`: Affirmative/negative markers (optional)
- `tense`: Tense markers (optional)

**Validation Rules:**
- At least one slot type must be defined
- Slot values must be non-empty strings
- Slot values should be scenario-appropriate (e.g., work scenario should use work-related vocabulary)

## Format Pattern

The `format` object defines how slots are combined into sentences:

```json
{
  "format": {
    "pattern": "{subject} {verb} {object} {time} {location}"
  }
```

**Pattern Syntax:**
- Use `{slotName}` to insert slot values
- Slots are optional in the pattern (missing slots are omitted)
- Whitespace is preserved between slots
- Pattern should produce grammatically correct German sentences

## Optional Fields

### `rules` (Optional)

Additional guardrails for generation:

```json
{
  "rules": {
    "minScenarioTokensPerPrompt": 2,
    "forbidPhrases": ["in today's lesson", "let's practice"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `minScenarioTokensPerPrompt` | number | Minimum number of scenario tokens required per prompt (default: 2) |
| `forbidPhrases` | string[] | Additional phrases to forbid in generated prompts (extends quality gate denylist) |

## Complete Example

```json
{
  "schemaVersion": 1,
  "id": "work_meetings_a2",
  "kind": "template",
  "title": "Work Meetings - A2",
  "level": "A2",
  "scenario": "work",
  "register": "formal",
  "primaryStructure": "modal_verbs_requests",
  "variationSlots": ["subject", "verb", "object", "time"],
  "requiredScenarioTokens": ["meeting", "manager", "schedule", "office"],
  "steps": [
    {
      "id": "greetings",
      "title": "Office Greetings",
      "promptCount": 2,
      "slots": ["subject", "verb", "time"]
    },
    {
      "id": "meetings",
      "title": "Meeting Phrases",
      "promptCount": 3,
      "slots": ["subject", "verb", "object", "time"]
    },
    {
      "id": "requests",
      "title": "Work Requests",
      "promptCount": 2,
      "slots": ["subject", "verb", "object"]
    }
  ],
  "slots": {
    "subject": ["Ich", "Wir", "Sie"],
    "verb": ["beginne", "vereinbare", "helfe", "bespreche"],
    "object": ["das Meeting", "einen Termin", "die Besprechung", "das Projekt"],
    "time": ["um 9 Uhr", "um 14:30", "am Montag", "am Dienstag"]
  },
  "format": {
    "pattern": "{subject} {verb} {object} {time}"
  },
  "rules": {
    "minScenarioTokensPerPrompt": 2,
    "forbidPhrases": []
  }
}
```

## Generation Rules

When generating packs from templates:

1. **Deterministic Generation**: Same template + same inputs = same output
2. **Cartesian Combinations**: Generate prompts by combining slot values
3. **Multi-slot Variation**: At least 30% of prompts must change 2+ slots (enforced via `slotsChanged`)
4. **Scenario Tokens**: Each prompt must contain at least 2 scenario tokens from `requiredScenarioTokens`
5. **Quality Gates**: Generated packs must pass all quality gates (generic denylist, register consistency, concreteness markers)

## Template Location

Templates are stored at:
```
content/v1/workspaces/{workspace}/templates/{templateId}.json
```

Example:
```
content/v1/workspaces/de/templates/work_meetings_a2.json
```

## Related Documentation

- [Pack Schema](./PACK_SCHEMA.md) - Generated pack structure
- [Quality Gates](./QUALITY_GATES.md) - Quality constraints for generated packs
- [Session Plan Schema](./SESSION_PLAN_SCHEMA.md) - Session plan structure

