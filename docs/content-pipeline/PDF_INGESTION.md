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
- [ ] Automatic scenario detection
- [ ] Template-based pack structure generation

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

## Integration with Existing Workflow

The PDF ingestion pipeline integrates seamlessly with existing content pipeline tools:

1. **Index Generation**: Automatically calls `npm run content:generate-indexes` after writing packs
2. **Validation**: Runs `npm run content:validate` after generation
3. **Quality Gates**: Uses same quality gates as `generate-pack.ts`
4. **Staging/Promote**: Generated packs follow same staging → promote workflow

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

