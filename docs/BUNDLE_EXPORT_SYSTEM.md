# B2B Curriculum Export System v2

This document describes the bundle export system that creates school-friendly curriculum bundles from the content catalog.

## Overview

The bundle export system generates deterministic, offline-ready curriculum bundles that can be distributed to schools, tutors, and programs without requiring the GetVerba app. Each bundle is a self-contained package with all necessary content and documentation.

## Bundle Definition Schema

Bundle definitions are JSON files in `content/meta/bundles/` that specify:
- Which content items to include (via filters)
- How to order items (deterministic sorting)
- Bundle metadata (title, description)

See [BUNDLE_SCHEMA.md](../content/meta/bundles/BUNDLE_SCHEMA.md) for full schema documentation.

## Bundle Types

### Scenario Bundle
All packs/drills for a specific scenario (e.g., `government_office`)

### Level Bundle
All items for a CEFR level (e.g., `A1`)

### Combined Bundle
Mix of constraints (e.g., `scenario: work` + `levels: ["A2"]`)

## Export Output

Each bundle export creates:

1. **Unzipped folder**: `exports/<workspace>/<bundleId>/bundle/`
2. **ZIP archive**: `exports/<workspace>/<bundleId>/<bundleId>.zip`

### Bundle Contents

#### 1. bundle.json
Complete bundle summary with:
- Bundle metadata
- Resolved item list with full metadata
- Analytics fields (targetLatencyMs, successDefinition, keyFailureModes)
- Session plan summaries for packs

#### 2. curriculum.md
Human-readable curriculum document:
- Overview and intended outcomes
- Recommended schedule
- Pack list grouped by level and kind
- For each pack: primaryStructure, learning goals, "why this works"

#### 3. items/ directory
Copied entry documents:
- `items/packs/<packId>/pack.json`
- `items/drills/<drillId>/drill.json`
- `items/exams/<examId>/exam.json`

#### 4. index.html
Static offline viewer:
- Left sidebar: item list
- Right panel: selected entry JSON + formatted outline/prompts
- Works offline (no network required)
- No frameworks required

#### 5. scormish/manifest.json
SCORM-ish packaging manifest:
- Bundle metadata
- Entry point (index.html)
- Item inventory with paths

## Usage

### List Available Bundles

```bash
npm run content:list-bundles
```

Lists all bundle definitions and validates their schema.

### Validate Bundles

```bash
npm run content:validate-bundles
```

Validates:
- Bundle schema
- Filters produce at least 1 item
- All referenced entry documents exist
- Stable ordering configuration
- No duplicate items

### Export Bundle

```bash
npm run content:export-bundle -- --bundle content/meta/bundles/en_intro_a1.json
```

Generates:
- Unzipped bundle folder
- ZIP archive

### Validate Content (includes bundles)

```bash
npm run content:validate
```

Validates all content including bundle definitions.

## Sample Bundles

The following sample bundles are included:

1. **en_intro_a1.json** - English Introduction (A1)
2. **de_government_office_a1.json** - Government Office (A1)
3. **de_mechanics_a1.json** - German Mechanics (A1)
4. **de_context_a2_work.json** - Work Context (A2)

## Deterministic Behavior

All exports are deterministic:
- Same bundle definition → same output
- Stable ordering ensures consistent item order
- No random elements or LLM calls
- Suitable for version control and reproducible builds

## Testing

Run bundle export tests:

```bash
npm run test:bundle-export
```

Tests cover:
- Bundle schema validation
- Filter resolution
- Stable ordering
- Required file generation
- ZIP creation

## Integration with Content Pipeline

Bundles integrate seamlessly with the existing content pipeline:
- Uses same catalog → section index → entry document structure
- Respects workspace organization
- Includes telemetry fields (packVersion, analytics)
- Validates against content quality gates

## Distribution

Bundles can be:
1. **Distributed as ZIP files** - Schools can download and extract
2. **Hosted as static folders** - Serve via web server or CDN
3. **Embedded in LMS** - SCORM-ish manifest enables LMS integration
4. **Used for review** - Internal quality review and curriculum planning

## Related Documentation

- [Bundle Schema](../content/meta/bundles/BUNDLE_SCHEMA.md)
- [Export Script](../scripts/export-bundle.ts)
- [Validation Script](../scripts/validate-bundles.ts)

