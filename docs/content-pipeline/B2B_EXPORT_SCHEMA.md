# B2B Export Bundle Schema

This document defines the schema for curriculum bundle exports (SCORM-ish school bundles).

## Bundle Manifest (`bundle.json`)

The core manifest file that describes the bundle structure and contents.

```json
{
  "bundleId": "gov_office_a1_v1",
  "workspace": "de",
  "title": "German A1 — Government Office Survival",
  "version": "2025-12-30",
  "generatedAt": "2025-12-30T10:30:00.000Z",
  "selection": {
    "levels": ["A1"],
    "scenarios": ["government_office"],
    "tags": [],
    "explicitPackIds": null,
    "explicitDrillIds": null,
    "explicitExamIds": null
  },
  "modules": [
    {
      "id": "m1",
      "title": "Government Office — Verb Position",
      "items": [
        {
          "kind": "pack",
          "id": "gov_office_appointments_a1",
          "entryUrl": "/v1/workspaces/de/packs/gov_office_appointments_a1/pack.json",
          "title": "Making Appointments at Government Office",
          "level": "A1",
          "scenario": "government_office",
          "register": "formal",
          "primaryStructure": "verb_position",
          "estimatedMinutes": 15,
          "whyThisWorks": {
            "primaryStructure": "verb_position",
            "variationSlots": ["subject", "verb", "time"],
            "qualitySignals": ["multi_slot_variation", "session_plan_present", "slots_changed_present"]
          }
        }
      ]
    }
  ],
  "totals": {
    "packs": 12,
    "drills": 8,
    "exams": 0,
    "estimatedMinutes": 180
  }
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `bundleId` | string | Unique bundle identifier (slug format) |
| `workspace` | string | Workspace identifier (e.g., "de", "fr") |
| `title` | string | Human-readable bundle title |
| `version` | string | Version string (YYYY-MM-DD format) |
| `generatedAt` | string | ISO 8601 timestamp of generation |
| `selection` | object | Selection criteria used to build bundle |
| `modules` | array | Array of module objects (non-empty) |
| `totals` | object | Aggregate statistics |

## Selection Object

| Field | Type | Description |
|-------|------|-------------|
| `levels` | string[] | Optional: CEFR levels filter (A1, A2, B1, B2, C1, C2) |
| `scenarios` | string[] | Optional: Scenario filters |
| `tags` | string[] | Optional: Tag filters |
| `explicitPackIds` | string[] | Optional: Explicit pack IDs to include |
| `explicitDrillIds` | string[] | Optional: Explicit drill IDs to include |
| `explicitExamIds` | string[] | Optional: Explicit exam IDs to include |

## Module Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Module identifier (e.g., "m1", "m2") |
| `title` | string | Module title |
| `items` | array | Array of item references (non-empty) |

## Item Object

| Field | Type | Description |
|-------|------|-------------|
| `kind` | string | Item type: "pack", "drill", or "exam" |
| `id` | string | Item identifier |
| `entryUrl` | string | Canonical entry URL path |
| `title` | string | Item title |
| `level` | string | Optional: CEFR level |
| `scenario` | string | Optional: Scenario identifier |
| `register` | string | Optional: Register (formal, neutral, casual) |
| `primaryStructure` | string | Optional: Primary grammatical structure |
| `estimatedMinutes` | number | Optional: Estimated duration |
| `whyThisWorks` | object | Optional: Quality metadata |

## WhyThisWorks Object

| Field | Type | Description |
|-------|------|-------------|
| `primaryStructure` | string | Primary grammatical structure |
| `variationSlots` | string[] | Array of variation slot types |
| `qualitySignals` | string[] | Quality gate signals (e.g., "multi_slot_variation", "session_plan_present") |

## Totals Object

| Field | Type | Description |
|-------|------|-------------|
| `packs` | number | Total number of packs |
| `drills` | number | Total number of drills |
| `exams` | number | Total number of exams |
| `estimatedMinutes` | number | Total estimated duration in minutes |

## Bundle Structure

```
exports/bundles/<bundleId>/
├── bundle.json              # Core manifest
├── syllabus.md              # Human-readable syllabus
├── scorm/
│   └── imsmanifest.xml      # SCORM-like manifest
├── content/                 # Entry documents
│   └── workspaces/
│       └── <workspace>/
│           ├── packs/
│           ├── drills/
│           └── exams/
└── reports/
    └── integrity.json        # Integrity report
```

## Deterministic Ordering

Items are ordered deterministically using the following rules (in order):

1. **Scenario** (stable order from template list)
2. **Level** (A1 → C2)
3. **Register** (formal → neutral → casual)
4. **Primary Structure** (alphabetical)
5. **ID** (alphabetical)

Same inputs produce identical bundle.json (non-random proof).

## Module Grouping

Items are grouped into modules based on:
- Scenario
- Level
- Primary Structure
- Maximum items per module (default: 8)

Modules are numbered sequentially (m1, m2, m3, ...).

## Integrity Report Schema

See `reports/integrity.json` for validation results:

```json
{
  "errors": [
    {
      "type": "duplicate_id" | "missing_entry" | "invalid_entry",
      "message": "Error description",
      "itemId": "item_id"
    }
  ],
  "warnings": [
    {
      "type": "low_coverage",
      "message": "Warning description"
    }
  ],
  "stats": {
    "levelDistribution": { "A1": 5, "A2": 3 },
    "scenarioDistribution": { "government_office": 8 },
    "primaryStructureDistribution": { "verb_position": 4 },
    "registerDistribution": { "formal": 8 }
  },
  "coherence": {
    "itemsWithScenario": 8,
    "itemsWithRegister": 8,
    "itemsWithPrimaryStructure": 8,
    "packsWithSessionPlan": 5,
    "promptsWithSlotsChanged": 45,
    "packsPassingWhyThisWorks": 5,
    "totalItems": 8,
    "totalPacks": 5,
    "totalPrompts": 50
  },
  "coherenceScorecard": {
    "scenarioCoverage": 100.0,
    "registerCoverage": 100.0,
    "primaryStructureCoverage": 100.0,
    "sessionPlanCoverage": 100.0,
    "slotsChangedCoverage": 90.0,
    "whyThisWorksPassRate": 100.0
  }
}
```

## SCORM Manifest

The `scorm/imsmanifest.xml` file provides minimal SCORM 1.2 compatibility for LMS import. It references local JSON entry documents (not URLs).

## Validation Rules

1. **No duplicate IDs**: Each item ID must be unique within the bundle
2. **Entry documents exist**: All `entryUrl` references must resolve to existing files
3. **ID matching**: Entry document IDs must match item IDs
4. **Coherence thresholds**: 
   - Scenario coverage: 80%+
   - Primary structure coverage: 80%+
   - Session plan coverage: 90%+

