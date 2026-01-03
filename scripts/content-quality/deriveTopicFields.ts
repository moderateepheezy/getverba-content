#!/usr/bin/env tsx

/**
 * Topic Field Derivation Utility
 * 
 * Derives topic grouping metadata (topicKey, topicLabel, shortTitle, orderInTopic)
 * from pack entries deterministically for catalog browsing.
 * 
 * Rules:
 * 1. If pack.analytics.topicKey/topicLabel/shortTitle exist → return them
 * 2. Else derive from pack fields:
 *    - topicLabel: prefer analytics.primaryStructure, else tags[0], else from title
 *    - topicKey: slugify(topicLabel)
 *    - shortTitle: extract from title after colon if <= 28 chars, else clean title
 *    - orderInTopic: parse "— N:" or "#N" from title
 */

export interface PackEntry {
  id: string;
  title: string;
  level?: string;
  scenario?: string;
  primaryStructure?: string;
  tags?: string[];
  analytics?: {
    topicKey?: string;
    topicLabel?: string;
    shortTitle?: string;
    orderInTopic?: number;
    primaryStructure?: string;
    [key: string]: unknown;
  };
}

export interface TopicFields {
  topicKey?: string;
  topicLabel?: string;
  shortTitle?: string;
  orderInTopic?: number;
}

/**
 * CEFR level markers to strip from titles
 */
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/**
 * Slugify a string to kebab-case, ASCII-safe
 * Handles German umlauts and special characters
 */
export function slugify(str: string): string {
  // German umlaut mappings
  const umlautMap: Record<string, string> = {
    'ä': 'ae',
    'ö': 'oe',
    'ü': 'ue',
    'Ä': 'ae',
    'Ö': 'oe',
    'Ü': 'ue',
    'ß': 'ss'
  };

  let result = str.toLowerCase();
  
  // Replace German umlauts
  for (const [umlaut, replacement] of Object.entries(umlautMap)) {
    result = result.replace(new RegExp(umlaut, 'g'), replacement);
  }
  
  // Replace non-alphanumeric characters with hyphens
  result = result
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')  // Trim leading/trailing hyphens
    .replace(/-+/g, '-');     // Collapse multiple hyphens
  
  // Limit length to 64 chars
  if (result.length > 64) {
    result = result.substring(0, 64).replace(/-+$/, '');
  }
  
  return result;
}

/**
 * Extract order number from title patterns like "— 1:", "#1", "Part 1"
 */
export function extractOrderFromTitle(title: string): number | undefined {
  // Pattern: "— N:" (with em-dash or regular dash)
  const dashNumberMatch = title.match(/[—–-]\s*(\d+)\s*:/);
  if (dashNumberMatch) {
    return parseInt(dashNumberMatch[1], 10);
  }
  
  // Pattern: "#N"
  const hashMatch = title.match(/#(\d+)/);
  if (hashMatch) {
    return parseInt(hashMatch[1], 10);
  }
  
  // Pattern: "Part N" or "Pack N"
  const partMatch = title.match(/\b(?:Part|Pack)\s+(\d+)\b/i);
  if (partMatch) {
    return parseInt(partMatch[1], 10);
  }
  
  return undefined;
}

/**
 * Clean a title by removing scenario prefix, level, and numbering
 */
export function cleanTitle(title: string): string {
  let cleaned = title;
  
  // Remove CEFR level markers with optional surrounding whitespace
  for (const level of CEFR_LEVELS) {
    cleaned = cleaned.replace(new RegExp(`\\b${level}\\b`, 'gi'), '');
  }
  
  // Remove numbering patterns: "— N:", "#N", "Part N", "Pack N", "Pack #N"
  cleaned = cleaned
    .replace(/[—–-]\s*\d+\s*:/g, '')  // "— 1:"
    .replace(/\bPack\s*#?\s*\d+\b/gi, '')  // "Pack 1", "Pack #3"
    .replace(/\bPart\s*#?\s*\d+\b/gi, '')  // "Part 1", "Part #3"
    .replace(/#\d+/g, '');             // "#1" (standalone)
  
  // Clean up whitespace and punctuation
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/^[\s:—–-]+|[\s:—–-]+$/g, '')
    .trim();
  
  return cleaned;
}

/**
 * Extract the topic portion (left side) and short portion (right side) from a title
 * e.g., "Doctor A1 — 1: Making an Appointment" → topic: "Making an Appointment", short: "Making an Appointment"
 */
export function splitTitleParts(title: string): { topicPart: string; shortPart: string } {
  // First, check if title has colon pattern "X: Y"
  const colonIdx = title.lastIndexOf(':');
  
  if (colonIdx > 0) {
    const rightSide = title.substring(colonIdx + 1).trim();
    const leftSide = title.substring(0, colonIdx);
    
    // If right side is meaningful (> 3 chars and not just numbers)
    if (rightSide.length > 3 && !/^\d+$/.test(rightSide)) {
      // Clean the left side to use as topic if right side is too short
      const cleanedLeft = cleanTitle(leftSide);
      
      // Use right side for both if it's decent, otherwise use left
      if (rightSide.length <= 28) {
        return { topicPart: rightSide, shortPart: rightSide };
      } else {
        // Right side too long, try to shorten
        const shortened = rightSide.substring(0, 25) + '...';
        return { topicPart: rightSide, shortPart: shortened };
      }
    }
  }
  
  // No colon pattern, clean the entire title
  const cleaned = cleanTitle(title);
  
  // For shortTitle, truncate if needed
  let shortPart = cleaned;
  if (shortPart.length > 28) {
    shortPart = shortPart.substring(0, 25) + '...';
  }
  
  return { topicPart: cleaned, shortPart };
}

/**
 * Derive topic fields from a pack entry
 */
export function deriveTopicFields(pack: PackEntry): TopicFields {
  const result: TopicFields = {};
  
  // 1. Check for explicit metadata first
  if (pack.analytics) {
    if (pack.analytics.topicKey && typeof pack.analytics.topicKey === 'string') {
      result.topicKey = pack.analytics.topicKey;
    }
    if (pack.analytics.topicLabel && typeof pack.analytics.topicLabel === 'string') {
      result.topicLabel = pack.analytics.topicLabel;
    }
    if (pack.analytics.shortTitle && typeof pack.analytics.shortTitle === 'string') {
      result.shortTitle = pack.analytics.shortTitle;
    }
    if (typeof pack.analytics.orderInTopic === 'number' && pack.analytics.orderInTopic >= 1) {
      result.orderInTopic = pack.analytics.orderInTopic;
    }
  }
  
  // 2. Derive missing fields
  
  // Extract orderInTopic from title if not explicit
  if (result.orderInTopic === undefined) {
    const order = extractOrderFromTitle(pack.title);
    if (order !== undefined) {
      result.orderInTopic = order;
    }
  }
  
  // Derive topicLabel if not explicit
  if (!result.topicLabel) {
    // Priority: 
    // 1. analytics.primaryStructure (humanized)
    // 2. primaryStructure (humanized)
    // 3. tags[0]
    // 4. from title
    
    if (pack.analytics?.primaryStructure && typeof pack.analytics.primaryStructure === 'string') {
      result.topicLabel = humanizePrimaryStructure(pack.analytics.primaryStructure);
    } else if (pack.primaryStructure && typeof pack.primaryStructure === 'string') {
      result.topicLabel = humanizePrimaryStructure(pack.primaryStructure);
    } else if (pack.tags && pack.tags.length > 0 && typeof pack.tags[0] === 'string') {
      result.topicLabel = humanizeTag(pack.tags[0]);
    } else {
      // Derive from title
      const { topicPart } = splitTitleParts(pack.title);
      result.topicLabel = topicPart || 'General';
    }
  }
  
  // Derive topicKey if not explicit
  if (!result.topicKey && result.topicLabel) {
    result.topicKey = slugify(result.topicLabel);
  }
  
  // Derive shortTitle if not explicit
  if (!result.shortTitle) {
    const { shortPart } = splitTitleParts(pack.title);
    result.shortTitle = shortPart || result.topicLabel?.substring(0, 28) || 'Pack';
  }
  
  // Ensure shortTitle is within bounds
  if (result.shortTitle && result.shortTitle.length > 28) {
    result.shortTitle = result.shortTitle.substring(0, 25) + '...';
  }
  
  return result;
}

/**
 * Humanize a primary structure identifier
 * e.g., "modal_verbs_requests" → "Modal Verbs Requests"
 */
export function humanizePrimaryStructure(structure: string): string {
  return structure
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Humanize a tag identifier
 * e.g., "doctor" → "Doctor"
 */
export function humanizeTag(tag: string): string {
  return tag
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generic labels to warn about
 */
export const GENERIC_TOPIC_LABELS = [
  'general',
  'basics',
  'introduction',
  'part',
  'pack',
  'lesson',
  'unit',
  'module'
];

/**
 * Check if a topic label is generic/noisy
 */
export function isGenericLabel(label: string): boolean {
  return GENERIC_TOPIC_LABELS.includes(label.toLowerCase().trim());
}

/**
 * Validate topic fields against schema rules
 */
export interface TopicFieldValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateTopicFields(fields: TopicFields): TopicFieldValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate topicKey
  if (fields.topicKey !== undefined) {
    if (typeof fields.topicKey !== 'string') {
      errors.push('topicKey must be a string');
    } else {
      // Must be kebab-case
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.topicKey)) {
        errors.push('topicKey must be kebab-case: ^[a-z0-9]+(?:-[a-z0-9]+)*$');
      }
      // Length <= 64
      if (fields.topicKey.length > 64) {
        errors.push(`topicKey too long (${fields.topicKey.length} chars, max 64)`);
      }
    }
  }
  
  // Validate topicLabel
  if (fields.topicLabel !== undefined) {
    if (typeof fields.topicLabel !== 'string') {
      errors.push('topicLabel must be a string');
    } else {
      // Length 3..60
      if (fields.topicLabel.length < 3) {
        errors.push(`topicLabel too short (${fields.topicLabel.length} chars, min 3)`);
      }
      if (fields.topicLabel.length > 60) {
        errors.push(`topicLabel too long (${fields.topicLabel.length} chars, max 60)`);
      }
      // Must not be purely numeric
      if (/^\d+$/.test(fields.topicLabel)) {
        errors.push('topicLabel must not be purely numeric');
      }
      // Warn about generic labels
      if (isGenericLabel(fields.topicLabel)) {
        warnings.push(`topicLabel "${fields.topicLabel}" is a generic value`);
      }
    }
  }
  
  // Validate shortTitle
  if (fields.shortTitle !== undefined) {
    if (typeof fields.shortTitle !== 'string') {
      errors.push('shortTitle must be a string');
    } else {
      // Length 3..28 (hard fail > 28)
      if (fields.shortTitle.length < 3) {
        errors.push(`shortTitle too short (${fields.shortTitle.length} chars, min 3)`);
      }
      if (fields.shortTitle.length > 28) {
        errors.push(`shortTitle too long (${fields.shortTitle.length} chars, max 28)`);
      }
    }
  }
  
  // Validate orderInTopic
  if (fields.orderInTopic !== undefined) {
    if (typeof fields.orderInTopic !== 'number') {
      errors.push('orderInTopic must be a number');
    } else if (!Number.isInteger(fields.orderInTopic)) {
      errors.push('orderInTopic must be an integer');
    } else if (fields.orderInTopic < 1) {
      errors.push('orderInTopic must be >= 1');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default deriveTopicFields;

