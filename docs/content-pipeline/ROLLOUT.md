# Content Rollout Guide

This document describes the workflow for rolling out new content to production.

## Drills v4 Workflow

### 1. Generate Drills

Generate drills from mechanic templates:

```bash
# Generate all drills for a workspace
tsx scripts/generate-drills-v4.ts --workspace de --all

# Generate a specific drill
tsx scripts/generate-drills-v4.ts --workspace de --mechanic verb_present_tense --level A1 --tier 1 --loop-type pattern_switch
```

### 2. Generate Indexes

Generate mechanics indexes and section indexes:

```bash
# Generate mechanics indexes
tsx scripts/generate-mechanics-indexes.ts --workspace de

# Generate all section indexes (includes drills)
npm run content:generate-indexes
```

### 3. Validate Content

Run validation to check for schema errors and quality gate violations:

```bash
npm run content:validate
```

### 4. Quality Check

Run quality checks:

```bash
npm run content:quality
```

### 5. Review Queue

Check what needs review:

```bash
# List all items needing review
./scripts/review-queue.sh

# List only drills
./scripts/review-queue.sh --kind drill
```

### 6. Approve Drills

Approve drills individually or in batches:

```bash
# Approve a single drill
./scripts/approve-drill.sh <drill-id> --reviewer "John Doe"

# Approve in batch (use approve-batch.sh for packs, adapt for drills)
```

### 7. Check Approval Gate

Before promoting, ensure all content is approved:

```bash
tsx scripts/check-approval-gate.ts
```

### 8. Generate Report

Generate a drills v4 report:

```bash
tsx scripts/drills-v4-report.ts --workspace de
```

### 9. Promote to Staging

Promote content to staging:

```bash
./scripts/promote-staging.sh
```

### 10. Promote to Production

After staging validation, promote to production:

```bash
./scripts/promote-prod.sh
```

## Drills v4 Schema

Drills v4 must include:
- `drillVersion: "v4"`
- `mechanicId` and `mechanicLabel`
- `loopType` (enum: pattern_switch, slot_substitution, micro_transform, fast_recall, contrast_pairs, error_trap)
- `difficultyTier` (1, 2, or 3)
- `shortTitle` (max 28 chars)
- `subtitle` (40-60 chars)
- `analytics` with v4 structure
- `provenance` and `review` blocks

See `docs/content-pipeline/DRILL_SCHEMA_V4.md` for full schema.

## Mechanics Indexes

Mechanics indexes are generated automatically and provide:
- `/v1/workspaces/{ws}/mechanics/index.json` - List of all mechanics
- `/v1/workspaces/{ws}/mechanics/{mechanicId}/index.json` - Drills for a specific mechanic

These indexes are used by the frontend to group drills by mechanic.
