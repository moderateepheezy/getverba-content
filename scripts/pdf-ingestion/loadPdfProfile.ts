#!/usr/bin/env tsx

/**
 * PDF Profile Loader
 * 
 * Loads and validates PDF profiles from content/meta/pdf-profiles/
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const PROFILES_DIR = join(PROJECT_ROOT, 'content', 'meta', 'pdf-profiles');

export interface PdfProfileSearch {
  skipFrontMatter?: boolean;
  windowSizePages?: number;
  minScenarioHits?: number;
  anchors?: string[];
}

export interface PdfProfileRangePresets {
  [name: string]: string[];
}

export interface PdfProfile {
  id: string;
  workspace: string;
  file: string;
  language: 'de' | 'en';
  defaultScenario?: string;
  defaultLevel?: string;
  search?: PdfProfileSearch;
  rangePresets?: PdfProfileRangePresets;
  notes?: string;
}

/**
 * Load PDF profile by ID
 */
export function loadPdfProfile(profileId: string): PdfProfile {
  const profilePath = join(PROFILES_DIR, `${profileId}.json`);
  
  if (!existsSync(profilePath)) {
    throw new Error(`PDF profile not found: ${profilePath}`);
  }
  
  const content = readFileSync(profilePath, 'utf-8');
  let profile: any;
  
  try {
    profile = JSON.parse(content);
  } catch (error: any) {
    throw new Error(`Invalid JSON in profile ${profileId}: ${error.message}`);
  }
  
  // Validate required fields
  if (!profile.id || typeof profile.id !== 'string') {
    throw new Error(`Profile ${profileId}: missing or invalid "id" field`);
  }
  
  if (profile.id !== profileId) {
    throw new Error(`Profile ${profileId}: "id" field ("${profile.id}") does not match filename`);
  }
  
  if (!profile.workspace || typeof profile.workspace !== 'string') {
    throw new Error(`Profile ${profileId}: missing or invalid "workspace" field`);
  }
  
  if (!profile.file || typeof profile.file !== 'string') {
    throw new Error(`Profile ${profileId}: missing or invalid "file" field`);
  }
  
  if (!profile.language || (profile.language !== 'de' && profile.language !== 'en')) {
    throw new Error(`Profile ${profileId}: missing or invalid "language" field (must be "de" or "en")`);
  }
  
  // Validate optional fields
  if (profile.defaultScenario !== undefined && typeof profile.defaultScenario !== 'string') {
    throw new Error(`Profile ${profileId}: invalid "defaultScenario" field (must be string)`);
  }
  
  if (profile.defaultLevel !== undefined && typeof profile.defaultLevel !== 'string') {
    throw new Error(`Profile ${profileId}: invalid "defaultLevel" field (must be string)`);
  }
  
  if (profile.search !== undefined) {
    if (typeof profile.search !== 'object' || Array.isArray(profile.search)) {
      throw new Error(`Profile ${profileId}: invalid "search" field (must be object)`);
    }
    
    if (profile.search.skipFrontMatter !== undefined && typeof profile.search.skipFrontMatter !== 'boolean') {
      throw new Error(`Profile ${profileId}: invalid "search.skipFrontMatter" field (must be boolean)`);
    }
    
    if (profile.search.windowSizePages !== undefined && typeof profile.search.windowSizePages !== 'number') {
      throw new Error(`Profile ${profileId}: invalid "search.windowSizePages" field (must be number)`);
    }
    
    if (profile.search.minScenarioHits !== undefined && typeof profile.search.minScenarioHits !== 'number') {
      throw new Error(`Profile ${profileId}: invalid "search.minScenarioHits" field (must be number)`);
    }
    
    if (profile.search.anchors !== undefined) {
      if (!Array.isArray(profile.search.anchors)) {
        throw new Error(`Profile ${profileId}: invalid "search.anchors" field (must be array)`);
      }
      for (const anchor of profile.search.anchors) {
        if (typeof anchor !== 'string') {
          throw new Error(`Profile ${profileId}: invalid anchor in "search.anchors" (must be string)`);
        }
      }
    }
  }
  
  if (profile.rangePresets !== undefined) {
    if (typeof profile.rangePresets !== 'object' || Array.isArray(profile.rangePresets)) {
      throw new Error(`Profile ${profileId}: invalid "rangePresets" field (must be object)`);
    }
    for (const [name, ranges] of Object.entries(profile.rangePresets)) {
      if (!Array.isArray(ranges)) {
        throw new Error(`Profile ${profileId}: invalid range preset "${name}" (must be array)`);
      }
      for (const range of ranges) {
        if (typeof range !== 'string') {
          throw new Error(`Profile ${profileId}: invalid range in preset "${name}" (must be string)`);
        }
      }
    }
  }
  
  if (profile.notes !== undefined && typeof profile.notes !== 'string') {
    throw new Error(`Profile ${profileId}: invalid "notes" field (must be string)`);
  }
  
  // Resolve file path (relative to project root or absolute)
  let resolvedFile = profile.file;
  if (!resolvedFile.startsWith('/')) {
    resolvedFile = join(PROJECT_ROOT, resolvedFile);
  }
  
  return {
    ...profile,
    file: resolvedFile
  } as PdfProfile;
}

/**
 * List all available profile IDs
 */
export function listPdfProfiles(): string[] {
  if (!existsSync(PROFILES_DIR)) {
    return [];
  }
  
  const { readdirSync } = require('fs');
  const files = readdirSync(PROFILES_DIR);
  return files
    .filter((f: string) => f.endsWith('.json'))
    .map((f: string) => f.replace(/\.json$/, ''));
}

