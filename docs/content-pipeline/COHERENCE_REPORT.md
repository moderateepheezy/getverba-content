# Catalog Coherence Report

The Catalog Coherence Report is a deterministic, investor-grade export that proves catalog quality and non-randomness at scale (20-50+ packs). It catches drift early and provides auditability for every release.

## Overview

The coherence report analyzes all content in a workspace catalog and generates comprehensive metrics showing:

- **Distribution**: Scenario, register, and level distributions
- **Coverage**: Primary structure and variation slot coverage
- **Quality Metrics**: Prompt metrics, token coverage, multi-slot variation
- **Violations**: Banned phrases and duplicates (should be 0)
- **Review Status**: Approval status counts
- **Risk Flags**: Packs likely generic or low token density

## What It Proves

The coherence report demonstrates that the catalog is:

1. **Structured**: Clear distribution across scenarios, levels, and structures
2. **Non-Random**: Consistent token coverage and variation patterns
3. **Quality-Controlled**: No banned phrases, no duplicates
4. **Auditable**: Every release has an immutable report tied to git SHA

## Metrics Explained

### Totals
- **Packs**: Number of context packs
- **Exams**: Number of exam packs
- **Drills**: Number of drill packs
- **Total**: Sum of all entry types

### Distribution

#### Scenario Distribution
Shows how content is distributed across scenarios (work, restaurant, shopping, etc.). Helps identify:
- Over-concentration in one scenario (>40% is flagged)
- Under-representation (<2 packs per scenario when total >6)

#### Level Distribution
Shows distribution across language levels (A1, A2, B1, etc.). Ensures balanced progression.

#### Register Distribution
Shows distribution across formality levels (formal, neutral, informal).

### Coverage

#### Primary Structures
Counts how many packs use each grammatical structure. Ensures diverse structural coverage.

#### Variation Slots
Counts how many packs use each variation slot type. Ensures varied practice opportunities.

### Prompt Metrics (Packs Only)

#### Prompts per Pack
- **Min/Max/Avg**: Distribution of prompt counts
- **Distribution**: Histogram of prompt counts

#### Multi-Slot Variation Rate
Percentage of prompts that vary 2+ slots simultaneously. Higher is better (more variation).

#### Scenario Token Coverage Rate
Percentage of prompts that contain >=2 scenario-specific tokens. Proves content is scenario-relevant, not generic.

#### Average Token Hits per Prompt
Average number of scenario tokens found per prompt, by scenario. Higher is better (more domain-specific language).

### Review Metrics

- **Approved**: Packs with `review.status === "approved"`
- **Needs Review**: Packs with `review.status === "needs_review"`
- **Unknown**: Packs without review status

**Gate**: In staging, all content must be approved before promotion.

### Violations

#### Banned Phrases
List of prompts containing denylisted phrases (e.g., "in today's lesson", "let's practice"). Should always be 0.

#### Duplicates
List of duplicate prompt texts (normalized). Should always be 0.

### Risk Flags

Packs are flagged as "risky" if they have:

1. **Low Token Density**: Average token hits per prompt < 2
2. **Repeated Skeleton Patterns**: >70% of prompts share the same normalized skeleton
3. **Outline/Steps Mismatch**: (Future) Mismatch between outline and actual steps

**Top 10 Risks** are listed in the report, sorted by risk score.

## Usage

### Generate Report

```bash
# Generate for all workspaces, staging manifest
tsx scripts/catalog-coherence-report.ts --workspace all --manifest staging

# Generate for specific workspace
tsx scripts/catalog-coherence-report.ts --workspace de --manifest staging

# Custom output directory
tsx scripts/catalog-coherence-report.ts --workspace all --manifest staging --outDir reports/my-report
```

### Check Coherence Gate

```bash
# Run gate checks (fails on violations)
tsx scripts/check-coherence-gate.ts --workspace all --manifest staging

# Include risk checks
tsx scripts/check-coherence-gate.ts --workspace all --manifest staging --failOnRisk true
```

### Access via Worker API

```bash
# List all reports
curl https://getverba-content-api.simpumind-apps.workers.dev/reports

# Get specific report (returns URLs)
curl https://getverba-content-api.simpumind-apps.workers.dev/reports/abc123def

# Access JSON directly
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/meta/reports/abc123def.coherence.json

# Access Markdown directly
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/meta/reports/abc123def.coherence.md
```

## Report Archive

### Automatic Archiving

On promotion (`./scripts/promote-staging.sh`), the coherence report is automatically:

1. Generated before promotion
2. Saved to `content/meta/reports/<gitSha>.coherence.{json,md}`
3. Uploaded to R2 with immutable caching (`Cache-Control: public, max-age=31536000, immutable`)

### Immutable Reports

Each report is tied to a git SHA, making it:
- **Immutable**: Never changes once created
- **Auditable**: Can verify what was in any release
- **Traceable**: Links report to exact code/content state

## Content Expansion Sprint

During content expansion sprints (20-50+ packs), the coherence report:

1. **Proves Structure**: Shows balanced distribution across scenarios/levels
2. **Catches Drift**: Flags packs that are too generic or repetitive
3. **Validates Quality**: Ensures no banned phrases or duplicates
4. **Tracks Progress**: Shows coverage improvements over time

### Example Workflow

```bash
# 1. Generate initial report (baseline)
tsx scripts/catalog-coherence-report.ts --workspace de --manifest staging

# 2. Add 20-50 packs
# ... content generation ...

# 3. Generate updated report
tsx scripts/catalog-coherence-report.ts --workspace de --manifest staging

# 4. Compare metrics:
#    - Scenario distribution should be balanced
#    - Token coverage should improve
#    - No new violations
#    - Risk count should decrease or stay low

# 5. Promote (report auto-archived)
./scripts/promote-staging.sh
```

## Report Format

### JSON Report (`coherence.json`)

Full structured data with all metrics and per-pack flags:

```json
{
  "generatedAt": "2025-01-01T12:00:00Z",
  "gitSha": "abc123def456...",
  "manifest": "staging",
  "workspaces": ["de", "en"],
  "metrics": {
    "totals": { "packs": 45, "exams": 10, "drills": 5 },
    "distribution": { ... },
    "coverage": { ... },
    "promptMetrics": { ... },
    "reviewMetrics": { ... },
    "violations": { ... },
    "risks": [ ... ]
  },
  "perPackFlags": { ... }
}
```

### Markdown Report (`coherence.md`)

Human-readable summary with tables and top risks:

- Summary statistics
- Distribution tables
- Coverage metrics
- Violation lists
- Top 10 risks table

## Integration with Releases

Every release promotion:

1. Generates coherence report
2. Archives to `content/meta/reports/<gitSha>.coherence.{json,md}`
3. Uploads to R2 (immutable)
4. Accessible via Worker API

This creates a complete audit trail: every release has a coherence report proving its quality and structure.

## Best Practices

1. **Run Before Promotion**: Always generate report before promoting
2. **Review Top Risks**: Address high-risk packs before promotion
3. **Track Over Time**: Compare reports across releases to track improvements
4. **Use in PRs**: Include coherence report in PR reviews for large content changes
5. **Monitor Violations**: Banned phrases and duplicates should always be 0

## Future Enhancements

- CSV export for spreadsheet analysis
- Historical trend analysis
- Automated drift detection
- Integration with CI/CD for automatic gate checks

