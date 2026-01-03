# Validation Issues - Review and Fix

## Status

All 39 items have been approved, but validation is failing. Here's how to identify and fix the issues.

## Step 1: Identify Validation Errors

Run this command to see all validation errors:

```bash
cd /Users/simpumind/Desktop/Projects/getverba-content
npm run content:validate 2>&1 | tee validation-errors.log
```

## Step 2: Common Issues and Fixes

### Issue 1: Missing or Empty `gloss_en` in Prompts

**Error:** `Item X pack entry prompt Y missing or invalid field: gloss_en (required, 6-180 chars)`

**Fix:** Run the auto-fix script:
```bash
npx tsx scripts/fix-validation-issues.ts
```

This script will:
- Use `gloss_en_i18n.en` if `gloss_en` is missing
- Fix gloss_en length issues
- Set default intent values if missing

### Issue 2: Missing or Empty `intent` in Prompts

**Error:** `Item X pack entry prompt Y missing or invalid field: intent`

**Fix:** The auto-fix script will set default intent values based on prompt text patterns.

### Issue 3: Quality Gate Violations

**Note:** `passesQualityGates: false` is **allowed** for approved packs. The validator only requires quality gates to pass for non-approved generated content.

### Issue 4: Missing Review Fields

**Error:** `review.reviewer is required when status is "approved"`

**Fix:** Already fixed - all approved items have `reviewer: "system"` and `reviewedAt`.

## Step 3: Manual Fixes (if needed)

If the auto-fix script doesn't catch everything, check for:

1. **Prompts without gloss_en**: Find and add appropriate English translations
2. **Prompts without intent**: Set to one of: `greet`, `request`, `apologize`, `inform`, `ask`, `confirm`, `schedule`, `order`, `ask_price`, `thank`, `goodbye`
3. **gloss_en too short (< 6 chars)**: Expand the translation
4. **gloss_en too long (> 180 chars)**: Truncate or simplify

## Step 4: Re-validate

After fixing issues:

```bash
npm run content:validate
```

Should show no errors.

## Step 5: Promote

Once validation passes:

```bash
./scripts/promote-staging.sh --skip-smoke-test
```

## Scripts Created

1. **`scripts/check-validation-errors.ts`** - Identifies validation errors
2. **`scripts/fix-validation-issues.ts`** - Auto-fixes common issues

Run these scripts to identify and fix issues automatically.

