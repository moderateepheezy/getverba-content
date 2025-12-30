# Content Expansion Sprint Report

**Generated:** 2025-12-30 19:18:42 UTC  
**Workspace:** de

---

## Summary

- **Total Packs:** 4
- **Total Drills:** 0
- **Total Items:** 4

---

## Distribution by Scenario

- **work:** 1 pack(s)
- **shopping:** 1 pack(s)
- **restaurant:** 1 pack(s)
- **casual_greeting:** 1 pack(s)

---

## Distribution by Level

- **A1:** 2 pack(s)
- **A2:** 2 pack(s)

---

## Distribution by Register

- **formal:** 3 pack(s)
- **neutral:** 1 pack(s)

---

## Top Primary Structures

- **verb_position:** 2 pack(s)
- **modal_verbs_requests:** 1 pack(s)
- **formal_pronouns:** 1 pack(s)

---

## Validation Results

❌ **Validation Errors:** 3

### Error Summary

```
❌ Fail: Pack "shopping_payment_options" has average 1.33 context tokens per prompt (minimum: 2.0)
❌ Fail: Primary structure "verb_position" is 50.0% of packs (max: 35%)
❌ Quality regression detected. Build should fail.
```

⚠️  **Validation Warnings:** 27

### Warning Summary

```
⚠️  Item 0 pack entry prompt 0 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 0 pack entry prompt 1 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 0 pack entry prompt 2 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 0 pack entry prompt 3 text may not contain a verb-like token: "Auf Wiedersehen, bis zum nächsten Mal! Schönen Tag..."
⚠️  Item 0 pack entry prompt 3 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 0 pack entry prompt 4 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 0 text may not contain a verb-like token: "Ich zahle 50€ an der Kasse...."
⚠️  Item 1 pack entry prompt 0 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 1 text may not contain a verb-like token: "Die Zahlung kostet 35€ im Laden...."
⚠️  Item 1 pack entry prompt 1 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 2 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 3 text may not contain a verb-like token: "Ich kaufe das für 40€ mit Karte...."
⚠️  Item 1 pack entry prompt 3 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 4 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 5 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 6 text may not contain a verb-like token: "Wir zahlen 60€ an der Kasse am Montag...."
⚠️  Item 1 pack entry prompt 6 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 7 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
⚠️  Item 1 pack entry prompt 8 text may not contain a verb-like token: "Ich hole die Zahlung für 45€ am Dienstag um 9 Uhr...."
⚠️  Item 1 pack entry prompt 8 missing natural_en (recommended for all prompts, optional for A1 non-government scenarios)
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

