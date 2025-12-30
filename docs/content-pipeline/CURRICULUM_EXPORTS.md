# Curriculum Exports

This document describes the curriculum bundle export system for generating B2B-ready curriculum artifacts (SCORM-ish) from GetVerba content.

## Overview

Curriculum exports produce school-friendly bundles that:
- Are generated deterministically from existing content JSON
- Carry "why this pack works" metadata
- Are auditable (reports + constraints), proving "not random/generic" at catalog scale
- Can be consumed by schools without requiring engine/ML infrastructure

## What is Exported

Each bundle contains:

### bundle.json
Manifest of what's inside the bundle:
- Bundle metadata (ID, workspace, section, scenario, level)
- List of included items (packs, drills, exams)
- Item counts and statistics

### Entry Documents
Copied pack/drill/exam JSON files organized by type:
- `packs/` - Pack entry documents
- `drills/` - Drill entry documents  
- `exams/` - Exam entry documents

### teacher_notes.md
Human-readable teacher guide derived from:
- Analytics metadata (goal, whyThisWorks, exitConditions)
- Outline and session plan structure
- Scenario and register information
- Variation slots and primary structures

### qa_report.json
Quality assurance report with:
- Coverage metrics (scenarios, structures, levels)
- Duplicate detection (titles, IDs)
- Analytics completeness (whyThisWorks, exitConditions)
- Item counts and distributions

### imsmanifest.xml (Optional)
SCORM stub for LMS compatibility (if `--format bundle+scormstub` is used).

## How to Run

### Basic Export

Export all items from a section:

```bash
npm run content:export-bundle -- --workspace de --section context --out ./exports
```

### Filtered Export

Export specific scenario and level:

```bash
npm run content:export-bundle -- \
  --workspace de \
  --section context \
  --scenario government_office \
  --level A1 \
  --out ./exports
```

### Export All Sections

```bash
npm run content:export-bundle -- --workspace de --section all --out ./exports
```

### With SCORM Stub

```bash
npm run content:export-bundle -- \
  --workspace de \
  --section context \
  --format bundle+scormstub \
  --out ./exports
```

## Output Structure

```
exports/
  <workspace>/
    <timestamp>/
      <bundleId>/
        bundle.json
        teacher_notes.md
        qa_report.json
        imsmanifest.xml (optional)
        packs/
          <packId>.json
          ...
        drills/
          <drillId>.json
          ...
        exams/
          <examId>.json
          ...
```

### Bundle ID Convention

Bundle IDs follow this pattern:
```
<workspace>__<section>__<scenarioOrAll>__<levelOrAll>__<gitShaShort>
```

Example: `de__context__government_office__A1__abc123`

## How This Proves "Catalog is Coherent/Non-Random at Scale"

The export system provides several proofs of coherence:

### 1. Scenario Coverage Matrix
The `qa_report.json` includes scenario distribution, showing:
- Which scenarios are covered
- How many items per scenario
- Coverage gaps

### 2. Structure Coverage Counts
Primary structure distribution proves:
- Grammatical structures are systematically covered
- No single structure dominates
- Balanced progression across levels

### 3. Duplicate Detection
Automatic detection of:
- Duplicate titles (should be zero)
- Duplicate IDs (hard fail)
- Near-duplicate content (quality gates)

### 4. Analytics Completeness
Tracks:
- Items with `whyThisWorks` metadata
- Items with `exitConditions`
- Items with full analytics blocks

### 5. Token Coverage Stats
Per-scenario token density (from quality gates):
- Ensures scenario-specific vocabulary
- Prevents generic/placeholder content
- Validates scenario authenticity

## How Schools Could Consume It

### Option 1: Direct JSON Consumption
Schools can:
1. Load `bundle.json` to see what's included
2. Read `teacher_notes.md` for pedagogical guidance
3. Use pack/drill/exam JSON files directly in their systems

### Option 2: SCORM Import
If SCORM stub is included:
1. Import `imsmanifest.xml` into LMS
2. LMS reads bundle structure
3. Content files referenced in manifest

### Option 3: Manual Review
1. Review `teacher_notes.md` for curriculum overview
2. Check `qa_report.json` for quality metrics
3. Validate coverage and coherence
4. Import selected packs into their system

## Integration with Review Harness

The export system integrates with the review harness:

1. **Pre-export validation**: Export runs `npm run content:validate` first
2. **Quality gates**: Must pass quality checks before export
3. **Analytics enforcement**: Validates `whyThisWorks` and `exitConditions` are present
4. **Duplicate detection**: Reports duplicate titles/IDs in QA report

## Example Output

### bundle.json
```json
{
  "version": "v1",
  "bundleId": "de__context__government_office__A1__abc123",
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "gitSha": "abc123",
  "workspace": "de",
  "section": "context",
  "scenario": "government_office",
  "level": "A1",
  "items": [
    {
      "id": "government_office_basic",
      "kind": "pack",
      "title": "Government Office - Basic",
      "level": "A1",
      "entryUrl": "/v1/workspaces/de/packs/government_office_basic/pack.json",
      "entryPath": "packs/pack.json"
    }
  ],
  "metadata": {
    "totalPacks": 1,
    "totalDrills": 0,
    "totalExams": 0,
    "totalItems": 1
  }
}
```

### teacher_notes.md (excerpt)
```markdown
# Teacher Notes

**Generated**: 2025-01-15T10:30:00.000Z
**Total Items**: 1

## Government Office - Basic

- **ID**: government_office_basic
- **Level**: A1
- **Scenario**: government_office
- **Register**: formal
- **Primary Structure**: verb_position
- **Variation Slots**: subject, verb, object, time
- **Estimated Time**: 15 minutes
- **Goal**: Practice formal government_office interactions at A1 level
- **Why This Works**:
  - High-frequency bureaucratic intents
  - Multi-slot substitution to prevent chanting
  - Short response windows encourage retrieval speed
- **Exit Conditions**:
  - Target Minutes: 5
  - Complete When: sessionPlan_completed_once

### Outline

1. Making an Appointment
2. Providing Documents
3. Confirming Details

### Session Plan

**Step 1: Making an Appointment**
- Prompt IDs: prompt-001, prompt-002
...
```

### qa_report.json (excerpt)
```json
{
  "version": "v1",
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "summary": {
    "totalItems": 1,
    "totalPacks": 1,
    "totalDrills": 0,
    "totalExams": 0
  },
  "coverage": {
    "scenarios": {
      "government_office": 1
    },
    "structures": {
      "verb_position": 1
    },
    "levels": {
      "A1": 1
    }
  },
  "quality": {
    "duplicateTitles": null,
    "duplicateIds": null,
    "itemsWithAnalytics": 1,
    "itemsWithWhyThisWorks": 1,
    "itemsWithExitConditions": 1
  }
}
```

## Related Documentation

- [Analytics Metadata](./ANALYTICS_METADATA.md) - Analytics schema and fields
- [Pack Schema](./PACK_SCHEMA.md) - Pack entry structure
- [Expansion Sprint](./EXPANSION_SPRINT.md) - Running expansion sprints
- [Rollout Workflow](./ROLLOUT.md) - Publishing and promotion

