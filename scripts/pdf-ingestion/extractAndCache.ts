#!/usr/bin/env tsx

/**
 * PDF Extraction with Caching
 * 
 * Extracts PDF text and caches it to avoid re-extracting large PDFs repeatedly.
 * Cache key is based on file hash + extraction version.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { extractPdfTextTextFirst, type PageText, type ExtractionResult } from './extract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const CACHE_DIR = join(PROJECT_ROOT, 'content', 'meta', 'pdf-cache');

// Extraction version - increment this to invalidate all caches
const EXTRACTION_VERSION = '1.0.0';

export interface CachedExtraction {
  cacheKey: string;
  pdfId: string;
  pdfPath: string;
  extractedAt: string;
  extractionVersion: string;
  pages: PageText[];
  pageCount: number;
  totalChars: number;
  avgCharsPerPage: number;
}

/**
 * Compute cache key from PDF file
 */
export function computeCacheKey(pdfPath: string): string {
  const fileBytes = readFileSync(pdfPath);
  const fileHash = createHash('sha256').update(fileBytes).digest('hex').substring(0, 16);
  const versionHash = createHash('sha256').update(EXTRACTION_VERSION).digest('hex').substring(0, 8);
  return `${fileHash}-${versionHash}`;
}

/**
 * Get cache path for a profile ID and cache key
 */
export function getCachePath(profileId: string, cacheKey: string): string {
  const profileCacheDir = join(CACHE_DIR, profileId);
  mkdirSync(profileCacheDir, { recursive: true });
  return join(profileCacheDir, `${cacheKey}.json`);
}

/**
 * Load cached extraction if it exists
 */
export function loadCachedExtraction(profileId: string, cacheKey: string): CachedExtraction | null {
  const cachePath = getCachePath(profileId, cacheKey);
  
  if (!existsSync(cachePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(cachePath, 'utf-8');
    const cached = JSON.parse(content) as CachedExtraction;
    
    // Validate cache version
    if (cached.extractionVersion !== EXTRACTION_VERSION) {
      console.log(`   ⚠️  Cache version mismatch (${cached.extractionVersion} vs ${EXTRACTION_VERSION}), will re-extract`);
      return null;
    }
    
    return cached;
  } catch (error: any) {
    console.log(`   ⚠️  Failed to load cache: ${error.message}`);
    return null;
  }
}

/**
 * Save extraction to cache
 */
export function saveCachedExtraction(
  profileId: string,
  cacheKey: string,
  pdfPath: string,
  extraction: ExtractionResult
): string {
  const cachePath = getCachePath(profileId, cacheKey);
  
  const cached: CachedExtraction = {
    cacheKey,
    pdfId: profileId,
    pdfPath,
    extractedAt: new Date().toISOString(),
    extractionVersion: EXTRACTION_VERSION,
    pages: extraction.pages,
    pageCount: extraction.pageCount,
    totalChars: extraction.totalChars,
    avgCharsPerPage: extraction.avgCharsPerPage
  };
  
  writeFileSync(cachePath, JSON.stringify(cached, null, 2), 'utf-8');
  return cachePath;
}

/**
 * Extract PDF text with caching
 * 
 * @param pdfPath Path to PDF file
 * @param profileId Profile ID for cache organization
 * @param useCache Whether to use cache (default: true)
 * @param cacheKey Optional cache key (if not provided, computed from file)
 * @returns Extraction result and cache info
 */
export async function extractAndCache(
  pdfPath: string,
  profileId: string,
  useCache: boolean = true,
  cacheKey?: string
): Promise<{
  extraction: ExtractionResult;
  cacheKey: string;
  cachePath: string | null;
  fromCache: boolean;
}> {
  // Compute cache key
  const key = cacheKey || computeCacheKey(pdfPath);
  
  // Try to load from cache
  if (useCache) {
    const cached = loadCachedExtraction(profileId, key);
    if (cached) {
      console.log(`   ✓ Using cached extraction (${cached.pageCount} pages, ${cached.totalChars.toLocaleString()} chars)`);
      const cachePath = getCachePath(profileId, key);
      
      // Convert cached data back to ExtractionResult format
      const extraction: ExtractionResult = {
        pages: cached.pages,
        method: 'text', // Cached extractions are always text-based
        warnings: [],
        pageCount: cached.pageCount,
        totalChars: cached.totalChars,
        avgCharsPerPage: cached.avgCharsPerPage
      };
      
      return {
        extraction,
        cacheKey: key,
        cachePath,
        fromCache: true
      };
    }
  }
  
  // Extract from PDF
  console.log(`   📄 Extracting text from PDF...`);
  const extraction = await extractPdfTextTextFirst(pdfPath, false);
  console.log(`   ✓ Extracted ${extraction.pageCount} pages, ${extraction.totalChars.toLocaleString()} characters`);
  
  // Save to cache
  if (useCache) {
    const cachePath = saveCachedExtraction(profileId, key, pdfPath, extraction);
    console.log(`   💾 Cached extraction: ${cachePath}`);
    
    return {
      extraction,
      cacheKey: key,
      cachePath,
      fromCache: false
    };
  }
  
  return {
    extraction,
    cacheKey: key,
    cachePath: null,
    fromCache: false
  };
}

