/**
 * Translation API Implementation
 * 
 * Supports multiple translation providers:
 * - DeepL API (recommended) - uses official deepl-node library
 * - Google Cloud Translation API
 * - Azure Translator
 * - LibreTranslate (free, open-source) - disabled to avoid rate limits
 */

import * as deepl from 'deepl-node';

interface TranslationResult {
  text: string;
  locale: string;
  success: boolean;
  error?: string;
}

/**
 * Map our locale codes to provider-specific codes
 */
// DeepL supported languages (as of 2024)
const DEEPL_SUPPORTED = new Set(['es', 'fr', 'it', 'pt', 'ru', 'ja', 'ko', 'zh-CN', 'zh-TW', 'ar', 'tr', 'pl', 'nl', 'sv', 'no', 'da', 'fi', 'el', 'cs', 'bg', 'et', 'lv', 'lt', 'ro', 'sk', 'sl', 'uk']);

function mapLocaleToProvider(locale: string, provider: 'deepl' | 'google' | 'azure' | 'libre'): string {
  const mappings: Record<string, Record<string, string>> = {
    deepl: {
      'es': 'ES',
      'fr': 'FR',
      'it': 'IT',
      'pt': 'PT-PT',
      'ru': 'RU',
      'ja': 'JA',
      'ko': 'KO',
      'zh-CN': 'ZH',
      'zh-TW': 'ZH',
      'ar': 'AR',
      'tr': 'TR',
      'pl': 'PL',
      'nl': 'NL',
      'sv': 'SV',
      'no': 'NB',
      'da': 'DA',
      'fi': 'FI',
      'el': 'EL',
      'cs': 'CS',
    },
    google: {
      'es': 'es',
      'fr': 'fr',
      'it': 'it',
      'pt': 'pt',
      'ru': 'ru',
      'ja': 'ja',
      'ko': 'ko',
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'ar': 'ar',
      'hi': 'hi',
      'tr': 'tr',
      'pl': 'pl',
      'nl': 'nl',
      'sv': 'sv',
      'no': 'no',
      'da': 'da',
      'fi': 'fi',
      'el': 'el',
      'cs': 'cs',
    },
    azure: {
      'es': 'es',
      'fr': 'fr',
      'it': 'it',
      'pt': 'pt',
      'ru': 'ru',
      'ja': 'ja',
      'ko': 'ko',
      'zh-CN': 'zh-Hans',
      'zh-TW': 'zh-Hant',
      'ar': 'ar',
      'hi': 'hi',
      'tr': 'tr',
      'pl': 'pl',
      'nl': 'nl',
      'sv': 'sv',
      'no': 'nb',
      'da': 'da',
      'fi': 'fi',
      'el': 'el',
      'cs': 'cs',
    },
    libre: {
      'es': 'es',
      'fr': 'fr',
      'it': 'it',
      'pt': 'pt',
      'ru': 'ru',
      'ja': 'ja',
      'ko': 'ko',
      'zh-CN': 'zh',
      'zh-TW': 'zh',
      'ar': 'ar',
      'hi': 'hi',
      'tr': 'tr',
      'pl': 'pl',
      'nl': 'nl',
      'sv': 'sv',
      'no': 'no',
      'da': 'da',
      'fi': 'fi',
      'el': 'el',
      'cs': 'cs',
    },
  };
  
  return mappings[provider]?.[locale] || locale;
}

// Initialize DeepL translator (singleton)
let deeplTranslator: deepl.Translator | null = null;

function getDeepLTranslator(useFreeEndpoint: boolean = false): deepl.Translator {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPL_API_KEY not set');
  }
  
  // For unlimited/paid accounts, use serverUrl: 'https://api.deepl.com'
  // For free tier, use serverUrl: 'https://api-free.deepl.com'
  const serverUrl = useFreeEndpoint 
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';
  
  return new deepl.Translator(apiKey, { serverUrl });
}

/**
 * Translate using DeepL API (official library)
 */
async function translateWithDeepL(
  text: string,
  sourceLocale: string,
  targetLocale: string
): Promise<TranslationResult> {
  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) {
    return {
      text: '',
      locale: targetLocale,
      success: false,
      error: 'DEEPL_API_KEY not set',
    };
  }
  
  // DeepL doesn't support Hindi - skip it
  if (targetLocale === 'hi') {
    return {
      text: '',
      locale: targetLocale,
      success: false,
      error: 'Hindi not supported by DeepL API',
    };
  }
  
  try {
    // Try paid endpoint first (for unlimited subscription)
    let translator = getDeepLTranslator(false);
    const sourceLang = mapLocaleToProvider(sourceLocale, 'deepl') as deepl.SourceLanguageCode | null;
    const targetLang = mapLocaleToProvider(targetLocale, 'deepl') as deepl.TargetLanguageCode;
    
    if (!targetLang) {
      return {
        text: '',
        locale: targetLocale,
        success: false,
        error: `Locale ${targetLocale} not supported by DeepL`,
      };
    }
    
    // Try free endpoint first (many keys work with free endpoint)
    // If that fails, try paid endpoint
    let lastError: any = null;
    
    for (const useFree of [true, false]) {
      try {
        translator = getDeepLTranslator(useFree);
        const result = await translator.translateText(
          text,
          sourceLang || null,
          targetLang
        );
        
        return {
          text: result.text,
          locale: targetLocale,
          success: true,
        };
      } catch (error: any) {
        lastError = error;
        // Continue to next endpoint
        continue;
      }
    }
    
    // Both endpoints failed
    throw lastError || new Error('Translation failed on both endpoints');
  } catch (error: any) {
    return {
      text: '',
      locale: targetLocale,
      success: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Translate using LibreTranslate (free, open-source)
 * Public instance: https://libretranslate.com
 * NOTE: Public instance has rate limits. For production, use DeepL API.
 */
async function translateWithLibre(
  text: string,
  sourceLocale: string,
  targetLocale: string,
  retries: number = 3
): Promise<TranslationResult> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const sourceLang = mapLocaleToProvider(sourceLocale, 'libre') || 'en';
      const targetLang = mapLocaleToProvider(targetLocale, 'libre');
      
      // Add delay to avoid rate limits (exponential backoff)
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
      
      // Using public LibreTranslate instance
      const response = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: sourceLang,
          target: targetLang,
          format: 'text',
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        if (attempt < retries - 1 && response.status === 429) {
          // Rate limited, retry
          continue;
        }
        return {
          text: '',
          locale: targetLocale,
          success: false,
          error: `LibreTranslate API error: ${error}`,
        };
      }
      
      const data = await response.json();
      return {
        text: data.translatedText,
        locale: targetLocale,
        success: true,
      };
    } catch (error: any) {
      if (attempt === retries - 1) {
        return {
          text: '',
          locale: targetLocale,
          success: false,
          error: error.message,
        };
      }
      // Retry on error
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return {
    text: '',
    locale: targetLocale,
    success: false,
    error: 'Max retries exceeded',
  };
}

/**
 * Main translation function
 * Uses DeepL API exclusively when API key is set (unlimited subscription)
 * Only falls back to LibreTranslate for languages DeepL doesn't support (like Hindi)
 */
export async function translateText(
  text: string,
  sourceLocale: string,
  targetLocale: string
): Promise<TranslationResult> {
  const apiKey = process.env.DEEPL_API_KEY;
  
  // Use DeepL if API key is available
  if (apiKey) {
    // Check if DeepL supports this language
    if (DEEPL_SUPPORTED.has(targetLocale)) {
      return translateWithDeepL(text, sourceLocale, targetLocale);
    } else {
      // DeepL doesn't support this language (e.g., Hindi)
      // Return error - don't use LibreTranslate to avoid rate limits
      return {
        text: '',
        locale: targetLocale,
        success: false,
        error: `Language ${targetLocale} is not supported by DeepL API. Consider using Google Cloud Translation API or Azure Translator for this language.`,
      };
    }
  }
  
  // No API key - return error
  return {
    text: '',
    locale: targetLocale,
    success: false,
    error: 'DEEPL_API_KEY not set. Please set environment variable: export DEEPL_API_KEY=your-key',
  };
}

