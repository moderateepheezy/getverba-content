# Expansion Sprint Runbook

This document describes how to run a Content Expansion Sprint (20-50 packs) using deterministic generators and produce "scale proof" exports.

## Overview

An expansion sprint generates multiple packs/drills in a single workflow, validates them, and produces curriculum exports that prove the catalog is coherent and non-random at scale.

## Prerequisites

- Content pipeline validated and working
- Deterministic generators available (`expand-content.sh` or scenario-specific generators)
- Workspace configured with catalog and sections

## Command Sequence

### Step 1: Run Expansion Sprint

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 20 \
  --drills 10 \
  --level A1
```

This orchestrates:
1. ✅ Generate packs/drills via `expand-content.sh`
2. ✅ Regenerate indexes (`npm run content:generate-indexes`)
3. ✅ Run validation + quality gates (hard fail if any)
4. ✅ Produce sprint report (`sprint-report.sh`)
5. ✅ Produce curriculum exports (`npm run content:export-bundle`)
6. ✅ Print release candidate summary

### Step 2: Review Generated Content

```bash
cd content/v1/workspaces/de
# Review generated packs
ls -la packs/
# Review generated drills
ls -la drills/
```

### Step 3: Publish to Staging

```bash
./scripts/publish-content.sh
```

### Step 4: Run Smoke Test

```bash
./scripts/smoke-test-content.sh
```

### Step 5: Promote to Production

```bash
./scripts/promote-staging.sh
```

## Expected Outputs

### Generated Content

- **Packs**: `content/v1/workspaces/<workspace>/packs/<packId>/pack.json`
- **Drills**: `content/v1/workspaces/<workspace>/drills/<drillId>/drill.json`
- **Indexes**: Regenerated with new items included

### Sprint Report

Location: `reports/sprint-report.<workspace>.md`

Contains:
- Total items generated
- Scenario distribution
- Structure coverage
- Quality metrics
- Analytics completeness

### Curriculum Exports

Location: `exports/<workspace>/<timestamp>/<bundleId>/`

Contains:
- `bundle.json` - Manifest
- `teacher_notes.md` - Teacher guide
- `qa_report.json` - Quality metrics
- `packs/`, `drills/`, `exams/` - Entry documents

## Scale Proof Metrics

The export system automatically generates proof that the catalog is coherent:

### Scenario Coverage Matrix

From `qa_report.json`:
```json
{
  "coverage": {
    "scenarios": {
      "government_office": 20,
      "work": 15,
      "restaurant": 10
    }
  }
}
```

### Structure Coverage Counts

```json
{
  "coverage": {
    "structures": {
      "verb_position": 15,
      "modal_verbs": 10,
      "dative_case": 5
    }
  }
}
```

### Banned Phrase Hits

Should be **zero** (hard fail if > 0):
- Quality gates check for generic template phrases
- Export validates before generating bundle

### Token Coverage Stats

Per-scenario token density:
- Ensures scenario-specific vocabulary
- Validates scenario authenticity
- Prevents generic/placeholder content

### Duplicate Detection

From `qa_report.json`:
```json
{
  "quality": {
    "duplicateTitles": null,  // Should be null (zero duplicates)
    "duplicateIds": null       // Should be null (zero duplicates)
  }
}
```

## Troubleshooting

### Validation Fails

If validation fails during sprint:
1. Check error messages
2. Fix content issues
3. Re-run sprint (will skip already-generated items)

### Quality Gates Fail

If quality gates fail:
1. Review quality report: `reports/content-quality-report.<workspace>.json`
2. Fix quality issues (generic phrases, multi-slot variation, etc.)
3. Re-run validation

### Export Fails

If export fails:
1. Check that indexes are regenerated
2. Verify entry documents exist
3. Check pagination chain is valid

## Manual Steps (if needed)

If the orchestrator script is not available, run steps manually:

```bash
# 1. Generate packs
./scripts/expand-content.sh --workspace de --section context --count 20 --scenario government_office --level A1

# 2. Regenerate indexes
npm run content:generate-indexes -- --workspace de

# 3. Validate
npm run content:validate

# 4. Quality gates
npm run content:quality

# 5. Sprint report
./scripts/sprint-report.sh --workspace de

# 6. Export bundle
npm run content:export-bundle -- --workspace de --section all --scenario government_office --level A1 --out ./exports
```

## Integration with Rollout

After expansion sprint:

1. **Review exports**: Check `exports/<workspace>/*/qa_report.json`
2. **Attach to release**: Bundle exports with release artifacts
3. **Publish**: Run `./scripts/publish-content.sh`
4. **Smoke test**: Verify content is accessible
5. **Promote**: Run `./scripts/promote-staging.sh`

## Related Documentation

- [Curriculum Exports](./CURRICULUM_EXPORTS.md) - Export format and usage
- [Rollout Workflow](./ROLLOUT.md) - Publishing and promotion
- [Analytics Metadata](./ANALYTICS_METADATA.md) - Analytics schema
- [Quality Gates](./QUALITY_GATES.md) - Quality validation rules

