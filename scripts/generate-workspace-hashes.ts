#!/usr/bin/env tsx

/**
 * Generate deterministic workspace hashes
 * 
 * Computes SHA256 hash of all content referenced by a workspace:
 * - catalog.json
 * - all section index pages (including pagination chain)
 * - all entry documents referenced by section index items
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = process.env.CONTENT_DIR || join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');

interface Manifest {
  schemaVersion?: number;
  activeVersion: string;
  activeWorkspace: string;
  workspaces: Record<string, string>;
  workspaceHashes?: Record<string, string>;
  minClientVersion?: string;
}

/**
 * Stable JSON stringify with sorted keys
 */
function stableStringify(obj: any): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Resolve content path from /v1/... path
 */
function resolveContentPath(jsonPath: string): string {
  const relativePath = jsonPath.replace(/^\/v1\//, '');
  return join(CONTENT_DIR, relativePath);
}

/**
 * Collect all files referenced by a section index (including pagination)
 */
function collectIndexFiles(indexPath: string, visited: Set<string> = new Set()): string[] {
  const files: string[] = [];
  
  if (visited.has(indexPath)) {
    return files; // Loop detected, skip
  }
  visited.add(indexPath);
  
  const resolvedPath = resolveContentPath(indexPath.replace(/^\/v1\//, ''));
  if (!existsSync(resolvedPath)) {
    return files;
  }
  
  files.push(resolvedPath);
  
  try {
    const content = readFileSync(resolvedPath, 'utf-8');
    const index = JSON.parse(content);
    
    if (typeof index.nextPage === 'string') {
      files.push(...collectIndexFiles(index.nextPage, visited));
    }
  } catch (err) {
    // Skip invalid JSON
  }
  
  return files;
}

/**
 * Collect all entry documents referenced by section indexes
 */
function collectEntryDocuments(workspace: string): string[] {
  const files: string[] = [];
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  
  if (!existsSync(catalogPath)) {
    return files;
  }
  
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    
    if (!Array.isArray(catalog.sections)) {
      return files;
    }
    
    const entryUrls = new Set<string>();
    
    // Collect all entryUrls from all sections
    for (const section of catalog.sections) {
      if (!section.itemsUrl || typeof section.itemsUrl !== 'string') {
        continue;
      }
      
      const indexFiles = collectIndexFiles(section.itemsUrl);
      
      for (const indexFile of indexFiles) {
        try {
          const index = JSON.parse(readFileSync(indexFile, 'utf-8'));
          if (Array.isArray(index.items)) {
            for (const item of index.items) {
              if (item.entryUrl && typeof item.entryUrl === 'string') {
                entryUrls.add(item.entryUrl);
              }
            }
          }
        } catch (err) {
          // Skip invalid index
        }
      }
    }
    
    // Resolve entry URLs to file paths
    for (const entryUrl of entryUrls) {
      const entryPath = resolveContentPath(entryUrl);
      if (existsSync(entryPath)) {
        files.push(entryPath);
      }
    }
  } catch (err) {
    // Skip invalid catalog
  }
  
  return files;
}

/**
 * Compute workspace hash
 */
function computeWorkspaceHash(workspace: string): string {
  const files: string[] = [];
  
  // 1. Add catalog.json
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  if (existsSync(catalogPath)) {
    files.push(catalogPath);
  }
  
  // 2. Add all section index files (including pagination)
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  if (Array.isArray(catalog.sections)) {
    for (const section of catalog.sections) {
      if (section.itemsUrl && typeof section.itemsUrl === 'string') {
        files.push(...collectIndexFiles(section.itemsUrl));
      }
    }
  }
  
  // 3. Add all entry documents
  files.push(...collectEntryDocuments(workspace));
  
  // Sort files lexicographically for stable ordering
  files.sort();
  
  // Compute hash of concatenated stable JSON
  const hash = createHash('sha256');
  
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const parsed = JSON.parse(content);
      const stable = stableStringify(parsed);
      hash.update(stable);
      hash.update('\n'); // Separator
    } catch (err) {
      throw new Error(`Failed to process file ${file}: ${err}`);
    }
  }
  
  return hash.digest('hex');
}

/**
 * Generate workspace hashes for all workspaces in manifest
 */
function generateWorkspaceHashes(manifestPath: string): Record<string, string> {
  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const hashes: Record<string, string> = {};
  
  if (!manifest.workspaces || typeof manifest.workspaces !== 'object') {
    throw new Error('Manifest missing workspaces');
  }
  
  for (const [workspace] of Object.entries(manifest.workspaces)) {
    try {
      hashes[workspace] = computeWorkspaceHash(workspace);
    } catch (err: any) {
      throw new Error(`Failed to compute hash for workspace ${workspace}: ${err.message}`);
    }
  }
  
  return hashes;
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const manifestPath = process.argv[2] || join(META_DIR, 'manifest.staging.json');
  
  if (!existsSync(manifestPath)) {
    console.error(`❌ Manifest not found: ${manifestPath}`);
    process.exit(1);
  }
  
  try {
    const hashes = generateWorkspaceHashes(manifestPath);
    console.log(JSON.stringify(hashes, null, 2));
  } catch (err: any) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

export { generateWorkspaceHashes, computeWorkspaceHash };

