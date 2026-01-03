# ⚠️ Validation Errors Detected

All 39 items have been approved, but **content validation is failing**. This blocks promotion.

## Issue

When content is marked as `"approved"`, the validator enforces stricter rules:
- **All prompts** in approved packs must have non-empty `gloss_en` and `intent` fields
- Quality gates are enforced more strictly

## Next Steps

### Step 1: Identify Validation Errors

```bash
cd /Users/simpumind/Desktop/Projects/getverba-content
npm run content:validate 2>&1 | tee validation-errors.log
```

This will show all validation errors. Common issues:
- Missing or empty `gloss_en` in prompts
- Missing or empty `intent` in prompts
- Quality gate violations

### Step 2: Fix Errors

See `FIX_VALIDATION_ERRORS.md` for detailed instructions on fixing common validation errors.

### Step 3: Re-validate

```bash
npm run content:validate
```

Ensure it passes with no errors.

### Step 4: Promote

Once validation passes:

```bash
./scripts/promote-staging.sh --skip-smoke-test
```

## Alternative: Temporarily Revert Approval

If there are too many errors to fix immediately, you can temporarily set items back to `"needs_review"`:

```bash
# Find all approved items
grep -r '"status": "approved"' content/v1/workspaces/de/packs/ content/v1/workspaces/de/drills/ | head -20

# Then manually change back to "needs_review" if needed
```

However, **fixing the validation errors is the recommended approach** since the content should be valid before promotion.

