#!/usr/bin/env tsx

/**
 * i18n Validation Utilities
 * 
 * Provides validation for internationalization fields:
 * - title_i18n: Localized titles (optional, backward-compatible)
 * - description_i18n: Localized descriptions (optional)
 * - shortTitle_i18n: Localized short titles (optional)
 * - groupId, groupTitle, groupTitle_i18n: Grouping metadata for lists
 * 
 * These are OPTIONAL fields during the transition period.
 * When present, they must be valid according to the contract.
 * 
 * Contract:
 * - title_i18n must include "en" key if present
 * - All locale keys must be BCP-47 short form (e.g., "en", "de", "de-AT")
 * - Values must be non-empty trimmed strings
 * - title_i18n values must be <= 80 chars (same as title)
 * - shortTitle_i18n values must be <= 28 chars (same as shortTitle)
 */

// BCP-47 short locale pattern: "en", "de", "de-AT", "pt-BR", etc.
// Accepts: 2-letter language code, optionally followed by hyphen and 2-letter region
const LOCALE_KEY_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

// groupId pattern: kebab-case or snake_case identifier
const GROUP_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;

// Constraints
const MAX_TITLE_LENGTH = 80;
const MAX_SHORT_TITLE_LENGTH = 28;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_GROUP_ID_LENGTH = 40;
const MAX_GROUP_TITLE_LENGTH = 60;

export interface I18nRecord {
  [locale: string]: string;
}

export interface GroupingMetadata {
  groupId?: string;
  groupTitle?: string;
  groupTitle_i18n?: I18nRecord;
}

export interface I18nFields {
  title_i18n?: I18nRecord;
  description_i18n?: I18nRecord;
  shortTitle_i18n?: I18nRecord;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a locale key matches BCP-47 short form
 */
export function isValidLocaleKey(key: string): boolean {
  return LOCALE_KEY_PATTERN.test(key);
}

/**
 * Validates a groupId is in valid format (kebab-case or snake_case)
 */
export function isValidGroupId(groupId: string): boolean {
  if (!groupId || typeof groupId !== 'string') return false;
  if (groupId.length === 0 || groupId.length > MAX_GROUP_ID_LENGTH) return false;
  return GROUP_ID_PATTERN.test(groupId);
}

/**
 * Validates an i18n record (title_i18n, description_i18n, etc.)
 * 
 * @param record - The i18n record to validate
 * @param fieldName - Name of the field for error messages
 * @param maxLength - Maximum length for values
 * @param requireEnglish - Whether "en" key is required (default: true)
 */
export function validateI18nRecord(
  record: unknown,
  fieldName: string,
  maxLength: number,
  requireEnglish: boolean = true
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // If not present, it's valid (optional field)
  if (record === undefined || record === null) {
    return { valid: true, errors: [], warnings: [] };
  }

  // Must be an object
  if (typeof record !== 'object' || Array.isArray(record)) {
    errors.push(`${fieldName} must be an object if present`);
    return { valid: false, errors, warnings };
  }

  const i18nRecord = record as Record<string, unknown>;
  const keys = Object.keys(i18nRecord);

  // If empty object, that's invalid when present
  if (keys.length === 0) {
    errors.push(`${fieldName} must have at least one locale if present`);
    return { valid: false, errors, warnings };
  }

  // Must include "en" for now
  if (requireEnglish && !('en' in i18nRecord)) {
    errors.push(`${fieldName} must include "en" locale`);
  }

  // Validate each key-value pair
  for (const key of keys) {
    // Validate locale key format
    if (!isValidLocaleKey(key)) {
      errors.push(`${fieldName} has invalid locale key "${key}". Must be BCP-47 short form (e.g., "en", "de", "de-AT")`);
      continue;
    }

    const value = i18nRecord[key];

    // Value must be a string
    if (typeof value !== 'string') {
      errors.push(`${fieldName}["${key}"] must be a string`);
      continue;
    }

    // Value must be non-empty after trimming
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      errors.push(`${fieldName}["${key}"] must be a non-empty string`);
      continue;
    }

    // Value must not exceed max length
    if (trimmed.length > maxLength) {
      errors.push(`${fieldName}["${key}"] exceeds max length (${trimmed.length} > ${maxLength})`);
    }

    // Warn if value has leading/trailing whitespace
    if (value !== trimmed) {
      warnings.push(`${fieldName}["${key}"] has leading/trailing whitespace`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates title_i18n field
 */
export function validateTitleI18n(record: unknown): ValidationResult {
  return validateI18nRecord(record, 'title_i18n', MAX_TITLE_LENGTH, true);
}

/**
 * Validates shortTitle_i18n field
 */
export function validateShortTitleI18n(record: unknown): ValidationResult {
  return validateI18nRecord(record, 'shortTitle_i18n', MAX_SHORT_TITLE_LENGTH, true);
}

/**
 * Validates description_i18n field
 */
export function validateDescriptionI18n(record: unknown): ValidationResult {
  return validateI18nRecord(record, 'description_i18n', MAX_DESCRIPTION_LENGTH, true);
}

/**
 * Validates grouping metadata fields
 */
export function validateGroupingMetadata(item: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!item || typeof item !== 'object') {
    return { valid: true, errors: [], warnings: [] };
  }

  const obj = item as Record<string, unknown>;
  const hasGroupId = 'groupId' in obj;
  const hasGroupTitle = 'groupTitle' in obj;
  const hasGroupTitleI18n = 'groupTitle_i18n' in obj;

  // If none present, that's valid (optional)
  if (!hasGroupId && !hasGroupTitle && !hasGroupTitleI18n) {
    return { valid: true, errors: [], warnings: [] };
  }

  // If any grouping field present, groupId and groupTitle are both required
  if (hasGroupId || hasGroupTitle) {
    if (!hasGroupId) {
      errors.push('groupTitle is present but groupId is missing');
    }
    if (!hasGroupTitle) {
      errors.push('groupId is present but groupTitle is missing');
    }
  }

  // Validate groupId
  if (hasGroupId) {
    const groupId = obj.groupId;
    if (typeof groupId !== 'string') {
      errors.push('groupId must be a string');
    } else if (!isValidGroupId(groupId)) {
      errors.push(`groupId "${groupId}" is invalid. Must be kebab-case or snake_case, max ${MAX_GROUP_ID_LENGTH} chars`);
    }
  }

  // Validate groupTitle
  if (hasGroupTitle) {
    const groupTitle = obj.groupTitle;
    if (typeof groupTitle !== 'string') {
      errors.push('groupTitle must be a string');
    } else if (groupTitle.trim().length === 0) {
      errors.push('groupTitle must be non-empty');
    } else if (groupTitle.length > MAX_GROUP_TITLE_LENGTH) {
      errors.push(`groupTitle exceeds max length (${groupTitle.length} > ${MAX_GROUP_TITLE_LENGTH})`);
    }
  }

  // Validate groupTitle_i18n
  if (hasGroupTitleI18n) {
    const i18nResult = validateI18nRecord(obj.groupTitle_i18n, 'groupTitle_i18n', MAX_GROUP_TITLE_LENGTH, true);
    errors.push(...i18nResult.errors);
    warnings.push(...i18nResult.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates all i18n and grouping fields on a document/item
 */
export function validateI18nAndGrouping(item: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!item || typeof item !== 'object') {
    return { valid: true, errors: [], warnings: [] };
  }

  const obj = item as Record<string, unknown>;

  // Validate title_i18n
  if ('title_i18n' in obj) {
    const result = validateTitleI18n(obj.title_i18n);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  // Validate shortTitle_i18n
  if ('shortTitle_i18n' in obj) {
    const result = validateShortTitleI18n(obj.shortTitle_i18n);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  // Validate description_i18n
  if ('description_i18n' in obj) {
    const result = validateDescriptionI18n(obj.description_i18n);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  // Validate grouping metadata
  const groupResult = validateGroupingMetadata(obj);
  errors.push(...groupResult.errors);
  warnings.push(...groupResult.warnings);

  // Cross-check: if title_i18n.en exists and title exists, they should match
  if ('title' in obj && 'title_i18n' in obj) {
    const title = obj.title as string;
    const titleI18n = obj.title_i18n as I18nRecord;
    if (titleI18n && typeof titleI18n.en === 'string') {
      if (title !== titleI18n.en) {
        warnings.push(`title "${title}" does not match title_i18n.en "${titleI18n.en}"`);
      }
    }
  }

  // Cross-check: if shortTitle_i18n.en exists and shortTitle exists, they should match
  if ('shortTitle' in obj && 'shortTitle_i18n' in obj) {
    const shortTitle = obj.shortTitle as string;
    const shortTitleI18n = obj.shortTitle_i18n as I18nRecord;
    if (shortTitleI18n && typeof shortTitleI18n.en === 'string') {
      if (shortTitle !== shortTitleI18n.en) {
        warnings.push(`shortTitle "${shortTitle}" does not match shortTitle_i18n.en "${shortTitleI18n.en}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Creates title_i18n from a title string (English only)
 */
export function createTitleI18nFromTitle(title: string): I18nRecord {
  return { en: title };
}

/**
 * Creates shortTitle_i18n from a shortTitle string (English only)
 */
export function createShortTitleI18nFromShortTitle(shortTitle: string): I18nRecord {
  return { en: shortTitle };
}

/**
 * Creates description_i18n from a description string (English only)
 */
export function createDescriptionI18nFromDescription(description: string): I18nRecord {
  return { en: description };
}

/**
 * Predefined group configurations for Doctor scenario
 */
export const DOCTOR_SCENARIO_GROUPS = {
  'booking-appointments': {
    groupId: 'booking-appointments',
    groupTitle: 'Booking Appointments',
    groupTitle_i18n: { en: 'Booking Appointments' }
  },
  'describing-symptoms': {
    groupId: 'describing-symptoms',
    groupTitle: 'Describing Symptoms',
    groupTitle_i18n: { en: 'Describing Symptoms' }
  },
  'getting-prescriptions': {
    groupId: 'getting-prescriptions',
    groupTitle: 'Getting Prescriptions',
    groupTitle_i18n: { en: 'Getting Prescriptions' }
  }
} as const;

export type DoctorGroupId = keyof typeof DOCTOR_SCENARIO_GROUPS;

/**
 * Determines which group a doctor pack belongs to based on its title or topic
 */
export function getDoctorPackGroup(pack: { title?: string; shortTitle?: string; topicKey?: string; topicLabel?: string }): DoctorGroupId | null {
  const title = pack.title?.toLowerCase() || '';
  const shortTitle = pack.shortTitle?.toLowerCase() || '';
  const topicKey = pack.topicKey?.toLowerCase() || '';
  const topicLabel = pack.topicLabel?.toLowerCase() || '';
  
  const allText = `${title} ${shortTitle} ${topicKey} ${topicLabel}`;
  
  if (allText.includes('appointment') || allText.includes('booking') || allText.includes('termin')) {
    return 'booking-appointments';
  }
  if (allText.includes('symptom') || allText.includes('describing') || allText.includes('beschreib')) {
    return 'describing-symptoms';
  }
  if (allText.includes('prescription') || allText.includes('rezept') || allText.includes('getting')) {
    return 'getting-prescriptions';
  }
  
  return null;
}

