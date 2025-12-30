# B2B Export Testing Guide

This document describes the comprehensive test suite for B2B Curriculum Exports v2.

## Test Files

### Unit Tests (`scripts/export-curriculum-b2b.test.ts`)

Comprehensive unit tests covering:

1. **Deterministic Ordering**
   - Scenario priority (work before restaurant)
   - Level priority (A1 before A2)
   - Register priority (formal before neutral)
   - Primary structure alphabetical ordering
   - ID tie-breaker
   - Same input produces identical output
   - Handles missing optional fields

2. **Filtering**
   - Filter by levels (includes only specified levels)
   - Filter by scenarios (includes only specified scenarios)
   - Max-packs limit enforcement
   - Max-drills limit enforcement

3. **Explicit IDs**
   - Includes only specified pack IDs
   - Empty list returns all items

4. **Bundle Planning**
   - Groups items into modules
   - Module IDs are sequential (m1, m2, m3...)
   - Module grouping respects max items per module

5. **SCORM Manifest Generation**
   - Creates valid XML
   - Includes all modules
   - Escapes XML special characters

6. **Syllabus Generation**
   - Includes all required sections
   - Contains bundle metadata
   - Lists modules and items

7. **Integrity Report**
   - Detects duplicate IDs
   - Computes distributions (levels, scenarios, structures)
   - Validates entry documents exist

### E2E Tests (`scripts/export-curriculum-e2e.test.ts`)

End-to-end tests that verify the complete export flow:

1. **Basic Export Flow**
   - Creates test content (packs, drills, catalog, indexes)
   - Runs export command
   - Verifies all outputs exist:
     - `bundle.json` (valid structure)
     - `syllabus.md` (contains expected content)
     - `scorm/imsmanifest.xml` (valid XML)
     - `reports/integrity.json` (valid structure)
     - `content/` directory with entry documents
     - ZIP file (if zip command available)

2. **Deterministic Behavior**
   - Same inputs produce identical `bundle.json`
   - Module structure is identical
   - Item order is identical
   - Verifies deterministic ordering rules

3. **Filtering by Levels and Scenarios**
   - Filters correctly by level
   - Filters correctly by scenario
   - Combined filters work correctly

4. **Explicit IDs**
   - Includes only specified pack IDs
   - Excludes non-specified items

5. **Max Limits**
   - Enforces max-packs limit
   - Limits are respected in bundle totals

6. **Integrity Report Validation**
   - No errors when all entry documents exist
   - Stats are computed correctly
   - Coherence metrics are accurate

## Running Tests

### Run Unit Tests

```bash
npm run test:curriculum-export-b2b
```

### Run E2E Tests

```bash
npm run test:curriculum-export-e2e
```

### Run All Tests

```bash
npm run test:curriculum-export-b2b && npm run test:curriculum-export-e2e
```

## Test Coverage

### Functions Tested

- ✅ `sortItemsDeterministically` - All ordering rules
- ✅ `filterItems` - All filter types
- ✅ `applyExplicitIds` - Explicit ID filtering
- ✅ `planBundle` - Complete planning flow
- ✅ `generateSCORMManifest` - XML generation and escaping
- ✅ `generateSyllabus` - Markdown generation
- ✅ `generateIntegrityReport` - Error detection and metrics
- ✅ `buildBundle` - Complete bundle building
- ✅ `writeBundleArtifacts` - File generation
- ✅ CLI argument parsing
- ✅ Export command execution

### Edge Cases Covered

- ✅ Missing optional fields (scenario, register, primaryStructure)
- ✅ Empty filter lists
- ✅ No items matching filters
- ✅ Duplicate IDs
- ✅ Missing entry documents
- ✅ XML special characters in titles
- ✅ Large item lists (module grouping)
- ✅ Multiple modules
- ✅ Mixed item types (packs, drills, exams)

### Integration Points Verified

- ✅ Catalog loading
- ✅ Section index pagination
- ✅ Entry document loading
- ✅ File system operations (create, copy, write)
- ✅ ZIP file creation
- ✅ Environment variable support (CONTENT_DIR, EXPORTS_DIR)

## Test Isolation

All tests use isolated test directories:
- Unit tests: `.test-curriculum-export/`
- E2E tests: `.test-curriculum-export-e2e/`

Test directories are cleaned up before and after each test run.

## Expected Test Results

### Unit Tests

All unit tests should pass with 0 failures. Tests verify:
- Correctness of individual functions
- Edge case handling
- Error conditions

### E2E Tests

All E2E tests should pass with 0 failures. Tests verify:
- Complete export flow works
- All files are generated correctly
- Deterministic behavior
- Filtering and limits work
- Integrity reports are accurate

## Debugging Failed Tests

### Unit Test Failures

1. Check the error message for the specific assertion that failed
2. Verify the test data matches expected structure
3. Check function implementation for logic errors

### E2E Test Failures

1. Check if test content was created correctly
2. Verify export command executed successfully
3. Check if output files exist in test directory
4. Verify file contents match expected structure
5. Check environment variables (CONTENT_DIR, EXPORTS_DIR)

### Common Issues

**"Workspace not found"**
- Test content directory structure is incorrect
- CONTENT_DIR environment variable not set correctly

**"Entry document not found"**
- Entry documents not created in test setup
- Entry URLs don't match file paths

**"ZIP creation failed"**
- `zip` command not available (non-fatal, test continues)
- Check if ZIP file is actually needed for test

**"Deterministic ordering failed"**
- Items not sorted correctly
- Check sortItemsDeterministically implementation
- Verify test data has correct fields

## Adding New Tests

### Unit Test Pattern

```typescript
test('Test name', () => {
  // Setup
  const items: BundleItem[] = [...];
  
  // Execute
  const result = functionUnderTest(items);
  
  // Assert
  assert(result.length === expected, 'Error message');
});
```

### E2E Test Pattern

```typescript
test('E2E: Test name', () => {
  setupTestDir();
  
  try {
    // Create test content
    createTestCatalog();
    createTestPack(...);
    createSectionIndex(...);
    
    // Run export
    execSync('npx tsx scripts/export-curriculum.ts ...', {
      cwd: ROOT_DIR,
      env: { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR, EXPORTS_DIR: TEST_EXPORTS_DIR }
    });
    
    // Verify outputs
    const bundle = JSON.parse(readFileSync(...));
    assert(bundle.totals.packs === expected, 'Error message');
  } finally {
    cleanupTestDir();
  }
});
```

## Test Maintenance

- Keep test data minimal but representative
- Use descriptive test names
- Clean up test directories after each run
- Verify tests pass in isolation and together
- Update tests when functionality changes

