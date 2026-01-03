# Translation Setup Guide

This guide explains how to set up and use the batch translation system.

## Overview

The translation system translates all user-facing content to 20 target languages in phases, ensuring 100% accuracy before moving to the next phase.

## Prerequisites

1. **Translation API Account**: Choose one:
   - **DeepL API** (recommended - best quality)
   - **Google Cloud Translation API**
   - **Azure Translator**

2. **API Key**: Get your API key from your chosen provider

## Setup

### Option 1: DeepL API (Recommended)

1. Sign up at https://www.deepl.com/pro-api
2. Get your API key
3. Set environment variable:
   ```bash
   export DEEPL_API_KEY=your-api-key-here
   ```

### Option 2: Google Cloud Translation API

1. Set up Google Cloud project
2. Enable Translation API
3. Create service account and download credentials
4. Set environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
   ```

### Option 3: Azure Translator

1. Create Azure Translator resource
2. Get API key and endpoint
3. Set environment variables:
   ```bash
   export AZURE_TRANSLATOR_KEY=your-key
   export AZURE_TRANSLATOR_ENDPOINT=https://your-endpoint.cognitiveservices.azure.com
   ```

## Implementation

The `translateText()` function in `scripts/translate-batch.ts` needs to be implemented with your chosen API.

### Example: DeepL API Implementation

```typescript
import * as deepl from 'deepl-node';

const translator = new deepl.Translator(process.env.DEEPL_API_KEY || '');

async function translateText(
  text: string,
  sourceLocale: string,
  targetLocale: string
): Promise<TranslationResult> {
  try {
    // Map our locale codes to DeepL language codes
    const deeplTargetLang = mapLocaleToDeepL(targetLocale);
    const deeplSourceLang = mapLocaleToDeepL(sourceLocale) || 'EN';
    
    const result = await translator.translateText(
      text,
      deeplSourceLang,
      deeplTargetLang
    );
    
    return {
      text: result.text,
      locale: targetLocale,
      success: true,
    };
  } catch (error: any) {
    return {
      text: '',
      locale: targetLocale,
      success: false,
      error: error.message,
    };
  }
}

function mapLocaleToDeepL(locale: string): string {
  const mapping: Record<string, string> = {
    'es': 'ES',
    'fr': 'FR',
    'it': 'IT',
    'pt': 'PT',
    'ru': 'RU',
    'ja': 'JA',
    'ko': 'KO',
    'zh-CN': 'ZH',
    'zh-TW': 'ZH',
    'ar': 'AR',
    'hi': 'HI',
    'tr': 'TR',
    'pl': 'PL',
    'nl': 'NL',
    'sv': 'SV',
    'no': 'NB', // Norwegian Bokmål
    'da': 'DA',
    'fi': 'FI',
    'el': 'EL',
    'cs': 'CS',
  };
  return mapping[locale] || locale.toUpperCase();
}
```

### Example: Google Cloud Translation API Implementation

```typescript
import { Translate } from '@google-cloud/translate/build/src/v2';

const translate = new Translate({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

async function translateText(
  text: string,
  sourceLocale: string,
  targetLocale: string
): Promise<TranslationResult> {
  try {
    const [translation] = await translate.translate(text, targetLocale);
    return {
      text: translation as string,
      locale: targetLocale,
      success: true,
    };
  } catch (error: any) {
    return {
      text: '',
      locale: targetLocale,
      success: false,
      error: error.message,
    };
  }
}
```

## Usage

### 1. Dry Run (Preview Changes)

```bash
# Phase 1: Entry metadata
npm run translate:phase1 -- --dry-run

# Phase 2: Doctor scenario packs
npm run translate:phase2 -- --dry-run
```

### 2. Apply Translations

```bash
# Phase 1: Entry metadata
npm run translate:phase1 -- --write

# Phase 2: Doctor scenario packs
npm run translate:phase2 -- --write
```

### 3. Verify Accuracy

After each phase:
1. Review sample translations manually
2. Check for obvious errors
3. Verify all fields are translated
4. Only proceed to next phase when 100% confident

## Translation Phases

See [TRANSLATION_PLAN.md](./TRANSLATION_PLAN.md) for complete phase breakdown.

## Troubleshooting

### API Rate Limits

If you hit rate limits:
- Add delays between requests
- Process in smaller batches
- Use API tier with higher limits

### Translation Quality

If translations seem off:
- Review source English text (should be natural, not generic)
- Check locale mapping (some APIs use different codes)
- Consider manual review for critical content

### Missing Translations

If some translations are missing:
- Check API response for errors
- Verify locale codes are supported by your API
- Review error logs in script output

## Cost Estimation

Translation costs vary by provider:
- **DeepL**: ~$25 per 1M characters
- **Google Cloud**: ~$20 per 1M characters
- **Azure**: ~$10 per 1M characters

Estimated content size: ~500K characters per phase
Estimated total cost: $50-200 depending on provider

## Next Steps

1. Choose translation API provider
2. Implement `translateText()` function
3. Run Phase 1 dry-run
4. Review sample translations
5. Apply Phase 1 translations
6. Verify accuracy
7. Proceed to Phase 2

