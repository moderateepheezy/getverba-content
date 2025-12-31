# Test Coverage for Expansion Sprint System

This document describes the comprehensive test suite for the Expansion Sprint Runner, Review Tools, and Meaning-Safety Gates.

## Test Files

### 1. `scripts/meaning-safety-gates.test.ts`

**Purpose**: Tests meaning-safety enforcement in approval gate and validator.

**Test Cases**:
- ✅ Approval gate blocks approved pack missing `gloss_en`
- ✅ Approval gate blocks approved pack with empty `gloss_en`
- ✅ Approval gate blocks approved pack missing `intent`
- ✅ Handcrafted packs are exempt from meaning-safety requirements
- ✅ Needs_review packs can have empty meaning-safety fields
- ✅ Validator enforces meaning-safety on approved generated packs
- ✅ Approved pack with complete meaning-safety fields passes

**Run**: `npm run test:meaning-safety`

### 2. `scripts/review-tools.test.ts`

**Purpose**: Tests review tools (`review-open.sh`, `approve-top.sh`).

**Test Cases**:
- ✅ `review-open.sh` script exists and is executable
- ✅ `review-open.sh` supports required flags (`--workspace`, `--limit`, `--sourceRef`)
- ✅ `approve-top.sh` script exists and is executable
- ✅ `approve-top.sh` supports required flags (`--workspace`, `--limit`, `--reviewer`, `--scenario`, `--level`)
- ✅ `approve-top.sh` filters by scenario
- ✅ `approve-top.sh` filters by level
- ✅ `approve-top.sh` sorts by quality score
- ✅ `approve-top.sh` updates review status
- ✅ `approve-top.sh` re-runs validation after approval

**Run**: `npm run test:review-tools`

### 3. `scripts/sprint-runner.test.ts`

**Purpose**: Tests sprint runner script (`run-expansion-sprint.sh`).

**Test Cases**:
- ✅ Sprint runner script exists and is executable
- ✅ Sprint runner supports required flags
- ✅ Sprint runner generates report directory structure
- ✅ Sprint runner includes validation step
- ✅ Sprint runner generates report with correct structure
- ✅ Sprint runner handles template generation
- ✅ Sprint runner handles PDF batch processing
- ✅ Sprint runner exits non-zero on validation failure
- ✅ Sprint runner tracks generated packs

**Run**: `npm run test:sprint-runner`

### 4. `scripts/run-expansion-sprint.test.ts`

**Purpose**: Basic integration tests for sprint runner.

**Test Cases**:
- ✅ Sprint runner produces report artifacts
- ✅ Approval gate blocks approved packs missing `gloss_en`/`intent`
- ✅ `approve-top.sh` only approves matching scenario/level

**Run**: `npm run test:expansion-sprint` (runs all expansion sprint tests)

## Running All Tests

```bash
# Run all expansion sprint tests
npm run test:expansion-sprint

# Run individual test suites
npm run test:meaning-safety
npm run test:review-tools
npm run test:sprint-runner

# Run all tests (including expansion sprint tests)
npm run test:all
```

## Test Coverage Summary

### Meaning-Safety Gates
- ✅ Approval gate enforcement
- ✅ Validator enforcement
- ✅ Handcrafted pack exemption
- ✅ Needs_review pack allowance

### Review Tools
- ✅ Script existence and executability
- ✅ Flag support
- ✅ Filtering logic (scenario, level)
- ✅ Quality score sorting
- ✅ Review status updates
- ✅ Validation re-run

### Sprint Runner
- ✅ Script existence and executability
- ✅ Flag support
- ✅ Report generation
- ✅ Validation integration
- ✅ Template generation integration
- ✅ PDF batch processing integration
- ✅ Error handling

## Integration with Existing Tests

The expansion sprint tests integrate with the existing test suite:
- Uses same test framework patterns as `provenance.test.ts` and `validate-content.test.ts`
- Follows same setup/teardown patterns
- Compatible with `npm run test:all`

## Future Test Enhancements

Potential additions:
- End-to-end integration tests with actual content generation
- Performance tests for large batch processing
- Edge case tests for malformed input
- Cross-workspace tests

