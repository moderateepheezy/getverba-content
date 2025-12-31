# Token Mining + Scenario Dictionary Expansion

Token mining extracts high-signal tokens and phrases from PDFs to improve scenario dictionaries deterministically, without using LLMs.

## Overview

Token mining:
1. Analyzes best windows from PDF extraction
2. Scores candidate tokens/phrases using frequency, dialogue markers, concreteness
3. Produces PR-ready patch suggestions
4. Improves scenario discovery and quality gates as you ingest more PDFs

## Patch File Format

Token mining produces patch files in `reports/token-mining/<profileId>/<timestamp>/suggested-dictionary.patch.json`:

```json
{
  "workspace": "de",
  "profileId": "deutschimblick",
  "generatedAt": "2025-01-01T12:00:00Z",
  "suggestions": [
    {
      "scenario": "government_office",
      "addTokens": [
        {
          "token": "meldebescheinigung",
          "strength": "strong",
          "reason": "freq+dialogue",
          "score": 8.5,
          "frequency": 12,
          "examples": [
            "Ich brauche eine Meldebescheinigung.",
            "Kann ich eine Meldebescheinigung beantragen?"
          ]
        },
        {
          "token": "termin vereinbaren",
          "strength": "strong",
          "reason": "phrase",
          "score": 7.2,
          "frequency": 8,
          "examples": [
            "Ich möchte einen Termin vereinbaren."
          ]
        }
      ]
    }
  ]
}
```

### Patch Schema

- **`workspace`** (string, required): Workspace identifier
- **`profileId`** (string, required): PDF profile ID
- **`generatedAt`** (string, required): ISO timestamp
- **`suggestions`** (array, required): Array of scenario suggestions
  - **`scenario`** (string, required): Scenario identifier
  - **`addTokens`** (array, required): Tokens to add
    - **`token`** (string, required): Token/phrase text
    - **`strength`** ("strong" | "medium" | "weak", required): Token strength
    - **`reason`** (string, required): Why this token was suggested
    - **`score`** (number, required): Computed score
    - **`frequency`** (number, required): Occurrence count
    - **`examples`** (string[], required): Sample contexts (max 3)

### Token Strength

- **`strong`**: High frequency + dialogue markers + concreteness (score >= 7.0)
- **`medium`**: Moderate frequency or dialogue markers (score >= 4.0)
- **`weak`**: Lower frequency but still relevant (score >= 2.0)

### Reasons

- **`freq+dialogue`**: High frequency in dialogue-like text
- **`phrase`**: Multi-word phrase with high signal
- **`concreteness`**: Near concreteness markers (numbers, dates, etc.)
- **`freq`**: High frequency alone

## Using Token Mining

### Basic Usage

```bash
tsx scripts/pdf-ingestion/tokenMining.ts \
  --profile deutschimblick \
  --workspace de \
  --topN 50 \
  --minFreq 5 \
  --maxPhraseLen 3
```

### With PDF Path (no profile)

```bash
tsx scripts/pdf-ingestion/tokenMining.ts \
  --pdf ./imports/deutschimblick.pdf \
  --workspace de \
  --topN 50
```

### With Window Range

```bash
tsx scripts/pdf-ingestion/tokenMining.ts \
  --profile deutschimblick \
  --workspace de \
  --window 100-200 \
  --scenario government_office
```

### Arguments

- **`--profile <id>`**: PDF profile ID (uses cached extraction)
- **`--pdf <path>`**: PDF file path (alternative to profile)
- **`--workspace <id>`**: Workspace identifier (required)
- **`--topN <number>`**: Top N tokens to include (default: 50)
- **`--minFreq <number>`**: Minimum frequency threshold (default: 5)
- **`--maxPhraseLen <number>`**: Maximum phrase length in words (default: 3)
- **`--window <start-end>`**: Optional page range (e.g., "100-200")
- **`--scenario <id>`**: Optional scenario filter (if absent, mines for top discovered scenarios)

## Applying Patches

### Review Patch

```bash
cat reports/token-mining/deutschimblick/2025-01-01T12-00-00/suggested-dictionary.patch.json
```

### Apply Patch

```bash
tsx scripts/apply-token-patch.ts \
  --file reports/token-mining/deutschimblick/2025-01-01T12-00-00/suggested-dictionary.patch.json
```

**What it does**:
1. Loads patch file
2. Updates scenario token dictionaries in key files
3. Preserves sorting and deduplicates
4. Runs `npm run content:quality` and `npm test`
5. Exits non-zero on failure

### Patch Application is Idempotent

Applying the same patch twice produces no changes (deduplication ensures this).

## Integration with Pipeline

Token mining is automatically triggered when:
- `runProfileBatch` fails due to insufficient candidates
- `runProfileBatch` detects low scenario token hits
- `--emitTokenMining true` is set (default)

## Scoring Algorithm

Tokens are scored using:

1. **Frequency** (0-10): `log(frequency + 1) * 2`
2. **Dialogue bonus** (+2): Token appears in dialogue-like text (quotes, colons)
3. **Concreteness bonus** (+1.5): Token near concreteness markers (numbers, dates, currency)
4. **Heading penalty** (-3): Token appears in heading-like text (all caps, short lines)
5. **Phrase bonus** (+1): Multi-word phrases get bonus

**Final score** = frequency + dialogue + concreteness - heading + phrase

## Best Practices

1. **Review patches before applying**: Check examples and scores
2. **Start with strong tokens**: Apply only "strong" tokens initially
3. **Iterate**: Mine → Review → Apply → Re-run batch → Verify improvement
4. **Version control**: Commit patch files for review
5. **Test after applying**: Run quality checks and tests

## Example Workflow

```bash
# 1. Run batch generation
tsx scripts/pdf-ingestion/runProfileBatch.ts \
  --profile deutschimblick \
  --packs 10

# 2. If insufficient candidates, token mining is suggested
# 3. Run token mining
tsx scripts/pdf-ingestion/tokenMining.ts \
  --profile deutschimblick \
  --workspace de \
  --topN 50

# 4. Review patch
cat reports/token-mining/deutschimblick/*/suggested-dictionary.patch.json

# 5. Apply patch
tsx scripts/apply-token-patch.ts \
  --file reports/token-mining/deutschimblick/*/suggested-dictionary.patch.json

# 6. Re-run batch (should have more qualified candidates)
tsx scripts/pdf-ingestion/runProfileBatch.ts \
  --profile deutschimblick \
  --packs 10
```

