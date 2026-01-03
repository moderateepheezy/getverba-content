/**
 * Translation Configuration
 * 
 * Defines target languages for i18n translation.
 * These are languages that users speak natively (not the language they're learning).
 */

export const TARGET_LOCALES = [
  'es',    // Spanish
  'fr',    // French
  'it',    // Italian
  'pt',    // Portuguese
  'ru',    // Russian
  'ja',    // Japanese
  'ko',    // Korean
  'zh-CN', // Chinese Simplified
  'zh-TW', // Chinese Traditional
  'ar',    // Arabic
  // 'hi',    // Hindi - Not supported by DeepL, will need alternative provider
  'tr',    // Turkish
  'pl',    // Polish
  'nl',    // Dutch
  'sv',    // Swedish
  'no',    // Norwegian
  'da',    // Danish
  'fi',    // Finnish
  'el',    // Greek
  'cs',    // Czech
] as const;

// Note: Hindi (hi) is not supported by DeepL. To add Hindi:
// 1. Use Google Cloud Translation API or Azure Translator
// 2. Or use LibreTranslate with API key
// 3. Or manually translate Hindi content

export type TargetLocale = typeof TARGET_LOCALES[number];

export const LOCALE_NAMES: Record<TargetLocale, string> = {
  'es': 'Spanish',
  'fr': 'French',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh-CN': 'Chinese Simplified',
  'zh-TW': 'Chinese Traditional',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'tr': 'Turkish',
  'pl': 'Polish',
  'nl': 'Dutch',
  'sv': 'Swedish',
  'no': 'Norwegian',
  'da': 'Danish',
  'fi': 'Finnish',
  'el': 'Greek',
  'cs': 'Czech',
};

/**
 * Translation phases in order
 */
export const TRANSLATION_PHASES = [
  {
    id: 'phase1',
    name: 'Phase 1: Entry Metadata',
    description: 'Translate titles, shortTitles, descriptions, subtitles for all entry documents',
    items: ['packs', 'drills', 'exams'],
  },
  {
    id: 'phase2',
    name: 'Phase 2: Doctor Scenario Packs',
    description: 'Translate gloss_en for all prompts in Doctor scenario packs (16 packs)',
    items: ['doctor'],
  },
  {
    id: 'phase3',
    name: 'Phase 3: Friends Small Talk Scenario Packs',
    description: 'Translate gloss_en for all prompts in Friends Small Talk scenario packs (24 packs)',
    items: ['friends_small_talk'],
  },
  {
    id: 'phase4',
    name: 'Phase 4: Government Office Scenario Packs',
    description: 'Translate gloss_en for all prompts in Government Office scenario packs (6 packs)',
    items: ['government_office'],
  },
  {
    id: 'phase5',
    name: 'Phase 5: Housing Scenario Packs',
    description: 'Translate gloss_en for all prompts in Housing scenario packs (20 packs)',
    items: ['housing'],
  },
  {
    id: 'phase6',
    name: 'Phase 6: Work Scenario Packs',
    description: 'Translate gloss_en for all prompts in Work scenario packs (23 packs)',
    items: ['work'],
  },
  {
    id: 'phase7',
    name: 'Phase 7: All Drills',
    description: 'Translate gloss_en for all prompts in all drills (149 drills)',
    items: ['drills'],
  },
  {
    id: 'phase8',
    name: 'Phase 8: Exam Content',
    description: 'Translate titles, descriptions, parts for all exams',
    items: ['exams'],
  },
] as const;

