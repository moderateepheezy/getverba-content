#!/usr/bin/env tsx

/**
 * PDF Ingestion Profile Loader
 * 
 * Loads and validates PDF ingestion profiles from imports/profiles/<pdfId>.json
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const PROFILES_DIR = join(PROJECT_ROOT, 'imports', 'profiles');

export interface PdfIngestionProfile {
  pdfId: string;
  language: 'de' | 'en';
  defaultScenarios: string[];
  anchors: string[];
  skipPages?: number[] | { ranges: string[] };
  preferPageRanges?: string[];
  windowSizePages?: number;
  minScenarioHits?: number;
  scoringTweaks?: {
    dialogueBonus?: number;
    headingPenalty?: number;
    tablePenalty?: number;
  };
  rejectSections?: string[];
}

/**
 * Load profile for a PDF ID
 */
export function loadProfile(pdfId: string): PdfIngestionProfile | null {
  const profilePath = join(PROFILES_DIR, `${pdfId}.json`);
  
  if (!existsSync(profilePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(content) as PdfIngestionProfile;
    
    // Validate required fields
    if (!profile.pdfId || !profile.language || !Array.isArray(profile.defaultScenarios) || !Array.isArray(profile.anchors)) {
      throw new Error(`Invalid profile: missing required fields`);
    }
    
    // Validate language
    if (profile.language !== 'de' && profile.language !== 'en') {
      throw new Error(`Invalid profile: language must be 'de' or 'en'`);
    }
    
    return profile;
  } catch (error: any) {
    throw new Error(`Failed to load profile ${pdfId}: ${error.message}`);
  }
}

/**
 * Load profile from explicit path
 */
export function loadProfileFromPath(profilePath: string): PdfIngestionProfile {
  if (!existsSync(profilePath)) {
    throw new Error(`Profile not found: ${profilePath}`);
  }
  
  try {
    const content = readFileSync(profilePath, 'utf-8');
    const profile = JSON.parse(content) as PdfIngestionProfile;
    
    // Validate required fields
    if (!profile.pdfId || !profile.language || !Array.isArray(profile.defaultScenarios) || !Array.isArray(profile.anchors)) {
      throw new Error(`Invalid profile: missing required fields`);
    }
    
    // Validate language
    if (profile.language !== 'de' && profile.language !== 'en') {
      throw new Error(`Invalid profile: language must be 'de' or 'en'`);
    }
    
    return profile;
  } catch (error: any) {
    throw new Error(`Failed to load profile from ${profilePath}: ${error.message}`);
  }
}

/**
 * Check if a page should be skipped based on profile
 */
export function shouldSkipPage(pageIndex: number, profile: PdfIngestionProfile): boolean {
  if (!profile.skipPages) {
    return false;
  }
  
  // Handle array of page numbers (0-indexed)
  if (Array.isArray(profile.skipPages)) {
    return profile.skipPages.includes(pageIndex);
  }
  
  // Handle ranges format: ["0-12", "350-380"]
  if (profile.skipPages.ranges && Array.isArray(profile.skipPages.ranges)) {
    for (const range of profile.skipPages.ranges) {
      const [start, end] = range.split('-').map(n => parseInt(n, 10));
      if (pageIndex >= start && pageIndex <= end) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if a page is in a preferred range
 */
export function isPreferredPage(pageIndex: number, profile: PdfIngestionProfile): boolean {
  if (!profile.preferPageRanges || profile.preferPageRanges.length === 0) {
    return true; // All pages are preferred if no preference specified
  }
  
  for (const range of profile.preferPageRanges) {
    const [start, end] = range.split('-').map(n => parseInt(n, 10));
    if (pageIndex >= start && pageIndex <= end) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a candidate should be rejected based on profile rejectSections
 */
export function shouldRejectCandidate(text: string, profile: PdfIngestionProfile): boolean {
  if (!profile.rejectSections || profile.rejectSections.length === 0) {
    return false;
  }
  
  const textLower = text.toLowerCase();
  for (const keyword of profile.rejectSections) {
    if (textLower.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Count anchor hits in text
 */
export function countAnchorHits(text: string, profile: PdfIngestionProfile): number {
  if (!profile.anchors || profile.anchors.length === 0) {
    return 0;
  }
  
  const textLower = text.toLowerCase();
  let hits = 0;
  for (const anchor of profile.anchors) {
    if (textLower.includes(anchor.toLowerCase())) {
      hits++;
    }
  }
  
  return hits;
}

