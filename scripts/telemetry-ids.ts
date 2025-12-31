#!/usr/bin/env tsx

/**
 * Telemetry ID Utilities
 * 
 * Provides deterministic functions for computing stable content identifiers
 * and revision tracking for telemetry readiness.
 */

import { createHash } from 'crypto';

/**
 * Normalize entry JSON for hashing by:
 * - Removing review fields (reviewedAt, reviewer) that change on approval
 * - Sorting object keys for deterministic ordering
 * - Excluding provenance timestamps (generatedAt) from content hash
 */
function normalizeEntryForHash(entry: any): any {
  const normalized = { ...entry };
  
  // Remove review fields that change on approval (but keep status)
  if (normalized.review) {
    const review = { ...normalized.review };
    delete review.reviewedAt;
    delete review.reviewer;
    normalized.review = review;
  }
  
  // Remove provenance timestamps (but keep source/sourceRef/extractorVersion)
  if (normalized.provenance) {
    const provenance = { ...normalized.provenance };
    delete provenance.generatedAt;
    normalized.provenance = provenance;
  }
  
  return normalized;
}

/**
 * Stable JSON stringify with sorted keys for deterministic hashing
 */
function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => stableStringify(item)).join(',') + ']';
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(key => {
      return JSON.stringify(key) + ':' + stableStringify(obj[key]);
    });
    return '{' + pairs.join(',') + '}';
  }
  
  return JSON.stringify(obj);
}

/**
 * Compute SHA256 hash of normalized entry JSON
 */
export function computeContentHash(entry: any): string {
  const normalized = normalizeEntryForHash(entry);
  const jsonString = stableStringify(normalized);
  const hash = createHash('sha256');
  hash.update(jsonString);
  return hash.digest('hex');
}

/**
 * Derive revision ID from content hash (first 12 characters)
 */
export function deriveRevisionId(contentHash: string): string {
  return contentHash.substring(0, 12);
}

/**
 * Generate stable content ID from workspace, kind, and entry id
 * Format: {workspace}:{kind}:{id}
 * 
 * Example: "de:pack:work_1"
 */
export function generateContentId(workspace: string, kind: string, entryId: string): string {
  // Normalize kind (pack -> pack, drill -> drill, exam -> exam)
  const normalizedKind = kind.toLowerCase();
  if (!['pack', 'drill', 'exam'].includes(normalizedKind)) {
    throw new Error(`Invalid kind for contentId: ${kind}. Must be pack, drill, or exam.`);
  }
  
  return `${workspace}:${normalizedKind}:${entryId}`;
}

/**
 * Compute all telemetry identifiers for an entry
 */
export function computeTelemetryIds(
  entry: any,
  workspace: string
): { contentId: string; contentHash: string; revisionId: string } {
  const contentId = generateContentId(workspace, entry.kind, entry.id);
  const contentHash = computeContentHash(entry);
  const revisionId = deriveRevisionId(contentHash);
  
  return { contentId, contentHash, revisionId };
}

