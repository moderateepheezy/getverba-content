# Translation Plan

This document outlines the plan for translating all content to 20 target languages.

## Overview

**Goal**: Translate all user-facing content to 20 common languages to support international users learning German.

**Key Principle**: **100% accuracy before moving to next phase**. Each phase must be verified complete and correct before proceeding.

## Target Languages

We're translating to 20 languages (locales) that users speak natively:

1. `es` - Spanish
2. `fr` - French
3. `it` - Italian
4. `pt` - Portuguese
5. `ru` - Russian
6. `ja` - Japanese
7. `ko` - Korean
8. `zh-CN` - Chinese Simplified
9. `zh-TW` - Chinese Traditional
10. `ar` - Arabic
11. `hi` - Hindi
12. `tr` - Turkish
13. `pl` - Polish
14. `nl` - Dutch
15. `sv` - Swedish
16. `no` - Norwegian
17. `da` - Danish
18. `fi` - Finnish
19. `el` - Greek
20. `cs` - Czech

**Note**: Workspace (`de`) is the language being learned. Localization is the language users already speak.

## Translation Phases

### Phase 1: Entry Metadata ✅ (First Priority)

**Scope**: Translate titles, shortTitles, descriptions, subtitles for all entry documents.

**Content**:
- All pack titles, descriptions, shortTitles
- All drill titles, subtitles, descriptions
- All exam titles, descriptions
- Session plan step titles

**Files**: All `pack.json`, `drill.json`, `exam.json` files

**Status**: ⏳ Pending

**Verification**: 
- [ ] All packs have `title_i18n` with all 20 locales
- [ ] All packs have `description_i18n` with all 20 locales
- [ ] All drills have `title_i18n` with all 20 locales
- [ ] All exams have `title_i18n` with all 20 locales
- [ ] Manual review of sample translations

---

### Phase 2: Doctor Scenario Packs

**Scope**: Translate `gloss_en_i18n` for all prompts in Doctor scenario packs.

**Content**: 16 packs in `doctor` scenario

**Status**: ⏳ Pending (blocked on Phase 1)

**Verification**:
- [ ] All prompts in Doctor packs have `gloss_en_i18n` with all 20 locales
- [ ] Translations are accurate (not generic placeholders)
- [ ] Manual review of sample translations

---

### Phase 3: Friends Small Talk Scenario Packs

**Scope**: Translate `gloss_en_i18n` for all prompts in Friends Small Talk scenario packs.

**Content**: 24 packs in `friends_small_talk` scenario

**Status**: ⏳ Pending (blocked on Phase 2)

---

### Phase 4: Government Office Scenario Packs

**Scope**: Translate `gloss_en_i18n` for all prompts in Government Office scenario packs.

**Content**: 6 packs in `government_office` scenario

**Status**: ⏳ Pending (blocked on Phase 3)

---

### Phase 5: Housing Scenario Packs

**Scope**: Translate `gloss_en_i18n` for all prompts in Housing scenario packs.

**Content**: 20 packs in `housing` scenario

**Status**: ⏳ Pending (blocked on Phase 4)

---

### Phase 6: Work Scenario Packs

**Scope**: Translate `gloss_en_i18n` for all prompts in Work scenario packs.

**Content**: 23 packs in `work` scenario

**Status**: ⏳ Pending (blocked on Phase 5)

---

### Phase 7: All Drills

**Scope**: Translate `gloss_en_i18n` for all prompts in all drills.

**Content**: 149 drills

**Status**: ⏳ Pending (blocked on Phase 6)

---

### Phase 8: Exam Content

**Scope**: Translate titles, descriptions, parts for all exams.

**Content**: All exam entry documents

**Status**: ⏳ Pending (blocked on Phase 7)

---

## Translation Workflow

### 1. Setup Translation Service

Choose and configure translation API:
- **DeepL API** (recommended for quality)
- **Google Translate API** (alternative)
- **Azure Translator** (alternative)

### 2. Run Translation Script

```bash
# Dry run (preview changes)
npx tsx scripts/translate-batch.ts --phase=phase1 --dry-run

# Apply changes
npx tsx scripts/translate-batch.ts --phase=phase1 --write
```

### 3. Verify Accuracy

For each phase:
1. **Automated checks**: Verify all fields have translations
2. **Sample review**: Manually review 5-10 random translations per language
3. **Quality check**: Ensure translations are natural, not literal word-for-word
4. **Context check**: Verify translations match the scenario/context

### 4. Mark Phase Complete

Only mark a phase complete when:
- ✅ All translations are present
- ✅ Sample review passes
- ✅ No obvious errors detected
- ✅ Ready for production

## Current Status

| Phase | Status | Progress | Blocked By |
|-------|--------|----------|------------|
| Phase 1 | ⏳ Pending | 0% | - |
| Phase 2 | ⏳ Pending | 0% | Phase 1 |
| Phase 3 | ⏳ Pending | 0% | Phase 2 |
| Phase 4 | ⏳ Pending | 0% | Phase 3 |
| Phase 5 | ⏳ Pending | 0% | Phase 4 |
| Phase 6 | ⏳ Pending | 0% | Phase 5 |
| Phase 7 | ⏳ Pending | 0% | Phase 6 |
| Phase 8 | ⏳ Pending | 0% | Phase 7 |

## Notes

- **Don't skip phases**: Each phase must be 100% complete before moving to next
- **Quality over speed**: Better to have accurate translations than fast but incorrect ones
- **Review samples**: Always manually review sample translations before marking complete
- **Update scripts**: Translation scripts may need updates as we learn what works best

## Related Files

- `scripts/translation-config.ts` - Configuration for target languages and phases
- `scripts/translate-batch.ts` - Main translation script
- `scripts/find-generic-gloss-en.ts` - Find prompts with generic placeholders

