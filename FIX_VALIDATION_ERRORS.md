# Fix Validation Errors

The promotion failed because content validation detected errors. Here's how to identify and fix them:

## Step 1: Run Validation to See Errors

```bash
cd /Users/simpumind/Desktop/Projects/getverba-content
npm run content:validate 2>&1 | tee validation-errors.log
```

This will show all validation errors. Common issues:

## Common Validation Errors

### 1. Missing `gloss_en` or `intent` in Prompts

**Error:** `Item X pack entry prompt Y missing or invalid field: gloss_en (required, 6-180 chars)`

**Fix:** For approved generated content, every prompt must have:
- `gloss_en`: Non-empty string (6-180 chars)
- `intent`: One of: `greet`, `request`, `apologize`, `inform`, `ask`, `confirm`, `schedule`, `order`, `ask_price`, `thank`, `goodbye`

### 2. Empty `gloss_en` or `intent` for Approved Content

**Error:** `Item X pack entry prompt Y gloss_en is empty (required for approved generated content)`

**Fix:** Since we just approved all items, all prompts in approved packs must have non-empty `gloss_en` and `intent` fields.

### 3. Quality Gate Violations

**Error:** `Quality Gate violation: ...`

**Common issues:**
- Missing scenario tokens
- Insufficient multi-slot variation
- Contains denylisted phrases
- Missing concreteness markers

### 4. Schema Violations

**Error:** `missing or invalid field: ...`

**Fix:** Check that all required fields are present and valid.

## Quick Fix Script

If you want to see the specific errors, run:

```bash
npm run content:validate 2>&1 | grep -E "error|Error|missing|invalid" | head -50
```

## After Fixing Errors

1. Re-run validation: `npm run content:validate`
2. Ensure it passes (no errors)
3. Run promotion: `./scripts/promote-staging.sh --skip-smoke-test`

## Note

Since we just approved all items, the validator is now enforcing stricter rules:
- All prompts in approved packs must have complete `gloss_en` and `intent` fields
- Quality gates are enforced more strictly

If you see many errors, you may need to:
1. Either fix all the errors
2. Or temporarily set items back to `"needs_review"` status until errors are fixed

