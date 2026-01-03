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
| `packVersion` | string | Pack semantic version (required, semver format x.y.z, e.g., "1.0.0") |
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
| `analytics` | object | Analytics metadata block (required for generated content, optional for handcrafted). See [QUALITY_GATES.md](./QUALITY_GATES.md#analytics-metrics) for details. Must include computed metrics for generated packs. |

## Quality Gates

All packs must pass Content Quality Gates v1. See [QUALITY_GATES.md](./QUALITY_GATES.md) for detailed rules and examples.

**Quick Summary:**
- **Generic Template Denylist**: Hard fail if prompts contain generic template phrases
- **Multi-slot Variation**: Hard fail if <2 distinct verbs or <2 distinct subjects across prompts
- **Register Consistency**: Hard fail if `register === "formal"` but no prompts contain "Sie" or "Ihnen"
- **Concreteness Marker**: Hard fail if <2 prompts contain digits, currency, time, or weekday markers

## Optional Fields

### i18n Fields (Optional)

Localization fields for user-visible strings. See [I18N_SCAFFOLDING.md](./I18N_SCAFFOLDING.md) for details.

- `title_i18n?: Record<string, string>` - Localized titles (e.g., `{ "en": "Office Meeting" }`)
- `subtitle_i18n?: Record<string, string>` - Localized subtitles

Generators automatically populate `*_i18n.en` fields for new content. Frontend should use `pickI18n(title_i18n) ?? title` pattern.

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

### `provenance` (Required for generated content, Optional for handcrafted)

Metadata about where the pack came from and how it was generated.

```json
{
  "provenance": {
    "source": "pdf",
    "sourceRef": "DeutschImBlick-textbook.pdf (pages 100-125)",
    "extractorVersion": "1.0.0",
    "generatedAt": "2025-12-30T23:00:00Z"
  }
}
```

**Provenance Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | string | ✅ | Source type: `"pdf"`, `"template"`, or `"handcrafted"` |
| `sourceRef` | string | ✅ | Reference to source (e.g., PDF filename + page range, template ID, or "manual") |
| `extractorVersion` | string | ✅ | Version of generator/extractor used (semver format) |
| `generatedAt` | string | ✅ | ISO 8601 timestamp when pack was generated |

**Validation Rules:**
- Required if `source !== "handcrafted"`
- Optional if `source === "handcrafted"` (may be omitted entirely)
- `source` must be one of: `"pdf"`, `"template"`, `"handcrafted"`
- `generatedAt` must be valid ISO 8601 format

### `review` (Required for generated content, Optional for handcrafted)

Review status and approval metadata.

```json
{
  "review": {
    "status": "approved",
    "reviewer": "alice",
    "reviewedAt": "2025-12-30T23:30:00Z"
  }
}
```

**Review Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | ✅ | Review status: `"draft"`, `"needs_review"`, or `"approved"` |
| `reviewer` | string | ❌ | Username/identifier of reviewer (required if `status === "approved"`) |
| `reviewedAt` | string | ❌ | ISO 8601 timestamp when reviewed (required if `status === "approved"`) |

**Validation Rules:**
- Required if `provenance.source !== "handcrafted"`
- Optional if `provenance.source === "handcrafted"` (defaults to `"approved"` if omitted)
- `status` must be one of: `"draft"`, `"needs_review"`, `"approved"`
- If `status === "approved"`, both `reviewer` and `reviewedAt` must be present
- For production promotion, all referenced packs must have `review.status === "approved"` (unless `provenance.source === "handcrafted"`)

**Default Values:**
- Generated packs (PDF/template): `status: "needs_review"`
- Handcrafted packs: `status: "approved"` (if review block present)

### `analytics` (Required for generated content, Optional for handcrafted)

Analytics metadata block containing deterministic metrics that prove "why this pack works" without ML/LLM runtime.

```json
{
  "analytics": {
    "version": 1,
    "qualityGateVersion": "qg-2025-01-01",
    "scenario": "work",
    "register": "formal",
    "primaryStructure": "modal_verbs",
    "variationSlots": ["subject", "verb", "object"],
    "promptCount": 12,
    "multiSlotRate": 0.42,
    "scenarioTokenHitAvg": 2.5,
    "scenarioTokenQualifiedRate": 0.92,
    "uniqueTokenRate": 0.68,
    "bannedPhraseViolations": 0,
    "passesQualityGates": true,
    "focus": "verb_position",
    "cognitiveLoad": "medium",
    "responseSpeedTargetMs": 1200,
    "fluencyOutcome": "automatic_opening",
    "whyThisWorks": [
      "forces verb-second position under time pressure",
      "alternates subject + tense to prevent chanting",
      "uses high-frequency office contexts"
    ],
    "goal": "Practice professional work communication at A2 level",
    "constraints": ["formal register maintained", "work scenario context"],
    "levers": ["subject variation", "verb substitution", "object variation"],
    "successCriteria": ["Uses professional vocabulary appropriately", "Varies subject and verb across prompts"],
    "commonMistakes": ["Mixing formal and informal register", "Missing time/meeting context"],
    "drillType": "roleplay-bounded"
  }
}
```

**Analytics Fields:**

**Catalog-Level Analytics (Required for generated content):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `focus` | string | ✅ (generated) | Primary pedagogical focus (e.g., "verb_position", "modal_verbs", "word_order"). Derived deterministically from primaryStructure. |
| `cognitiveLoad` | string | ✅ (generated) | Cognitive load level: `"low"`, `"medium"`, or `"high"`. Derived deterministically from variationSlots, slotSwitchDensity, and prompt characteristics. |
| `responseSpeedTargetMs` | number | ✅ (generated) | Target response time in milliseconds (500-3000ms). Derived deterministically from level and cognitiveLoad. |
| `fluencyOutcome` | string | ✅ (generated) | Intended fluency outcome (e.g., "automatic_opening", "polite_requests", "time_expressions"). Derived deterministically from scenario and primaryStructure. |
| `whyThisWorks` | string[] | ✅ (generated) | Array of 2-5 human-readable explanations (each <= 120 chars) explaining why this pack is effective. Derived deterministically from successCriteria or structure/scenario. |

**Computed Metrics (Required for generated content):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | number | ✅ (generated) | Must be `1` |
| `qualityGateVersion` | string | ✅ (generated) | Quality gate version identifier |
| `scenario` | string | ✅ (generated) | Content scenario (matches pack.scenario) |
| `register` | string | ✅ (generated) | Formality level (matches pack.register) |
| `primaryStructure` | string | ✅ (generated) | Primary structure (matches pack.primaryStructure) |
| `variationSlots` | string[] | ✅ (generated) | Slot types (matches pack.variationSlots) |
| `promptCount` | number | ✅ (generated) | Total number of prompts |
| `multiSlotRate` | number | ✅ (generated) | Ratio (0..1) of prompts with 2+ slotsChanged |
| `scenarioTokenHitAvg` | number | ✅ (generated) | Average scenario token hits per prompt |
| `scenarioTokenQualifiedRate` | number | ✅ (generated) | Ratio (0..1) of prompts meeting min token requirement |
| `uniqueTokenRate` | number | ✅ (generated) | Ratio (0..1) of unique tokens to total tokens |
| `bannedPhraseViolations` | number | ✅ (generated) | Count of banned phrase violations (should be 0) |
| `passesQualityGates` | boolean | ✅ (generated) | Must be `true` for generated content |

**Legacy Analytics Fields (Optional, for backward compatibility):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `goal` | string | ❌ | Learning goal description (<= 120 chars) |
| `constraints` | string[] | ❌ | What is held constant |
| `levers` | string[] | ❌ | What changes (references variationSlots) |
| `successCriteria` | string[] | ❌ | Success criteria (2-6 items) |
| `commonMistakes` | string[] | ❌ | Common mistakes to avoid |
| `drillType` | string | ❌ | Type: "substitution", "pattern-switch", or "roleplay-bounded" |

**Validation Rules:**
- Required if `provenance.source === "pdf"` or `"template"`
- Optional if `provenance.source === "handcrafted"` (may be omitted entirely)
- Validator recomputes metrics and hard-fails if mismatch (within 0.001 tolerance for floats)
- `passesQualityGates` must be `true` for generated content
- **Catalog-level analytics** (`focus`, `cognitiveLoad`, `responseSpeedTargetMs`, `fluencyOutcome`, `whyThisWorks`) are **required** for generated content
- `responseSpeedTargetMs` must be between 500 and 3000 milliseconds
- `whyThisWorks` must contain at least 2 items, each <= 120 characters
- All catalog-level analytics must be derived deterministically (no free text, no randomness)

See [QUALITY_GATES.md](./QUALITY_GATES.md#analytics-metrics) and [ANALYTICS_METADATA.md](./ANALYTICS_METADATA.md) for detailed definitions.

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

