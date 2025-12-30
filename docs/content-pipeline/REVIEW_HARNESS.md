# Review Harness Workflow

This document describes the review harness system that enforces human sign-off before content promotion to production.

## Overview

The review harness provides a deterministic workflow for content approval:

1. **Generate** → Content is automatically added to `pending.json`
2. **Validate/Quality** → Run quality gates and duplicate detection
3. **Sprint Report** → Review metrics and identify issues
4. **Manual Approval** → Move approved items from `pending.json` to `approved.json`
5. **Promote** → Promotion script enforces that all items are approved (hard fail otherwise)

This turns "Cursor generated it" into "Cursor proposes it, pipeline enforces it."

## Files

### `content/review/pending.json`

Auto-populated by generators (`generate-pack.ts`, batch generators). Contains items waiting for review:

```json
[
  {
    "id": "anmeldung_address_registration_a1",
    "kind": "pack",
    "workspace": "de",
    "scenario": "government_office",
    "level": "A1",
    "title": "Government Office - A1",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "sourceTemplate": "government_office.json"
  }
]
```

### `content/review/approved.json`

Curated list of items that have been reviewed and approved. Only items in this list can be included in production manifest.

```json
[
  {
    "id": "anmeldung_address_registration_a1",
    "kind": "pack",
    "workspace": "de",
    "scenario": "government_office",
    "level": "A1",
    "title": "Government Office - A1",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "sourceTemplate": "government_office.json"
  }
]
```

## Workflow

### Step 1: Generate Content

When you generate packs or drills, they are automatically added to `pending.json`:

```bash
# Generate a pack
npx tsx scripts/generate-pack.ts \
  --workspace de \
  --packId anmeldung_address_registration_a1 \
  --scenario government_office \
  --level A1 \
  --seed 1

# Pack is automatically added to content/review/pending.json
```

### Step 2: Validate and Quality Check

Run validation and quality gates:

```bash
# Validate schema and quality gates
npm run content:validate

# Run quality report
npm run content:quality

# Check for duplicates
npm run content:dedupe -- --workspace de
```

### Step 3: Generate Sprint Report

Generate a comprehensive report with all metrics:

```bash
./scripts/sprint-report.sh --workspace de
```

The report includes:
- Pending vs approved counts
- Missing natural_en counts by pack
- Duplicate checks summary
- Scenario token pass rate
- Multi-slot variation stats
- Top repeated intents
- Pack metadata completeness

### Step 4: Review and Approve

Manually review items in `content/review/pending.json` and move approved items to `content/review/approved.json`:

```bash
# Option 1: Edit files directly
# Copy approved items from pending.json to approved.json

# Option 2: Use a script (create if needed)
# scripts/approve-item.sh <item-id> <workspace>
```

**Approval Criteria:**
- ✅ Passes validation (`npm run content:validate`)
- ✅ Passes quality gates (`npm run content:quality`)
- ✅ No duplicate prompts (`npm run content:dedupe`)
- ✅ Has required fields (scenario, register, primaryStructure, variationSlots)
- ✅ For government_office or A2+: all prompts have `natural_en`
- ✅ Content feels "rich," not templated
- ✅ No out-of-scenario prompts
- ✅ No "literal meaning ≠ native meaning" drift

### Step 5: Promote

The promotion script enforces approval:

```bash
./scripts/promote-staging.sh
```

**Preflight Check:**
- All items referenced in staging manifest must be in `approved.json`
- Hard fail if any unapproved items are found
- Clear error message listing missing approvals

## Duplicate Detection

The duplicate detection script (`npm run content:dedupe`) checks for:

1. **Exact Duplicates** (HARD FAIL):
   - Same normalized text (lowercase, stripped punctuation, collapsed whitespace)
   - Within the same pack OR across packs in the same workspace

2. **Near-Duplicates** (WARNING):
   - Similarity > 0.85 using trigram Jaccard similarity
   - Within pack or across packs

**Usage:**
```bash
npm run content:dedupe -- --workspace de
```

**Output:**
- Lists exact duplicates (hard fail)
- Lists near-duplicates with similarity scores (warning)
- Summary counts

## Native Meaning Guard

The `natural_en` field guards against "literal meaning ≠ native meaning" drift.

### Schema

Each prompt should have:
- `gloss_en`: Literal-ish scaffold (already generated)
- `natural_en`: Native meaning paraphrase (short, idiomatic English)

### Quality Rules

1. **Required for:**
   - `scenario === "government_office"` OR
   - `level >= "A2"` (A2, B1, B2, C1, C2)

2. **Optional but recommended for:**
   - A1 non-government scenarios (warning if missing)

3. **Validation:**
   - Must be 6-180 chars
   - Must not contain German tokens (literal translation check)
   - Should differ from `gloss_en` (not identical)

### Example

```json
{
  "id": "prompt-001",
  "text": "Ich brauche einen Termin.",
  "gloss_en": "I need to make an appointment.",
  "natural_en": "I'd like to schedule an appointment."
}
```

## Integration Points

### Generator Integration

`generate-pack.ts` automatically:
- Adds generated packs to `pending.json`
- Generates `natural_en` for all prompts
- Includes metadata (scenario, level, sourceTemplate)

### Promotion Integration

`promote-staging.sh` automatically:
- Runs approval preflight check before promotion
- Hard fails if unapproved items found
- Provides clear error messages

### Sprint Report Integration

`sprint-report.sh` includes:
- Pending vs approved counts
- Missing natural_en counts by pack
- Duplicate checks summary
- Scenario token pass rate
- Multi-slot variation stats

## Troubleshooting

### Promotion Fails: "Unapproved items found"

**Solution:**
1. Review items in `content/review/pending.json`
2. Move approved items to `content/review/approved.json`
3. Re-run promotion

**Check which items are unapproved:**
```bash
npx tsx scripts/check-approvals.ts content/meta/manifest.staging.json
```

### Duplicate Detection Fails

**Solution:**
1. Review duplicate prompts listed in output
2. Remove or modify duplicate prompts
3. Re-run duplicate detection

### Missing natural_en

**Solution:**
1. For government_office or A2+ packs: add `natural_en` to all prompts
2. For A1 non-government: add `natural_en` (recommended) or ignore warning

**Check missing natural_en:**
```bash
./scripts/sprint-report.sh --workspace de
# See "Natural EN Coverage" section
```

## Best Practices

1. **Review in batches**: Don't approve everything at once. Review quality first.
2. **Use sprint report**: Always check sprint report before approving.
3. **Check duplicates**: Run `npm run content:dedupe` before approving.
4. **Verify natural_en**: Ensure government_office and A2+ packs have `natural_en`.
5. **Test locally**: Run validation and quality checks before approving.

## Related Documentation

- [Quality Gates](./QUALITY_GATES.md) - Content quality rules
- [Pack Schema](./PACK_SCHEMA.md) - Pack entry schema
- [Rollout Guide](./ROLLOUT.md) - Deployment workflow
- [Prompt Meaning Contract](./PROMPT_MEANING_CONTRACT.md) - Meaning metadata schema

