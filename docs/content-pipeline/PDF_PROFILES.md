# PDF Profiles

PDF Profiles are versioned configuration files that define the "recipe" for processing a PDF. They enable reproducible, fast, and reviewable PDF→packs generation.

## Overview

A PDF Profile contains:
- PDF file reference
- Default processing parameters (scenario, level, search settings)
- Page range presets
- Human notes

Profiles are **committed to git** and **reviewed** as part of the content pipeline. This ensures that the processing recipe for each PDF is versioned and reproducible.

## Profile Location

Profiles are stored in `content/meta/pdf-profiles/<profileId>.json`.

## Profile Schema

```json
{
  "id": "deutschimblick",
  "workspace": "de",
  "file": "imports/deutschimblick.pdf",
  "language": "de",
  "defaultScenario": "auto",
  "defaultLevel": "A1",
  "search": {
    "skipFrontMatter": true,
    "windowSizePages": 25,
    "minScenarioHits": 2,
    "anchors": []
  },
  "rangePresets": {
    "chapters": ["100-160", "161-220"]
  },
  "notes": "German textbook, chapters 3-5 contain work scenarios"
}
```

### Required Fields

- **`id`** (string): Profile identifier (must match filename without `.json`)
- **`workspace`** (string): Workspace identifier (e.g., `de`, `en`)
- **`file`** (string): Path to PDF file (relative to project root or absolute)
- **`language`** ("de" | "en"): Language of PDF content

### Optional Fields

- **`defaultScenario`** (string): Default scenario for batch generation. `"auto"` enables scenario discovery.
- **`defaultLevel`** (string): Default CEFR level (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`)
- **`search`** (object): Search mode settings
  - `skipFrontMatter` (boolean, default: `true`): Skip front matter pages
  - `windowSizePages` (number, default: `25`): Size of sliding window
  - `minScenarioHits` (number, default: `2`): Minimum scenario token hits per candidate
  - `anchors` (string[]): Anchor phrases that must appear (hard constraints)
- **`rangePresets`** (object): Named page range presets (e.g., `{ "chapters": ["100-160", "161-220"] }`)
- **`notes`** (string): Human-readable notes about the PDF

## Using Profiles

### Create a Profile

1. Create `content/meta/pdf-profiles/<profileId>.json`:

```json
{
  "id": "deutschimblick",
  "workspace": "de",
  "file": "imports/deutschimblick.pdf",
  "language": "de",
  "defaultScenario": "auto",
  "defaultLevel": "A1",
  "search": {
    "skipFrontMatter": true,
    "windowSizePages": 25,
    "minScenarioHits": 2,
    "anchors": ["Termin", "Büro"]
  },
  "notes": "German textbook for A1 level"
}
```

2. Commit to git (profiles are versioned)

### Run Batch Generation

Use the profile to generate packs:

```bash
tsx scripts/pdf-ingestion/runProfileBatch.ts \
  --profile deutschimblick \
  --packs 10 \
  --promptsPerPack 12 \
  --scenario auto \
  --level A1
```

The command will:
1. Load the profile
2. Use cached extraction (or extract if cache missing)
3. Run scenario discovery + window search
4. Generate batch packs
5. Emit run artifacts under `reports/pdf-runs/<profileId>/<timestamp>/`

### Override Profile Settings

You can override profile settings via CLI flags:

```bash
tsx scripts/pdf-ingestion/runProfileBatch.ts \
  --profile deutschimblick \
  --packs 5 \
  --scenario work \
  --level A2
```

## Profile vs Ingestion Profile

**PDF Profile** (`content/meta/pdf-profiles/`):
- Versioned in git
- Defines the "recipe" for processing a PDF
- Used by `runProfileBatch.ts`
- Contains file reference, defaults, search settings

**Ingestion Profile** (`imports/profiles/`):
- Per-document calibration
- Contains skipPages, preferPageRanges, rejectSections
- Used by `pdf-to-packs-batch.ts` when `--pdfId` is provided
- More detailed page-level control

**Both can be used together**: A PDF Profile can reference an Ingestion Profile via `pdfId` in the notes or by using the same identifier.

## Best Practices

1. **Version profiles in git**: Profiles define reproducible processing recipes
2. **Document in notes**: Add human-readable notes explaining PDF characteristics
3. **Use range presets**: Define named page ranges for common use cases
4. **Review profile changes**: Profile changes should go through code review
5. **Keep profiles minimal**: Only include settings that differ from defaults

## Example Profiles

### Government Office Textbook

```json
{
  "id": "gov-office-textbook",
  "workspace": "de",
  "file": "imports/gov-office.pdf",
  "language": "de",
  "defaultScenario": "government_office",
  "defaultLevel": "A1",
  "search": {
    "skipFrontMatter": true,
    "windowSizePages": 30,
    "minScenarioHits": 3,
    "anchors": ["Termin", "Anmeldung", "Formular"]
  },
  "rangePresets": {
    "chapter3": ["50-80"],
    "chapter4": ["81-110"]
  },
  "notes": "Government office scenarios, chapters 3-4"
}
```

### Work Dialogue Book

```json
{
  "id": "work-dialogues",
  "workspace": "de",
  "file": "imports/work-dialogues.pdf",
  "language": "de",
  "defaultScenario": "auto",
  "defaultLevel": "A2",
  "search": {
    "skipFrontMatter": true,
    "windowSizePages": 20,
    "minScenarioHits": 2,
    "anchors": ["Büro", "Meeting", "Termin"]
  },
  "notes": "Work-related dialogues, auto-discover scenarios"
}
```

