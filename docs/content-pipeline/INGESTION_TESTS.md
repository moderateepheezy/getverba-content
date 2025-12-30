# Ingestion Pipeline Tests

This document describes the comprehensive test suite for the automated niche pack generation pipeline.

## Test Coverage

### Unit Tests (`scripts/ingest/ingest.test.ts`)

**32 unit tests** covering all pipeline components:

#### Text Normalization (3 tests)
- ✅ Removes extra whitespace
- ✅ Handles line breaks
- ✅ Trims whitespace

#### Segmentation (7 tests)
- ✅ Produces stable chunk IDs for same input
- ✅ Splits on headings
- ✅ Splits on bullet points
- ✅ Handles long chunks by splitting
- ✅ Handles empty text
- ✅ Handles single paragraph
- ✅ Preserves chunk boundaries

#### Signal Extraction (8 tests)
- ✅ Extracts top tokens
- ✅ Detects intents
- ✅ Detects question patterns
- ✅ Detects entities (time)
- ✅ Detects entities (date)
- ✅ Detects entities (money)
- ✅ Detects action verbs
- ✅ Provides evidence with counts

#### Pack Planning (4 tests)
- ✅ Creates packs from signals
- ✅ Enforces overlap threshold
- ✅ Generates stable pack IDs
- ✅ Respects min/max pack count

#### Draft Prompt Generation (5 tests)
- ✅ Generates prompts for pack
- ✅ Ensures multi-slot variation
- ✅ Includes scenario tokens
- ✅ Avoids banned phrases
- ✅ Ensures register consistency for formal

#### Quality Gates (5 tests)
- ✅ Passes valid pack
- ✅ Fails on missing scenario tokens
- ✅ Fails on banned phrases
- ✅ Fails on insufficient multi-slot variation
- ✅ Fails on missing natural_en for A2+

### E2E Tests (`scripts/ingest/ingest-e2e.test.ts`)

**5 end-to-end tests** covering the complete pipeline:

1. **Full pipeline with text input** - Tests complete ingestion from text → draft packs → report
2. **Promotion workflow** - Tests draft → production promotion with validation
3. **Deterministic generation** - Verifies same input produces identical output
4. **Quality gates enforcement** - Verifies quality gates are checked and reported
5. **Multiple scenarios** - Tests pipeline with different scenarios (government_office, work)

## Running Tests

### Unit Tests
```bash
npm run test:ingest
```

### E2E Tests
```bash
npm run test:ingest-e2e
```

### All Tests
```bash
npm run test:all
```

## Test Results

### Unit Tests: ✅ 32/32 passing (100%)

All unit tests verify:
- Deterministic behavior (same input → same output)
- Correct signal extraction
- Proper pack planning
- Quality gate enforcement
- Edge case handling

### E2E Tests: ✅ 5/5 passing (100%)

All E2E tests verify:
- Complete pipeline execution
- Draft pack generation
- Promotion workflow
- Report generation
- Validation integration

## Test Quality Assurance

### Deterministic Testing
- Tests verify stable chunk IDs (SHA-1 hashing)
- Tests verify stable pack IDs
- Tests verify identical output for same input

### Quality Gate Coverage
- Scenario token requirements
- Banned phrase detection
- Multi-slot variation enforcement
- Register consistency
- Concreteness markers
- Meaning contract fields (natural_en)

### Edge Case Coverage
- Empty text input
- Single paragraph text
- Long text (splitting)
- Minimal input
- Multiple scenarios
- Similar signals (overlap detection)

### Integration Coverage
- Text extraction → Segmentation → Signals → Planning → Prompts
- Draft generation → Quality gates → Reporting
- Draft → Promotion → Production → Validation

## Test Maintenance

When adding new features:
1. Add unit tests for new functions
2. Add E2E tests for new workflows
3. Update this document
4. Ensure 100% test pass rate

## Known Limitations

- PDF extraction tests require `pdf-parse` dependency (optional)
- URL extraction tests require network access (optional)
- E2E tests create temporary files (auto-cleaned)

