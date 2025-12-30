# Curriculum Exports v2 (SCORM-ish Bundles)

This document defines the deterministic "Curriculum Export" system that packages content into school-friendly bundles (modules/lessons), with stable IDs, coverage guarantees, and export artifacts (JSON + CSV + optional IMSCC-like zip).

## Overview

The Curriculum Export v2 system generates **deterministic, school-friendly bundles** that teachers and schools can adopt without caring about the GetVerba app. Each bundle is a curated learning path with:

- **Stable IDs**: Bundle and module IDs remain consistent across exports (same inputs = same outputs)
- **Coverage guarantees**: Minimum packs, structures, and time requirements
- **Multiple formats**: JSON (structured), CSV (spreadsheet-friendly), and optional ZIP (SCORM-ish packaging)

## What is a "Bundle"?

A **bundle** is a curated collection of learning content organized by:
- **Scenario** (e.g., `government_office`, `restaurant`, `work`)
- **Level** (e.g., `A1`, `A2`, `B1`, `B2`, `C1`, `C2`)
- **Register** (optional: `formal`, `neutral`, `casual`)

Each bundle contains:
- **Outcomes**: 3–8 learning outcome bullets (what students will achieve)
- **Primary Structures**: Aggregated grammatical structures covered
- **Estimated Minutes**: Sum of all pack/drill/exam durations
- **Modules**: Ordered learning path (packs → drills → exams)

## Mapping to Content

Bundles map to existing content as follows:

| Bundle Component | Maps To | Source |
|-----------------|---------|--------|
| Bundle | Scenario × Level grouping | Deterministic grouping from catalog |
| Module | Logical grouping of items | Ordered by kind (packs → drills → exams) |
| Item | Pack/Drill/Exam entry | From section indexes |

### Deterministic Rules

1. **Scenario-first grouping**: One bundle per `scenario × level` combination
2. **Module ordering**:
   - Packs first (context/learning)
   - Then drills (mechanics/practice)
   - Then exams (assessment)
   - Within each kind: sort by `primaryStructure`, then by `title`
3. **Coverage gates** (hard requirements):
   - Minimum 3 packs per bundle
   - Minimum 2 distinct `primaryStructures` per bundle
   - No duplicate `entryUrl` values
   - `estimatedMinutes` between 15–180 per bundle

## Versioning and Stability

### Export Version

All exports include:
- `version: 2` (schema version)
- `exportedAt`: ISO timestamp
- `gitSha`: From `content/meta/release.json` (or git HEAD if not available)

### Stable IDs

Bundle and module IDs are **deterministic** based on:
- Workspace
- Scenario
- Level
- Register (if specified)

**Example IDs:**
- `gov_office_a1_core` (scenario: `government_office`, level: `A1`)
- `restaurant_a2_formal` (scenario: `restaurant`, level: `A2`, register: `formal`)

**Guarantee**: Same content inputs produce identical bundle/module IDs across exports.

### Bundle Config Override

Optional config file: `content/templates/v1/curriculum/bundles.<ws>.json`

Allows:
- Renaming bundles/modules
- Pinning explicit item ordering
- Excluding items
- Defining custom outcomes text

**Rules:**
- Config can override titles/outcomes/order
- Config **cannot** introduce unknown item IDs
- Generator validates config against actual content

## Export Artifacts

### JSON Export

**File**: `exports/curriculum.v2.<ws>.json`

Full structured export with all bundle metadata, modules, and item references.

### CSV Export

**File**: `exports/curriculum.v2.<ws>.csv`

Flattened rows: `bundle → module → item`

**Columns:**
- `bundle_id`, `bundle_title`, `level`, `scenario`, `register`
- `module_id`, `module_title`
- `item_kind`, `item_id`, `entryUrl`, `minutes`
- `primaryStructures` (bundle-level, pipe-separated)
- `outcomes` (bundle-level, pipe-separated)

### ZIP Export (Optional)

**File**: `exports/curriculum.v2.<ws>.zip`

Contains:
- `curriculum.json` (same as JSON export)
- `curriculum.csv` (same as CSV export)
- `README.txt` (usage instructions)
- `imsmanifest.xml` (optional, minimal SCORM-like manifest)

## Usage

### Generate Export

```bash
npm run content:export-curriculum [--workspace <ws>]
```

### Validate Export

```bash
npm run content:validate-curriculum [--workspace <ws>]
```

### Generate ZIP

```bash
npm run content:package-curriculum-zip [--workspace <ws>]
```

## Validation Rules

The validator enforces:

1. **Schema correctness**: All required fields present, correct types
2. **Referential integrity**: All referenced items exist in content
3. **No duplicates**: No duplicate `entryUrl` values across bundles
4. **Coverage minimums**:
   - ≥3 packs per bundle
   - ≥2 distinct `primaryStructures` per bundle
   - `estimatedMinutes` between 15–180 per bundle

## Integration with CI

The export and validation are integrated into the content pipeline:

1. Content validation passes
2. Export generation runs
3. Curriculum validation runs
4. Exports are committed (or documented as CI artifacts)

## Future Enhancements

- **IMSCC full compliance**: Full Common Cartridge manifest generation
- **LTI integration**: Launch parameters for LMS systems
- **Multi-language bundles**: Cross-language curriculum alignment
- **Custom bundle definitions**: User-defined bundle groupings

