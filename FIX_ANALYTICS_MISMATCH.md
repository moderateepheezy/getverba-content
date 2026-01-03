# Fix Analytics Mismatch

After fixing duplicate sentences in the pack files, the analytics values in the pack files need to be recomputed to match the updated prompts.

## The Problem

The validator checks that the analytics values stored in pack files match the computed values from the prompts. When we changed prompts to fix duplicates, the analytics in the pack files became outdated.

## The Solution

Run the recompute analytics script to update all pack files:

```bash
cd /Users/simpumind/Desktop/Projects/getverba-content
npm run content:recompute-analytics de
```

This will:
1. Find all pack files in the `de` workspace
2. Recompute analytics from the current prompts
3. Update the analytics fields in each pack.json file

## After Recomputing

1. **Regenerate indexes** to update index items:
   ```bash
   npm run content:generate-indexes
   ```

2. **Re-validate** to ensure everything passes:
   ```bash
   npm run content:validate
   ```

3. **Then promote**:
   ```bash
   npm run content:promote -- --skip-smoke-test
   ```

## Affected Packs

The following packs had duplicate sentences fixed and need analytics recomputation:
- `doctor_pack_4_a1` (prompt-006 changed)
- `doctor_pack_4_a2` (prompt-006 changed)
- `friends_small_talk_pack_1_a1` (prompt-008 changed)
- `friends_small_talk_pack_1_a2` (prompt-008 changed)

However, the script will recompute analytics for ALL packs to ensure consistency.

