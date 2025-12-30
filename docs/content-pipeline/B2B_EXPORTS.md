# B2B Curriculum Exports v2

This document describes how to generate and use B2B curriculum exports (SCORM-ish school bundles).

## Overview

The B2B export system packages selected packs/drills/exams into curriculum bundles with:
- **Deterministic manifests**: Same inputs produce identical outputs (non-random proof)
- **SCORM-like metadata**: Minimal SCORM 1.2 compatibility for LMS import
- **Human-readable syllabus**: Markdown file for teachers/administrators
- **Integrity reports**: Coherence metrics and validation results

Bundles can be distributed to language schools or LMS teams without requiring the GetVerba app.

## Quick Start

### Export a Government Office Bundle for A1

```bash
npm run content:export-curriculum -- \
  --workspace de \
  --bundle-id gov_office_a1_v1 \
  --title "German A1 — Government Office Survival" \
  --levels A1 \
  --scenarios government_office \
  --include-sections context,mechanics \
  --max-packs 12 \
  --max-drills 8
```

### Export from Explicit IDs

```bash
npm run content:export-curriculum -- \
  --workspace de \
  --bundle-id work_a2_interviews_v1 \
  --title "German A2 — Work & Interviews" \
  --include-pack-ids work_1,shopping_conversations,restaurant_conversations \
  --include-drill-ids separable_verbs_a1,akkusativ_prepositions_a1
```

## Command Line Arguments

### Required Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `--workspace` | Workspace identifier | `de`, `fr` |
| `--bundle-id` | Unique bundle identifier (slug) | `gov_office_a1_v1` |
| `--title` | Human-readable bundle title | `"German A1 — Government Office"` |

### Filter Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `--levels` | Comma-separated CEFR levels | `A1,A2` |
| `--scenarios` | Comma-separated scenarios | `government_office,work` |
| `--tags` | Comma-separated tags | `grammar,vocabulary` |
| `--include-sections` | Sections to include | `context,mechanics` |

### Limit Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `--max-packs` | Maximum number of packs | `12` |
| `--max-drills` | Maximum number of drills | `8` |
| `--max-exams` | Maximum number of exams | `2` |

### Explicit ID Arguments

| Argument | Description | Example |
|----------|-------------|---------|
| `--include-pack-ids` | Comma-separated pack IDs | `work_1,work_2` |
| `--include-drill-ids` | Comma-separated drill IDs | `verb_endings_a1` |
| `--include-exam-ids` | Comma-separated exam IDs | `a1_level_test` |

## Output Structure

After running the export, you'll find:

```
exports/bundles/<bundleId>/
├── bundle.json              # Core manifest (see B2B_EXPORT_SCHEMA.md)
├── syllabus.md              # Human-readable syllabus
├── scorm/
│   └── imsmanifest.xml      # SCORM-like manifest
├── content/                 # Entry documents (copied from workspace)
│   └── workspaces/
│       └── <workspace>/
│           ├── packs/
│           ├── drills/
│           └── exams/
└── reports/
    └── integrity.json        # Integrity report

exports/bundles/<bundleId>.zip  # ZIP archive of bundle directory
```

## Bundle Planning

### Deterministic Ordering

Items are ordered deterministically using this priority:

1. **Scenario** (stable order from template list)
2. **Level** (A1 → C2)
3. **Register** (formal → neutral → casual)
4. **Primary Structure** (alphabetical)
5. **ID** (alphabetical)

Same inputs produce identical `bundle.json` (non-random proof).

### Module Grouping

Items are automatically grouped into modules based on:
- Scenario
- Level
- Primary Structure
- Maximum items per module (default: 8)

Modules are numbered sequentially (m1, m2, m3, ...).

## Integrity Report

The integrity report (`reports/integrity.json`) includes:

- **Errors**: Duplicate IDs, missing entries, invalid entries
- **Warnings**: Low coverage metrics
- **Stats**: Distribution of levels, scenarios, structures, registers
- **Coherence**: Coverage percentages for metadata fields
- **Scorecard**: Pass rates for quality gates

### Coherence Thresholds

- Scenario coverage: 80%+
- Primary structure coverage: 80%+
- Session plan coverage: 90%+

## How Schools Can Consume Bundles

### Option 1: Direct JSON Access

Schools can read `bundle.json` to understand the curriculum structure and access entry documents in `content/`.

### Option 2: LMS Import (SCORM)

The `scorm/imsmanifest.xml` file provides minimal SCORM 1.2 compatibility. Some LMS systems can import this directly.

### Option 3: Syllabus Review

Teachers can review `syllabus.md` to understand:
- Bundle contents
- Module structure
- Estimated time
- Learning objectives

### Option 4: Custom Integration

Schools can build custom integrations using:
- `bundle.json` for structure
- Entry documents in `content/` for full content
- `reports/integrity.json` for quality metrics

## Examples

### Example 1: Government Office A1 Bundle

```bash
npm run content:export-curriculum -- \
  --workspace de \
  --bundle-id gov_office_a1_v1 \
  --title "German A1 — Government Office Survival" \
  --levels A1 \
  --scenarios government_office \
  --include-sections context,mechanics \
  --max-packs 12 \
  --max-drills 8
```

**Output:**
- Bundle with 12 packs and 8 drills focused on government office scenarios
- All items at A1 level
- Includes context packs and mechanics drills
- Estimated time: ~180 minutes

### Example 2: Work A2 Bundle from Explicit IDs

```bash
npm run content:export-curriculum -- \
  --workspace de \
  --bundle-id work_a2_interviews_v1 \
  --title "German A2 — Work & Interviews" \
  --include-pack-ids work_1,work_2,work_3 \
  --include-drill-ids separable_verbs_a1,akkusativ_prepositions_a1
```

**Output:**
- Bundle with exactly 3 specified packs and 2 specified drills
- No filtering by level/scenario (uses explicit IDs only)

### Example 3: Multi-Level Bundle

```bash
npm run content:export-curriculum -- \
  --workspace de \
  --bundle-id work_a1_a2_v1 \
  --title "German Work Scenarios — A1 & A2" \
  --levels A1,A2 \
  --scenarios work \
  --include-sections context,mechanics,exams \
  --max-packs 20 \
  --max-drills 10 \
  --max-exams 2
```

**Output:**
- Bundle with packs, drills, and exams
- Covers A1 and A2 levels
- Focused on work scenarios
- Up to 20 packs, 10 drills, 2 exams

## Troubleshooting

### "Workspace not found"

Ensure the workspace exists in `content/v1/workspaces/<workspace>/`.

### "No items found"

Check that:
- Section filters match existing sections
- Level/scenario filters match existing content
- Explicit IDs are correct

### "ZIP creation failed"

The export still works, but the ZIP file won't be created. Bundle files are available in `exports/bundles/<bundleId>/`.

### Integrity Report Errors

Review `reports/integrity.json` for:
- Missing entry documents
- Duplicate IDs
- Invalid entries

Fix content issues and re-export.

## Best Practices

1. **Use descriptive bundle IDs**: Include scenario, level, and version (e.g., `gov_office_a1_v1`)
2. **Set reasonable limits**: Use `--max-packs` and `--max-drills` to keep bundles focused
3. **Review integrity reports**: Check coherence metrics before distributing
4. **Version bundles**: Include version in bundle ID for tracking
5. **Document selection criteria**: Note why specific filters were used

## Related Documentation

- [B2B_EXPORT_SCHEMA.md](./B2B_EXPORT_SCHEMA.md) - Bundle schema reference
- [ENTRY_URL_SCHEMA.md](./ENTRY_URL_SCHEMA.md) - Entry document schema
- [PACK_SCHEMA.md](./PACK_SCHEMA.md) - Pack entry schema
- [DRILLS_SCHEMA.md](./DRILLS_SCHEMA.md) - Drill entry schema

