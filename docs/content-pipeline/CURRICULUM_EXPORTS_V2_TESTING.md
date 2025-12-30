# Curriculum Exports v2 Testing Guide

This document describes the comprehensive test suite for the Curriculum Export v2 system.

## Test Structure

The test suite consists of three types of tests:

1. **Unit Tests**: Test individual functions and logic in isolation
2. **Integration Tests**: Test component interactions
3. **E2E Tests**: Test the complete workflow end-to-end

## Running Tests

### Unit Tests

```bash
# Test curriculum export generator
npm run test:curriculum-export

# Test curriculum export validator
npm run test:curriculum-validate

# Run all unit tests
npm test
```

### E2E Tests

```bash
# Run all e2e tests (includes curriculum export tests)
npm run test:e2e

# Run all tests
npm run test:all
```

## Test Coverage

### Unit Tests: `export-curriculum-v2.test.ts`

Tests the curriculum export generator:

1. **Bundle ID Generation**
   - ✅ Deterministic bundle ID generation
   - ✅ Neutral register handling (omits register from ID)
   - ✅ Scenario and level slugification

2. **Module Ordering**
   - ✅ Packs → drills → exams ordering
   - ✅ Sorting within each kind (primaryStructure, then title)

3. **Coverage Gates**
   - ✅ Minimum packs per bundle (3)
   - ✅ Minimum primary structures per bundle (2)
   - ✅ Estimated minutes bounds (15-180)

4. **CSV Generation**
   - ✅ Correct CSV format
   - ✅ Proper escaping of special characters
   - ✅ All required columns present

5. **Bundle Config Overrides**
   - ✅ Title override
   - ✅ Outcomes override
   - ✅ Module title override
   - ✅ Item ordering override

6. **Level Comparison**
   - ✅ Correct sorting order (A1 < A2 < B1 < B2 < C1 < C2)

### Unit Tests: `validate-curriculum-export.test.ts`

Tests the curriculum export validator:

1. **Schema Validation**
   - ✅ Valid export schema passes
   - ✅ Invalid version fails
   - ✅ Missing required fields fail
   - ✅ Invalid level fails
   - ✅ Item kind validation

2. **Referential Integrity**
   - ✅ Entry documents exist
   - ✅ Entry IDs match references
   - ✅ Entry kinds match references

3. **Duplicate Detection**
   - ✅ Duplicate entryUrl detection

4. **Coverage Requirements**
   - ✅ Minimum packs enforcement
   - ✅ Minimum primary structures enforcement
   - ✅ Estimated minutes bounds enforcement
   - ✅ Outcomes count validation (warnings)

5. **Format Validation**
   - ✅ EntryUrl format validation
   - ✅ CSV format validation

### E2E Tests: `e2e-test.ts`

Tests the complete workflow:

1. **Export Generation**
   - ✅ Export command runs successfully
   - ✅ JSON and CSV files are generated
   - ✅ Export structure is valid

2. **Export Validation**
   - ✅ Validation command runs
   - ✅ Errors are properly reported
   - ✅ Warnings are properly reported

3. **Structure Validation**
   - ✅ Top-level structure is valid
   - ✅ All bundles are valid
   - ✅ All modules are valid
   - ✅ All items are valid

4. **Referential Integrity**
   - ✅ No duplicate entryUrls
   - ✅ All referenced entry documents exist
   - ✅ Entry document IDs match references
   - ✅ Entry document kinds match references

## Test Data

Unit tests use temporary test directories (`.test-curriculum-export`, `.test-curriculum-validate`) that are automatically cleaned up after each test run.

E2E tests use the actual content in the repository, so they may skip if:
- No manifest exists
- No active workspace is configured
- Export hasn't been generated yet
- Content doesn't meet minimum requirements

## Writing New Tests

### Unit Test Pattern

```typescript
test('test name', () => {
  setupTestDir();
  
  // Create test data
  // ... setup code ...
  
  // Run test logic
  // ... test code ...
  
  // Assertions
  assert(condition, 'error message');
  
  cleanupTestDir();
});
```

### E2E Test Pattern

```typescript
test('e2e test name', async () => {
  // Check prerequisites
  if (!existsSync(requiredFile)) {
    return; // Skip if prerequisites not met
  }
  
  // Run command or check state
  // ... test code ...
  
  // Assertions
  assert(condition, 'error message');
});
```

## Continuous Integration

Tests are designed to:
- ✅ Pass when content is valid
- ✅ Fail gracefully when content has issues
- ✅ Skip when prerequisites aren't met
- ✅ Clean up temporary files automatically

## Known Limitations

1. **E2E tests may skip** if export hasn't been generated - this is expected behavior
2. **Coverage gate tests** may pass even if actual content doesn't meet requirements - they test the logic, not the actual content
3. **Bundle config tests** use simplified mock data - full integration requires actual config files

## Future Enhancements

- [ ] Add performance tests for large catalogs
- [ ] Add tests for ZIP packaging
- [ ] Add tests for bundle config validation
- [ ] Add snapshot tests for deterministic output
- [ ] Add tests for pagination edge cases

