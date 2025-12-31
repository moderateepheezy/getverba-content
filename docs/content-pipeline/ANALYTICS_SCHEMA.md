# Catalog-Level Analytics Schema

This document defines the **required** catalog-level analytics metadata for Pack and Drill entries. These analytics make every pack and drill explainable in deterministic, non-ML terms.

## Purpose

Catalog-level analytics answer the question: **"Why does this pack work?"**

This metadata becomes:
- Your internal quality bar
- Your future ranking/sorting layer
- Your investor proof
- Your future B2B export spine

## Schema

All Pack and Drill entries **must** include an `analytics` object with the following structure:

```json
{
  "analytics": {
    "primaryStructure": "verb_position_subordinate",
    "variationSlots": ["subject", "verb", "time"],
    "slotSwitchDensity": 0.42,
    "promptDiversityScore": 0.68,
    "scenarioCoverageScore": 0.91,
    "estimatedCognitiveLoad": "medium",
    "intendedOutcome": "A1 work intake readiness"
  }
}
```

## Required Fields

| Field | Type | Description | Range/Values |
|-------|------|-------------|--------------|
| `primaryStructure` | string | Primary grammatical structure identifier | Must match pack.primaryStructure |
| `variationSlots` | string[] | Array of slot types that can be varied | Must match pack.variationSlots |
| `slotSwitchDensity` | number | % of prompts that change ≥2 slots | 0.0 - 1.0 |
| `promptDiversityScore` | number | Lexical + structural uniqueness across prompts | 0.0 - 1.0 |
| `scenarioCoverageScore` | number | % of scenario token groups represented | 0.0 - 1.0 |
| `estimatedCognitiveLoad` | string | Estimated cognitive load for learners | "low" \| "medium" \| "high" |
| `intendedOutcome` | string | Human-written description of learning objective | Non-empty, no TODO markers |

## Field Semantics

### `primaryStructure` (required, string)

**What this pack trains structurally.** Must match the pack's top-level `primaryStructure` field exactly.

**Examples:**
- `"verb_position_subordinate"`
- `"modal_verbs_requests"`
- `"dative_case_objects"`

**Validation:**
- Must be a non-empty string
- Must match `pack.primaryStructure` exactly (validator hard-fails on mismatch)

### `variationSlots` (required, array)

**What slots can be varied across prompts.** Must match the pack's top-level `variationSlots` array exactly.

**Allowed values:**
- `"subject"`
- `"verb"`
- `"object"`
- `"modifier"`
- `"tense"`
- `"polarity"`
- `"time"`
- `"location"`

**Examples:**
- `["subject", "verb"]`
- `["subject", "verb", "time"]`
- `["verb", "object", "modifier"]`

**Validation:**
- Must be a non-empty array
- Must match `pack.variationSlots` exactly (order-independent, validator hard-fails on mismatch)

### `slotSwitchDensity` (required, number, 0-1)

**% of prompts that change ≥2 slots.**

This measures how much variation exists across prompts. Higher density = more diverse practice, which prevents "chanting" (repeating the same pattern without thinking).

**Computation:**
```
slotSwitchDensity = (number of prompts with 2+ slotsChanged) / total prompts
```

**Examples:**
- `0.0` - No prompts change multiple slots (low variation)
- `0.30` - 30% of prompts change 2+ slots (minimum target)
- `0.50` - 50% of prompts change 2+ slots (good variation)
- `1.0` - All prompts change 2+ slots (high variation)

**Validation:**
- Must be a number between 0.0 and 1.0
- Computed deterministically from `prompts[].slotsChanged` arrays

### `promptDiversityScore` (required, number, 0-1)

**Lexical + structural uniqueness across prompts.**

Combines:
- **Lexical diversity**: unique tokens / total tokens (70% weight)
- **Structural diversity**: coefficient of variation of prompt lengths (30% weight)

Higher scores indicate more diverse prompts, which provide better practice.

**Computation:**
```
lexicalDiversity = uniqueTokens / totalTokens
structuralDiversity = stdDev(promptLengths) / avg(promptLengths)
promptDiversityScore = (lexicalDiversity * 0.7) + (structuralDiversity * 0.3)
```

**Examples:**
- `0.0` - All prompts are identical (no diversity)
- `0.5` - Moderate diversity
- `0.8` - High diversity
- `1.0` - Maximum diversity

**Validation:**
- Must be a number between 0.0 and 1.0
- Computed deterministically from prompt texts

### `scenarioCoverageScore` (required, number, 0-1)

**% of scenario token groups represented.**

Groups scenario tokens into semantic clusters (3 tokens per cluster) and measures how many clusters are represented in the prompts. Higher scores indicate better scenario authenticity.

**Computation:**
```
1. Group scenario tokens into clusters (3 tokens per cluster)
2. Count how many clusters appear in prompts
3. scenarioCoverageScore = representedClusters / totalClusters
```

**Examples:**
- `0.0` - No scenario tokens present (generic content)
- `0.5` - Half of scenario token groups represented
- `0.9` - Most scenario token groups represented (good coverage)
- `1.0` - All scenario token groups represented (excellent coverage)

**Validation:**
- Must be a number between 0.0 and 1.0
- Computed deterministically from prompt texts and scenario token dictionary

### `estimatedCognitiveLoad` (required, enum)

**Estimated cognitive load for learners.**

Derived from:
- Number of variation slots
- Slot switch density
- Average response length (estimated from prompt length)

**Values:**
- `"low"`: Simple patterns, few variations (typically A1 with ≤2 variationSlots)
- `"medium"`: Moderate complexity (typically A1-A2 with 2-3 variationSlots)
- `"high"`: Complex patterns, many variations (typically A2+ with ≥4 variationSlots)

**Computation:**
```
score = 0
if (slotCount <= 2) score += 1
else if (slotCount <= 3) score += 2
else score += 3

if (slotSwitchDensity >= 0.5) score += 2
else if (slotSwitchDensity >= 0.3) score += 1

if (avgLength >= 10) score += 2
else if (avgLength >= 6) score += 1

if (score <= 2) return "low"
if (score <= 4) return "medium"
return "high"
```

**Validation:**
- Must be one of: `"low"`, `"medium"`, `"high"`
- Computed deterministically from pack characteristics

### `intendedOutcome` (required, string)

**Human-written description of learning objective.**

**REQUIRED**: Must be human-written. No TODO markers, no auto-generation placeholders.

**Examples:**
- `"A1 work intake readiness"`
- `"A2 government office form completion"`
- `"A1 restaurant ordering fluency"`

**Validation:**
- Must be a non-empty string
- Must NOT contain "TODO", "FIXME", or "TBD" (case-insensitive)
- Validator hard-fails if contains placeholder markers

## Deterministic Computation

All metrics are computed **deterministically** (no ML, no randomness):

1. **slotSwitchDensity**: Count prompts with `slotsChanged.length >= 2`
2. **promptDiversityScore**: Token-based lexical diversity + length-based structural diversity
3. **scenarioCoverageScore**: Cluster-based scenario token coverage
4. **estimatedCognitiveLoad**: Rule-based scoring from slot count, density, and length

## Validation Rules

### Hard Failures

The validator will **hard-fail** (prevent publishing) if:

1. ✅ `analytics` object is missing
2. ✅ Any required field is missing
3. ✅ `primaryStructure` does not match `pack.primaryStructure`
4. ✅ `variationSlots` does not match `pack.variationSlots`
5. ✅ Numeric fields are outside valid ranges (0-1)
6. ✅ `estimatedCognitiveLoad` is not a valid enum value
7. ✅ `intendedOutcome` contains TODO/FIXME/TBD markers
8. ✅ `intendedOutcome` is empty

### Field Matching

- `analytics.primaryStructure` must equal `pack.primaryStructure` exactly
- `analytics.variationSlots` must match `pack.variationSlots` exactly (order-independent)

## Generator Auto-Population

Generators (`scripts/generate-pack.ts`, `scripts/generate-pack-from-template.ts`) automatically populate all analytics fields:

1. **Computed fields** (slotSwitchDensity, promptDiversityScore, scenarioCoverageScore, estimatedCognitiveLoad) are computed deterministically
2. **Matched fields** (primaryStructure, variationSlots) are copied from pack metadata
3. **intendedOutcome** is auto-generated with a TODO marker - **must be replaced with human-written text before approval**

## Migration

For existing packs without catalog-level analytics:

```bash
# Backfill analytics for all packs in a workspace
tsx scripts/backfill-catalog-analytics.ts --workspace de

# Dry run to see what would be updated
tsx scripts/backfill-catalog-analytics.ts --workspace de --dry-run
```

Migration:
1. Computes all metrics deterministically from existing pack data
2. Generates `intendedOutcome` with TODO marker (must be replaced manually)
3. Preserves existing analytics fields (backward compatible)

## Examples

### Pack Entry

```json
{
  "id": "work_basic_a1",
  "kind": "pack",
  "scenario": "work",
  "register": "formal",
  "primaryStructure": "modal_verbs_requests",
  "variationSlots": ["subject", "verb", "time"],
  "analytics": {
    "primaryStructure": "modal_verbs_requests",
    "variationSlots": ["subject", "verb", "time"],
    "slotSwitchDensity": 0.42,
    "promptDiversityScore": 0.68,
    "scenarioCoverageScore": 0.91,
    "estimatedCognitiveLoad": "medium",
    "intendedOutcome": "A1 work intake readiness"
  }
}
```

### Drill Entry

```json
{
  "id": "verb_endings_a1",
  "kind": "drill",
  "level": "A1",
  "analytics": {
    "primaryStructure": "drill_pattern",
    "variationSlots": [],
    "slotSwitchDensity": 0.0,
    "promptDiversityScore": 0.65,
    "scenarioCoverageScore": 0.0,
    "estimatedCognitiveLoad": "low",
    "intendedOutcome": "A1 verb conjugation accuracy"
  }
}
```

## Frontend Usage

Catalog-level analytics enable:

1. **Sorting**: Sort packs by `slotSwitchDensity`, `promptDiversityScore`, or `estimatedCognitiveLoad`
2. **Filtering**: Filter by `estimatedCognitiveLoad` or `primaryStructure`
3. **Display**: Show "why this pack works" tooltips using `intendedOutcome`
4. **Ranking**: Use metrics for recommendation algorithms

## Backward Compatibility

Existing analytics fields (goal, constraints, levers, etc.) remain **optional** for backward compatibility. The new catalog-level analytics fields are **required** and enforced at validation time.

## Related Documentation

- [PACK_SCHEMA.md](./PACK_SCHEMA.md) - Full pack entry schema
- [DRILLS_SCHEMA.md](./DRILLS_SCHEMA.md) - Full drill entry schema
- [QUALITY_GATES.md](./QUALITY_GATES.md) - Quality gate rules
- [ANALYTICS_METADATA.md](./ANALYTICS_METADATA.md) - Legacy analytics metadata (optional)

