# Drills Schema

This document describes the schema for drill content entries.

## Overview

Drills are interactive grammar and vocabulary exercises that test specific language mechanics. Unlike packs (which focus on conversational context), drills focus on discrete grammar rules, conjugations, and patterns.

## Canonical Entry URL

```
/v1/workspaces/{workspace}/drills/{drillId}/drill.json
```

**Example:**
```
/v1/workspaces/de/drills/verb_endings_a1/drill.json
```

## Drill Entry Document Schema

```json
{
  "id": "verb_endings_a1",           // Required: unique identifier
  "kind": "drill",                    // Required: must be "drill"
  "title": "Verb Endings - A1",       // Required: display title
  "level": "A1",                      // Optional: CEFR level (A1, A2, B1, B2, C1, C2)
  "estimatedMinutes": 10,             // Required: expected completion time
  "description": "Practice verb...",  // Optional: longer description
  "instructions": "Complete...",      // Optional: how to complete the drill
  "exercises": [...],                 // Optional: array of exercise objects
  "passingScore": 80,                 // Optional: minimum score to pass (percentage)
  "tags": ["grammar", "verbs"]        // Optional: tags for filtering
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier matching the folder name |
| `kind` | string | Must be `"drill"` |
| `title` | string | Display title for the drill |
| `estimatedMinutes` | number | Expected time to complete in minutes |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `level` | string | CEFR level (A1, A2, B1, B2, C1, C2) |
| `description` | string | Longer description of the drill content |
| `instructions` | string | Instructions for completing the drill |
| `exercises` | array | Array of exercise objects (see below) |
| `passingScore` | number | Minimum percentage to pass (0-100) |
| `tags` | array | Array of tag strings for filtering |

## Exercise Schema

Exercises are the individual questions/tasks within a drill.

```json
{
  "id": "ex-001",
  "type": "fill-blank",
  "prompt": "Ich ___ (spielen) Fußball.",
  "answer": "spiele",
  "hint": "ich → -e"
}
```

### Exercise Types

| Type | Description |
|------|-------------|
| `fill-blank` | User fills in the blank in a sentence |
| `multiple-choice` | User selects from multiple options |
| `translation` | User translates a phrase |
| `matching` | User matches items between two lists |

### Exercise Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique exercise ID within the drill |
| `type` | string | Yes | Exercise type (see above) |
| `prompt` | string | Yes | The question or sentence |
| `answer` | string | Yes | The correct answer |
| `options` | array | For multiple-choice | Available options |
| `hint` | string | No | Optional hint for the user |

## Section Index Schema

Drills are exposed via a section index in the catalog.

### Catalog Section

```json
{
  "id": "mechanics",
  "kind": "drills",
  "title": "Mechanics Drills",
  "itemsUrl": "/v1/workspaces/de/mechanics/index.json"
}
```

### Index File

```json
{
  "version": "v1",
  "kind": "drills",
  "total": 2,
  "pageSize": 20,
  "items": [
    {
      "id": "verb_endings_a1",
      "kind": "drill",
      "title": "Verb Endings - Present Tense",
      "level": "A1",
      "durationMinutes": 10,
      "entryUrl": "/v1/workspaces/de/drills/verb_endings_a1/drill.json"
    }
  ],
  "nextPage": null
}
```

### Index Item Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Drill ID (matches folder name) |
| `kind` | string | Yes | Must be `"drill"` |
| `title` | string | Yes | Display title |
| `level` | string | Yes | CEFR level |
| `durationMinutes` | number | No | Estimated time |
| `entryUrl` | string | Yes | Canonical URL to drill.json |

## File Structure

```
content/v1/workspaces/de/
├── catalog.json              # Includes mechanics section
├── mechanics/
│   └── index.json            # Lists all drills
└── drills/
    ├── verb_endings_a1/
    │   └── drill.json
    └── dative_case_a1/
        └── drill.json
```

## Validation Rules

The validator enforces:

1. **Entry URL pattern**: Must match `/v1/workspaces/{ws}/drills/{id}/drill.json`
2. **ID matching**: Entry URL ID must match item ID
3. **Required fields**: `id`, `kind`, `title`, `estimatedMinutes`
4. **Kind validation**: Must be `"drill"` (case-insensitive)

## Frontend Usage

```typescript
// Fetch drill entry
const response = await fetch(`${BASE_URL}/v1/workspaces/de/drills/verb_endings_a1/drill.json`);
const drill = await response.json();

// Render exercises
drill.exercises.forEach(exercise => {
  switch (exercise.type) {
    case 'fill-blank':
      renderFillBlank(exercise);
      break;
    case 'multiple-choice':
      renderMultipleChoice(exercise);
      break;
  }
});
```

## Example Drill Entry

```json
{
  "id": "verb_endings_a1",
  "kind": "drill",
  "title": "Verb Endings - Present Tense",
  "level": "A1",
  "estimatedMinutes": 10,
  "description": "Practice regular verb conjugations in the present tense.",
  "instructions": "Complete each sentence with the correct verb form.",
  "exercises": [
    {
      "id": "ex-001",
      "type": "fill-blank",
      "prompt": "Ich ___ (spielen) Fußball.",
      "answer": "spiele",
      "hint": "ich → -e"
    },
    {
      "id": "ex-002",
      "type": "multiple-choice",
      "prompt": "Which is correct: 'Er ___ Deutsch'?",
      "options": ["lernen", "lernt", "lerne", "lernst"],
      "answer": "lernt"
    }
  ],
  "passingScore": 80,
  "tags": ["grammar", "verbs", "conjugation"]
}
```

