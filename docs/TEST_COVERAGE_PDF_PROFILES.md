# Test Coverage: PDF Profiles + Cache System

This document describes the comprehensive test suite for PDF Profiles, Cached Extraction, and Deterministic Re-runs.

## Test Files

### Unit Tests

#### 1. `scripts/pdf-ingestion/loadPdfProfile.test.ts` (7 tests)

**Purpose**: Tests PDF profile loading and validation.

**Test Cases**:
- ✅ Load valid profile
- ✅ Profile validation - missing required fields
- ✅ Profile validation - invalid language
- ✅ Profile search settings defaults
- ✅ Profile range presets validation
- ✅ Profile file path resolution (relative vs absolute)

**Run**: `npm run test:load-pdf-profile`

#### 2. `scripts/pdf-ingestion/extractAndCache.test.ts` (7 tests)

**Purpose**: Tests extraction cache functionality.

**Test Cases**:
- ✅ Cache key stability (same file → same key)
- ✅ Cache key differs for different files
- ✅ Get cache path
- ✅ Save and load cached extraction
- ✅ Load non-existent cache returns null
- ✅ Cache version mismatch invalidates cache
- ✅ Cache key includes file hash and version

**Run**: `npm run test:extract-cache`

### E2E Tests

#### 3. `scripts/pdf-ingestion/runProfileBatch.test.ts` (6 tests)

**Purpose**: Tests the runProfileBatch workflow components.

**Test Cases**:
- ✅ Profile loading and validation
- ✅ Cache key computation is deterministic
- ✅ Cache path generation
- ✅ Run artifacts structure
- ✅ Deterministic pack generation
- ✅ Profile file path resolution

**Run**: `npm run test:run-profile-batch`

#### 4. `scripts/pdf-ingestion/pdf-profiles-e2e.test.ts` (6 tests)

**Purpose**: Comprehensive E2E tests for the complete workflow.

**Test Cases**:
- ✅ Complete workflow simulation
- ✅ Profile validation edge cases
- ✅ Cache versioning
- ✅ Run directory structure
- ✅ Deterministic seed generation
- ✅ Profile search settings inheritance

**Run**: `npm run test:pdf-profiles-e2e`

## Running All Tests

```bash
# Run all PDF profiles + cache tests
npm run test:pdf-profiles-full

# Run individual test suites
npm run test:load-pdf-profile        # 7 tests
npm run test:extract-cache           # 7 tests
npm run test:run-profile-batch       # 6 tests
npm run test:pdf-profiles-e2e        # 6 tests

# Run grouped tests
npm run test:pdf-profiles-cache      # Unit tests only
```

## Test Coverage Summary

### Profile Loading
- ✅ Valid profile loading
- ✅ Required field validation
- ✅ Invalid language detection
- ✅ Search settings defaults
- ✅ Range presets validation
- ✅ File path resolution (relative/absolute)

### Cache System
- ✅ Cache key stability (deterministic)
- ✅ Cache key uniqueness (different files)
- ✅ Cache path generation
- ✅ Save and load operations
- ✅ Non-existent cache handling
- ✅ Version mismatch invalidation
- ✅ Cache key format validation

### Run Workflow
- ✅ Profile loading integration
- ✅ Cache integration
- ✅ Run artifact generation
- ✅ Deterministic pack generation
- ✅ Seed generation consistency

### E2E Workflow
- ✅ Complete workflow simulation
- ✅ Edge case handling
- ✅ Version management
- ✅ Directory structure
- ✅ Settings inheritance

## Test Results

**Total Tests**: 26 tests
- 7 profile loader tests
- 7 cache system tests
- 6 runProfileBatch tests
- 6 E2E workflow tests

**All tests passing** ✅

## Test Quality

- **Edge cases covered**: Missing fields, invalid data, version mismatches
- **Error handling verified**: Null returns, validation failures
- **Deterministic behavior tested**: Cache keys, seeds, pack IDs
- **Integration points validated**: Profile → cache → batch generation
- **E2E coverage**: Complete workflow from profile to artifacts

## Future Test Enhancements

Potential additions:
- Actual PDF file extraction tests (requires test PDFs)
- Full end-to-end run with real profile and cache
- Performance tests for large PDFs
- Cache invalidation scenarios
- Concurrent cache access tests

