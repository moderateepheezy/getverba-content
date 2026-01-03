# Drills Schema

This document describes the schema for drill content entries.

## Overview

Drills are interactive grammar and vocabulary exercises that test specific language mechanics. Unlike packs (which focus on conversational context), drills focus on discrete grammar rules, conjugations, and patterns.

## API Endpoints

### Drills Index
```
GET /v1/workspaces/{workspace}/drills/index.json
```

Returns a paginated SectionIndex of all drills in the workspace.

### Drill Entry Document
```
GET /v1/workspaces/{workspace}/drills/{drillId}/drill.json
```

Returns the full drill entry document.

### Drill Prompts (Optional)
```
GET /v1/workspaces/{workspace}/drills/{drillId}/prompts.json
```

If the drill uses `promptsUrl` instead of inline prompts, this endpoint returns the prompts array.

## Canonical Entry URL Pattern

```
/v1/workspaces/{workspace}/drills/{drillId}/drill.json
```

**Example:**
```
/v1/workspaces/de/drills/verb_present_tense_a1/drill.json
```

## Drill Entry Document Schema

Drills support two content delivery modes:
1. **Prompts + SessionPlan** (for session engine playability, like packs)
2. **Exercises** (traditional quiz-style, for legacy/simple drills)

### Mode 1: Prompts + SessionPlan (Recommended for Session Engine)

```json
{
  "schemaVersion": 1,
  "id": "verb_present_tense_a1",
  "kind": "drill",
  "title": "Verb Endings: Present Tense (A1)",
  "level": "A1",
  "estimatedMinutes": 8,
  "description": "Master present tense verb conjugations...",
  "scenario": "mechanics",
  "register": "neutral",
  "primaryStructure": "present_tense_conjugation",
  "variationSlots": ["subject", "verb"],
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich spiele Fußball.",
      "intent": "practice",
      "natural_en": "I play soccer.",
      "slots": { "subject": ["Ich"], "verb": ["spiele"] }
    }
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      { "id": "step-1", "title": "Ich & Du Forms", "promptIds": ["prompt-001", "prompt-002"] }
    ]
  },
  "analytics": { ... },
  "title_i18n": { "en": "Verb Endings: Present Tense (A1)" }
}
```

### Mode 2: Exercises (Legacy/Simple)

```json
{
  "schemaVersion": 1,
  "id": "verb_endings_a1",
  "kind": "drill",
  "title": "Verb Endings - A1",
  "level": "A1",
  "estimatedMinutes": 10,
  "exercises": [
    { "id": "ex-001", "type": "fill-blank", "prompt": "Ich ___ (spielen) Fußball.", "answer": "spiele" }
  ],
  "passingScore": 80,
  "tags": ["grammar", "verbs"]
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Must be `1` |
| `id` | string | Unique identifier matching the folder name |
| `kind` | string | Must be `"drill"` |
| `title` | string | Display title for the drill |
| `estimatedMinutes` | number | Expected time to complete in minutes (1-120) |

## Content Delivery (MUST include at least one)

| Field | Type | Description |
|-------|------|-------------|
| `prompts` | array | Array of PromptEntry objects (same schema as packs) |
| `promptsUrl` | string | URL to external prompts.json file |
| `exercises` | array | Array of Exercise objects (legacy mode) |

**Note:** If `prompts` or `promptsUrl` is present, `sessionPlan` is REQUIRED for session engine playability.

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `level` | string | CEFR level (A1, A2, B1, B2, C1, C2) |
| `description` | string | Longer description of the drill content |
| `instructions` | string | Instructions for completing the drill |
| `scenario` | string | Content scenario (e.g., "mechanics", "work") |
| `register` | string | Formality level: "formal", "neutral", or "informal" |
| `primaryStructure` | string | Primary grammatical structure focus |
| `variationSlots` | array | Slot types for variation (subject, verb, etc.) |
| `outline` | array | Step titles for display |
| `passingScore` | number | Minimum percentage to pass (0-100) |
| `tags` | array | Array of tag strings for filtering |
| `analytics` | object | Analytics metadata (required for prompts-based drills) |
| `title_i18n` | object | Internationalized titles: `{ "en": "..." }` |
| `description_i18n` | object | Internationalized descriptions |

## SessionPlan Schema (Required when using prompts)

Same as pack sessionPlan. See [SESSION_PLAN_SCHEMA.md](./SESSION_PLAN_SCHEMA.md).

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

**Validation Rules:**
- `sessionPlan.version` must be `1`
- `sessionPlan.steps` must be a non-empty array
- Each step must have `id`, `title`, and non-empty `promptIds`
- Every `promptId` must exist in the `prompts` array (or in promptsUrl file)

## Exercise Schema (Legacy Mode)

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

Drills are exposed via a paginated section index following the SectionIndex contract.

### Drills Section in Catalog

```json
{
  "id": "drills",
  "kind": "drills",
  "title": "Speaking Drills",
  "itemsUrl": "/v1/workspaces/de/drills/index.json",
  "title_i18n": { "en": "Speaking Drills" }
}
```

### Index File (SectionIndex)

```json
{
  "version": "v1",
  "kind": "drills",
  "total": 5,
  "pageSize": 20,
  "items": [
    {
      "id": "verb_present_tense_a1",
      "kind": "drill",
      "title": "Verb Endings: Present Tense (A1)",
      "level": "A1",
      "durationMinutes": 8,
      "entryUrl": "/v1/workspaces/de/drills/verb_present_tense_a1/drill.json",
      "contentId": "de:drill:verb_present_tense_a1",
      "revisionId": "df88562851c8",
      "scenario": "mechanics",
      "register": "neutral",
      "primaryStructure": "present_tense_conjugation",
      "tags": ["grammar", "verbs", "conjugation"],
      "drillType": "conjugation",
      "cognitiveLoad": "low",
      "whyThisWorks": "Master present tense verb conjugation patterns..."
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
| `entryUrl` | string | Yes | Canonical URL to drill.json |
| `contentId` | string | Yes | Telemetry identifier: `{workspace}:drill:{id}` |
| `revisionId` | string | Yes | First 12 chars of contentHash |
| `level` | string | No | CEFR level (A1-C2) |
| `durationMinutes` | number | No | Estimated time in minutes |
| `scenario` | string | No | Content scenario |
| `register` | string | No | Formality level |
| `primaryStructure` | string | No | Grammar focus |
| `tags` | array | No | Filter tags |
| `drillType` | string | No | Analytics drill type |
| `cognitiveLoad` | string | No | "low", "medium", or "high" |
| `whyThisWorks` | string | No | Brief learning rationale |

### Pagination

Follows standard SectionIndex pagination contract:
- `nextPage`: URL to next page, or `null` if last page
- `total`: Total item count (invariant across pages)
- `pageSize`: Items per page (invariant across pages)

## File Structure

```
content/v1/workspaces/de/
├── catalog.json                    # Includes drills section
├── drills/
│   ├── index.json                  # Paginated SectionIndex
│   ├── verb_present_tense_a1/
│   │   └── drill.json              # Prompts + sessionPlan style
│   ├── office_greetings_quickfire_a1/
│   │   └── drill.json              # Prompts + sessionPlan style
│   └── verb_endings_a1/
│       └── drill.json              # Exercise-based style (legacy)
└── mechanics/
    └── index.json                  # Alternative section pointing to same drills
```

## Validation Rules

The validator enforces:

1. **Entry URL pattern**: Must match `/v1/workspaces/{ws}/drills/{id}/drill.json`
2. **ID matching**: Entry URL ID must match item ID
3. **Required fields**: `schemaVersion`, `id`, `kind`, `title`, `estimatedMinutes`
4. **Kind validation**: Must be `"drill"`
5. **Content delivery**: Must have at least one of: `prompts`, `promptsUrl`, or `exercises`
6. **SessionPlan requirement**: If `prompts` or `promptsUrl` is present, `sessionPlan` is required
7. **PromptId validation**: All `promptIds` in sessionPlan must exist in prompts array
8. **Analytics requirement**: Required for prompts-based drills

## Telemetry Identifiers

All drills must include:
- `contentId`: Format `{workspace}:drill:{id}` (e.g., `de:drill:verb_present_tense_a1`)
- `contentHash`: SHA256 hash of stable content (64 hex chars)
- `revisionId`: First 12 characters of contentHash

Use `npx tsx scripts/backfill-telemetry-ids.ts` to generate these automatically.

## Frontend Usage

### Session Engine (Prompts-based drills)

```typescript
// Fetch drill entry with sessionPlan
const response = await fetch(`${BASE_URL}/v1/workspaces/de/drills/verb_present_tense_a1/drill.json`);
const drill = await response.json();

// Use sessionPlan to drive the session engine
const { prompts, sessionPlan } = drill;

sessionPlan.steps.forEach(step => {
  console.log(`Step: ${step.title}`);
  const stepPrompts = step.promptIds.map(id => prompts.find(p => p.id === id));
  // Render each prompt for speaking practice
  stepPrompts.forEach(prompt => {
    renderSpeakingPrompt(prompt);
  });
});
```

### Exercise Mode (Legacy drills)

```typescript
// Fetch drill entry with exercises
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

## Example: Prompts-Based Drill (Recommended)

```json
{
  "schemaVersion": 1,
  "id": "verb_present_tense_a1",
  "kind": "drill",
  "title": "Verb Endings: Present Tense (A1)",
  "level": "A1",
  "estimatedMinutes": 8,
  "description": "Master the essential present tense verb conjugations for regular German verbs.",
  "scenario": "mechanics",
  "register": "neutral",
  "primaryStructure": "present_tense_conjugation",
  "variationSlots": ["subject", "verb"],
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich spiele Fußball.",
      "intent": "practice",
      "natural_en": "I play soccer.",
      "slots": { "subject": ["Ich"], "verb": ["spiele"] }
    },
    {
      "id": "prompt-002",
      "text": "Du spielst Gitarre.",
      "intent": "practice",
      "natural_en": "You play guitar.",
      "slots": { "subject": ["Du"], "verb": ["spielst"] }
    }
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "ich-du-forms",
        "title": "Ich & Du Forms",
        "promptIds": ["prompt-001", "prompt-002"],
        "title_i18n": { "en": "Ich & Du Forms" }
      }
    ]
  },
  "outline": ["Ich & Du Forms"],
  "tags": ["grammar", "verbs", "conjugation"],
  "analytics": {
    "version": 1,
    "primaryStructure": "present_tense_conjugation",
    "variationSlots": ["subject", "verb"],
    "slotSwitchDensity": 1.0,
    "promptDiversityScore": 0.75,
    "scenarioCoverageScore": 0.8,
    "estimatedCognitiveLoad": "low",
    "intendedOutcome": "Confident present tense conjugation",
    "goal": "Master present tense verb conjugation patterns",
    "drillType": "conjugation",
    "cognitiveLoad": "low"
  },
  "contentId": "de:drill:verb_present_tense_a1",
  "contentHash": "df88562851c8...",
  "revisionId": "df88562851c8",
  "title_i18n": { "en": "Verb Endings: Present Tense (A1)" },
  "description_i18n": { "en": "Master the essential present tense verb conjugations..." }
}
```

## Example: Exercise-Based Drill (Legacy)

```json
{
  "schemaVersion": 1,
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

## Smoke Testing

The smoke test script validates drills endpoints:

```bash
./scripts/smoke-test-content.sh --base-url https://your-worker.workers.dev
```

Checks performed:
1. GET `/v1/workspaces/{ws}/drills/index.json` returns 200
2. Index has valid SectionIndex structure (version, kind, items, nextPage)
3. At least 2 drills present (warning if fewer)
4. Each item has required fields: `id`, `kind: "drill"`, `entryUrl`
5. entryUrl matches pattern `/v1/workspaces/{ws}/drills/{id}/drill.json`
6. Entry documents are accessible and valid JSON
7. If promptsUrl is present, it's accessible

