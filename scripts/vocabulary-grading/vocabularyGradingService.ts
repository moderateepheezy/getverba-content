#!/usr/bin/env tsx

/**
 * Vocabulary Grading Service
 * 
 * Provides CEFR level grading for vocabulary tokens using external APIs
 * with caching to minimize API calls.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const META_DIR = join(__dirname, '..', '..', 'content', 'meta');
const CACHE_FILE = join(META_DIR, 'vocabulary-cache.json');
const CONFIG_FILE = join(META_DIR, 'level-grading-config.json');

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null;

export interface PromptGrade {
  level: CEFRLevel;
  confidence: number;
  tokenGrades: Array<{ token: string; level: CEFRLevel }>;
  issues: string[];
}

export interface ContentGrade {
  claimedLevel: string;
  detectedLevel: CEFRLevel;
  confidence: number;
  accuracy: number;
  issues: string[];
  promptGrades: PromptGrade[];
}

interface VocabularyCache {
  vocabulary: Record<string, Record<string, CEFRLevel>>;
  lastUpdated: string;
}

interface GradingConfig {
  apiProvider?: 'dwds' | 'wortschatz' | 'custom';
  apiUrl?: string;
  apiKey?: string;
  cacheEnabled: boolean;
  accuracyThreshold: number;
  validationRules: Record<string, {
    maxHigherLevel: number;
    maxLevel: string;
  }>;
}

// Default configuration
const DEFAULT_CONFIG: GradingConfig = {
  cacheEnabled: true,
  accuracyThreshold: 0.98,
  validationRules: {
    'A1': { maxHigherLevel: 0.05, maxLevel: 'A2' },
    'A2': { maxHigherLevel: 0.10, maxLevel: 'B1' },
    'B1': { maxHigherLevel: 0.15, maxLevel: 'B2' }
  }
};

// CEFR level order for comparison
const CEFR_ORDER: Record<string, number> = {
  'A1': 1,
  'A2': 2,
  'B1': 3,
  'B2': 4,
  'C1': 5,
  'C2': 6
};

// German stop words (common words that don't affect level)
const GERMAN_STOP_WORDS = new Set([
  'der', 'die', 'das', 'ein', 'eine', 'einen', 'einer', 'einem',
  'und', 'oder', 'aber', 'auch', 'nicht', 'kein', 'keine', 'keinen',
  'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'hat', 'haben',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'Sie',
  'mit', 'von', 'zu', 'in', 'auf', 'für', 'an', 'am', 'im', 'zum', 'zur',
  'heute', 'morgen', 'jetzt', 'hier', 'dort', 'da', 'so', 'sehr', 'viel'
]);

class VocabularyGradingService {
  private cache: VocabularyCache;
  private config: GradingConfig;

  constructor() {
    this.config = this.loadConfig();
    this.cache = this.loadCache();
  }

  private loadConfig(): GradingConfig {
    if (existsSync(CONFIG_FILE)) {
      try {
        const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
        return { ...DEFAULT_CONFIG, ...config };
      } catch (error) {
        console.warn(`Failed to load config from ${CONFIG_FILE}, using defaults`);
      }
    }
    return DEFAULT_CONFIG;
  }

  private loadCache(): VocabularyCache {
    if (existsSync(CACHE_FILE)) {
      try {
        return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      } catch (error) {
        console.warn(`Failed to load cache from ${CACHE_FILE}`);
      }
    }
    return {
      vocabulary: {},
      lastUpdated: new Date().toISOString()
    };
  }

  private saveCache(): void {
    if (!existsSync(META_DIR)) {
      mkdirSync(META_DIR, { recursive: true });
    }
    this.cache.lastUpdated = new Date().toISOString();
    writeFileSync(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  /**
   * Grade a single token (word) for CEFR level
   */
  async gradeToken(token: string, language: string = 'de'): Promise<CEFRLevel> {
    // Normalize token
    const normalized = this.normalizeToken(token);
    
    if (!normalized || normalized.length < 2) {
      return null;
    }

    // Check cache first
    if (this.config.cacheEnabled && this.cache.vocabulary[language]?.[normalized]) {
      return this.cache.vocabulary[language][normalized];
    }

    // Check if it's a stop word
    if (language === 'de' && GERMAN_STOP_WORDS.has(normalized.toLowerCase())) {
      return 'A1'; // Stop words are A1
    }

    // Try to grade via API (if configured)
    let level: CEFRLevel = null;
    if (this.config.apiUrl && this.config.apiKey) {
      level = await this.gradeTokenViaAPI(normalized, language);
    } else {
      // Fallback: use heuristics for common German words
      level = this.gradeTokenHeuristic(normalized, language);
    }

    // Cache the result
    if (this.config.cacheEnabled && level) {
      if (!this.cache.vocabulary[language]) {
        this.cache.vocabulary[language] = {};
      }
      this.cache.vocabulary[language][normalized] = level;
      this.saveCache();
    }

    return level;
  }

  /**
   * Grade token via external API
   */
  private async gradeTokenViaAPI(token: string, language: string): Promise<CEFRLevel> {
    if (!this.config.apiUrl || !this.config.apiKey) {
      return null;
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({ token, language })
      });

      if (response.ok) {
        const data = await response.json();
        return data.level as CEFRLevel;
      }
    } catch (error) {
      console.warn(`API call failed for token "${token}": ${error}`);
    }

    return null;
  }

  /**
   * Heuristic grading for German words (fallback when API unavailable)
   * This is a basic implementation - should be enhanced with actual word lists
   */
  private gradeTokenHeuristic(token: string, language: string): CEFRLevel {
    if (language !== 'de') {
      return null;
    }

    const lower = token.toLowerCase();

    // Basic A1 words (very common)
    const a1Words = [
      'hallo', 'guten', 'tag', 'morgen', 'abend', 'tisch', 'stuhl', 'buch',
      'haus', 'auto', 'wasser', 'brot', 'kaffee', 'tee', 'essen', 'trinken',
      'gehen', 'kommen', 'sehen', 'machen', 'haben', 'sein', 'wohnen', 'arbeiten',
      'ich', 'du', 'er', 'sie', 'wir', 'ihr', 'gut', 'schlecht', 'groß', 'klein'
    ];

    // Basic A2 words
    const a2Words = [
      'zeitung', 'supermarkt', 'restaurant', 'schule', 'büro', 'park',
      'kaufen', 'verkaufen', 'lernen', 'studieren', 'spielen', 'hören',
      'wichtig', 'interessant', 'schwierig', 'einfach'
    ];

    // Basic B1 words
    const b1Words = [
      'komplex', 'anspruchsvoll', 'erweitert', 'fortgeschritten',
      'diskutieren', 'erklären', 'verstehen', 'entscheiden'
    ];

    if (a1Words.includes(lower)) return 'A1';
    if (a2Words.includes(lower)) return 'A2';
    if (b1Words.includes(lower)) return 'B1';

    // Default: assume A2 if unknown (conservative)
    return 'A2';
  }

  /**
   * Normalize token (remove punctuation, lowercase, etc.)
   */
  private normalizeToken(token: string): string {
    return token
      .toLowerCase()
      .replace(/[.,!?;:()\[\]{}'"]/g, '')
      .trim();
  }

  /**
   * Extract tokens from text
   */
  private extractTokens(text: string, language: string = 'de'): string[] {
    // Simple tokenization - split by whitespace and punctuation
    const tokens = text
      .split(/[\s.,!?;:()\[\]{}'"]+/)
      .map(t => this.normalizeToken(t))
      .filter(t => t.length >= 2 && !GERMAN_STOP_WORDS.has(t));

    return tokens;
  }

  /**
   * Grade an entire prompt
   */
  async gradePrompt(prompt: string, language: string = 'de'): Promise<PromptGrade> {
    const tokens = this.extractTokens(prompt, language);
    const tokenGrades: Array<{ token: string; level: CEFRLevel }> = [];
    const issues: string[] = [];

    // Grade each token
    for (const token of tokens) {
      const level = await this.gradeToken(token, language);
      tokenGrades.push({ token, level });
    }

    // Compute overall level (use highest level found, or most common)
    const levels = tokenGrades
      .map(tg => tg.level)
      .filter(l => l !== null) as CEFRLevel[];

    if (levels.length === 0) {
      return {
        level: null,
        confidence: 0,
        tokenGrades,
        issues: ['No gradable tokens found']
      };
    }

    // Find highest level
    let maxLevel: CEFRLevel = 'A1';
    let maxOrder = 1;
    for (const level of levels) {
      const order = CEFR_ORDER[level] || 0;
      if (order > maxOrder) {
        maxOrder = order;
        maxLevel = level;
      }
    }

    // Count level distribution
    const levelCounts: Record<string, number> = {};
    for (const level of levels) {
      levelCounts[level] = (levelCounts[level] || 0) + 1;
    }

    // Confidence based on consistency
    const total = levels.length;
    const maxCount = Math.max(...Object.values(levelCounts));
    const confidence = maxCount / total;

    // Identify issues
    if (confidence < 0.7) {
      issues.push(`Mixed vocabulary levels detected (confidence: ${(confidence * 100).toFixed(1)}%)`);
    }

    return {
      level: maxLevel,
      confidence,
      tokenGrades,
      issues
    };
  }

  /**
   * Grade content item (pack, drill, or exam)
   */
  async gradeContent(
    content: { prompts?: Array<{ text: string }>; level: string },
    language: string = 'de'
  ): Promise<ContentGrade> {
    const claimedLevel = content.level.toUpperCase();
    const promptGrades: PromptGrade[] = [];
    const issues: string[] = [];

    if (!content.prompts || content.prompts.length === 0) {
      return {
        claimedLevel,
        detectedLevel: null,
        confidence: 0,
        accuracy: 0,
        issues: ['No prompts found'],
        promptGrades: []
      };
    }

    // Grade each prompt
    for (const prompt of content.prompts) {
      if (prompt.text) {
        const grade = await this.gradePrompt(prompt.text, language);
        promptGrades.push(grade);
      }
    }

    // Compute overall detected level
    const detectedLevels = promptGrades
      .map(pg => pg.level)
      .filter(l => l !== null) as CEFRLevel[];

    if (detectedLevels.length === 0) {
      return {
        claimedLevel,
        detectedLevel: null,
        confidence: 0,
        accuracy: 0,
        issues: ['No gradable prompts found'],
        promptGrades
      };
    }

    // Find highest detected level
    let detectedLevel: CEFRLevel = 'A1';
    let maxOrder = 1;
    for (const level of detectedLevels) {
      const order = CEFR_ORDER[level] || 0;
      if (order > maxOrder) {
        maxOrder = order;
        detectedLevel = level;
      }
    }

    // Check against validation rules
    const rule = this.config.validationRules[claimedLevel];
    if (rule) {
      const claimedOrder = CEFR_ORDER[claimedLevel] || 0;
      const maxAllowedOrder = CEFR_ORDER[rule.maxLevel] || 0;

      // Count tokens exceeding allowed level
      let exceedingCount = 0;
      let totalTokens = 0;

      for (const pg of promptGrades) {
        for (const tg of pg.tokenGrades) {
          if (tg.level) {
            totalTokens++;
            const tokenOrder = CEFR_ORDER[tg.level] || 0;
            if (tokenOrder > maxAllowedOrder) {
              exceedingCount++;
            }
          }
        }
      }

      const exceedingRate = totalTokens > 0 ? exceedingCount / totalTokens : 0;

      if (exceedingRate > rule.maxHigherLevel) {
        issues.push(
          `${(exceedingRate * 100).toFixed(1)}% of tokens exceed allowed level for ${claimedLevel} (max: ${(rule.maxHigherLevel * 100).toFixed(1)}%)`
        );
      }

      // Check if detected level is too high
      const detectedOrder = CEFR_ORDER[detectedLevel] || 0;
      if (detectedOrder > maxAllowedOrder) {
        issues.push(
          `Detected level ${detectedLevel} exceeds maximum allowed level ${rule.maxLevel} for claimed level ${claimedLevel}`
        );
      }
    }

    // Compute accuracy (how well content matches claimed level)
    const claimedOrder = CEFR_ORDER[claimedLevel] || 0;
    const detectedOrder = CEFR_ORDER[detectedLevel] || 0;
    
    // Accuracy is higher if detected level matches or is close to claimed
    let accuracy = 1.0;
    if (detectedOrder > claimedOrder) {
      // Penalize if detected is higher than claimed
      const diff = detectedOrder - claimedOrder;
      accuracy = Math.max(0, 1.0 - (diff * 0.2));
    } else if (detectedOrder < claimedOrder) {
      // Slight penalty if detected is lower (content might be too easy)
      const diff = claimedOrder - detectedOrder;
      accuracy = Math.max(0.7, 1.0 - (diff * 0.1));
    }

    // Overall confidence
    const confidences = promptGrades.map(pg => pg.confidence);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    return {
      claimedLevel,
      detectedLevel,
      confidence: avgConfidence,
      accuracy,
      issues,
      promptGrades
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; languages: string[] } {
    const languages = Object.keys(this.cache.vocabulary);
    const size = languages.reduce((sum, lang) => {
      return sum + Object.keys(this.cache.vocabulary[lang] || {}).length;
    }, 0);

    return { size, languages };
  }
}

// Export singleton instance
export const vocabularyGradingService = new VocabularyGradingService();

