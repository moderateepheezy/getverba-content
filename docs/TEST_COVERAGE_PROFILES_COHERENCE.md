# Test Coverage for PDF Ingestion Profiles & Catalog Coherence Report

This document describes the comprehensive test suite for PDF Ingestion Profiles and Catalog Coherence Report features.

## Test Files

### 1. `scripts/pdf-ingestion/profileLoader.test.ts`

**Purpose**: Tests profile loader functionality and edge cases.

**Test Cases** (12 tests):
- ✅ Load profile from path
- ✅ `shouldSkipPage` with array format
- ✅ `shouldSkipPage` with ranges format
- ✅ `isPreferredPage` with ranges
- ✅ `shouldRejectCandidate` with rejectSections
- ✅ `countAnchorHits` with anchors
- ✅ Load profile with missing required fields fails
- ✅ Load profile with invalid language fails
- ✅ `shouldSkipPage` returns false when no skipPages
- ✅ `isPreferredPage` returns true when no preferPageRanges
- ✅ `shouldRejectCandidate` returns false when no rejectSections
- ✅ `countAnchorHits` with empty anchors

**Run**: `npm run test:profile-loader`

### 2. `scripts/pdf-ingestion/pdf-to-packs-batch-profile.test.ts`

**Purpose**: Tests profile integration in PDF batch processing.

**Test Cases** (9 tests):
- ✅ `pdf-to-packs-batch` supports `--pdfId` flag
- ✅ `pdf-to-packs-batch` supports `--profile` flag
- ✅ Profile auto-loading when pdfId provided
- ✅ Profile `skipPages` application
- ✅ Profile `preferPageRanges` application
- ✅ Profile `defaultScenarios` ordering
- ✅ Profile anchors enforcement
- ✅ Profile `rejectSections` application
- ✅ Profile overrides CLI arguments

**Run**: `npm run test:pdf-batch-profile`

### 3. `scripts/content-quality/coherence-report.test.ts`

**Purpose**: Tests coherence report generation and all report components.

**Test Cases** (8 tests):
- ✅ Coverage matrix generation
- ✅ Generic phrase detection
- ✅ Near-duplicate detection
- ✅ Orphan checks
- ✅ Variation slots distribution
- ✅ Token density stats
- ✅ Report generation produces JSON and Markdown
- ✅ Generic phrase count causes hard fail

**Run**: `npm run test:coherence-report`

## Running All Tests

```bash
# Run all profile and coherence tests
npm run test:profiles-coherence

# Run individual test suites
npm run test:profile-loader
npm run test:pdf-batch-profile
npm run test:coherence-report

# Run all tests (including profile/coherence tests)
npm run test:all
```

## Test Coverage Summary

### Profile Loader
- ✅ Profile loading (from path and by pdfId)
- ✅ Profile validation (required fields, language)
- ✅ `skipPages` (array and ranges formats)
- ✅ `preferPageRanges` filtering
- ✅ `rejectSections` keyword matching
- ✅ Anchor hit counting
- ✅ Edge cases (empty arrays, missing fields)

### PDF Batch Profile Integration
- ✅ CLI flag support (`--pdfId`, `--profile`)
- ✅ Auto-loading from `imports/profiles/<pdfId>.json`
- ✅ Profile application (skipPages, preferPageRanges, anchors)
- ✅ Profile scenario ordering
- ✅ Profile rejectSections
- ✅ Profile argument overrides

### Coherence Report
- ✅ Coverage matrix generation (scenario × level × primaryStructure × register)
- ✅ Variation slots distribution
- ✅ Token density stats per scenario
- ✅ Generic phrase detection (hard fail if >0)
- ✅ Near-duplicate detection (Jaccard similarity, threshold 0.92)
- ✅ Orphan checks (index items vs entry docs)
- ✅ Report output (JSON + Markdown)

## Integration with Existing Tests

The profile and coherence tests integrate with the existing test suite:
- Uses same test framework patterns as other test files
- Follows same setup/teardown patterns
- Compatible with `npm run test:all`

## Test Results

All 29 tests passing:
- 12 profile loader tests
- 9 PDF batch profile integration tests
- 8 coherence report tests

## Future Test Enhancements

Potential additions:
- End-to-end integration tests with actual PDF processing
- Performance tests for large catalogs (100+ packs)
- Edge case tests for malformed profiles
- Cross-workspace coherence tests

