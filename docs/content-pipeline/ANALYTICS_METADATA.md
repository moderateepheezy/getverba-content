# Analytics Metadata Schema

This document defines the analytics metadata block for Pack entries. Analytics metadata encodes deterministic "why this pack works" signals without ML/LLMs, enabling sorting, filtering, and future correlation with telemetry.

## Schema

All pack entries must include an `analytics` object with the following structure:

```json
{
  "analytics": {
    "version": 1,
    "goal": "string (1-120 chars)",
    "constraints": ["string (1-80 chars each)", "..."],
    "levers": ["string (1-80 chars each)", "..."],
    "successCriteria": ["string (1-80 chars each)", "..."],
    "commonMistakes": ["string (1-80 chars each)", "..."],
    "drillType": "substitution" | "pattern-switch" | "roleplay-bounded",
    "cognitiveLoad": "low" | "medium" | "high",
    "whyThisWorks": ["string (1-120 chars each)", "..."],
    "exitConditions": {
      "targetMinutes": 5,
      "completeWhen": "sessionPlan_completed_once" | "sessionPlan_completed_twice" | "manual_mark_complete"
    },
    "primaryStructure": "string (must match pack.primaryStructure)",
    "scenario": "string (must match pack.scenario)",
    "register": "formal" | "neutral" | "casual" | "informal (must match pack.register)",
    "variationSlots": ["subject" | "verb" | "object" | "modifier" | "tense" | "polarity" | "time" | "location"],
    "minDistinctSubjects": 3,
    "minDistinctVerbs": 3,
    "minMultiSlotRate": 0.30,
    "targetResponseSeconds": 2.5,
    "canonicalIntents": ["ask", "request", "confirm", "decline"],
    "anchorPhrases": ["string (scenario-specific phrases)"]
  }
}
```

## Field Semantics

### `goal` (required, 1-120 chars)

**What this pack trains.** A concise description of the learning objective.

**Examples:**
- `"Practice formal government_office interactions at A1 level"`
- `"Practice professional work communication at A2 level"`
- `"Practice restaurant ordering and service requests at A1 level"`

### `constraints` (required, 1-6 items, each 1-80 chars)

**What is held constant.** Elements that remain fixed across prompts to focus learning.

**Examples:**
- `"formal register maintained"`
- `"work scenario context"`
- `"modal_verbs_requests structure focus"`
- `"verb position: second"`

**Rules:**
- Must mention at least one non-lever slot or constant property (register/scenario/primaryStructure)
- Should reference pack-level metadata (register, scenario, primaryStructure)

### `levers` (required, 1-6 items, each 1-80 chars)

**What changes across prompts.** Elements that vary to create practice diversity.

**Examples:**
- `"subject variation"`
- `"verb substitution"`
- `"object variation"`
- `"time expressions"`

**Rules:**
- **Must reference `variationSlots`** - each lever should map to a slot in `pack.variationSlots`
- Can also reference documented lever keywords: `subject`, `verb`, `object`, `modifier`, `tense`, `polarity`, `time`, `location`, `register`, `scenario`, `intent`
- Validator will fail if lever doesn't reference a variationSlot or valid keyword

### `successCriteria` (required, 1-6 items, each 1-80 chars)

**What 'good' sounds like.** Observable indicators of successful performance.

**Examples:**
- `"Uses formal address (Sie/Ihnen) correctly"`
- `"Includes required scenario tokens (Termin, Formular, etc.)"`
- `"Maintains polite modal verb constructions"`
- `"Varies subject and verb across prompts"`

### `commonMistakes` (required, 1-6 items, each 1-80 chars)

**Most likely failure modes.** Typical errors learners make with this pack.

**Examples:**
- `"Forgetting formal address (using 'du' instead of 'Sie')"`
- `"Missing required documents vocabulary"`
- `"Incorrect modal verb conjugation"`
- `"Mixing formal and informal register"`

**Warning:** Validator will warn (non-fatal) if `successCriteria` overlaps heavily with `commonMistakes` (simple string equality check).

### `drillType` (required, enum)

**Type of drill pattern.**

- **`substitution`**: Simple slot substitution (e.g., changing subject/verb/object)
- **`pattern-switch`**: Switching between grammatical patterns (e.g., question vs statement)
- **`roleplay-bounded`**: Bounded roleplay scenarios (e.g., government office, restaurant, work)

**Alignment Rules:**
- If `drillType !== 'substitution'`, then `scenario`, `register`, and `primaryStructure` must exist (validator will fail if missing)

### `cognitiveLoad` (required, enum)

**Estimated cognitive load for learners.**

- **`low`**: Simple patterns, few variations (typically A1 with ≤2 variationSlots)
- **`medium`**: Moderate complexity (typically A1-A2 with 2-3 variationSlots)
- **`high`**: Complex patterns, many variations (typically A2+ with ≥4 variationSlots)

**Warning:** Validator will warn (non-fatal) if `cognitiveLoad === 'low'` while `variationSlots.length >= 4`.

### `version` (required, number)

**Analytics schema version.** Always `1` for v1 analytics.

### `primaryStructure`, `scenario`, `register`, `variationSlots` (required)

**Must match pack top-level fields exactly.** These fields ensure single source of truth and prevent drift between pack metadata and analytics.

- `primaryStructure`: Must equal `pack.primaryStructure`
- `scenario`: Must equal `pack.scenario`
- `register`: Must equal `pack.register` (normalized: "informal" → "casual")
- `variationSlots`: Must match `pack.variationSlots` array exactly (order-independent)

**Hard fail if mismatch detected.**

### `minDistinctSubjects` (required, number)

**Minimum number of distinct subjects required across prompts.** Typically >= 3.

**Computed validation**: Validator counts distinct subjects from prompts (using `slotsChanged`, `slots.subject`, or heuristic) and hard-fails if count < `minDistinctSubjects`.

### `minDistinctVerbs` (required, number)

**Minimum number of distinct verbs required across prompts.** Typically >= 3.

**Computed validation**: Validator counts distinct verbs from prompts (using `slotsChanged`, `slots.verb`, or heuristic) and hard-fails if count < `minDistinctVerbs`.

### `minMultiSlotRate` (required, number)

**Minimum fraction of prompts that must change multiple slots.** Value between 0.0 and 1.0. Typically 0.30 (30%).

**Computed validation**: Validator computes measured multi-slot rate from `slotsChanged` arrays and hard-fails if measured rate < `minMultiSlotRate`.

### `targetResponseSeconds` (required, number)

**Target response time in seconds.** Value between 0.5 and 6.0.

**Examples:**
- `2.5` - Moderate pace
- `1.5` - Fast pace (for fluency drills)
- `4.0` - Slower pace (for complex structures)

### `canonicalIntents` (required, array, 3+ items)

**Expected intent categories for this pack.** Each intent must appear in at least one prompt.

**Allowed values**: `"greet"`, `"request"`, `"apologize"`, `"inform"`, `"ask"`, `"confirm"`, `"schedule"`, `"order"`, `"ask_price"`, `"thank"`, `"goodbye"`, `"decline"`

**Computed validation**: Validator checks that each `canonicalIntent` appears in at least one prompt's `intent` field. Hard-fail if any intent is missing.

### `anchorPhrases` (required, array, 3+ items)

**Short, scenario-specific, language-specific phrases expected to appear in prompts.** These prove the pack is authentic to the scenario, not generic.

**Examples for `government_office` scenario:**
- `"Termin"`
- `"Formular"`
- `"Anmeldung"`
- `"Bescheinigung"`

**Computed validation**: Validator checks that each `anchorPhrase` appears (case-insensitive, normalized) in at least one prompt's `text`. Hard-fail if any phrase is missing.

### `whyThisWorks` (required, 1-5 items, each 1-120 chars)

**Why this pack is effective.** Concise explanations of the pedagogical rationale.

**Examples:**
- `"High-frequency bureaucratic intents"`
- `"Multi-slot substitution to prevent chanting"`
- `"Short response windows encourage retrieval speed"`
- `"Forces verb position under time pressure"`
- `"Reuses same skeleton with multi-slot variation"`

**Rules:**
- Must be non-empty array (1-5 items)
- Each item must be 1-120 characters
- Should be specific and actionable (not generic like "practice more" or "learn faster")
- Validator will warn (non-fatal) if contains generic phrases from denylist

### `exitConditions` (required, object)

**When a session is considered complete.**

```json
{
  "targetMinutes": 5,
  "completeWhen": "sessionPlan_completed_once"
}
```

**Fields:**
- **`targetMinutes`** (required, number): Target duration in minutes (1-20)
- **`completeWhen`** (required, enum): Completion criteria
  - `"sessionPlan_completed_once"`: Complete when all steps in sessionPlan are done once
  - `"sessionPlan_completed_twice"`: Complete when all steps are done twice (for reinforcement)
  - `"manual_mark_complete"`: Requires manual completion (for exams/assessments)

**Rules:**
- `targetMinutes` must be between 1 and 20
- `completeWhen` must be one of the three enum values

## Examples

### Government Office Pack (A1)

```json
{
  "analytics": {
    "goal": "Practice formal government_office interactions at A1 level",
    "constraints": [
      "formal register maintained",
      "government_office scenario context",
      "modal_verbs_requests structure focus"
    ],
    "levers": [
      "subject variation",
      "verb substitution",
      "object variation",
      "time expressions"
    ],
    "successCriteria": [
      "Uses formal address (Sie/Ihnen) correctly",
      "Includes required scenario tokens (Termin, Formular, etc.)",
      "Maintains polite modal verb constructions"
    ],
    "commonMistakes": [
      "Forgetting formal address (using 'du' instead of 'Sie')",
      "Missing required documents vocabulary",
      "Incorrect modal verb conjugation"
    ],
    "drillType": "roleplay-bounded",
    "cognitiveLoad": "medium"
  }
}
```

### Work Pack (A2)

```json
{
  "analytics": {
    "goal": "Practice professional work communication at A2 level",
    "constraints": [
      "formal register maintained",
      "work scenario context",
      "modal_verbs_requests structure focus"
    ],
    "levers": [
      "subject variation",
      "verb substitution",
      "object variation",
      "time expressions"
    ],
    "successCriteria": [
      "Uses professional vocabulary appropriately",
      "Varies subject and verb across prompts",
      "Includes time/meeting context markers"
    ],
    "commonMistakes": [
      "Mixing formal and informal register",
      "Missing time/meeting context",
      "Incorrect verb position in questions"
    ],
    "drillType": "roleplay-bounded",
    "cognitiveLoad": "high"
  }
}
```

## Index-Level Summary

Section index items include a subset of analytics for quick browsing:

- **`drillType`**: Copied from `analytics.drillType`
- **`cognitiveLoad`**: Copied from `analytics.cognitiveLoad`
- **`whyThisWorks`**: Derived from `analytics.goal + first successCriteria` (max 200 chars)

**Example index item:**
```json
{
  "id": "government_office_basic",
  "title": "Government Office - Basic",
  "drillType": "roleplay-bounded",
  "cognitiveLoad": "medium",
  "whyThisWorks": "Practice formal government_office interactions at A1 level Uses formal address (Sie/Ihnen) correctly"
}
```

## Frontend Usage

### Index-Level Summary (Quick Browsing)

Use `drillType`, `cognitiveLoad`, and `whyThisWorks` from section index items for:
- Filtering packs by drill type
- Sorting by cognitive load
- Displaying "why this works" tooltips in pack selection UI

### Entry-Level Full Analytics (Detailed View)

Load full pack entry to access complete `analytics` block for:
- Detailed learning objectives
- Full constraint/lever analysis
- Complete success criteria and common mistakes
- Advanced filtering and correlation

## Generator Defaults

When generating packs:

1. **`scripts/generate-pack.ts`**: Automatically generates analytics from template metadata
2. **`scripts/new-pack.sh`**: Scaffolds analytics with TODO placeholders

**Review Harness:** Detects incomplete analytics (TODO markers) and requires completion before approval.

## Migration

For existing packs without analytics:

```bash
# Migrate all packs in a workspace
tsx scripts/migrate-analytics.ts --workspace de

# Dry run to see what would be migrated
tsx scripts/migrate-analytics.ts --workspace de --dry-run
```

Migration generates minimal analytics based on existing pack metadata (scenario, register, primaryStructure, variationSlots, level).

## Validation

All analytics fields are **hard-validated**:

- ✅ `goal` non-empty, ≤120 chars
- ✅ Arrays non-empty, 1-6 items each, each item 1-80 chars (except `whyThisWorks`: 1-5 items, each 1-120 chars)
- ✅ `drillType` and `cognitiveLoad` enums only
- ✅ `levers` must reference `variationSlots` or valid keywords
- ✅ If `drillType !== 'substitution'`, scenario/register/primaryStructure must exist
- ✅ `whyThisWorks` non-empty, 1-5 items, each 1-120 chars
- ✅ `exitConditions.targetMinutes` between 1-20
- ✅ `exitConditions.completeWhen` must be valid enum value

**Warnings (non-fatal):**
- ⚠️ `successCriteria` overlaps with `commonMistakes`
- ⚠️ `cognitiveLoad === 'low'` while `variationSlots.length >= 4`
- ⚠️ `whyThisWorks` contains generic phrases (denylist: "practice more", "learn faster", "improve skills", "get better", "study hard")

## Sprint Report

Sprint report includes analytics completeness metrics:

- % packs with analytics fully filled (no TODO markers)
- Distribution of `drillType` values
- Distribution of `cognitiveLoad` values
- Missing fields summary

