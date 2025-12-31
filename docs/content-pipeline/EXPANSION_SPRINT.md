# Expansion Sprint Runbook

This document describes how to run an Expansion Sprint: a batch generation of 20-50 packs/drills with automated quality gates, coherence reports, and staging release preparation.

## Overview

An Expansion Sprint is a systematic process to:
1. Generate a coherent batch of content (20-50 items)
2. Run all quality gates and validation
3. Produce coherence and sprint reports
4. Prepare a staging release that can be promoted safely

The sprint runner automates the entire workflow, from generation to release checklist.

## Quick Start

### Basic Template-Based Sprint

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 20 \
  --drills 10 \
  --level A1 \
  --source template
```

### PDF-Based Sprint

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 30 \
  --level A1 \
  --source pdf \
  --pdf ./imports/government_forms.pdf \
  --promptsPerPack 12
```

### Mixed Source Sprint with Auto-Approval

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 20 \
  --level A1 \
  --source mixed \
  --pdf ./imports/government_forms.pdf \
  --promptsPerPack 12 \
  --reviewer "Afees" \
  --autoApproveTop 5
```

## Parameters

### Required Parameters

- `--workspace <ws>`: Workspace identifier (e.g., `de`, `en`)
- `--scenario <scenario>`: Content scenario:
  - `government_office`
  - `work`
  - `housing`
  - `doctor`
  - `shopping`
  - `auto` (for PDF discovery)
- `--packs <N>`: Number of packs to generate (1-50)
- `--level <level>`: CEFR level (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`)

### Optional Parameters

- `--drills <N>`: Number of drills to generate (default: 0)
- `--source <source>`: Source type:
  - `template`: Generate from templates only
  - `pdf`: Generate from PDF only
  - `mixed`: Use both templates and PDF (default)
- `--pdf <path>`: Path to PDF file (required if source includes `pdf`)
- `--promptsPerPack <N>`: Prompts per pack (default: 12)
- `--reviewer <name>`: Reviewer name for batch approval
- `--autoApproveTop <N>`: Auto-approve top N packs by quality score (default: 0)

## Recommended Sprint Mixes

### High Coherence Scenarios

For routine, high-coherence scenarios (government_office, work):

```bash
# Government Office A1 (routine, high coherence)
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 20 \
  --drills 10 \
  --level A1 \
  --source template \
  --autoApproveTop 5 \
  --reviewer "Afees"
```

### Mixed Scenario Sprint

For diverse content coverage:

```bash
# 20 gov_office + 10 housing + 10 mechanics
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 20 \
  --level A1 \
  --source template

./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario housing \
  --packs 10 \
  --level A1 \
  --source template

./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario work \
  --packs 10 \
  --level A1 \
  --source template
```

### PDF-Based Sprint

For content extracted from PDFs:

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario auto \
  --packs 30 \
  --level A1 \
  --source pdf \
  --pdf ./imports/deutschimblick.pdf \
  --promptsPerPack 12 \
  --discoverScenarios true
```

## Workflow

### 1. Content Generation

The sprint runner generates content based on the `--source` parameter:

- **Template-based**: Finds templates matching scenario and level, generates packs using `generate-pack-from-template.ts`
- **PDF-based**: Runs `pdf-to-packs-batch.ts` with scenario discovery enabled
- **Mixed**: Combines both approaches

All generated packs default to `review.status="needs_review"`.

### 2. Index Rebuilding

Rebuilds section indexes for the workspace:

```bash
npm run content:generate-indexes -- --workspace <ws>
```

### 3. Validation

Runs comprehensive validation:

```bash
npm run content:validate
```

This includes:
- Schema validation
- Content quality checks
- Expansion report

### 4. Quality Checks

Runs quality gates including deduplication:

```bash
npm run content:quality
```

This includes:
- Quality report generation
- Duplicate detection
- Red/yellow/green status checks

### 5. Sprint Report

Generates sprint report with metrics:

```bash
./scripts/sprint-report.sh --workspace <ws>
```

Outputs:
- `sprint.md`: Markdown report
- `sprint.json`: JSON metrics

### 6. Coherence Report

Generates catalog coherence report:

```bash
tsx scripts/catalog-coherence-report.ts \
  --workspace <ws> \
  --manifest staging
```

Outputs:
- `coherence.md`: Markdown report
- `coherence.json`: JSON metrics with risk scores

### 7. Auto-Approval (Optional)

If `--autoApproveTop > 0`:

- For PDF-generated packs: Uses `approve-batch.sh` with quality scores from PDF report
- For template-generated packs: Approves top N by risk score (lowest risk = highest quality) from coherence report
- Re-runs validation and quality checks after approval

### 8. Release Checklist

Generates a release checklist with:
- Summary of generated content
- Validation and quality status
- Review status (approved vs needs_review)
- Approval gate status
- Exact publish commands
- Next steps

## Artifacts

All artifacts are saved to:

```
content/meta/sprints/<timestamp>/
```

### Generated Files

- `sprint.md` - Sprint report (markdown)
- `sprint.json` - Sprint metrics (JSON)
- `coherence.md` - Coherence report (markdown)
- `coherence.json` - Coherence metrics (JSON)
- `RELEASE_CHECKLIST.md` - Release checklist
- `validation.log` - Validation output
- `quality.log` - Quality check output
- `*.log` - Other generation logs

### Reviewing Artifacts

```bash
# View sprint report
cat content/meta/sprints/<timestamp>/sprint.md

# View coherence report
cat content/meta/sprints/<timestamp>/coherence.md

# View release checklist
cat content/meta/sprints/<timestamp>/RELEASE_CHECKLIST.md
```

## Review Workflow

### Manual Review

1. Check review queue:

```bash
npm run content:report
```

2. Review pending items:

```bash
# List pending packs
cat content/review/pending.json | jq '.[] | select(.workspace == "de")'
```

3. Approve individual packs:

```bash
./scripts/approve-pack.sh <packId> --reviewer "Afees" --workspace de
```

4. Approve batch from PDF:

```bash
./scripts/approve-batch.sh \
  --sourceRef "<pdfSlug>" \
  --limit 5 \
  --reviewer "Afees" \
  --workspace de
```

### Auto-Approval Strategy

The `--autoApproveTop` flag automatically approves the top N packs by quality score:

- **PDF packs**: Uses quality scores from PDF batch report
- **Template packs**: Uses risk scores from coherence report (lowest risk = highest quality)

After auto-approval, validation and quality checks are re-run to ensure the approval gate passes.

## Interpreting Coherence Risks

The coherence report includes risk scores for each pack. Lower scores indicate higher quality.

### Risk Factors

1. **Low Token Density**: Pack has fewer scenario tokens per prompt than average
   - Threshold: < 2 hits/prompt
   - Risk Score: +3

2. **Repeated Skeleton Patterns**: Pack has too many similar sentence structures
   - Threshold: < 70% unique skeletons
   - Risk Score: +2

### Risk Score Interpretation

- **Score 0**: No risks detected ✅
- **Score 1-2**: Low risk (minor issues)
- **Score 3-4**: Medium risk (should review)
- **Score 5+**: High risk (must review before approval)

### Using Risk Scores for Auto-Approval

When using `--autoApproveTop`, packs are sorted by risk score (ascending). The top N packs with the lowest risk scores are automatically approved.

## Publishing Sprint Artifacts

Sprint artifacts can be published to R2 (staging only) using:

```bash
./scripts/publish-content.sh --include-sprint-artifacts
```

This uploads:
- All content files
- Sprint artifacts from `content/meta/sprints/**`
- Coherence reports

Artifacts are uploaded with:
- `Cache-Control: public, max-age=31536000, immutable`
- Appropriate content-types (JSON, Markdown)

**Note**: Sprint artifacts are only published when using staging manifest (not production).

## Release Checklist

After running a sprint, review the generated `RELEASE_CHECKLIST.md`:

### Approval Gate

The approval gate passes if:
- ✅ Validation passed
- ✅ Quality checks passed
- ✅ All approved items pass post-approval validation

### Publishing

1. **Publish to Staging**:
   ```bash
   ./scripts/publish-content.sh --include-sprint-artifacts
   ```

2. **Smoke Test**:
   ```bash
   ./scripts/smoke-test-content.sh
   ```

3. **Promote to Production**:
   ```bash
   ./scripts/promote-staging.sh
```

## Troubleshooting

### Template Not Found

If templates aren't found for a scenario/level:

1. Check template locations:
   - `content/v1/workspaces/<ws>/templates/`
   - `content/templates/v1/scenarios/`

2. Verify template matches scenario and level:
   ```bash
   jq '.scenario, .level' content/templates/v1/scenarios/<scenario>.json
   ```

### PDF Generation Fails

If PDF generation fails:

1. Check PDF path is correct
2. Verify PDF is readable
3. Review `content/meta/sprints/<timestamp>/pdf-generation.log`

### Validation Fails

If validation fails:

1. Review `content/meta/sprints/<timestamp>/validation.log`
2. Fix schema or content issues
3. Re-run validation: `npm run content:validate`

### Quality Checks Fail

If quality checks fail:

1. Review `content/meta/sprints/<timestamp>/quality.log`
2. Check for duplicate prompts
3. Review quality report: `npm run content:quality-report`

### Auto-Approval Fails

If auto-approval doesn't work:

1. Ensure `--reviewer` is provided
2. Check coherence report has risk scores
3. Verify packs exist in workspace
4. Review `content/meta/sprints/<timestamp>/auto-approval.log`

## Best Practices

### Sprint Size

- **Small sprints (10-20 items)**: Good for testing new scenarios or levels
- **Medium sprints (20-30 items)**: Recommended for routine expansion
- **Large sprints (30-50 items)**: Use for major content pushes

### Scenario Selection

- Start with high-coherence scenarios (government_office, work)
- Mix scenarios for diverse coverage
- Use PDF discovery for unknown content

### Review Strategy

- Use `--autoApproveTop` for high-confidence batches
- Manually review medium-risk packs (score 3-4)
- Always review high-risk packs (score 5+)

### Quality Gates

- Always run validation and quality checks
- Review coherence reports before publishing
- Ensure approval gate passes before promoting

## Examples

### Example 1: Government Office A1 Sprint

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 20 \
  --drills 10 \
  --level A1 \
  --source template \
  --autoApproveTop 5 \
  --reviewer "Afees"
```

**Output**:
- 20 packs generated from templates
- 10 drills generated
- Top 5 packs auto-approved
- Sprint and coherence reports generated
- Release checklist created

### Example 2: PDF-Based Work Scenario

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario work \
  --packs 30 \
  --level A2 \
  --source pdf \
  --pdf ./imports/work_scenarios.pdf \
  --promptsPerPack 12
```

**Output**:
- 30 packs extracted from PDF
- Scenario discovery enabled
- Quality scores computed
- Reports generated

### Example 3: Mixed Source Sprint

```bash
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario housing \
  --packs 15 \
  --level A1 \
  --source mixed \
  --pdf ./imports/housing_guide.pdf \
  --promptsPerPack 12 \
  --autoApproveTop 3 \
  --reviewer "Afees"
```

**Output**:
- Packs from both templates and PDF
- Top 3 packs auto-approved
- Combined quality metrics
- Comprehensive reports

## Next Steps

After completing a sprint:

1. **Review Reports**: Check sprint and coherence reports
2. **Review Checklist**: Follow release checklist steps
3. **Publish**: Use `--include-sprint-artifacts` to publish
4. **Verify**: Run smoke tests
5. **Promote**: Promote to production when ready

For more information, see:
- [QUALITY_GATES.md](./QUALITY_GATES.md) - Quality gate requirements
- [TEMPLATE_SCHEMA.md](./TEMPLATE_SCHEMA.md) - Template structure
- [PDF_INGESTION.md](./PDF_INGESTION.md) - PDF ingestion process
- [SPRINT_REPORT.md](./SPRINT_REPORT.md) - Sprint report details
