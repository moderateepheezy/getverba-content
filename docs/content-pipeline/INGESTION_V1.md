# Automated Niche Pack Generation v1

This document describes the ingestion pipeline that converts PDF/URL/text sources into draft content packs.

## Overview

The ingestion pipeline is a **dev-time toolchain** that:
1. Extracts text from PDF, URL, or raw text input
2. Segments text into chunks with stable hashing
3. Extracts structured signals (keywords, entities, intents)
4. Plans packs deterministically with overlap detection
5. Generates draft prompts using template-based substitution
6. Writes draft packs to `content/v1/workspaces/<ws>/draft/packs/`
7. Generates quality gate reports

**Important**: This is a **deterministic, non-LLM pipeline**. No runtime AI is used. All generation is template-based and rule-driven.

## Usage

### Basic Usage

```bash
# Raw text input
npm run content:ingest-niche -- --workspace de --scenario government_office --level A1 --input-text "..."

# PDF input
npm run content:ingest-niche -- --workspace de --scenario work --level A2 --pdf ./inputs/office_handbook.pdf

# URL input
npm run content:ingest-niche -- --workspace de --scenario housing --level A2 --url "https://example.com/rental-process"
```

### Parameters

- `--workspace`: Workspace identifier (e.g., `de`)
- `--scenario`: Scenario identifier (must match a template in `content/templates/v1/scenarios/`)
- `--level`: CEFR level (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`)
- `--input-text`: Raw text string (for text input)
- `--pdf`: Path to PDF file (for PDF input)
- `--url`: URL to fetch (for URL input)

### Promoting Drafts to Production

After reviewing and editing draft packs:

```bash
npm run content:promote-drafts -- --workspace de pack-id-1 pack-id-2 pack-id-3
```

This will:
1. Copy draft packs to `content/v1/workspaces/<ws>/packs/<id>/pack.json`
2. Update section indexes
3. Run validation
4. Run quality gates

## Pipeline Stages

### 1. Text Extraction

**Module**: `scripts/ingest/extractText.ts`

- **PDF**: Uses `pdf-parse` library (install with `npm install --save-dev pdf-parse`)
- **URL**: Fetches HTML and strips tags (uses `node-html-parser` if available, otherwise basic tag stripping)
- **Text**: Direct text input

### 2. Segmentation

**Module**: `scripts/ingest/segmenter.ts`

Splits text into chunks using:
- Heading patterns (`#`, all-caps lines)
- Bullet points (`-`, `•`, `*`)
- Paragraph boundaries (double newlines)
- Maximum chunk length (default: 500 chars)

Each chunk gets a stable ID: `sha1(normalizedChunk).slice(0,10)`

### 3. Signal Extraction

**Module**: `scripts/ingest/signalExtractor.ts`

Extracts:
- **Top tokens**: Most frequent words (top 10-15)
- **Detected intents**: Pattern-based intent detection (e.g., `request_appointment`, `submit_documents`)
- **Entities**: Dates, times, money, addresses, capitalized terms
- **Action verbs**: Common German verbs + scenario-specific verbs
- **Question patterns**: Detects question marks and German question words

### 4. Pack Planning

**Module**: `scripts/ingest/packPlanner.ts`

- Groups signals by intent category
- Creates 6-12 packs (configurable)
- Enforces Jaccard overlap threshold (< 0.45) to prevent duplicate packs
- Assigns primary structure from scenario template
- Generates stable pack IDs: `<scenario>_<topicSlug>_<level>_<shortHash>`

### 5. Draft Prompt Generation

**Module**: `scripts/ingest/draftPromptGenerator.ts`

For each planned pack:
- Generates 8-14 prompts using template slot banks
- Ensures 30% of prompts change 2+ slots (`slotsChanged`)
- Includes scenario tokens (passes token gate)
- Avoids banned phrases
- Adds `meaning_en`, `literal_en`, `gloss_en` fields
- Optional `notes_lite` (max 120 chars) for illogical patterns

### 6. Quality Gates

**Module**: `scripts/ingest/ingestReport.ts`

Each draft pack must pass:
- **Scenario tokens**: At least 2 tokens per prompt
- **Banned phrases**: No generic template phrases
- **Multi-slot variation**: At least 30% of prompts change 2+ slots
- **Register consistency**: Formal packs must use "Sie"/"Ihnen"
- **Concreteness markers**: At least 2 prompts with digits/currency/time/weekdays
- **Length constraints**: Prompts must be 12-140 characters
- **Meaning contract**: `natural_en` required for government_office or A2+

### 7. Reporting

**Module**: `scripts/ingest/ingestReport.ts`

Generates:
- `exports/ingest-report.<ws>.<scenario>.<timestamp>.json`
- `exports/ingest-report.<ws>.<scenario>.<timestamp>.md`

Report includes:
- Generated packs list
- Quality gate pass/fail status
- Failure reasons
- Recommended manual edits

## Output Structure

### Draft Packs

Draft packs are written to:
```
content/v1/workspaces/<workspace>/draft/packs/<packId>/pack.json
```

Draft packs include `_ingestionMetadata` field (removed during promotion):
```json
{
  "_ingestionMetadata": {
    "source": "pdf|url|text",
    "sourcePath": "...",
    "sourceUrl": "...",
    "generatedAt": "2025-01-01T00:00:00.000Z",
    "chunkIds": ["abc123", "def456"]
  }
}
```

### Production Packs

After promotion, packs are in:
```
content/v1/workspaces/<workspace>/packs/<packId>/pack.json
```

Production packs have `_ingestionMetadata` removed and are identical to manually-created packs.

## Quality Gate Integration

The ingestion pipeline uses the same quality gates as manual pack generation:

- **Generic Template Denylist**: Blocks phrases like "in today's lesson", "let's practice"
- **Context Token Requirement**: Requires 2+ scenario tokens per prompt
- **Multi-slot Variation**: Requires 30% of prompts to change 2+ slots
- **Register Consistency**: Formal packs must use formal language
- **Concreteness Marker**: Requires real-world details (times, dates, amounts)
- **Native Meaning Guard**: Requires `natural_en` for government_office or A2+

See [QUALITY_GATES.md](./QUALITY_GATES.md) for detailed rules.

## Deterministic Generation

The pipeline is **deterministic**:
- Same input → same chunk IDs (via stable hashing)
- Same signals → same pack IDs (via stable hashing)
- Same template + slots → same prompts (via template-based generation)

This ensures:
- Reproducible results
- No random variation
- Stable pack IDs across runs

## Limitations

### v1 Limitations

- **No OCR**: PDFs must have extractable text (no scanned images)
- **Basic translation**: `literal_en` and `natural_en` use simplified heuristics (not full translation)
- **Template-based only**: Prompts are generated from template slot banks, not extracted from source text
- **No LLM integration**: All generation is rule-based

### Future Enhancements

- OCR support for scanned PDFs
- Better translation heuristics for `literal_en`/`natural_en`
- Direct prompt extraction from source text (with quality gates)
- Optional LLM-based refinement (with human review)

## Troubleshooting

### "pdf-parse is not installed"

Install the dependency:
```bash
npm install --save-dev pdf-parse
```

### "Template not found"

Ensure the scenario template exists at:
```
content/templates/v1/scenarios/<scenario>.json
```

### Quality gate failures

Check the report in `exports/ingest-report.*.md` for specific failure reasons. Common fixes:
- Add more scenario tokens to prompts
- Remove banned phrases
- Increase multi-slot variation
- Add concreteness markers
- Add `natural_en` for government_office/A2+ packs

### Low pass rate

If many prompts fail quality gates:
- Review source text quality (may be too generic)
- Check scenario template has sufficient slot banks
- Verify scenario tokens are present in source text
- Consider manual editing of draft packs before promotion

## Examples

### Example 1: Government Office PDF

```bash
npm run content:ingest-niche -- \
  --workspace de \
  --scenario government_office \
  --level A2 \
  --pdf ./inputs/bürgeramt-handbook.pdf
```

This will:
1. Extract text from the PDF
2. Segment into chunks
3. Extract signals (termin, formular, anmeldung, etc.)
4. Plan 6-12 packs (e.g., "Termin vereinbaren", "Unterlagen einreichen")
5. Generate draft prompts using government_office template
6. Write to `content/v1/workspaces/de/draft/packs/`
7. Generate report

### Example 2: Job Description URL

```bash
npm run content:ingest-niche -- \
  --workspace de \
  --scenario work \
  --level A2 \
  --url "https://example.com/job-description"
```

### Example 3: Raw Text

```bash
npm run content:ingest-niche -- \
  --workspace de \
  --scenario housing \
  --level A1 \
  --input-text "Ich brauche eine Wohnung. Die Miete ist 800 Euro. Der Termin ist am Montag."
```

## Related Documentation

- [QUALITY_GATES.md](./QUALITY_GATES.md) - Quality gate rules
- [PACK_SCHEMA.md](./PACK_SCHEMA.md) - Pack entry schema
- [TEMPLATE_SCHEMA.md](./TEMPLATE_SCHEMA.md) - Template schema
- [PROMPT_MEANING_CONTRACT.md](./PROMPT_MEANING_CONTRACT.md) - Meaning contract fields

