# Content Expansion Sprint Report

**Generated:** 2025-12-30 18:35:25 UTC  
**Workspace:** de

---

## Summary

- **Total Packs:** 1
- **Total Drills:** 0
- **Total Items:** 1

---

## Distribution by Scenario

- **government_office:** 1 pack(s)

---

## Distribution by Level

- **A1:** 1 pack(s)

---

## Distribution by Register

- **formal:** 1 pack(s)

---

## Top Primary Structures

- **modal_verbs_requests:** 1 pack(s)

---

## Validation Results

❌ **Validation Errors:** 2

### Error Summary

```
❌ Validation errors:
❌ Validation failed with 4 error(s)
```

⚠️  **Validation Warnings:** 4

### Warning Summary

```
⚠️  Item 0 pack entry prompt 0 text may not contain a verb-like token: "I welcome you to our English learning course start..."
⚠️  Item 0 pack entry prompt 0 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 0 pack entry prompt 1 text may not contain a verb-like token: "We offer language courses starting at 10:00 for $5..."
⚠️  Item 0 pack entry prompt 1 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
```

---

## Review Queue Status

- Run `npm run content:dedupe` to check duplicate status

---

## Natural EN Coverage

- Run enhanced metrics to see natural_en coverage

---

## Scenario Token Pass Rate

- Run enhanced metrics to see scenario token pass rate

---

## Multi-Slot Variation Stats

- Run enhanced metrics to see multi-slot variation stats

---

## Top Repeated Intents

- Run enhanced metrics to see top intents

---

## Pack Metadata Completeness

- Run enhanced metrics to see metadata completeness

---

## Duplicate Checks

Run duplicate detection:
```bash
npm run content:dedupe -- --workspace de
```

Check for:
- Duplicate prompt texts across packs
- Near-duplicate sentences (similarity > 0.85)
- Exact duplicate normalized text (hard fail)

---

## Ready to Promote? Checklist

- [ ] All packs pass validation (`npm run content:validate`)
- [ ] Quality gates pass (`npm run content:quality`)
- [ ] No duplicate prompts detected
- [ ] All section indexes regenerated (`npm run content:generate-indexes`)
- [ ] Smoke test passes (`./scripts/smoke-test-content.sh`)
- [ ] Content published to staging (`./scripts/publish-content.sh`)
- [ ] Staging content verified manually
- [ ] Ready to promote (`./scripts/promote-staging.sh`)

---

## Next Steps

1. **Review generated content:**
   ```bash
   # Review packs
   ls -la content/v1/workspaces/de/packs/
   
   # Review drills
   ls -la content/v1/workspaces/de/drills/
   ```

2. **Validate content:**
   ```bash
   npm run content:validate
   npm run content:quality
   ```

3. **Regenerate indexes (if needed):**
   ```bash
   npm run content:generate-indexes -- --workspace de
   ```

4. **Publish to staging:**
   ```bash
   ./scripts/publish-content.sh
   ```

5. **Promote to production:**
   ```bash
   ./scripts/promote-staging.sh
   ```

---

## Notes

- This report is generated automatically and may need manual review.
- Check validation output above for specific issues.
- Government office packs should be prioritized for review.
- Ensure all prompts have proper `intent` and `gloss_en` fields.

