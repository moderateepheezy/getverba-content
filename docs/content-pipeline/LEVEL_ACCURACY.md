# Level Accuracy System

This document describes the level accuracy validation system that ensures CEFR level labeling is 98% accurate.

## Overview

The level accuracy system validates that content labeled with CEFR levels (A1, A2, B1, etc.) actually uses vocabulary appropriate for that level. This ensures premium content quality and prevents random or inaccurate level labeling.

## Components

### 1. Vocabulary Grading Service

**File**: `scripts/vocabulary-grading/vocabularyGradingService.ts`

Provides CEFR level grading for vocabulary tokens:
- Integrates with external APIs (configurable)
- Caches results in `content/meta/vocabulary-cache.json`
- Falls back to heuristics if API unavailable
- Supports token-level, prompt-level, and content-level grading

### 2. Level Accuracy Validation

**File**: `scripts/validate-content.ts` (function: `validateLevelAccuracy`)

Validates content during the standard validation process:
- Checks cached vocabulary levels against claimed content level
- Flags content with level mismatches
- Runs automatically during `npm run content:validate`

### 3. Analysis Script

**File**: `scripts/analyze-level-accuracy.ts`

Scans all existing content and generates accuracy report:
- Analyzes all drills, packs, and exams
- Generates `content/meta/level-accuracy-report.json`
- Provides summary statistics and mismatch details

**Usage**:
```bash
tsx scripts/analyze-level-accuracy.ts
```

### 4. Fix Script

**File**: `scripts/fix-level-mismatches.ts`

Fixes content items with level mismatches:
- Reads accuracy report
- Auto-fixes with high confidence (>95%)
- Flags for manual review otherwise

**Usage**:
```bash
# Flag for review (no changes)
tsx scripts/fix-level-mismatches.ts

# Auto-fix with confidence >= 0.95
tsx scripts/fix-level-mismatches.ts --auto-fix

# Auto-fix with custom confidence threshold
tsx scripts/fix-level-mismatches.ts --auto-fix --confidence=0.90
```

### 5. Generation Integration

**File**: `scripts/generate-drills-v4.ts`

Filters slot dictionaries by level during generation:
- Uses vocabulary cache to filter words
- Ensures generated content uses appropriate vocabulary
- Prevents level mismatches at generation time

### 6. Exam-Specific Validation

**File**: `scripts/validate-content.ts` (function: `validateExamRequirements`)

Validates exam content against official requirements:
- Checks provider requirements (Goethe, TELC, DTZ)
- Validates vocabulary level matches exam CEFR level
- Stricter rules than general content (max 5% exceed)

## Configuration

### Level Grading Config

**File**: `content/meta/level-grading-config.json`

```json
{
  "apiProvider": "custom",
  "apiUrl": "",
  "apiKey": "",
  "cacheEnabled": true,
  "accuracyThreshold": 0.98,
  "validationRules": {
    "A1": { "maxHigherLevel": 0.05, "maxLevel": "A2" },
    "A2": { "maxHigherLevel": 0.10, "maxLevel": "B1" },
    "B1": { "maxHigherLevel": 0.15, "maxLevel": "B2" }
  }
}
```

### Exam Requirements

**File**: `content/meta/exam-requirements.json`

Contains official exam requirements per provider and level:
- Goethe-Institut exams (A1-C1)
- TELC exams (A1-C1)
- DTZ exam (B1)

## Validation Rules

### General Content

- **A1**: 95%+ tokens must be A1, max 5% A2
- **A2**: 90%+ tokens must be A1-A2, max 10% B1
- **B1**: 85%+ tokens must be A1-B1, max 15% B2
- **B2**: 80%+ tokens must be A1-B2, max 20% C1
- **C1**: 75%+ tokens must be A1-C1, max 25% C2
- **C2**: 70%+ tokens must be A1-C2, max 30% exceed

### Exams

- Stricter: max 5% of tokens can exceed exam level
- Must match official exam provider requirements
- Vocabulary level must match exam CEFR level exactly

### Hard Failures

- Any token is 2+ levels above claimed level (e.g., C1 token in A1 content)
- More than allowed percentage of tokens exceed level
- Exam content doesn't match provider requirements

## Workflow

1. **Generate Content**: `generate-drills-v4.ts` filters dictionaries by level
2. **Validate**: `npm run content:validate` checks level accuracy
3. **Analyze**: `npm run content:validate-levels` generates accuracy report
4. **Fix**: `fix-level-mismatches.ts` fixes identified issues
5. **Verify**: Re-run analysis to confirm 98%+ accuracy

## CI/CD Integration

The level accuracy check is integrated into the validation pipeline:
- Runs during `npm run content:validate`
- Fails build if level accuracy < 98%
- Reports available in `content/meta/level-accuracy-report.json`

## Success Criteria

- 98%+ of content has accurate level labeling
- All new content automatically validated for level accuracy
- Existing content analyzed and fixed
- Exam content validated against official requirements
- CI/CD fails if level accuracy drops below 98%

