# Review Harness Runbook

Quick reference for testing and operating the review harness system.

## End-to-End Testing

### 1. Generate Content

```bash
# Generate a test pack
npx tsx scripts/generate-pack.ts \
  --workspace de \
  --packId test_review_pack \
  --scenario government_office \
  --level A1 \
  --seed 1

# Verify it was added to pending.json
cat content/review/pending.json | jq '.[] | select(.id == "test_review_pack")'
```

### 2. Validate Content

```bash
# Run validation
npm run content:validate

# Run quality gates
npm run content:quality

# Check for duplicates
npm run content:dedupe -- --workspace de
```

### 3. Generate Sprint Report

```bash
# Generate comprehensive report
./scripts/sprint-report.sh --workspace de

# View report
cat docs/content-pipeline/SPRINT_REPORT.md
```

### 4. Review and Approve

```bash
# View pending items
cat content/review/pending.json | jq '.[] | {id, title, scenario, level}'

# Manually edit approved.json to move approved items
# Or use a script (if created):
# scripts/approve-item.sh test_review_pack de
```

### 5. Test Promotion Preflight

```bash
# Create a test staging manifest (if needed)
# Then test approval check:
npx tsx scripts/check-approvals.ts content/meta/manifest.staging.json

# Should pass if all items are approved, fail otherwise
```

### 6. Run Tests

```bash
# Run review harness tests
npm run test:review

# Run all tests
npm run test:all
```

## Common Operations

### Approve an Item

```bash
# 1. Edit content/review/approved.json
# 2. Copy item from pending.json to approved.json
# 3. Remove from pending.json (optional, for cleanliness)

# Or use jq:
PENDING=$(cat content/review/pending.json)
ITEM=$(echo "$PENDING" | jq '.[] | select(.id == "pack_id")')
APPROVED=$(cat content/review/approved.json)
echo "$APPROVED" | jq ". + [$ITEM]" > content/review/approved.json
```

### Check Approval Status

```bash
# Check if specific item is approved
cat content/review/approved.json | jq '.[] | select(.id == "pack_id")'

# Check all approved items
cat content/review/approved.json | jq '.[] | {id, workspace, scenario, level}'
```

### Find Duplicates

```bash
# Run duplicate detection
npm run content:dedupe -- --workspace de

# Output shows:
# - Exact duplicates (hard fail)
# - Near-duplicates with similarity scores (warning)
```

### Check Missing natural_en

```bash
# Generate sprint report (includes natural_en coverage)
./scripts/sprint-report.sh --workspace de

# Or check directly:
npx tsx scripts/sprint-report-metrics.ts --workspace de | jq '.naturalEn'
```

## Troubleshooting

### Promotion Fails: "Unapproved items found"

```bash
# 1. Check which items are unapproved
npx tsx scripts/check-approvals.ts content/meta/manifest.staging.json

# 2. Review and approve items
# 3. Re-run promotion
./scripts/promote-staging.sh
```

### Duplicate Detection Fails

```bash
# 1. See which prompts are duplicates
npm run content:dedupe -- --workspace de

# 2. Edit pack.json files to remove/modify duplicates
# 3. Re-run duplicate detection
```

### Validation Fails: Missing natural_en

```bash
# 1. Check which packs are missing natural_en
./scripts/sprint-report.sh --workspace de
# See "Natural EN Coverage" section

# 2. Add natural_en to prompts in pack.json files
# 3. Re-run validation
npm run content:validate
```

## Quick Checklist Before Promotion

- [ ] All packs pass validation (`npm run content:validate`)
- [ ] Quality gates pass (`npm run content:quality`)
- [ ] No duplicate prompts (`npm run content:dedupe`)
- [ ] All items in staging manifest are approved
- [ ] Sprint report reviewed (`./scripts/sprint-report.sh`)
- [ ] Smoke test passes (`./scripts/smoke-test-content.sh`)
- [ ] Content published to staging (`./scripts/publish-content.sh`)
- [ ] Ready to promote (`./scripts/promote-staging.sh`)

