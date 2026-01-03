# Translation System - Quick Start

## Overview

The translation system is ready to translate all content to 20 languages in phases. The structure is complete - you just need to connect a translation API.

## Current Status

✅ **Structure Complete**: All scripts and configuration are ready
⏳ **API Integration**: Needs translation API implementation
⏳ **Phase 1**: Ready to start (entry metadata)

## Quick Start

### 1. Choose Translation API

Recommended: **DeepL API** (best quality)

### 2. Install Dependencies (if using DeepL)

```bash
npm install deepl-node
```

### 3. Set API Key

```bash
export DEEPL_API_KEY=your-api-key-here
```

### 4. Implement Translation Function

Edit `scripts/translate-batch.ts` and replace the `translateText()` function with actual API calls. See `docs/TRANSLATION_SETUP.md` for examples.

### 5. Run Phase 1 (Dry Run)

```bash
npm run translate:phase1 -- --dry-run
```

### 6. Review & Apply

```bash
# Review output, then apply
npm run translate:phase1 -- --write
```

### 7. Verify & Move to Phase 2

Only proceed when Phase 1 is 100% complete and verified.

## Available Commands

```bash
# Find prompts with generic placeholders
npm run translate:find-generic

# Phase 1: Entry metadata (titles, descriptions)
npm run translate:phase1 -- --dry-run
npm run translate:phase1 -- --write

# Phase 2: Doctor scenario packs
npm run translate:phase2 -- --dry-run
npm run translate:phase2 -- --write

# Phase 3-8: Other phases
npm run translate:phase3 -- --write
# ... etc
```

## Translation Phases

1. **Phase 1**: Entry metadata (titles, descriptions) - All packs/drills/exams
2. **Phase 2**: Doctor scenario packs (16 packs)
3. **Phase 3**: Friends Small Talk scenario packs (24 packs)
4. **Phase 4**: Government Office scenario packs (6 packs)
5. **Phase 5**: Housing scenario packs (20 packs)
6. **Phase 6**: Work scenario packs (23 packs)
7. **Phase 7**: All drills (149 drills)
8. **Phase 8**: Exam content

## Important Notes

- ✅ **100% accuracy before moving to next phase**
- ✅ **Review samples manually** before marking complete
- ✅ **Don't skip phases** - each must be verified
- ✅ **Workspace = language being learned** (de = German)
- ✅ **Localization = language user speaks** (es, fr, it, etc.)

## Documentation

- `docs/TRANSLATION_PLAN.md` - Complete phase breakdown
- `docs/TRANSLATION_SETUP.md` - API setup and implementation guide
- `scripts/translation-config.ts` - Configuration (languages, phases)
- `scripts/translate-batch.ts` - Main translation script

## Next Steps

1. ✅ Structure is complete
2. ⏳ Implement translation API in `translateText()` function
3. ⏳ Run Phase 1 dry-run
4. ⏳ Review and apply Phase 1
5. ⏳ Verify Phase 1 is 100% complete
6. ⏳ Proceed to Phase 2

