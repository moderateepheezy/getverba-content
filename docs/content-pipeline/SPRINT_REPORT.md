# Content Expansion Sprint Report

**Generated:** 2025-12-31 07:37:22 UTC  
**Workspace:** de

---

## Summary

- **Total Packs:** 42
- **Total Drills:** 3
- **Total Items:** 45

---

## Distribution by Scenario

- **housing:** 20 pack(s)
- **doctor:** 16 pack(s)
- **government_office:** 6 pack(s)

---

## Distribution by Level

- **A1:** 21 pack(s)
- **A2:** 21 pack(s)

---

## Distribution by Register

- **formal:** 6 pack(s)
- **neutral:** 36 pack(s)

---

## Top Primary Structures

- **modal_verbs_requests:** 22 pack(s)
- **dative_case:** 20 pack(s)

---

## Validation Results

❌ **Validation Errors:** 2

### Error Summary

```
❌ Validation errors:
❌ Validation failed with 160 error(s)
```

⚠️  **Validation Warnings:** 110

### Warning Summary

```
⚠️  Item 0 pack entry prompt 1 text may not contain a verb-like token: "Sie möchte die Behandlung morgen um 18:00..."
⚠️  Item 0 pack entry prompt 2 text may not contain a verb-like token: "Der Arzt fühlt die Untersuchung..."
⚠️  Item 0 pack entry prompt 3 text may not contain a verb-like token: "Der Arzt braucht die Untersuchung..."
⚠️  Item 0 pack entry prompt 4 text may not contain a verb-like token: "Ich brauche die Untersuchung..."
⚠️  Item 0 pack entry prompt 5 text may not contain a verb-like token: "Ich vereinbare die Diagnose..."
⚠️  Item 0 pack entry prompt 6 text may not contain a verb-like token: "Der Arzt braucht einen Termin..."
⚠️  Item 1 pack entry prompt 0 text may not contain a verb-like token: "Die Ärztin möchte die Medikamente am Montag..."
⚠️  Item 1 pack entry prompt 3 text may not contain a verb-like token: "Ich vereinbare die Symptome..."
⚠️  Item 1 pack entry prompt 4 text may not contain a verb-like token: "Die Ärztin braucht die Diagnose..."
⚠️  Item 1 pack entry prompt 5 text may not contain a verb-like token: "Der Arzt fühlt einen Termin..."
⚠️  Item 2 pack entry prompt 1 text may not contain a verb-like token: "Sie vereinbaren die Untersuchung um 10 Uhr..."
⚠️  Item 2 pack entry prompt 2 text may not contain a verb-like token: "Der Arzt nehmt die Medikamente..."
⚠️  Item 2 pack entry prompt 4 text may not contain a verb-like token: "Sie fühlen die Medikamente..."
⚠️  Item 2 pack entry prompt 5 text may not contain a verb-like token: "Die Ärztin möchte die Diagnose..."
⚠️  Item 3 pack entry prompt 0 text may not contain a verb-like token: "Sie möchte die Medikamente um 10 Uhr..."
⚠️  Item 3 pack entry prompt 1 text may not contain a verb-like token: "Ich nehme einen Termin nächste Woche um 18:00..."
⚠️  Item 3 pack entry prompt 6 text may not contain a verb-like token: "Sie vereinbaren die Untersuchung..."
⚠️  Item 4 pack entry prompt 1 text may not contain a verb-like token: "Ich nehme die Diagnose am Montag..."
⚠️  Item 4 pack entry prompt 2 text may not contain a verb-like token: "Sie brauchen die Diagnose..."
⚠️  Item 4 pack entry prompt 4 text may not contain a verb-like token: "Der Arzt möchte die Symptome..."
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

## Analytics Summary

- Run `npm run content:export-analytics -- --workspace de` to generate analytics summary

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

