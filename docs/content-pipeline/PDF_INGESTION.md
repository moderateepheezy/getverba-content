# PDF Ingestion Pipeline

This document describes the PDF → Packs pipeline, a deterministic, dev-time tool that ingests PDFs and produces GetVerba content packs.

## Overview

The PDF ingestion pipeline is a **backend/dev tool** (not an in-app feature) that:

- Extracts text from PDFs (text-first approach)
- Normalizes and segments text into prompt candidates
- Groups candidates into packs using deterministic templates
- Writes generated content JSON to canonical paths
- Updates section indexes via existing generator
- Runs validation + quality gates
- Produces detailed reports (markdown + JSON)

## Supported PDFs

### Text-Based PDFs (Recommended)

The pipeline works best with **text-based PDFs** that have selectable text:

- PDFs exported from Word, Google Docs, etc.
- PDFs with embedded text layers
- Searchable PDFs

### Scanned PDFs (Limited Support)

**Scanned/image-only PDFs are unsupported by default** unless `--ocr=on` is provided.

**Current Status**: OCR support is **not yet implemented** (v1). The pipeline will:
- Detect scanned PDFs automatically
- Fail with `ERR_PDF_SCAN_UNSUPPORTED` if OCR is off
- Provide clear error messages with instructions

**Workaround**: Convert scanned PDFs to text-based PDFs:
1. Use Adobe Acrobat's "Enhance Scans" → "Recognize Text"
2. Use online OCR tools (e.g., OCR.space, Adobe's online tool)
3. Export as searchable PDF

## PDF Profiles + Cache + Run History Workflow

**Purpose**: Fast, reproducible, and reviewable PDF→packs generation using versioned profiles and cached extraction.

### Overview

The PDF Profiles + Cache system enables:
- **Versioned recipes**: PDF processing configuration committed to git
- **Fast iteration**: Cached extraction avoids re-extracting large PDFs
- **Reproducible runs**: Same profile + same cache = same output
- **Reviewable artifacts**: Run history with diffs and comparisons

### Workflow

1. **Create PDF Profile** (`content/meta/pdf-profiles/<profileId>.json`)
2. **Run batch generation** using profile
3. **Review run artifacts** (`reports/pdf-runs/<profileId>/<timestamp>/`)
4. **Approve and promote** packs

### Step 1: Create PDF Profile

Create a profile file in `content/meta/pdf-profiles/`:

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
  "notes": "German textbook, chapters 3-5 contain work scenarios"
}
```

**Commit to git**: Profiles are versioned and reviewed.

See [PDF_PROFILES.md](./PDF_PROFILES.md) for complete schema documentation.

### Step 2: Run Batch Generation

Use the profile to generate packs:

```bash
tsx scripts/pdf-ingestion/runProfileBatch.ts \
  --profile deutschimblick \
  --packs 10 \
  --promptsPerPack 12 \
  --scenario auto \
  --level A1
```

**What happens**:
1. Loads profile from `content/meta/pdf-profiles/deutschimblick.json`
2. Checks extraction cache (or extracts if missing)
3. Runs scenario discovery + window search
4. Generates batch packs
5. Emits run artifacts under `reports/pdf-runs/deutschimblick/<timestamp>/`

**First run**: Extracts PDF and caches extraction (may take time for large PDFs)

**Subsequent runs**: Reuses cached extraction (fast)

### Step 3: Review Run Artifacts

Each run produces:
- `run.json`: Machine-readable run metadata (inputs, chosen scenario, cache key)
- `run.md`: Human-readable run report

Compare runs by reviewing artifacts in `reports/pdf-runs/<profileId>/`.

### Step 4: Approve and Promote

After reviewing generated packs:
1. Review queue: `./scripts/review-open.sh --workspace de --limit 20`
2. Approve batches: `./scripts/approve-top.sh --scenario work --level A1 --limit 10`
3. Promote to staging: `./scripts/promote-staging.sh`

### Cache Management

**Cache location**: `content/meta/pdf-cache/<profileId>/<cacheKey>.json`

**Cache key**: Computed from file hash + extraction version

**Cache invalidation**: 
- Change extraction version in `extractAndCache.ts` to invalidate all caches
- Delete cache file manually to force re-extraction

**Cache is not committed**: `.gitignore` excludes `content/meta/pdf-cache/`

### Benefits

- **Fast iteration**: No re-extraction on subsequent runs
- **Reproducible**: Same profile + cache = same output
- **Reviewable**: Run artifacts enable comparison and debugging
- **Versioned**: Profiles in git provide audit trail

## PDF Ingestion Profiles

**Purpose**: Per-document calibration for deterministic, high-quality PDF ingestion. Profiles tell the pipeline what "good" looks like for a specific PDF.

**Note**: PDF Ingestion Profiles (`imports/profiles/`) are different from PDF Profiles (`content/meta/pdf-profiles/`). See [PDF_PROFILES.md](./PDF_PROFILES.md) for details.

### Profile Location

Profiles are stored in `imports/profiles/<pdfId>.json`. The pipeline automatically loads a profile when `--pdfId <id>` is provided.

### Profile Schema

```json
{
  "pdfId": "deutschimblick",
  "language": "de",
  "defaultScenarios": ["government_office", "work", "school"],
  "anchors": ["Termin", "Büro", "Anmeldung"],
  "skipPages": {
    "ranges": ["0-12", "350-380"]
  },
  "preferPageRanges": ["50-200", "250-300"],
  "windowSizePages": 30,
  "minScenarioHits": 3,
  "scoringTweaks": {
    "dialogueBonus": 1.2,
    "headingPenalty": 0.5,
    "tablePenalty": 0.3
  },
  "rejectSections": [
    "Inhaltsverzeichnis",
    "Kapitel",
    "Grammatik",
    "Vokabelliste"
  ]
}
```

### Profile Fields

- **`pdfId`** (string, required): PDF identifier (must match filename without `.json`)
- **`language`** ("de" | "en", required): Language of PDF content
- **`defaultScenarios`** (string[], required): Ordered list of preferred scenarios (used when `--scenario auto`)
- **`anchors`** (string[], required): German phrases that must appear (hard constraints)
- **`skipPages`** (number[] | { ranges: string[] }, optional): Pages to skip
  - Array format: `[0, 1, 2, 10, 11]`
  - Ranges format: `{ "ranges": ["0-12", "350-380"] }`
- **`preferPageRanges`** (string[], optional): Preferred page ranges (e.g., `["50-200", "250-300"]`)
- **`windowSizePages`** (number, optional): Override default window size
- **`minScenarioHits`** (number, optional): Override minimum scenario token hits
- **`scoringTweaks`** (object, optional): Scoring adjustments
  - `dialogueBonus`: Multiplier for dialogue-like text
  - `headingPenalty`: Penalty for heading-like text
  - `tablePenalty`: Penalty for table-like text
- **`rejectSections`** (string[], optional): Keywords that cause candidate rejection

### Using Profiles

**Automatic loading (recommended)**:
```bash
tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
  --workspace de \
  --pdfId deutschimblick \
  --pdf ./imports/deutschimblick.pdf \
  --scenario auto \
  --level A1 \
  --packs 10
```

The pipeline will:
1. Load `imports/profiles/deutschimblick.json` automatically
2. Apply `skipPages` and `preferPageRanges` before window search
3. Use `defaultScenarios` ordering when `--scenario auto`
4. Require anchor hits (warns if 0 hits found)
5. Reject candidates matching `rejectSections` keywords

**Explicit profile path**:
```bash
tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
  --workspace de \
  --profile ./custom-profiles/my-profile.json \
  --pdf ./imports/some.pdf \
  --scenario auto
```

### Profile Examples

**Example 1: Government Office Textbook**
```json
{
  "pdfId": "gov-office-textbook",
  "language": "de",
  "defaultScenarios": ["government_office", "work"],
  "anchors": ["Termin", "Anmeldung", "Formular"],
  "skipPages": { "ranges": ["0-15"] },
  "preferPageRanges": ["50-150"],
  "rejectSections": ["Inhaltsverzeichnis", "Kapitel"]
}
```

**Example 2: Work Dialogue Book**
```json
{
  "pdfId": "work-dialogues",
  "language": "de",
  "defaultScenarios": ["work", "restaurant"],
  "anchors": ["Büro", "Meeting", "Termin"],
  "skipPages": [0, 1, 2],
  "windowSizePages": 20,
  "minScenarioHits": 2
}
```

## Token Mining + Proposal + Apply + Regenerate Workflow

**Purpose**: Iteratively improve scenario token dictionaries based on real PDF content, then regenerate packs with improved token coverage.

### Workflow Overview

1. **Mine tokens** from PDF windows
2. **Create proposal** from mining report
3. **Review and edit** proposal (human approval)
4. **Apply proposal** to update scenario dictionaries
5. **Regenerate packs** with improved tokens

### Step 1: Mine Tokens

Extract candidate tokens/phrases from the best window for a scenario:

```bash
tsx scripts/pdf-ingestion/tokenMining.ts \
  --workspace de \
  --pdf ./imports/deutschimblick.pdf \
  --pdfId deutschimblick \
  --scenario school \
  --mode search \
  --topN 80 \
  --ngrams 1,2,3
```

**Outputs**:
- `reports/token-mining/<pdfId>.<scenario>.<timestamp>/report.json` (machine-readable)
- `reports/token-mining/<pdfId>.<scenario>.<timestamp>/report.md` (human-readable)

**What it does**:
- Finds best window for scenario (reuses existing pipeline)
- Extracts n-grams (1, 2, 3-word phrases) from qualified candidates
- Filters stopwords, banned phrases, existing tokens
- Ranks by frequency
- Suggests strong tokens (multi-word phrases with high frequency)

### Step 2: Create Token Proposal

Generate a proposal file from the mining report:

```bash
tsx scripts/pdf-ingestion/create-token-proposal.ts \
  --fromReport ./reports/token-mining/deutschimblick.school.2025-01-01/report.json \
  --scenario school \
  --pdfId deutschimblick \
  --notes "Tokens from Deutsch im Blick chapter 3"
```

**Output**: `content/meta/token-proposals/deutschimblick.school.json`

**Proposal structure**:
```json
{
  "pdfId": "deutschimblick",
  "scenario": "school",
  "createdAt": "2025-01-01T12:00:00Z",
  "add": {
    "tokens": ["student", "studentin", "klasse", "hausaufgabe"],
    "strongTokens": ["studieren", "prüfung", "vorlesung"],
    "phrases": ["in der uni", "zur vorlesung gehen"]
  },
  "notes": "Tokens from Deutsch im Blick chapter 3"
}
```

### Step 3: Review and Edit Proposal

**Human approval required**: Edit the proposal file to remove unwanted tokens:

```bash
# Review proposal
cat content/meta/token-proposals/deutschimblick.school.json

# Edit if needed
vim content/meta/token-proposals/deutschimblick.school.json
```

### Step 4: Apply Token Proposal

Merge approved tokens into scenario dictionaries:

```bash
./scripts/apply-token-proposal.sh content/meta/token-proposals/deutschimblick.school.json
```

**What it does**:
- Updates `SCENARIO_TOKEN_DICTS` in key files:
  - `scripts/content-quality/computeAnalytics.ts`
  - `scripts/pdf-ingestion/pdf-to-packs-batch.ts`
  - `scripts/pdf-ingestion/tokenMining.ts`
- Deduplicates tokens (keeps sorted)
- Runs validation and quality checks
- Prints next command to regenerate packs

### Step 5: Regenerate Packs

Re-run batch generation with updated tokens:

```bash
tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
  --workspace de \
  --pdfId deutschimblick \
  --pdf ./imports/deutschimblick.pdf \
  --scenario school \
  --level A1 \
  --packs 10
```

**Expected improvement**: More qualified candidates, better token coverage, higher quality packs.

### Automatic Token Mining Hints

When batch generation detects insufficient qualified candidates, it automatically suggests token mining:

```
💡 Token Mining Suggestion:
   Low qualified candidates detected. Consider mining tokens from this PDF:
   tsx scripts/pdf-ingestion/tokenMining.ts \
     --workspace de \
     --pdf "./imports/deutschimblick.pdf" \
     --pdfId deutschimblick \
     --scenario school \
     --mode search \
     --topN 80 \
     --ngrams 1,2,3
```

**Disable hints**: Use `--emitTokenMiningHint false` to suppress suggestions.

### Why This Works

- **Grounded in real language**: Tokens come from actual PDF content, not guesses
- **Deterministic**: Same PDF + same tokens = same results
- **Iterative**: Each cycle improves token coverage
- **Human-approved**: No auto-landing; review before applying
- **Prevents generic content**: Real tokens ensure authentic scenarios

### Example: Complete Iteration

```bash
# 1. Initial batch (low qualified candidates)
tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
  --workspace de --pdfId deutschimblick --scenario school --packs 10
# → Only 5 qualified candidates found

# 2. Mine tokens
tsx scripts/pdf-ingestion/tokenMining.ts \
  --workspace de --pdfId deutschimblick --scenario school --topN 80

# 3. Create proposal
tsx scripts/pdf-ingestion/create-token-proposal.ts \
  --fromReport reports/token-mining/deutschimblick.school.*/report.json \
  --scenario school --pdfId deutschimblick

# 4. Review proposal
vim content/meta/token-proposals/deutschimblick.school.json

# 5. Apply proposal
./scripts/apply-token-proposal.sh content/meta/token-proposals/deutschimblick.school.json

# 6. Regenerate (should have more qualified candidates)
tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
  --workspace de --pdfId deutschimblick --scenario school --packs 10
# → Now 25 qualified candidates found ✓
```

## Meaning-Safety Requirements

Generated prompts from PDF ingestion must include meaning-safety fields before approval:

- **`gloss_en`**: Literal meaning in English (required for approved content)
- **`intent`**: What the speaker is trying to accomplish (required for approved content)
- **`registerNote`**: Optional formal/informal nuance
- **`culturalNote`**: Optional cultural context (max 1 sentence)

**Enforcement**: The approval gate (`check-approval-gate.ts`) and validator enforce that approved generated packs have non-empty `gloss_en` and `intent` for all prompts. Promotion will fail if these fields are missing.

See [QUALITY_GATES.md](./QUALITY_GATES.md#meaning-safety-gates) for details.

## Usage

### Basic Command

```bash
npm run content:pdf-to-packs \
  --pdf ./imports/some.pdf \
  --workspace de \
  --section context \
  --scenario government_office \
  --level A1
```

### Full Command with All Options

```bash
npm run content:pdf-to-packs \
  --pdf ./imports/some.pdf \
  --workspace de \
  --section context \
  --scenario government_office \
  --level A1 \
  --register formal \
  --titlePrefix "Gov Office" \
  --maxPacks 3 \
  --packSize 12 \
  --ocr off \
  --dryRun false
```

### Arguments

#### Required

- `--pdf <path>`: Path to PDF file
- `--workspace <id>`: Workspace identifier (e.g., `de`, `en`)
- `--section <id>`: Section identifier (`context`, `mechanics`, `exams`)
- `--scenario <id>`: Scenario identifier (e.g., `government_office`, `work`, `restaurant`)
- `--level <level>`: CEFR level (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`)

#### Optional

- `--register <register>`: Formality level (`formal`, `neutral`, `informal`). Default: `neutral`
- `--titlePrefix <prefix>`: Prefix for pack titles. Default: derived from PDF filename
- `--maxPacks <number>`: Maximum number of packs to generate. Default: `1`
- `--packSize <number>`: Number of prompts per pack. Default: `12`
- `--ocr <on|off>`: Enable OCR for scanned PDFs. Default: `off` (not yet implemented)
- `--dryRun <true|false>`: If `true`, don't write content files, only generate report. Default: `true`
- `--outRunDir <path>`: Output directory for reports. Default: `reports/pdf-ingestion/<runId>/`
- `--seed <hex>`: Deterministic seed for generation. Default: derived from PDF hash + args
- `--mode <search|range>`: Selection mode. `search` finds best window automatically, `range` uses specified page range. Default: `search`
- `--skipFrontMatter <true|false>`: Skip front matter pages (TOC, intro, etc.). Default: `true`
- `--frontMatterMaxPages <number>`: Maximum pages to check for front matter. Default: `40`
- `--pageRange <start-end>`: Page range for `range` mode (e.g., `50-120`). Only used if `--mode=range`
- `--minScenarioHits <number>`: Minimum scenario token hits per candidate. Default: `2`
- `--windowSizePages <number>`: Size of sliding window for search mode. Default: `25`
- `--topWindows <number>`: Number of top windows to report. Default: `3`
- `--anchors <phrases>`: Comma-separated anchor phrases to prefer (e.g., `"Büro,Termin,Meeting"`)
- `--language <de|en>`: Language of PDF content. Default: derived from workspace (`de` for `de`, `en` for `en`)
- `--discoverScenarios <true|false>`: Enable scenario discovery to see which scenarios are present. Default: `true` in search mode
- `--minQualifiedCandidates <number>`: Minimum qualified candidates required. Default: `10`

## Workflow

### Recommended Workflow

1. **Dry Run First (Search Mode)**
   ```bash
   npm run content:pdf-to-packs \
     --pdf ./imports/some.pdf \
     --workspace de \
     --section context \
     --scenario work \
     --level A1 \
     --dryRun true
   ```
   
   The pipeline will:
   - Automatically skip front matter (TOC, intro pages)
   - Search for the best page window containing scenario content
   - Select top-scoring candidates from that window

2. **Review Report**
   - Open `reports/pdf-ingestion/<runId>/report.md`
   - Check the **Scenario Discovery** section to see which scenarios are present in the PDF
   - If your requested scenario has low matches, try one of the recommended scenarios
   - Check the **Window Search** section to see which pages were selected
   - Review top windows if the best window doesn't have enough content
   - Check for warnings and actionable issues

3. **If Search Mode Doesn't Find Enough Content**
   
   The pipeline will automatically run **Scenario Discovery** and show you which scenarios are actually present in the PDF. If your requested scenario has low matches, try one of the recommended scenarios:
   
   ```bash
   npm run content:pdf-to-packs \
     --pdf ./imports/some.pdf \
     --workspace de \
     --section context \
     --scenario school \  # Use recommended scenario from discovery
     --level A1 \
     --dryRun true
   ```
   
   Option A: Use anchors to guide search
   ```bash
   npm run content:pdf-to-packs \
     --pdf ./imports/some.pdf \
     --workspace de \
     --section context \
     --scenario work \
     --level A1 \
     --anchors "Büro,Termin,Meeting,Kollege" \
     --dryRun true
   ```
   
   Option B: Use range mode with specific pages
   ```bash
   npm run content:pdf-to-packs \
     --pdf ./imports/some.pdf \
     --workspace de \
     --section context \
     --scenario work \
     --level A1 \
     --mode range \
     --pageRange 80-180 \
     --dryRun true
   ```

4. **Run Actual Generation**
   ```bash
   npm run content:pdf-to-packs \
     --pdf ./imports/some.pdf \
     --workspace de \
     --section context \
     --scenario work \
     --level A1 \
     --dryRun false
   ```

4. **Validate Content**
   ```bash
   npm run content:validate
   ```

5. **Publish to Staging**
   ```bash
   npm run content:publish
   ```

6. **Smoke Test**
   - Test against staging manifest
   - Verify packs appear in section indexes
   - Check prompt quality

7. **Promote to Production**
   ```bash
   ./scripts/promote-staging.sh
   ```

## Determinism

The pipeline is **fully deterministic**: same PDF + same arguments = same output.

- Pack IDs are deterministic (derived from PDF name, scenario, level, part number)
- Prompt ordering is deterministic (seeded shuffle)
- Candidate selection is deterministic (same seed = same selection)

**Seed Generation**: If `--seed` is not provided, the seed is derived from:
```
sha256(pdfHash + workspace + scenario + level)
```

## Quality Gates

The pipeline enforces the same quality gates as manual pack generation:

### Hard Failures

1. **Generic Template Denylist**: Fails if any prompt contains:
   - "in today's lesson"
   - "let's practice"
   - "this sentence"
   - "i like to"
   - "the quick brown fox"
   - "lorem ipsum"

2. **Concreteness Marker**: Fails if <2 prompts contain:
   - Digits (0-9)
   - Currency symbols (€, $)
   - Time markers (14:30)
   - Weekday tokens (Montag, Dienstag, etc.)

3. **Segmentation Quality**: Fails if:
   - Insufficient candidates (<80% of required)
   - Too many duplicates (>25%)
   - Too many "garbage" candidates (>50% "other" type)

### Warnings (Non-Blocking)

- Low scenario token coverage (<80% of candidates)
- Placeholder `gloss_en` values (marked as `(gloss pending)`)
- Scanned PDF detected (if OCR is off)

## Report Structure

Each run produces two report files:

### `report.json`

Structured JSON with all run data:
- Input arguments
- PDF fingerprint (SHA256)
- Extraction statistics
- Normalization actions
- Segmentation statistics
- Quality check results
- Generation results
- Validation results
- Actionable issues
- Flags

### `report.md`

Human-readable Markdown report with:
- Summary of all steps
- Statistics and metrics
- Error and warning details
- Actionable issues section
- Flags summary

## Common Failures and Fixes

### ERR_PDF_SCAN_UNSUPPORTED

**Problem**: PDF appears to be scanned/image-only.

**Solutions**:
1. Convert PDF to text-based PDF (see "Scanned PDFs" section above)
2. Use `--ocr=on` (not yet implemented in v1)
3. Provide a text file instead (if available)

### Insufficient Candidates

**Problem**: After segmentation, not enough candidates for requested packs.

**Solutions**:
1. Reduce `--maxPacks` or `--packSize`
2. Use a longer/more detailed PDF
3. Check if PDF has sufficient text content

### Too Many Duplicates

**Problem**: >25% of candidates are duplicates.

**Solutions**:
1. PDF may have repeated content (headers, footers)
2. Normalization should remove these, but may need manual cleanup
3. Use a different PDF source

### Quality Gates Failed

**Problem**: Generated packs fail quality gates.

**Solutions**:
1. Check report for specific failures
2. Ensure PDF contains scenario-appropriate vocabulary
3. Verify PDF has concrete details (times, dates, amounts)
4. Review denylist violations

### Scenario Tokens Missing

**Problem**: Many candidates don't contain scenario-specific tokens.

**Solutions**:
1. Use a PDF that matches the scenario (e.g., government office PDF for `government_office` scenario)
2. Check if PDF language matches workspace language
3. Review segmentation - may need better text source

## Output Structure

Generated packs are written to:

```
content/v1/workspaces/{workspace}/packs/{packId}/pack.json
```

Example:
```
content/v1/workspaces/de/packs/gov-office-government_office-a1-part1/pack.json
```

## Limitations (v1)

1. **No OCR Support**: Scanned PDFs require manual conversion
2. **Simple Gloss Generation**: `gloss_en` may be placeholder `(gloss pending)` for complex sentences
3. **Basic Intent Detection**: Intent classification is rule-based, not LLM-powered
4. **No LLM Calls**: All generation is deterministic and rule-based
5. **Limited Language Support**: Currently optimized for German (de) workspace

## Future Enhancements

- [ ] OCR support for scanned PDFs
- [ ] LLM-based gloss generation (optional)
- [ ] Multi-language support
- [ ] Better intent detection
- [ ] Template-based pack structure generation

## TODO: B2B/Curriculum Exports v2

**Status**: Deferred

B2B/curriculum exports v2 (SCORM-ish bundles) are planned for a future release. This includes:
- SCORM-compatible content bundles
- Curriculum-level exports
- Multi-pack bundles with sequencing
- Progress tracking metadata

See [BUNDLE_EXPORT_SYSTEM.md](../BUNDLE_EXPORT_SYSTEM.md) for current export capabilities.

## Dependencies

The pipeline requires:

- `pdf-parse`: For PDF text extraction
  ```bash
  npm install --save-dev pdf-parse
  ```

If `pdf-parse` is not installed, the pipeline will fail with a clear error message.

## Examples

### Example 1: Government Office PDF

```bash
npm run content:pdf-to-packs \
  --pdf ./imports/bürgeramt-handbook.pdf \
  --workspace de \
  --section context \
  --scenario government_office \
  --level A1 \
  --register formal \
  --titlePrefix "Bürgeramt" \
  --maxPacks 2 \
  --packSize 12 \
  --dryRun false
```

### Example 2: Work Scenario PDF (Dry Run)

```bash
npm run content:pdf-to-packs \
  --pdf ./imports/office-handbook.pdf \
  --workspace de \
  --section context \
  --scenario work \
  --level A2 \
  --register neutral \
  --maxPacks 3 \
  --dryRun true
```

## Batch Generation Workflow (v1.1)

The batch generation workflow allows you to generate multiple packs from a single PDF with automatic scenario discovery, window search, and a review queue.

### Batch Command

```bash
tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
  --workspace de \
  --pdf ./imports/deutschimblick.pdf \
  --mode search \
  --discoverScenarios true \
  --scenario auto \
  --level A1 \
  --packs 10 \
  --promptsPerPack 12 \
  --windowSizePages 25 \
  --minScenarioHits 2 \
  --skipFrontMatter true \
  --seed 42
```

### Batch Arguments

#### Required
- `--workspace <id>`: Workspace identifier
- `--pdf <path>`: Path to PDF file
- `--level <level>`: CEFR level
- `--scenario <scenario|auto>`: Scenario identifier or `auto` for discovery

#### Optional
- `--mode <search|range>`: Selection mode. Default: `search`
- `--discoverScenarios <true|false>`: Enable scenario discovery. Default: `true`
- `--packs <number>`: Number of packs to generate. Default: `10`
- `--promptsPerPack <number>`: Prompts per pack. Default: `12`
- `--windowSizePages <number>`: Window size for search. Default: `25`
- `--minScenarioHits <number>`: Minimum scenario token hits. Default: `2`
- `--skipFrontMatter <true|false>`: Skip front matter. Default: `true`
- `--seed <hex>`: Deterministic seed
- `--register <register>`: Formality level. Default: `neutral`

### Batch Workflow Steps

1. **Generate Batch**
   ```bash
   tsx scripts/pdf-ingestion/pdf-to-packs-batch.ts \
     --workspace de \
     --pdf ./imports/deutschimblick.pdf \
     --scenario auto \
     --level A1 \
     --packs 10
   ```

2. **Review Report**
   - Check `reports/pdf-ingestion/{timestamp}-{pdfSlug}/summary.md`
   - Review the scenario ranking table
   - Check the review queue (sorted by quality score)
   - Review rejected candidates if any

3. **Approve Top Packs**
   ```bash
   ./scripts/approve-batch.sh \
     --sourceRef "deutschimblick" \
     --limit 5 \
     --reviewer "Your Name"
   ```

4. **Verify Approval Gate**
   ```bash
   tsx scripts/check-approval-gate.ts
   ```

5. **Promote to Production**
   ```bash
   ./scripts/promote-staging.sh
   ```

### Batch Report Structure

The batch report includes:

- **PDF Statistics**: Pages, characters, candidates found
- **Scenario Ranking**: Top 5 scenarios with token hits and qualified candidates
- **Top Windows**: Best page windows for scenario content
- **Generated Packs**: Details for each generated pack including:
  - Pack ID, title, level, scenario
  - Window used
  - Qualified prompts count
  - Token hits summary
  - Multi-slot variation score
  - Quality score
- **Review Queue**: Packs sorted by quality score (descending)
- **Rejected Candidates**: List of candidates that were filtered out with reasons

### Review Queue Filtering

Filter the review queue by PDF source:

```bash
./scripts/review-queue.sh --sourceRef "deutschimblick"
```

This shows only packs generated from PDFs matching the sourceRef filter.

### Batch Approval

The `approve-batch.sh` script:
- Loads the most recent batch report for the given sourceRef
- Sorts packs by quality score (from report)
- Approves the top N packs
- Runs validation and quality checks
- Updates review status to `approved` with reviewer and timestamp

### Safety Features

1. **Provenance Tracking**: All generated packs include:
   - `provenance.source: "pdf"`
   - `provenance.sourceRef`: PDF filename + window pages
   - `provenance.extractorVersion`: Version of extractor used
   - `provenance.generatedAt`: ISO timestamp

2. **Review Gates**: All generated packs default to:
   - `review.status: "needs_review"`
   - No reviewer or reviewedAt fields

3. **Approval Gate**: Promotion hard-fails if any generated content is not approved

4. **Duplicate Detection**: Quality check includes dedupe across entire workspace

5. **Reject List**: Tracks rejected candidates with reasons (heading, too short, no tokens, banned phrase, etc.)

### Stop Conditions

If the pipeline cannot produce at least `--packs` packs that pass validation:
- Produces as many as possible
- Exits non-zero
- Writes report with exact reasons
- Maintains reject list in report

## Integration with Existing Workflow

The PDF ingestion pipeline integrates seamlessly with existing content pipeline tools:

1. **Index Generation**: Automatically calls `npm run content:generate-indexes` after writing packs
2. **Validation**: Runs `npm run content:validate` after generation
3. **Quality Gates**: Uses same quality gates as `generate-pack.ts`
4. **Staging/Promote**: Generated packs follow same staging → promote workflow
5. **Batch Workflow**: Supports batch generation with review queue and approval workflow

## Troubleshooting

### "pdf-parse is not installed"

Install the dependency:
```bash
npm install --save-dev pdf-parse
```

### "ERR_PDF_SCAN_UNSUPPORTED"

Your PDF is scanned/image-only. Convert it to a text-based PDF or wait for OCR support.

### "Insufficient candidates"

Your PDF doesn't have enough text. Try:
- A longer PDF
- Reducing `--maxPacks` or `--packSize`
- Using a different PDF source

### Validation Errors After Generation

Check the validation output for specific errors. Common issues:
- Missing required fields (add manually if needed)
- Quality gate failures (review PDF content)
- Schema violations (shouldn't happen, but check report)

## See Also

- [PACK_SCHEMA.md](./PACK_SCHEMA.md): Pack entry schema
- [QUALITY_GATES.md](./QUALITY_GATES.md): Quality gate rules
- [ROLLOUT.md](./ROLLOUT.md): Staging → promote workflow
- [INGESTION_V1.md](./INGESTION_V1.md): General ingestion pipeline docs

