# Catalog-Level Analytics Metadata

This document defines the **Catalog-Level Analytics Metadata** system that provides deterministic, explainable analytics for every Pack. This metadata enables ranking, explanation, auditing, and exporting of packs without ML/LLM runtime.

## Overview

Catalog-level analytics metadata bridges the gap between:
- "we generated good content"
- "we can rank, explain, export, and sell it"

Without this layer:
- Expansion becomes noise
- B2B exports are shallow
- Frontend has nothing to surface intelligently
- You can't defend quality claims

## Core Principle

**All analytics are deterministic and explainable.** No ML. No guessing. No free text generation at runtime.

## Required Fields

All generated packs must include the following catalog-level analytics fields:

### `focus` (string, required)

**Description:** Primary pedagogical focus of the pack.

**Derivation:** Deterministically derived from `primaryStructure` using pattern matching.

**Examples:**
- `"verb_position"` - for packs focusing on verb-second position
- `"modal_verbs"` - for packs focusing on modal verb constructions
- `"word_order"` - for packs focusing on German word order
- `"tense_usage"` - for packs focusing on tense selection
- `"case_system"` - for packs focusing on German cases
- `"prepositions"` - for packs focusing on preposition usage

**Validation:**
- Must be a non-empty string
- Must be derived deterministically (no free text)

### `cognitiveLoad` (enum, required)

**Description:** Cognitive load level required to complete the pack.

**Values:** `"low"`, `"medium"`, `"high"`

**Derivation:** Deterministically computed from:
- Number of `variationSlots`
- `slotSwitchDensity`
- Average prompt length (words)

**Scoring System:**
- Slot count: ≤2 slots = 1 point, ≤3 slots = 2 points, >3 slots = 3 points
- Switch density: ≥0.5 = 2 points, ≥0.3 = 1 point, <0.3 = 0 points
- Length: ≥10 words = 2 points, ≥6 words = 1 point, <6 words = 0 points
- Total score: ≤2 = low, ≤4 = medium, >4 = high

**Validation:**
- Must be one of: `"low"`, `"medium"`, `"high"`
- Must match `estimatedCognitiveLoad` (if present)

### `responseSpeedTargetMs` (number, required)

**Description:** Target response time in milliseconds for learners completing prompts in this pack.

**Range:** 500-3000 milliseconds

**Derivation:** Deterministically computed from:
- CEFR level (base target)
- `cognitiveLoad` (adjustment factor)

**Base Targets by Level:**
- A1: 1500ms
- A2: 1200ms
- B1: 1000ms
- B2: 900ms
- C1: 800ms
- C2: 700ms

**Adjustments by Cognitive Load:**
- Low: -200ms
- Medium: 0ms
- High: +300ms

**Examples:**
- A1 + Low = 1300ms
- A2 + Medium = 1200ms
- B1 + High = 1300ms

**Validation:**
- Must be a number between 500 and 3000 (inclusive)

### `fluencyOutcome` (string, required)

**Description:** Intended fluency outcome that learners should achieve after completing this pack.

**Derivation:** Deterministically derived from `scenario` and `primaryStructure` using pattern matching.

**Examples:**
- `"automatic_opening"` - for greeting/opening phrase packs
- `"polite_requests"` - for modal verb request packs
- `"professional_requests"` - for work scenario modal packs
- `"meeting_scheduling"` - for work scenario time/schedule packs
- `"workplace_communication"` - for general work scenario packs
- `"polite_ordering"` - for restaurant scenario modal packs
- `"restaurant_interactions"` - for general restaurant packs
- `"transaction_phrases"` - for shopping scenario packs
- `"health_appointments"` - for doctor scenario packs
- `"rental_communication"` - for housing scenario packs
- `"time_expressions"` - for time-focused packs
- `"automatic_word_order"` - for verb position packs
- `"fluent_expression"` - default generic outcome

**Validation:**
- Must be a non-empty string
- Must be derived deterministically (no free text)

### `whyThisWorks` (array of strings, required)

**Description:** Array of 2-5 human-readable explanations (each ≤120 chars) explaining why this pack is effective.

**Derivation:** 
1. If `successCriteria` exists and has ≥2 items, use those (truncated to 120 chars each)
2. Otherwise, generate deterministically from:
   - `primaryStructure` (structure-based explanations)
   - `scenario` (scenario-based explanations)
   - `variationSlots` (variation-based explanations)
   - `level` (level-appropriate explanations)

**Examples:**
```json
[
  "forces verb-second position under time pressure",
  "alternates subject + tense to prevent chanting",
  "uses high-frequency office contexts"
]
```

**Validation:**
- Must be an array with 2-5 items
- Each item must be a non-empty string ≤120 characters
- Must be derived deterministically (no free text, no randomness)

## Integration with Existing Analytics

Catalog-level analytics complement existing computed metrics:

**Computed Metrics (from `computePackAnalytics`):**
- `version`, `qualityGateVersion`
- `promptCount`, `multiSlotRate`
- `scenarioTokenHitAvg`, `scenarioTokenQualifiedRate`
- `uniqueTokenRate`, `bannedPhraseViolations`
- `passesQualityGates`

**Catalog Metrics (from `computePackCatalogAnalytics`):**
- `primaryStructure`, `variationSlots`
- `slotSwitchDensity`, `promptDiversityScore`
- `scenarioCoverageScore`, `estimatedCognitiveLoad`

**Catalog-Level Analytics (new, required):**
- `focus`, `cognitiveLoad`, `responseSpeedTargetMs`
- `fluencyOutcome`, `whyThisWorks`

## Usage Examples

### Smart Sorting

```typescript
// Sort packs by cognitive load and response speed
packs.sort((a, b) => {
  const loadOrder = { low: 1, medium: 2, high: 3 };
  const loadCmp = loadOrder[a.analytics.cognitiveLoad] - loadOrder[b.analytics.cognitiveLoad];
  if (loadCmp !== 0) return loadCmp;
  return a.analytics.responseSpeedTargetMs - b.analytics.responseSpeedTargetMs;
});

// Filter by fluency outcome
const openingPacks = packs.filter(p => 
  p.analytics.fluencyOutcome === 'automatic_opening'
);
```

### Frontend Copy Generation

```typescript
// Generate pack description from analytics
function generatePackDescription(pack: PackEntry): string {
  const { focus, cognitiveLoad, fluencyOutcome, whyThisWorks } = pack.analytics;
  
  return `This pack trains ${fluencyOutcome.replace(/_/g, ' ')}. ` +
         `Focus: ${focus.replace(/_/g, ' ')}. ` +
         `Cognitive load: ${cognitiveLoad}. ` +
         whyThisWorks[0];
}
```

### B2B Export

```json
{
  "packId": "work_2",
  "focus": "verb_position",
  "cognitiveLoad": "medium",
  "responseSpeedTargetMs": 1200,
  "fluencyOutcome": "automatic_opening",
  "rationale": [
    "forces verb-second position under time pressure",
    "alternates subject + tense to prevent chanting",
    "uses high-frequency office contexts"
  ]
}
```

### Quality Audits

```typescript
// Identify weak packs automatically
function findWeakPacks(packs: PackEntry[]): PackEntry[] {
  return packs.filter(pack => {
    const { whyThisWorks, cognitiveLoad, responseSpeedTargetMs } = pack.analytics;
    
    // Weak indicators
    if (whyThisWorks.length < 2) return true;
    if (cognitiveLoad === 'high' && responseSpeedTargetMs < 1000) return true;
    if (whyThisWorks.some(bullet => bullet.length < 20)) return true;
    
    return false;
  });
}
```

## Implementation Details

### Generator Integration

The `generate-pack.ts` script derives all catalog-level analytics deterministically:

```typescript
const focus = deriveFocus(template.primaryStructure);
const cognitiveLoad = catalogAnalytics.estimatedCognitiveLoad;
const responseSpeedTargetMs = deriveResponseSpeedTargetMs(level, cognitiveLoad);
const fluencyOutcome = deriveFluencyOutcome(template.scenarioId, template.primaryStructure);
const whyThisWorks = deriveWhyThisWorks(
  baseAnalytics.successCriteria,
  template.primaryStructure,
  template.scenarioId,
  template.variationSlots,
  level
);
```

### Validator Enforcement

The `validate-content.ts` script enforces:
- Hard-fail if any required catalog-level analytics field is missing
- Validate allowed values (enums, ranges)
- Enforce `responseSpeedTargetMs` range (500-3000ms)
- Ensure `whyThisWorks` has 2-5 items, each ≤120 chars
- Verify `cognitiveLoad` matches `estimatedCognitiveLoad`

### Index Propagation

The `generate-indexes.ts` script optionally includes catalog-level analytics in `SectionIndexItem`:

```typescript
interface SectionIndexItem {
  // ... other fields ...
  focus?: string;
  cognitiveLoad?: 'low' | 'medium' | 'high';
  fluencyOutcome?: string;
}
```

This enables frontend filtering and sorting without loading full pack entries.

## Acceptance Criteria

✅ All packs have catalog-level analytics metadata  
✅ Analytics are deterministic and validated  
✅ Section indexes can expose analytics  
✅ No frontend or engine changes required  
✅ All validation rules enforced  
✅ Documentation complete  

## Related Documentation

- [PACK_SCHEMA.md](./PACK_SCHEMA.md) - Full pack schema definition
- [QUALITY_GATES.md](./QUALITY_GATES.md) - Quality gate definitions
- [SECTION_INDEX_SCHEMA.md](../../SECTION_INDEX_SCHEMA.md) - Index schema

## Future Enhancements

Once analytics metadata is locked, future steps will include:
1. Pack Effectiveness Telemetry hooks (FE-assisted, still cheap)
2. Government Office onboarding spine (A1 default path)
3. B2B export v2 (now actually meaningful)

But do not jump ahead. This layer must be solid first.
