# friends_small_talk Scenario Testing

This document describes the test coverage for the `friends_small_talk` scenario implementation.

## Unit Tests

Location: `scripts/generate-pack.test.ts`

### Test: friends_small_talk scenario generates valid pack
- **Purpose**: Verify that packs can be generated from the friends_small_talk template
- **Checks**:
  - Scenario is set to `friends_small_talk`
  - Register is `casual`
  - Primary structure is `modal_verbs_suggestions`
  - At least 80% of prompts contain scenario tokens
  - No banned generic greetings (unless contextualized)
  - Casual register maintained (no formal Sie/Ihnen)

### Test: friends_small_talk token matching includes phrase tokens
- **Purpose**: Verify that phrase tokens (multi-word tokens) are recognized
- **Checks**:
  - At least 2 tokens per prompt (single or phrase tokens)
  - Phrase tokens like "hast du lust", "lass uns", etc. are recognized
  - Quality gates token requirement is met

### Test: friends_small_talk maintains multi-slot variation
- **Purpose**: Verify multi-slot variation requirements
- **Checks**:
  - At least 30% of prompts have 2+ slotsChanged
  - At least 3 different slots are varied across prompts
  - Variation slots are properly used

## E2E Tests

Location: `scripts/e2e-test.ts`

### E2E Test 39: friends_small_talk scenario template exists and is valid
- **Purpose**: Verify template file structure and required fields
- **Checks**:
  - Template file exists at correct path
  - Schema version is 1
  - Scenario ID is `friends_small_talk`
  - Default register is `casual`
  - Required tokens array has at least 18 tokens
  - Phrase tokens are included
  - Step blueprint has at least 2 steps

### E2E Test 40: friends_small_talk packs can be generated
- **Purpose**: Verify pack generation works end-to-end
- **Checks**:
  - Pack file is created
  - Pack has correct ID, scenario, register
  - Pack has at least 12 prompts
  - Pack has session plan with steps

### E2E Test 41: friends_small_talk packs appear in index after generation
- **Purpose**: Verify index integration
- **Checks**:
  - Pack appears in context index after generation
  - Index item has correct scenario
  - Index item has correct entryUrl

### E2E Test 42: friends_small_talk token matching works correctly
- **Purpose**: Verify token matching in generated packs
- **Checks**:
  - Each prompt has at least 2 scenario tokens
  - Phrase tokens are recognized (soft check)
  - Token matching works for both single and multi-word tokens

## Running Tests

### Run Unit Tests
```bash
npx tsx scripts/generate-pack.test.ts
```

### Run E2E Tests
```bash
npx tsx scripts/e2e-test.ts
```

### Run Specific Test
To run only friends_small_talk related tests, you can filter the output:
```bash
npx tsx scripts/generate-pack.test.ts 2>&1 | grep -A 5 "friends_small_talk"
npx tsx scripts/e2e-test.ts 2>&1 | grep -A 5 "friends_small_talk\|E2E Test 39\|E2E Test 40\|E2E Test 41\|E2E Test 42"
```

## Test Coverage Summary

✅ **Template Validation**: Template structure and required fields  
✅ **Pack Generation**: End-to-end pack generation from template  
✅ **Token Matching**: Single and phrase token recognition  
✅ **Quality Gates**: Multi-slot variation, register consistency, token requirements  
✅ **Index Integration**: Pack appears in indexes after generation  
✅ **Scenario-Specific**: Casual register, no generic greetings, friends context

## Expected Test Results

All tests should pass when:
- Template file exists and is valid
- Token dictionaries are properly configured
- Generator script works correctly
- Index generation includes new packs

If tests fail, check:
1. Template file exists at `content/templates/v1/scenarios/friends_small_talk.json`
2. Token dictionaries include `friends_small_talk` in all relevant files
3. Generated packs pass quality gates
4. Index generation runs successfully


