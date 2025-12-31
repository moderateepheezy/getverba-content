# Entry URL Schema

This document defines the canonical `entryUrl` contract for section index items. Every `entryUrl` must resolve to a single, canonical JSON document that the app can render.

## Canonical Patterns

All `entryUrl` values must follow these patterns based on the section `kind`:

### Pack Entry URL

**Pattern**: `/v1/workspaces/{workspace}/packs/{packId}/pack.json`

**Example**: `/v1/workspaces/de/packs/basic_greetings/pack.json`

**Schema**: See [Pack Entry Schema](#pack-entry-schema)

### Exam Entry URL

**Pattern**: `/v1/workspaces/{workspace}/exams/{examId}/exam.json`

**Example**: `/v1/workspaces/de/exams/a1_level_test/exam.json`

**Schema**: See [Exam Entry Schema](#exam-entry-schema)

### Drill Entry URL

**Pattern**: `/v1/workspaces/{workspace}/drills/{drillId}/drill.json`

**Example**: `/v1/workspaces/de/drills/pronunciation_basics/drill.json`

**Schema**: See [Drill Entry Schema](#drill-entry-schema)

### Track Entry URL

**Pattern**: `/v1/workspaces/{workspace}/tracks/{trackId}/track.json`

**Example**: `/v1/workspaces/de/tracks/gov_office_a1_default/track.json`

**Schema**: See [Track Entry Schema](#track-entry-schema)

## Validation Rules

1. ✅ `entryUrl` must start with `/v1/` and end with `.json`
2. ✅ `entryUrl` must match the pattern for the section `kind`:
   - If `kind === "context"` or `kind === "pack"` → must match pack pattern
   - If `kind === "exams"` or `kind === "exam"` → must match exam pattern
   - If `kind === "drills"` or `kind === "drill"` → must match drill pattern
   - If `kind === "tracks"` or `kind === "track"` → must match track pattern
3. ✅ The file referenced by `entryUrl` must exist locally
4. ✅ The `packId`/`examId`/`drillId`/`trackId` in the URL must match the item `id` (case-insensitive, normalized)

## Pack Entry Schema

**File**: `/v1/workspaces/{workspace}/packs/{packId}/pack.json`

```json
{
  "id": "basic_greetings",
  "kind": "pack",
  "title": "Basic German Greetings",
  "level": "A1",
  "estimatedMinutes": 15,
  "description": "Learn essential German greetings for everyday conversations. Practice saying hello, goodbye, and common polite phrases.",
  "outline": [
    "Opening: Greetings",
    "Common Phrases",
    "Closing: Goodbyes"
  ],
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Guten Morgen",
      "translation": "Good morning",
      "audioUrl": "/v1/audio/basic_greetings/prompt-001.mp3"
    },
    {
      "id": "prompt-002",
      "text": "Guten Tag",
      "translation": "Good day",
      "audioUrl": "/v1/audio/basic_greetings/prompt-002.mp3"
    }
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "opening",
        "title": "Opening: Greetings",
        "promptIds": ["prompt-001", "prompt-002"]
      },
      {
        "id": "common",
        "title": "Common Phrases",
        "promptIds": ["prompt-003"]
      },
      {
        "id": "closing",
        "title": "Closing: Goodbyes",
        "promptIds": ["prompt-004", "prompt-005"]
      }
    ]
  }
}
```

### Pack Entry Fields

**Required:**
- `id` (string): Pack identifier, must match `packId` in URL
- `kind` (string): Must be `"pack"`
- `packVersion` (string): Pack semantic version (semver format x.y.z, e.g., "1.0.0")
- `title` (string): Display title
- `level` (string): Language level (`"A1"`, `"A2"`, etc.)
- `estimatedMinutes` (number): Estimated duration in minutes
- `description` (string): 1-3 line description
- `outline` (string[]): Array of section titles/headings
- `sessionPlan` (object): Session plan defining the order and grouping of prompts
- `scenario` (string): Content scenario identifier (e.g., "work", "restaurant", "shopping", "doctor", "housing")
- `register` (string): Formality level: `"formal"`, `"neutral"`, or `"informal"`
- `primaryStructure` (string): Primary grammatical structure identifier (e.g., "verb_position", "negation", "modal_verbs", "dative_case")
- `variationSlots` (string[]): Array of slot types that can be varied. Allowed values: `"subject"`, `"verb"`, `"object"`, `"modifier"`, `"tense"`, `"polarity"`, `"time"`, `"location"`. Must be non-empty.
- `analytics` (object): Analytics metadata block with telemetry fields (see [PACK_SCHEMA.md](./PACK_SCHEMA.md))
  - `version` (number): Must be `1`
  - `steps` (array): Non-empty array of step objects
    - Each step must have:
      - `id` (string): Unique step identifier
      - `title` (string): Step display title
      - `promptIds` (string[]): Non-empty array of prompt IDs that reference `prompts[].id`
- `prompts` (array): Array of prompt objects OR `promptsUrl` (string) for large packs
  - Required if `sessionPlan` references prompt IDs

**Optional:**
- `promptsUrl` (string): If pack has many prompts, can reference external file
  - Format: `/v1/workspaces/{workspace}/packs/{packId}/prompts.json`
  - If used, prompts must be loaded separately and `sessionPlan.promptIds` must reference IDs in that file
- `tags` (string[]): Taxonomy tags for filtering
- `thumbnailUrl` (string): Preview image URL

**Session Plan Rules:**
- `sessionPlan.version` must be `1`
- `sessionPlan.steps` must be a non-empty array
- Each step's `promptIds` must be a non-empty array
- Every `promptId` in `sessionPlan.steps[].promptIds` must exist in `prompts[].id` (or in the prompts loaded from `promptsUrl`)
- `outline.length` should match `steps.length` (validator warns if different, but allows it)

**Prompt Object:**
- `id` (string): Unique prompt identifier
- `text` (string): Primary text (e.g., German phrase)
- `translation` (string, optional): Translation or explanation
- `audioUrl` (string, optional): Audio file URL

## Exam Entry Schema

**File**: `/v1/workspaces/{workspace}/exams/{examId}/exam.json`

```json
{
  "id": "a1_level_test",
  "kind": "exam",
  "title": "A1 Level Test",
  "level": "A1",
  "estimatedMinutes": 30,
  "description": "Test your A1 German skills with this comprehensive assessment.",
  "outline": [
    "Vocabulary Section",
    "Grammar Section",
    "Reading Comprehension"
  ],
  "questions": [
    {
      "id": "q-001",
      "type": "multiple-choice",
      "question": "What does 'Guten Tag' mean?",
      "options": ["Good morning", "Good day", "Good evening", "Good night"],
      "correctAnswer": 1
    }
  ]
}
```

### Exam Entry Fields

**Required:**
- `id` (string): Exam identifier
- `kind` (string): Must be `"exam"`
- `title` (string): Display title
- `level` (string): Language level
- `estimatedMinutes` (number): Estimated duration
- `description` (string): Exam description
- `outline` (string[]): Section outline
- `questions` (array): Array of question objects OR `questionsUrl` (string)

**Optional:**
- `questionsUrl` (string): External questions file for large exams
- `passingScore` (number): Minimum score to pass (0-100)

## Drill Entry Schema

**File**: `/v1/workspaces/{workspace}/drills/{drillId}/drill.json`

```json
{
  "id": "pronunciation_basics",
  "kind": "drill",
  "title": "Pronunciation Basics",
  "level": "A1",
  "estimatedMinutes": 10,
  "description": "Practice basic German pronunciation patterns.",
  "outline": [
    "Vowel Sounds",
    "Consonant Combinations",
    "Common Words"
  ],
  "exercises": [
    {
      "id": "ex-001",
      "text": "Hallo",
      "audioUrl": "/v1/audio/pronunciation_basics/ex-001.mp3"
    }
  ]
}
```

### Drill Entry Fields

**Required:**
- `id` (string): Drill identifier
- `kind` (string): Must be `"drill"`
- `title` (string): Display title
- `level` (string): Language level
- `estimatedMinutes` (number): Estimated duration
- `description` (string): Drill description
- `outline` (string[]): Section outline
- `exercises` (array): Array of exercise objects OR `exercisesUrl` (string)

## Track Entry Schema

**File**: `/v1/workspaces/{workspace}/tracks/{trackId}/track.json`

```json
{
  "id": "gov_office_a1_default",
  "kind": "track",
  "title": "Government Office Basics (A1)",
  "level": "A1",
  "scenario": "government_office",
  "estimatedMinutes": 25,
  "description": "Essential routines for navigating German government offices.",
  "items": [
    {
      "kind": "pack",
      "entryUrl": "/v1/workspaces/de/packs/anmeldung_basics/pack.json",
      "required": true
    },
    {
      "kind": "drill",
      "entryUrl": "/v1/workspaces/de/drills/formal_address_a1/drill.json",
      "required": true
    }
  ],
  "ordering": {
    "type": "fixed"
  },
  "version": 1
}
```

### Track Entry Fields

**Required:**
- `id` (string): Track identifier, must match `trackId` in URL
- `kind` (string): Must be `"track"`
- `title` (string): Display title
- `level` (string): Language level (`"A1"`, `"A2"`, etc.)
- `scenario` (string): Content scenario identifier
- `estimatedMinutes` (number): Estimated duration in minutes (sum of all items)
- `description` (string): Track description (1-3 lines)
- `items` (array): Array of track item objects (6-14 items recommended)
  - Each item must have:
    - `kind` (string): Must be `"pack"` or `"drill"`
    - `entryUrl` (string): Canonical entry URL matching pattern for kind
    - `required` (boolean): Whether this item is required (default: `true`)
- `ordering` (object): Ordering configuration
  - `type` (string): Must be `"fixed"` for deterministic tracks
- `version` (number): Track version (currently `1`)

**Validation:**
- Each `items[].entryUrl` must exist locally
- Each `items[].entryUrl` must match the pattern for `items[].kind`
- No duplicate `entryUrl` values in `items` array
- If `scenario` is set, all pack items must have matching `scenario` (drills may omit scenario)

See [TRACK_SCHEMA.md](./TRACK_SCHEMA.md) for complete track schema documentation.

## Migration from Old Pattern

**Old pattern** (deprecated):
```
/v1/packs/pack-001.json
```

**New pattern** (canonical):
```
/v1/workspaces/de/packs/basic_greetings/pack.json
```

**Changes:**
- Moved from flat `/v1/packs/` to workspace-scoped `/v1/workspaces/{workspace}/packs/`
- Pack ID now uses kebab-case (`basic_greetings` instead of `pack-001`)
- File name is always `pack.json` (not `{packId}.json`)
- Same structure for exams and drills

## Benefits

1. **Workspace-scoped**: Content is organized by workspace, enabling multi-language support
2. **Predictable**: Always know where to find entry files
3. **Extensible**: Can add additional files per entry (e.g., `prompts.json`, `metadata.json`)
4. **Validatable**: Validator can enforce pattern matching
5. **Cache-friendly**: Clear URL structure for ETag caching

## Usage in Frontend

The frontend should:

1. Extract `kind` from section index (or infer from section `kind`)
2. Construct expected `entryUrl` pattern based on `kind`
3. Fetch entry JSON from `entryUrl`
4. Render based on entry `kind` and schema

Example:
```typescript
// From section index item
const item = { id: "basic_greetings", entryUrl: "/v1/workspaces/de/packs/basic_greetings/pack.json", ... };

// Fetch entry
const entry = await contentClient.fetchEntry(item.entryUrl);

// Render based on entry.kind
if (entry.kind === "pack") {
  // Render PackDetailPreview
} else if (entry.kind === "exam") {
  // Render ExamDetailPreview
}
```

