# Content Quality Gates v1

This document defines the hard, deterministic constraints that prevent generic/low-value content from being published.

## Purpose

Quality Gates v1 exist to:
- **Prevent generic content**: Block template-like sentences that don't provide real learning value
- **Require contextual content**: Ensure prompts contain scenario-specific tokens (2-3 per prompt)
- **Ensure variation**: Require multiple verbs and subjects, and multi-slot variation (30% of prompts change 2+ slots)
- **Enforce register consistency**: Ensure formal packs actually use formal language
- **Require concreteness**: Ensure packs contain real-world details (times, dates, amounts)

These gates are **hard constraints** - packs that fail cannot be published. No exceptions.

## Analytics Summary Validation

When packs are indexed in section indexes, they must include an `analyticsSummary` field that matches the pack's metadata exactly. This enables frontend to display "why this pack works" without fetching full pack entries.

### Required Fields

For `kind="pack"` items in section indexes, `analyticsSummary` is **required** and must include:

- `primaryStructure` (string): Must match pack's `primaryStructure` exactly
- `variationSlots` (array): Must match pack's `variationSlots` array exactly
- `drillType` (string): Must match pack's `analytics.drillType` exactly
- `cognitiveLoad` (string): Must match pack's `analytics.cognitiveLoad` exactly
- `goal` (string, <= 120 chars): Must match pack's `analytics.goal` (truncated if needed)
- `whyThisWorks` (array, 2-4 items, each <= 80 chars): Derived from pack's `analytics.successCriteria`

### Validation Rules

1. **No TODO placeholders**: `goal` and `whyThisWorks` bullets cannot contain "TODO", "FIXME", or "TBD" (case-insensitive)
2. **No generic phrases**: `goal` cannot contain generic phrases like:
   - "practice german"
   - "learn german"
   - "study german"
   - "improve german"
   - "practice language"
   - "learn language"
   - "practice speaking"
   - "practice grammar"
   - "practice vocabulary"
   - "generic practice"
   - "basic practice"
   - "simple practice"
   - "general practice"
   - "placeholder"
3. **Length constraints**:
   - `goal`: Maximum 120 characters
   - `whyThisWorks`: Array of 2-4 items, each maximum 80 characters
4. **Exact match requirement**: All fields must match pack metadata exactly (validator hard-fails on mismatch)

**Why**: Ensures index items provide accurate, non-placeholder analytics metadata for frontend rendering without requiring full pack entry fetches.

## Rules

### 1. Generic Template Denylist (Hard Fail)

**Rule**: Hard-fail if any prompt text contains (case-insensitive) any of these substrings:
- "in today's lesson"
- "let's practice"
- "this sentence"
- "i like to"
- "the quick brown fox"
- "lorem ipsum"
- "hello" (unless contextualized, e.g., "Hello, I have a meeting at 10")
- "how are you" (unless contextualized)
- "my name is" (unless contextualized)
- "nice to meet you" (unless contextualized)

**Why**: These phrases indicate template/generic content that doesn't provide real learning value.

**Example - FAIL**:
```json
{
  "prompts": [
    {
      "id": "prompt-001",
      "text": "In today's lesson, we will practice German."
    }
  ]
}
```

**Example - PASS**:
```json
{
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich gehe morgen zur Arbeit."
    }
  ]
}
```

### 2. Context Token Requirement (Hard Fail)

**Rule**: Each prompt must contain at least 2 tokens from its pack scenario's token dictionary (case-insensitive substring match).

**Scenario Token Dictionaries**:
- `work`: ["meeting", "shift", "manager", "schedule", "invoice", "deadline", "office", "colleague", "project", "task"]
- `restaurant`: ["menu", "order", "bill", "reservation", "waiter", "table", "food", "drink", "kitchen", "service"]
- `shopping`: ["price", "buy", "cost", "store", "cashier", "payment", "discount", "receipt", "cart", "checkout"]
- `doctor`: ["appointment", "symptom", "prescription", "medicine", "treatment", "diagnosis", "health", "patient", "clinic", "examination"]
- `housing`: ["apartment", "rent", "lease", "landlord", "tenant", "deposit", "utilities", "furniture", "neighborhood", "address"]
- `government_office`: ["termin", "formular", "anmeldung", "bescheinigung", "unterlagen", "ausweis", "amt", "beamte", "sachbearbeiter", "aufenthaltserlaubnis", "pass", "bürgeramt", "ausländeramt", "jobcenter", "krankenkasse"]
- `casual_greeting`: ["greeting", "hello", "goodbye", "morning", "evening", "day", "see", "meet", "friend", "time"]

**Why**: Ensures prompts are contextual and scenario-specific, not generic filler.

**Example - FAIL** (only 1 token found):
```json
{
  "scenario": "work",
  "prompts": [
    {
      "id": "p1",
      "text": "Ich gehe zur Arbeit." // Only "Arbeit" (work) - needs 2 tokens
    }
  ]
}
```

**Example - PASS**:
```json
{
  "scenario": "work",
  "prompts": [
    {
      "id": "p1",
      "text": "Das Meeting beginnt um 14:30." // Contains "meeting" and "14:30" (time context)
    }
  ]
}
```

**Note**: If a pack's scenario has no token dictionary defined, the validator will warn but skip this check (allows iterative expansion of scenario coverage).

### 3. Multi-slot Variation (Hard Fail)

**Rule**: Ensure packs are not "mindless chant" drills:
- At least 30% of prompts must change 2+ slots relative to previous prompt in the same step
- At least 2 distinct verbs across all prompts (fallback heuristic)
- At least 2 distinct subjects/pronouns across prompts (fallback heuristic)

**Preferred Method**: Use `slotsChanged` metadata on prompts to explicitly declare which slots differ:
```json
{
  "prompts": [
    {
      "id": "p1",
      "text": "Ich gehe morgen zur Arbeit.",
      "slotsChanged": ["subject", "verb"] // This prompt changes 2+ slots
    }
  ]
}
```

**Why**: Prevents packs from being repetitive drills with only one-word swaps. Requires meaningful variation across multiple grammatical elements.

**Verb Detection**:
- For German sentences starting with pronoun (Ich, Du, Wir, Sie, Er, Sie, Es), pick the second token as verb candidate
- Count unique verb tokens across all prompts

**Subject Detection**:
- Count distinct starting pronoun tokens among: ich, du, wir, sie, er, es, ihr, Sie (case-insensitive)

**Why**: Prevents packs from being repetitive drills with only one verb or one subject.

**Example - FAIL** (only 1 verb):
```json
{
  "prompts": [
    { "id": "p1", "text": "Ich gehe zur Arbeit." },
    { "id": "p2", "text": "Du gehst zur Schule." },
    { "id": "p3", "text": "Er geht zum Park." }
  ]
}
```
All prompts use "gehen" (gehe, gehst, geht) - only 1 distinct verb.

**Example - PASS**:
```json
{
  "prompts": [
    { "id": "p1", "text": "Ich gehe zur Arbeit." },
    { "id": "p2", "text": "Du kommst zur Schule." },
    { "id": "p3", "text": "Er macht Sport." }
  ]
}
```
Three distinct verbs: gehen, kommen, machen.

**Example - FAIL** (only 1 subject):
```json
{
  "prompts": [
    { "id": "p1", "text": "Ich gehe zur Arbeit." },
    { "id": "p2", "text": "Ich komme zur Schule." },
    { "id": "p3", "text": "Ich mache Sport." }
  ]
}
```
All prompts start with "Ich" - only 1 distinct subject.

**Example - PASS**:
```json
{
  "prompts": [
    { "id": "p1", "text": "Ich gehe zur Arbeit." },
    { "id": "p2", "text": "Du kommst zur Schule." },
    { "id": "p3", "text": "Wir machen Sport." }
  ]
}
```
Three distinct subjects: Ich, Du, Wir.

### 4. Register Consistency (Hard Fail)

**Rule**: If `register === "formal"`, then at least one prompt must include "Sie" or "Ihnen" (exact token match; case-sensitive for Sie).

If `register !== "formal"`, no enforcement.

**Why**: Ensures formal packs actually use formal language (Sie/Ihnen), not just casual language with a "formal" label.

**Example - FAIL** (formal register but no Sie/Ihnen):
```json
{
  "register": "formal",
  "prompts": [
    { "id": "p1", "text": "Können Sie mir helfen?" },
    { "id": "p2", "text": "Ich hätte gern einen Kaffee." }
  ]
}
```
Wait, this actually passes - it has "Sie" in prompt 1. Let me fix the example:

**Example - FAIL** (formal register but no Sie/Ihnen):
```json
{
  "register": "formal",
  "prompts": [
    { "id": "p1", "text": "Kannst du mir helfen?" },
    { "id": "p2", "text": "Ich hätte gern einen Kaffee." }
  ]
}
```
No "Sie" or "Ihnen" found.

**Example - PASS**:
```json
{
  "register": "formal",
  "prompts": [
    { "id": "p1", "text": "Können Sie mir helfen?" },
    { "id": "p2", "text": "Ich hätte gern einen Kaffee." }
  ]
}
```
Contains "Sie".

### 5. Concreteness Marker (Hard Fail)

**Rule**: At least 2 prompts must include at least one concreteness marker:
- A digit (0-9) OR
- A currency symbol (€, $) OR
- A time marker like `:` (e.g. 14:30) OR
- A weekday token (Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag, Sonntag)

**Why**: Ensures packs contain real-world details, not abstract/generic sentences.

**Example - FAIL** (only 1 prompt has marker):
```json
{
  "prompts": [
    { "id": "p1", "text": "Ich gehe zur Arbeit." },
    { "id": "p2", "text": "Das Meeting beginnt um 14:30." },
    { "id": "p3", "text": "Wir treffen uns morgen." }
  ]
}
```
Only prompt 2 has a concreteness marker (14:30).

**Example - PASS**:
```json
{
  "prompts": [
    { "id": "p1", "text": "Das Meeting beginnt um 14:30." },
    { "id": "p2", "text": "Wir treffen uns am Montag." },
    { "id": "p3", "text": "Der Kaffee kostet 3€." }
  ]
}
```
Three prompts have markers: 14:30 (time), Montag (weekday), 3€ (digit + currency).

## How to Fix a Failing Pack

### Missing Required Fields

If validation fails with "missing required field: scenario/register/primaryStructure/variationSlots":
1. Add the missing field to your pack.json
2. Use appropriate values:
   - `scenario`: e.g., "work", "restaurant", "shopping", "doctor", "housing", "casual_greeting"
   - `register`: "formal", "neutral", or "informal"
   - `primaryStructure`: e.g., "verb_position", "negation", "modal_verbs", "dative_case", "accusative_prepositions"
   - `variationSlots`: Array of slot types that can be varied, e.g., `["subject", "verb", "object", "modifier"]`

### Generic Template Denylist

If validation fails with "contains denylisted phrase":
1. Remove the generic phrase from your prompt text
2. Replace with specific, concrete content that includes scenario context
3. Example: "Hello" → "Hello, I have a meeting at 10 o'clock"
4. Example: "In today's lesson..." → "Ich lerne Deutsch seit 2 Jahren."

### Context Token Requirement

If validation fails with "contains fewer than 2 scenario tokens":
1. Review the scenario token dictionary for your pack's scenario
2. Add at least 2 tokens from the dictionary to each prompt
3. Example for "work" scenario: "Das Meeting beginnt um 14:30" (contains "meeting" and time context)
4. Ensure prompts are contextual, not generic

### Multi-slot Variation

If validation fails with "insufficient multi-slot variation":
1. **Preferred**: Add `slotsChanged` metadata to at least 30% of prompts:
   ```json
   {
     "id": "p1",
     "text": "Ich gehe morgen zur Arbeit.",
     "slotsChanged": ["subject", "verb"] // Declares 2+ slots changed
   }
   ```
2. **Fallback**: Ensure at least 2 distinct verbs and 2 distinct subjects across prompts
   - Instead of all "gehen", use "kommen", "machen", "sehen", etc.
   - Instead of all "Ich", use "Du", "Wir", "Sie", etc.

### Register Consistency

If validation fails with "formal register requires Sie/Ihnen":
1. Add at least one prompt that uses "Sie" (formal you) or "Ihnen" (formal you, dative)
2. Example: "Können Sie mir helfen?" or "Das ist für Sie."

### Concreteness Marker

If validation fails with "insufficient concreteness markers":
1. Add at least 2 prompts with:
   - Times: "um 14:30", "um 9 Uhr"
   - Weekdays: "am Montag", "am Dienstag"
   - Digits: "3 Personen", "2 Jahre"
   - Currency: "5€", "10$"

## Integration

Quality Gates are enforced:
- **During validation**: `npm run content:validate` will fail if any pack violates gates
- **During smoke test**: Smoke test includes validation, so failing packs block deployment
- **Before publish**: Publish scripts run validation, preventing invalid content from reaching R2

### 6. Native Meaning Guard (Hard Fail for government_office or A2+)

**Rule**: For `scenario === "government_office"` OR `level >= "A2"`, every prompt must have both `gloss_en` and `natural_en` fields.

- `gloss_en`: Literal-ish scaffold (already required)
- `natural_en`: Native meaning paraphrase (short, idiomatic English)

**Why**: Prevents "literal meaning ≠ native meaning" drift. Ensures prompts have explicit native English paraphrases that capture the actual meaning, not just word-for-word translations.

**Example - FAIL** (government_office pack missing natural_en):
```json
{
  "scenario": "government_office",
  "level": "A1",
  "prompts": [
    {
      "id": "p1",
      "text": "Ich brauche einen Termin.",
      "gloss_en": "I need to make an appointment."
      // Missing natural_en
    }
  ]
}
```

**Example - PASS**:
```json
{
  "scenario": "government_office",
  "level": "A1",
  "prompts": [
    {
      "id": "p1",
      "text": "Ich brauche einen Termin.",
      "gloss_en": "I need to make an appointment.",
      "natural_en": "I'd like to schedule an appointment."
    }
  ]
}
```

**For A1 non-government scenarios**: `natural_en` is optional but recommended (warning if missing, not a hard fail).

## Analytics Metrics

All generated packs (source: "pdf" or "template") must include a computed `analytics` block with deterministic metrics that prove "why this pack works" without ML/LLM runtime.

### Required Analytics Fields (for generated content)

| Field | Type | Description |
|-------|------|-------------|
| `version` | number | Must be `1` |
| `qualityGateVersion` | string | Quality gate version identifier (e.g., "qg-2025-01-01") |
| `scenario` | string | Content scenario identifier (matches pack.scenario) |
| `register` | string | Formality level (matches pack.register) |
| `primaryStructure` | string | Primary grammatical structure (matches pack.primaryStructure) |
| `variationSlots` | string[] | Array of slot types (matches pack.variationSlots) |
| `promptCount` | number | Total number of prompts in pack |
| `multiSlotRate` | number | Ratio (0..1) of prompts with 2+ slotsChanged |
| `scenarioTokenHitAvg` | number | Average scenario token hits per prompt (>=0) |
| `scenarioTokenQualifiedRate` | number | Ratio (0..1) of prompts meeting minimum token requirement (>=2 tokens) |
| `uniqueTokenRate` | number | Ratio (0..1) of unique normalized tokens to total tokens |
| `bannedPhraseViolations` | number | Count of prompts containing banned phrases (should be 0) |
| `passesQualityGates` | boolean | Must be `true` for generated content |

### Computation Rules

- **Deterministic**: All metrics are computed from normalized tokens and metadata, no ML/LLM runtime
- **Validation**: Validator recomputes metrics and hard-fails if mismatch (within 0.001 tolerance for floats)
- **Required for generated**: Packs with `provenance.source === "pdf"` or `"template"` must include analytics
- **Optional for handcrafted**: Packs with `provenance.source === "handcrafted"` may omit analytics

### Metric Definitions

- **multiSlotRate**: Percentage of prompts that change 2+ slots relative to previous prompt. Higher values indicate better variation.
- **scenarioTokenHitAvg**: Average number of scenario-specific tokens found per prompt. Measures contextual relevance.
- **scenarioTokenQualifiedRate**: Percentage of prompts that meet the minimum token requirement (>=2 tokens). Should be >= 0.8 (80%).
- **uniqueTokenRate**: Ratio of unique normalized tokens to total tokens. Measures vocabulary diversity.
- **bannedPhraseViolations**: Count of prompts containing generic template phrases. Must be 0 for publishable content.

### Section Index Signals

Section index items for packs include derived `signals` object:

```json
{
  "signals": {
    "multiSlot": "low" | "med" | "high",  // Based on multiSlotRate thresholds
    "difficultyHint": "foundation" | "standard" | "stretch"  // Based on level + primaryStructure
  }
}
```

**Multi-slot classification:**
- `low`: multiSlotRate < 0.3
- `med`: 0.3 <= multiSlotRate < 0.6
- `high`: multiSlotRate >= 0.6

**Difficulty hint classification:**
- `foundation`: A1 level with simple structures (greeting, basic)
- `standard`: A1-A2 with standard structures
- `stretch`: B1+ or complex/advanced structures

## Meaning-Safety Gates

**Purpose**: Ensure that "native meaning vs literal meaning" cannot be lost in production. Generated content may be `needs_review` without perfect nuance, but promotion requires meaning-safety fields.

### Required Fields for Generated Prompts

For generated prompts (where `provenance.source !== "handcrafted"`), the following fields are required when `review.status === "approved"`:

- **`gloss_en`** (string, required): Literal meaning in English. Must be non-empty for approved generated content.
- **`intent`** (string, required): What the speaker is trying to accomplish. Must be non-empty for approved generated content.
- **`registerNote`** (string, optional): Formal/informal nuance (max 1 sentence).
- **`culturalNote`** (string, optional): Cultural context (only when needed; max 1 sentence).

### Enforcement Rules

1. **Generation time**: These fields may be empty or placeholder ONLY while `review.status === "needs_review"`.
2. **Approval gate** (hard fail on promote):
   - If `review.status === "approved"` and `provenance.source !== "handcrafted"`:
     - Every prompt must have non-empty `gloss_en` and `intent`
     - `registerNote` and `culturalNote` are optional
3. **Validation**: The validator enforces meaning-safety on approved generated packs.

**Why**: Prevents "lost meaning" from shipping to production. Reviewers must ensure meaning-safety fields are complete before approving generated content.

**Example - FAIL (promotion blocked)**:
```json
{
  "provenance": { "source": "template" },
  "review": { "status": "approved" },
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich brauche einen Termin.",
      "intent": "request",
      "gloss_en": ""  // ❌ Empty - promotion will fail
    }
  ]
}
```

**Example - PASS**:
```json
{
  "provenance": { "source": "template" },
  "review": { "status": "approved" },
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich brauche einen Termin.",
      "intent": "request",
      "gloss_en": "I need an appointment.",
      "registerNote": "Formal register appropriate for government office"
    }
  ]
}
```

## Catalog Coherence Report

**Purpose**: Prove catalog coherence at scale (20-50 packs). The coherence report is a deterministic artifact that demonstrates the catalog is not random and maintains quality standards.

### Running the Coherence Report

```bash
npm run content:coherence -- --workspace de --outDir ./reports/coherence
```

### Report Contents

The coherence report includes:

1. **Coverage Matrix**: Scenario × Level × PrimaryStructure × Register (counts)
   - Shows distribution of packs across dimensions
   - Identifies gaps or over-concentration

2. **Variation Slots Distribution**: Count of packs using each variation slot type
   - Ensures diversity in slot usage

3. **Token Density Stats**: Per-scenario statistics
   - Average tokens per prompt
   - Total tokens
   - Unique tokens

4. **Generic Phrase Count**: Should be 0 (hard fail if >0)
   - Detects generic template phrases that should not appear in production
   - Lists all occurrences with pack/prompt IDs

5. **Near-Duplicate Detection**: Similarity threshold 0.92
   - Uses Jaccard similarity on normalized text
   - Reports clusters of similar prompts
   - Does not hard fail, but marks "review required"

6. **Orphan Checks**: Index items vs entry documents
   - Verifies entry files exist
   - Checks metadata matches (level, title)
   - Reports mismatches

### Interpreting the Report

**✅ Good Signs**:
- Coverage matrix shows balanced distribution
- Generic phrase count = 0
- No orphan issues
- Near-duplicate clusters are minimal or intentional

**⚠️ Warning Signs**:
- Generic phrase count > 0 (hard fail)
- Large near-duplicate clusters (review required)
- Orphan issues (metadata mismatches)
- Over-concentration in one scenario/level combination

**Example Report Structure**:
```markdown
# Catalog Coherence Report

## Coverage Matrix
- government_office / A1 / verb_position / formal: 5 pack(s)
- work / A1 / verb_position / neutral: 3 pack(s)

## Generic Phrases
✅ No generic phrases found

## Near-Duplicate Clusters
⚠️ Found 2 near-duplicate cluster(s)
- Cluster 1: Packs work_1, work_2 (similarity: 92.5%)

## Orphan Checks
✅ No orphan issues found
```

### Integration with Sprint Runner

The coherence report is automatically generated at the end of expansion sprints:

```bash
./scripts/run-expansion-sprint.sh --workspace de --templateScenarios government_office --levels A1
```

The sprint runner will:
1. Generate packs
2. Run validation and quality checks
3. **Generate coherence report**
4. Generate sprint report

### Report Output

- **JSON**: `reports/coherence/coherence.<timestamp>.json` (machine-readable)
- **Markdown**: `reports/coherence/coherence.<timestamp>.md` (human-readable)

## Related Documentation

- [Pack Schema](./PACK_SCHEMA.md) - Complete pack entry schema
- [Rollout Guide](./ROLLOUT.md) - Deployment workflow including quality gates
- [Review Harness](./REVIEW_HARNESS.md) - Content approval workflow
- [PDF Ingestion](./PDF_INGESTION.md) - PDF ingestion profiles and workflow

