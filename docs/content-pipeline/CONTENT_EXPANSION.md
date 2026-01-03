# Content Expansion Sprint Harness

This document explains the Content Expansion Sprint Harness, a deterministic quality control system that proves content can scale without becoming generic.

## Purpose

The Content Expansion Sprint Harness exists to:

- **Prove scalability**: Demonstrate that content can expand (10, 20, 50+ packs) without quality drift
- **Enforce hard constraints**: Block expansion if quality metrics degrade
- **Provide metrics**: Generate numerical evidence of content quality, not subjective judgment

This is **not** a runtime AI system. It's a build-time validator that enforces deterministic constraints.

## How It Works

The harness (`scripts/content-expansion-report.ts`) analyzes all `pack.json` files under `content/v1/**` and generates a report with per-pack metrics.

### Per-Pack Metrics

Each pack is analyzed for:

1. **packId**: Pack identifier
2. **scenario**: Content scenario (e.g., `work`, `restaurant`, `government_office`)
3. **register**: Formality level (`formal`, `neutral`, `casual`)
4. **primaryStructure**: Primary grammatical structure identifier
5. **promptCount**: Total number of prompts in the pack
6. **variationSlots**: Array of slot types declared for variation
7. **percentMultiSlotVariation**: Percentage of prompts that change 2+ slots (must be ≥30%)
8. **averageScenarioTokenDensity**: Average number of scenario-specific tokens per prompt
9. **bannedPhraseHits**: Count of prompts containing denylisted phrases (must be 0)
10. **duplicateSentenceCount**: Count of duplicate sentences within the pack (must be 0)

### Hard Fail Conditions

The harness **hard fails** (exits with code 1) if any pack violates:

1. **bannedPhraseHits > 0**: Any prompt contains a denylisted phrase
2. **percentMultiSlotVariation < 30%**: Less than 30% of prompts change 2+ slots
3. **duplicateSentenceCount > 0**: Any duplicate sentences within the pack

These are **non-negotiable**. Packs that fail cannot proceed to expansion.

## Usage

### Run Manually

```bash
tsx scripts/content-expansion-report.ts
```

### Run as Part of Validation

The harness is automatically run as part of `npm run content:validate`:

```bash
npm run content:validate
```

This runs:
1. `validate-content.ts` (schema validation)
2. `content-quality-report.ts` (workspace-level quality metrics)
3. `content-expansion-report.ts` (expansion harness) ← **NEW**

### CI Integration

The harness should be integrated into your CI workflow. If the report fails, the PR should be blocked.

Example GitHub Actions:

```yaml
- name: Validate Content
  run: npm run content:validate
```

## Report Output

The harness generates `content-expansion-report.json` at the repository root.

### Report Structure

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "totalPacks": 25,
  "packs": [
    {
      "packId": "shopping_payment_options",
      "scenario": "shopping",
      "register": "neutral",
      "primaryStructure": "verb_position",
      "promptCount": 9,
      "variationSlots": ["subject", "verb", "object", "modifier"],
      "percentMultiSlotVariation": 55.6,
      "averageScenarioTokenDensity": 2.3,
      "bannedPhraseHits": 0,
      "duplicateSentenceCount": 0
    }
  ],
  "summary": {
    "totalBannedPhraseHits": 0,
    "packsWithBannedPhrases": 0,
    "packsBelowMultiSlotThreshold": 0,
    "packsWithDuplicates": 0,
    "averageMultiSlotPercentage": 45.2,
    "averageScenarioTokenDensity": 2.1
  },
  "failures": [],
  "passed": true
}
```

## Green Thresholds

A pack passes ("green") if:

- ✅ `bannedPhraseHits === 0`
- ✅ `percentMultiSlotVariation >= 30%`
- ✅ `duplicateSentenceCount === 0`

A workspace passes if **all packs** pass.

## Reading the Report

### Summary Metrics

- **totalBannedPhraseHits**: Should be 0. Any non-zero value is a hard fail.
- **packsWithBannedPhrases**: Number of packs containing banned phrases. Should be 0.
- **packsBelowMultiSlotThreshold**: Number of packs with <30% multi-slot variation. Should be 0.
- **packsWithDuplicates**: Number of packs with duplicate sentences. Should be 0.
- **averageMultiSlotPercentage**: Workspace average. Should be ≥30% (ideally ≥40%).
- **averageScenarioTokenDensity**: Workspace average. Should be ≥2.0 (ideally ≥2.3).

### Per-Pack Analysis

For each pack, check:

1. **percentMultiSlotVariation**: If <30%, add more prompts that change 2+ slots simultaneously.
2. **averageScenarioTokenDensity**: If <2.0, add more scenario-specific vocabulary.
3. **bannedPhraseHits**: If >0, remove denylisted phrases (see [QUALITY_GATES.md](./QUALITY_GATES.md)).
4. **duplicateSentenceCount**: If >0, remove duplicate sentences or make them distinct.

## Banned Phrases

The harness checks for these denylisted phrases (case-insensitive):

- "in today's lesson"
- "let's practice"
- "this sentence"
- "i like to"
- "the quick brown fox"
- "lorem ipsum"

These phrases indicate generic/template content that doesn't provide real learning value.

See [QUALITY_GATES.md](./QUALITY_GATES.md) for the complete denylist and rationale.

## Scenario Token Dictionaries

The harness uses scenario-specific token dictionaries to compute `averageScenarioTokenDensity`:

- **work**: meeting, shift, manager, schedule, invoice, deadline, office, colleague, project, task, besprechung, termin, büro, kollege, projekt, aufgabe, arbeit
- **restaurant**: menu, order, bill, reservation, waiter, table, food, drink, kitchen, service, speisekarte, bestellen, kellner, tisch, essen, trinken
- **shopping**: price, buy, cost, store, cashier, payment, discount, receipt, cart, checkout, kaufen, laden, kasse, zahlung, rabatt, quittung
- **doctor**: appointment, symptom, prescription, medicine, treatment, diagnosis, health, patient, clinic, examination
- **housing**: apartment, rent, lease, landlord, tenant, deposit, utilities, furniture, neighborhood, address
- **government_office**: appointment, form, document, application, permit, registration, passport, visa, residence, office, termin, formular, dokument, antrag, genehmigung, anmeldung, pass, visum, aufenthalt, amt

Tokens are matched case-insensitively as substrings in prompt text.

## Expansion Workflow

### Before Expansion

1. Run `npm run content:validate`
2. Verify all packs pass the harness
3. Review `content-expansion-report.json` for baseline metrics

### During Expansion

1. Generate new packs (manually or via templates)
2. Run `npm run content:validate` after each batch
3. Check that new packs pass the harness
4. Verify workspace averages don't degrade

### After Expansion

1. Review `content-expansion-report.json` summary
2. Ensure all metrics are "green"
3. If any pack fails, fix it before proceeding
4. Document expansion batch in commit message

## Example: Fixing a Failing Pack

If a pack fails with:

```json
{
  "packId": "work_meeting_schedule",
  "percentMultiSlotVariation": 20.0,
  "bannedPhraseHits": 0,
  "duplicateSentenceCount": 0
}
```

**Problem**: Only 20% of prompts change 2+ slots (below 30% threshold).

**Solution**: Add more prompts that vary multiple slots simultaneously. For example:

```json
{
  "id": "prompt-010",
  "text": "Wir besprechen das Projekt am Montag um 14:00.",
  "slotsChanged": ["subject", "verb", "object", "modifier"]
}
```

This prompt changes 4 slots (subject, verb, object, modifier), which counts toward the multi-slot threshold.

## Integration with Quality Gates

The expansion harness complements the existing quality gates in `validate-content.ts`:

- **Quality Gates**: Enforce structural constraints (schema, required fields, etc.)
- **Expansion Harness**: Enforce scalability constraints (variation, uniqueness, etc.)

Both must pass for content to be considered valid.

## Related Documentation

- [QUALITY_GATES.md](./QUALITY_GATES.md) - Quality gate rules and rationale
- [PACK_SCHEMA.md](./PACK_SCHEMA.md) - Pack entry schema
- [ROLLOUT.md](./ROLLOUT.md) - Deployment workflow

## Philosophy

> "We are not building random AI lessons. We are building a controlled language production system."

The expansion harness proves that:

1. **Content is deterministic**: Quality is enforced by constraints, not model creativity
2. **Content scales**: We can generate 10, 20, 50+ packs without becoming generic
3. **Content is auditable**: Every pack has numerical metrics, not subjective judgment

This is exactly what investors mean by: **"Utility over edutainment."**


