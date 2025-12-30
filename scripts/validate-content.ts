#!/usr/bin/env tsx

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');

interface ValidationError {
  file: string;
  message: string;
}

const errors: ValidationError[] = [];

function addError(file: string, message: string) {
  errors.push({ file, message });
}

function isValidJsonPath(path: string): boolean {
  return typeof path === 'string' && path.endsWith('.json') && path.startsWith('/v1/');
}

function resolveContentPath(jsonPath: string): string {
  // Remove /v1/ prefix and resolve relative to content/v1
  const relativePath = jsonPath.replace(/^\/v1\//, '');
  return join(CONTENT_DIR, relativePath);
}

function validateEntryUrlPattern(entryUrl: string, itemId: string, kind: string, filePath: string, itemIdx: number): void {
  // Normalize kind to canonical form
  const normalizedKind = kind.toLowerCase();
  
  // Determine expected pattern based on kind
  let expectedPattern: RegExp;
  let expectedSuffix: string;
  
  if (normalizedKind === 'context' || normalizedKind === 'pack') {
    // Pack pattern: /v1/workspaces/{workspace}/packs/{packId}/pack.json
    expectedPattern = /^\/v1\/workspaces\/[^/]+\/packs\/[^/]+\/pack\.json$/;
    expectedSuffix = '/pack.json';
  } else if (normalizedKind === 'exams' || normalizedKind === 'exam') {
    // Exam pattern: /v1/workspaces/{workspace}/exams/{examId}/exam.json
    expectedPattern = /^\/v1\/workspaces\/[^/]+\/exams\/[^/]+\/exam\.json$/;
    expectedSuffix = '/exam.json';
  } else if (normalizedKind === 'drills' || normalizedKind === 'drill') {
    // Drill pattern: /v1/workspaces/{workspace}/drills/{drillId}/drill.json
    expectedPattern = /^\/v1\/workspaces\/[^/]+\/drills\/[^/]+\/drill\.json$/;
    expectedSuffix = '/drill.json';
  } else {
    // Unknown kind - skip pattern validation but warn
    return;
  }
  
  // Check if entryUrl matches expected pattern
  if (!expectedPattern.test(entryUrl)) {
    addError(filePath, `Item ${itemIdx} entryUrl does not match canonical pattern for kind "${kind}". Expected pattern: /v1/workspaces/{workspace}/${normalizedKind === 'context' || normalizedKind === 'pack' ? 'packs' : normalizedKind === 'exams' || normalizedKind === 'exam' ? 'exams' : 'drills'}/{id}/${normalizedKind === 'context' || normalizedKind === 'pack' ? 'pack' : normalizedKind === 'exams' || normalizedKind === 'exam' ? 'exam' : 'drill'}.json`);
    return;
  }
  
  // Extract packId/examId/drillId from URL and verify it matches item.id
  // URL format: /v1/workspaces/{workspace}/{type}/{id}/{file}.json
  const urlParts = entryUrl.split('/');
  const typeIndex = urlParts.indexOf(normalizedKind === 'context' || normalizedKind === 'pack' ? 'packs' : normalizedKind === 'exams' || normalizedKind === 'exam' ? 'exams' : 'drills');
  if (typeIndex >= 0 && typeIndex < urlParts.length - 2) {
    const urlId = urlParts[typeIndex + 1];
    // Normalize IDs for comparison (case-insensitive, handle kebab-case)
    const normalizedUrlId = urlId.toLowerCase().replace(/-/g, '_');
    const normalizedItemId = itemId.toLowerCase().replace(/-/g, '_');
    
    if (normalizedUrlId !== normalizedItemId) {
      addError(filePath, `Item ${itemIdx} entryUrl contains ID "${urlId}" but item.id is "${itemId}". They should match (case-insensitive).`);
    }
  }
}

function validateEntryDocument(entryPath: string, kind: string, contextFile: string, itemIdx: number): void {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entry = JSON.parse(content);
    
    const normalizedKind = kind.toLowerCase();
    
    // Common required fields for all entry types
    if (!entry.id || typeof entry.id !== 'string') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: id (must be string)`);
    }
    if (!entry.kind || typeof entry.kind !== 'string') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: kind (must be string)`);
    } else if (entry.kind.toLowerCase() !== normalizedKind) {
      addError(contextFile, `Item ${itemIdx} entry document kind "${entry.kind}" does not match item kind "${kind}"`);
    }
    if (!entry.title || typeof entry.title !== 'string') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: title (must be string)`);
    } else if (entry.title.length > MAX_TITLE_LENGTH) {
      addError(contextFile, `Item ${itemIdx} entry document title is too long (${entry.title.length} chars). Max is ${MAX_TITLE_LENGTH} chars.`);
    }
    if (typeof entry.estimatedMinutes !== 'number') {
      addError(contextFile, `Item ${itemIdx} entry document missing or invalid field: estimatedMinutes (must be number)`);
    } else if (entry.estimatedMinutes < MIN_DURATION_MINUTES || entry.estimatedMinutes > MAX_DURATION_MINUTES) {
      addError(contextFile, `Item ${itemIdx} entry document estimatedMinutes (${entry.estimatedMinutes}) is outside valid range [${MIN_DURATION_MINUTES}-${MAX_DURATION_MINUTES}]`);
    }
    
    // Validate level is CEFR if present
    if (entry.level && typeof entry.level === 'string') {
      if (!VALID_CEFR_LEVELS.includes(entry.level.toUpperCase())) {
        addError(contextFile, `Item ${itemIdx} entry document level "${entry.level}" is not a valid CEFR level. Must be one of: ${VALID_CEFR_LEVELS.join(', ')}`);
      }
    }
    
    // Pack-specific validation
    if (normalizedKind === 'pack') {
      if (!entry.description || typeof entry.description !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: description (must be string)`);
      }
      if (!Array.isArray(entry.outline) || entry.outline.length === 0) {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: outline (must be non-empty array)`);
      }
      
      // Validate sessionPlan (required for packs)
      if (!entry.sessionPlan || typeof entry.sessionPlan !== 'object') {
        addError(contextFile, `Item ${itemIdx} pack entry missing or invalid field: sessionPlan (must be object)`);
      } else {
        // Validate sessionPlan.version
        if (entry.sessionPlan.version !== 1) {
          addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.version must be 1`);
        }
        
        // Validate sessionPlan.steps
        if (!Array.isArray(entry.sessionPlan.steps) || entry.sessionPlan.steps.length === 0) {
          addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps must be a non-empty array`);
        } else {
          entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
            if (!step.id || typeof step.id !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] missing or invalid field: id (must be string)`);
            }
            if (!step.title || typeof step.title !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] missing or invalid field: title (must be string)`);
            }
            if (!Array.isArray(step.promptIds) || step.promptIds.length === 0) {
              addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] missing or invalid field: promptIds (must be non-empty array)`);
            } else {
              // Validate each promptId is a string
              step.promptIds.forEach((promptId: any, pIdIdx: number) => {
                if (typeof promptId !== 'string') {
                  addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}].promptIds[${pIdIdx}] must be a string`);
                }
              });
            }
          });
          
          // Validate that all referenced promptIds exist in prompts array
          if (entry.prompts && Array.isArray(entry.prompts)) {
            const promptIds = new Set(entry.prompts.map((p: any) => p.id).filter(Boolean));
            entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
              if (Array.isArray(step.promptIds)) {
                step.promptIds.forEach((promptId: string) => {
                  if (!promptIds.has(promptId)) {
                    addError(contextFile, `Item ${itemIdx} pack entry sessionPlan.steps[${sIdx}] references promptId "${promptId}" which does not exist in prompts array`);
                  }
                });
              }
            });
          } else if (entry.promptsUrl) {
            // If promptsUrl is used, we can't validate promptIds exist (they're in external file)
            // This is acceptable - frontend will need to load promptsUrl and validate
          } else {
            // No prompts and no promptsUrl - can't validate promptIds
            addError(contextFile, `Item ${itemIdx} pack entry has sessionPlan but no prompts array or promptsUrl. Prompts are required when sessionPlan references promptIds.`);
          }
          
          // Warn if outline.length doesn't match steps.length (non-fatal)
          if (Array.isArray(entry.outline) && entry.outline.length !== entry.sessionPlan.steps.length) {
            // This is a warning, not an error - we'll just log it
            console.warn(`⚠️  Item ${itemIdx} pack entry outline.length (${entry.outline.length}) does not match sessionPlan.steps.length (${entry.sessionPlan.steps.length}). This is allowed but may indicate a mismatch.`);
          }
        }
      }
      
      // Prompts are optional but if present, validate structure
      if (entry.prompts !== undefined) {
        if (!Array.isArray(entry.prompts)) {
          addError(contextFile, `Item ${itemIdx} pack entry prompts must be an array if present`);
        } else {
          entry.prompts.forEach((prompt: any, pIdx: number) => {
            if (!prompt.id || typeof prompt.id !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: id`);
            }
            if (!prompt.text || typeof prompt.text !== 'string') {
              addError(contextFile, `Item ${itemIdx} pack entry prompt ${pIdx} missing or invalid field: text`);
            }
          });
        }
      }
      // If promptsUrl is used instead, validate it's a string
      if (entry.promptsUrl !== undefined && typeof entry.promptsUrl !== 'string') {
        addError(contextFile, `Item ${itemIdx} pack entry promptsUrl must be a string if present`);
      }
    }
    
    // Exam-specific validation
    if (normalizedKind === 'exam') {
      if (!entry.level || typeof entry.level !== 'string') {
        addError(contextFile, `Item ${itemIdx} exam entry missing or invalid field: level (must be string)`);
      }
      // Description is optional for exams
      if (entry.description !== undefined && typeof entry.description !== 'string') {
        addError(contextFile, `Item ${itemIdx} exam entry description must be a string if present`);
      }
    }
    
    // Drill-specific validation
    if (normalizedKind === 'drill') {
      // Level is optional for drills
      if (entry.level !== undefined && typeof entry.level !== 'string') {
        addError(contextFile, `Item ${itemIdx} drill entry level must be a string if present`);
      }
      // Description is optional for drills
      if (entry.description !== undefined && typeof entry.description !== 'string') {
        addError(contextFile, `Item ${itemIdx} drill entry description must be a string if present`);
      }
    }
  } catch (err: any) {
    addError(contextFile, `Item ${itemIdx} entry document validation failed: ${err.message}`);
  }
}

function validateJsonPath(path: string, context: string): void {
  if (!isValidJsonPath(path)) {
    return; // Not a JSON path, skip
  }

  const resolvedPath = resolveContentPath(path);
  if (!existsSync(resolvedPath)) {
    addError(context, `Referenced path does not exist: ${path} (resolved to: ${resolvedPath})`);
  }
}

function validateJsonPaths(obj: any, context: string): void {
  if (typeof obj !== 'object' || obj === null) {
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      if (typeof item === 'string' && isValidJsonPath(item)) {
        validateJsonPath(item, `${context}[${idx}]`);
      } else if (typeof item === 'object') {
        validateJsonPaths(item, `${context}[${idx}]`);
      }
    });
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const newContext = context ? `${context}.${key}` : key;

      if (typeof value === 'string' && isValidJsonPath(value)) {
        validateJsonPath(value, newContext);
      } else if (Array.isArray(value)) {
        value.forEach((item, idx) => {
          if (typeof item === 'string' && isValidJsonPath(item)) {
            validateJsonPath(item, `${newContext}[${idx}]`);
          } else if (typeof item === 'object') {
            validateJsonPaths(item, `${newContext}[${idx}]`);
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        validateJsonPaths(value, newContext);
      }
    }
  }
}

function findJsonFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  files.forEach(file => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function validateCatalog(catalogPath: string): void {
  try {
    const content = readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(content);

    // Validate required fields
    if (!catalog.workspace) {
      addError(catalogPath, 'Missing required field: workspace');
    }
    // Accept either old schema (language) or new schema (languageCode + languageName)
    if (!catalog.language && (!catalog.languageCode || !catalog.languageName)) {
      addError(catalogPath, 'Missing required field: either "language" (old schema) or both "languageCode" and "languageName" (new schema)');
    }
    if (!Array.isArray(catalog.sections)) {
      addError(catalogPath, 'Missing or invalid field: sections (must be an array)');
      return;
    }

    // Validate sections
    catalog.sections.forEach((section: any, idx: number) => {
      if (!section.id || typeof section.id !== 'string') {
        addError(catalogPath, `Section ${idx} missing or invalid field: id (must be string)`);
      }
      if (!section.kind || typeof section.kind !== 'string') {
        addError(catalogPath, `Section ${idx} missing or invalid field: kind (must be string)`);
      }
      if (!section.title || typeof section.title !== 'string') {
        addError(catalogPath, `Section ${idx} missing or invalid field: title (must be string)`);
      }
    });

    // Validate JSON paths in catalog
    validateJsonPaths(catalog, `catalog.json`);
  } catch (err: any) {
    addError(catalogPath, `Failed to parse JSON: ${err.message}`);
  }
}

// Valid CEFR levels
const VALID_CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Reasonable duration bounds
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 120;

// Title length bounds
const MAX_TITLE_LENGTH = 100;

function validateCefrLevel(level: string, context: string, itemIdx: number): void {
  if (!VALID_CEFR_LEVELS.includes(level.toUpperCase())) {
    addError(context, `Item ${itemIdx} level "${level}" is not a valid CEFR level. Must be one of: ${VALID_CEFR_LEVELS.join(', ')}`);
  }
}

function validateDuration(minutes: number, context: string, itemIdx: number, fieldName: string): void {
  if (minutes < MIN_DURATION_MINUTES || minutes > MAX_DURATION_MINUTES) {
    addError(context, `Item ${itemIdx} ${fieldName} (${minutes}) is outside valid range [${MIN_DURATION_MINUTES}-${MAX_DURATION_MINUTES}]`);
  }
}

function validateTitle(title: string, context: string, itemIdx: number): void {
  if (title.length > MAX_TITLE_LENGTH) {
    addError(context, `Item ${itemIdx} title is too long (${title.length} chars). Max is ${MAX_TITLE_LENGTH} chars.`);
  }
}

interface PaginationResult {
  totalItems: number;
  allItemIds: Set<string>;
  pageCount: number;
}

interface FirstPageMeta {
  version: string;
  kind: string;
  pageSize: number;
  total: number;
}

/**
 * Validate pagination chain from first page
 * Enforces all invariants across pages
 */
function validatePaginationChain(
  firstPagePath: string,
  firstPageMeta: FirstPageMeta
): PaginationResult {
  const result: PaginationResult = { totalItems: 0, allItemIds: new Set<string>(), pageCount: 0 };
  const visitedPages = new Set<string>();
  
  let currentPath: string | null = firstPagePath;
  
  while (currentPath) {
    // Loop detection
    if (visitedPages.has(currentPath)) {
      addError(currentPath, 'Circular reference detected in nextPage chain (loop)');
      break;
    }
    visitedPages.add(currentPath);
    result.pageCount++;
    
    // Resolve path
    const resolvedPath = resolveContentPath(currentPath.replace(/^\/v1\//, ''));
    
    if (!existsSync(resolvedPath)) {
      addError(firstPagePath, `nextPage chain broken: file not found at ${currentPath}`);
      break;
    }
    
    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      const page = JSON.parse(content);
      
      // Validate invariants match first page (only for pages after first)
      if (result.pageCount > 1) {
        if (page.version !== firstPageMeta.version) {
          addError(resolvedPath, `Pagination invariant violation: version "${page.version}" differs from first page "${firstPageMeta.version}"`);
        }
        if (page.kind !== firstPageMeta.kind) {
          addError(resolvedPath, `Pagination invariant violation: kind "${page.kind}" differs from first page "${firstPageMeta.kind}"`);
        }
        if (page.pageSize !== firstPageMeta.pageSize) {
          addError(resolvedPath, `Pagination invariant violation: pageSize ${page.pageSize} differs from first page ${firstPageMeta.pageSize}`);
        }
        if (page.total !== firstPageMeta.total) {
          addError(resolvedPath, `Pagination invariant violation: total ${page.total} differs from first page ${firstPageMeta.total}`);
        }
      }
      
      // Collect items and check for duplicates
      if (Array.isArray(page.items)) {
        page.items.forEach((item: any) => {
          if (item.id) {
            if (result.allItemIds.has(item.id)) {
              addError(resolvedPath, `Duplicate item ID "${item.id}" found across pagination pages`);
            }
            result.allItemIds.add(item.id);
          }
        });
        result.totalItems += page.items.length;
      }
      
      // Move to next page
      if (typeof page.nextPage === 'string') {
        // Validate nextPage format
        if (!page.nextPage.startsWith('/v1/')) {
          addError(resolvedPath, `nextPage "${page.nextPage}" must start with /v1/`);
          break;
        }
        if (!page.nextPage.endsWith('.json')) {
          addError(resolvedPath, `nextPage "${page.nextPage}" must end with .json`);
          break;
        }
        currentPath = page.nextPage;
      } else {
        currentPath = null;
      }
      
      // Soft warning: last page has fewer items than pageSize
      if (currentPath === null && Array.isArray(page.items) && page.items.length < page.pageSize) {
        // This is normal for last page - could add a debug log if needed
      }
      
    } catch (err: any) {
      addError(resolvedPath, `Failed to parse pagination page: ${err.message}`);
      break;
    }
  }
  
  // Validate total matches actual item count
  if (result.totalItems !== firstPageMeta.total) {
    addError(firstPagePath, `Pagination total mismatch: declared total is ${firstPageMeta.total} but actual item count across ${result.pageCount} page(s) is ${result.totalItems}`);
  }
  
  // Soft warning: tiny pageSize with large total
  if (firstPageMeta.total > 100 && firstPageMeta.pageSize < 10) {
    console.warn(`⚠️  ${firstPagePath}: Large total (${firstPageMeta.total}) with small pageSize (${firstPageMeta.pageSize}) - consider increasing pageSize`);
  }
  
  return result;
}

/**
 * Validate pagination across all pages of an index (legacy wrapper)
 * Returns: { totalItems: number, allItemIds: Set<string> }
 */
function validatePaginatedIndex(indexPath: string, visitedPages: Set<string> = new Set()): { totalItems: number; allItemIds: Set<string> } {
  const result = { totalItems: 0, allItemIds: new Set<string>() };
  
  if (visitedPages.has(indexPath)) {
    addError(indexPath, 'Circular reference detected in nextPage chain');
    return result;
  }
  visitedPages.add(indexPath);
  
  try {
    const resolvedPath = resolveContentPath(indexPath.replace(/^\/v1\//, ''));
    if (!existsSync(resolvedPath)) {
      return result;
    }
    
    const content = readFileSync(resolvedPath, 'utf-8');
    const index = JSON.parse(content);
    
    if (Array.isArray(index.items)) {
      index.items.forEach((item: any) => {
        if (item.id) {
          if (result.allItemIds.has(item.id)) {
            addError(indexPath, `Duplicate item ID "${item.id}" found across pagination pages`);
          }
          result.allItemIds.add(item.id);
        }
      });
      result.totalItems += index.items.length;
    }
    
    // Follow nextPage recursively
    if (typeof index.nextPage === 'string') {
      const nextResult = validatePaginatedIndex(index.nextPage, visitedPages);
      result.totalItems += nextResult.totalItems;
      nextResult.allItemIds.forEach(id => {
        if (result.allItemIds.has(id)) {
          addError(indexPath, `Duplicate item ID "${id}" found across pagination pages`);
        }
        result.allItemIds.add(id);
      });
    }
    
    return result;
  } catch (err: any) {
    return result;
  }
}

function validateIndex(indexPath: string): void {
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content);

    // Validate required fields
    if (!index.version || typeof index.version !== 'string') {
      addError(indexPath, 'Missing or invalid field: version (must be string)');
    }
    if (!index.kind || typeof index.kind !== 'string') {
      addError(indexPath, 'Missing or invalid field: kind (must be string)');
    }
    if (typeof index.total !== 'number') {
      addError(indexPath, 'Missing or invalid field: total (must be number)');
    }
    if (typeof index.pageSize !== 'number') {
      addError(indexPath, 'Missing or invalid field: pageSize (must be number)');
    }
    if (!Array.isArray(index.items)) {
      addError(indexPath, 'Missing or invalid field: items (must be an array)');
      return;
    }

    // Validate nextPage
    if (index.nextPage !== null && typeof index.nextPage !== 'string') {
      addError(indexPath, 'Invalid field: nextPage (must be null or string)');
    }

    // Validate items
    index.items.forEach((item: any, idx: number) => {
      if (!item.id || typeof item.id !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: id (must be string)`);
      }
      if (!item.kind || typeof item.kind !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: kind (must be string: "pack", "exam", or "drill")`);
      } else {
        // Validate kind is one of the allowed values
        const validKinds = ['pack', 'exam', 'drill'];
        if (!validKinds.includes(item.kind.toLowerCase())) {
          addError(indexPath, `Item ${idx} kind must be one of: "pack", "exam", "drill"`);
        }
      }
      if (!item.title || typeof item.title !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: title (must be string)`);
      } else {
        // Validate title length
        validateTitle(item.title, indexPath, idx);
      }
      if (!item.level || typeof item.level !== 'string' || item.level.trim() === '') {
        addError(indexPath, `Item ${idx} missing or invalid field: level (must be non-empty string)`);
      } else {
        // Validate CEFR level
        validateCefrLevel(item.level, indexPath, idx);
      }
      if (!item.entryUrl || typeof item.entryUrl !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: entryUrl (must be string)`);
      } else {
        // Validate entryUrl format
        if (!item.entryUrl.startsWith('/v1/') || !item.entryUrl.endsWith('.json')) {
          addError(indexPath, `Item ${idx} entryUrl must start with /v1/ and end with .json`);
        } else {
          // Validate entryUrl matches canonical pattern based on kind
          const itemKind = item.kind || index.kind; // Prefer item.kind, fallback to section kind
          validateEntryUrlPattern(item.entryUrl, item.id, itemKind, indexPath, idx);
          
          // Validate entryUrl file exists
          validateJsonPath(item.entryUrl, `items[${idx}].entryUrl`);
          
          // Validate entry document schema
          const entryPath = resolveContentPath(item.entryUrl);
          if (existsSync(entryPath)) {
            validateEntryDocument(entryPath, item.kind, indexPath, idx);
          }
        }
      }
      // durationMinutes - validate type and bounds
      if (item.durationMinutes !== undefined) {
        if (typeof item.durationMinutes !== 'number') {
          addError(indexPath, `Item ${idx} durationMinutes must be a number if present`);
        } else {
          validateDuration(item.durationMinutes, indexPath, idx, 'durationMinutes');
        }
      }
    });

    // Validate nextPage file exists if it's a string
    if (typeof index.nextPage === 'string') {
      if (!index.nextPage.startsWith('/v1/') || !index.nextPage.endsWith('.json')) {
        addError(indexPath, 'nextPage must start with /v1/ and end with .json');
      } else {
        validateJsonPath(index.nextPage, 'nextPage');
      }
    }
    
    // For first page (index.json), validate entire pagination chain with full invariants
    if (indexPath.endsWith('index.json') && !indexPath.includes('.page')) {
      const relPath = '/v1/' + relative(CONTENT_DIR, indexPath).replace(/\\/g, '/');
      
      // Use full pagination chain validation with invariant checks
      const firstPageMeta: FirstPageMeta = {
        version: index.version || '',
        kind: index.kind || '',
        pageSize: index.pageSize || 0,
        total: index.total || 0
      };
      
      const paginationResult = validatePaginationChain(relPath, firstPageMeta);
      
      // Log pagination stats for multi-page indexes
      if (paginationResult.pageCount > 1) {
        console.log(`   📄 ${relPath}: ${paginationResult.pageCount} pages, ${paginationResult.totalItems} items`);
      }
    }
  } catch (err: any) {
    addError(indexPath, `Failed to parse JSON: ${err.message}`);
  }
}

function validateJsonFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8');
    JSON.parse(content);
  } catch (err: any) {
    addError(filePath, `Invalid JSON: ${err.message}`);
  }
}

function validateManifest(manifestPath: string): void {
  try {
    const content = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);

    // Validate required fields
    if (!manifest.activeVersion) {
      addError(manifestPath, 'Missing required field: activeVersion');
    }
    // activeWorkspace is optional (defaults to first workspace if not provided)
    if (!manifest.workspaces || typeof manifest.workspaces !== 'object') {
      addError(manifestPath, 'Missing or invalid field: workspaces (must be an object)');
      return;
    }

    // Validate that referenced catalog paths exist
    for (const [workspaceId, catalogPath] of Object.entries(manifest.workspaces)) {
      if (typeof catalogPath !== 'string') {
        addError(manifestPath, `Workspace "${workspaceId}" catalog path must be a string`);
        continue;
      }

      if (!catalogPath.startsWith('/v1/') || !catalogPath.endsWith('.json')) {
        addError(manifestPath, `Workspace "${workspaceId}" catalog path must start with /v1/ and end with .json`);
        continue;
      }

      // Resolve path relative to content/v1
      const relativePath = catalogPath.replace(/^\/v1\//, '');
      const fullPath = join(CONTENT_DIR, relativePath);

      if (!existsSync(fullPath)) {
        addError(manifestPath, `Workspace "${workspaceId}" catalog path "${catalogPath}" does not exist (resolved to: ${fullPath})`);
      }
    }
  } catch (err: any) {
    addError(manifestPath, `Failed to parse JSON: ${err.message}`);
  }
}

function main() {
  console.log('Validating content structure...\n');

  if (!existsSync(CONTENT_DIR)) {
    console.error(`❌ Content directory not found: ${CONTENT_DIR}`);
    process.exit(1);
  }

  // Validate manifest.json exists and is valid (production)
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    addError(manifestPath, 'manifest.json not found in content/meta/');
  } else {
    validateManifest(manifestPath);
  }

  // Validate manifest.staging.json exists and is valid (staging)
  const stagingManifestPath = join(META_DIR, 'manifest.staging.json');
  if (!existsSync(stagingManifestPath)) {
    addError(stagingManifestPath, 'manifest.staging.json not found in content/meta/');
  } else {
    validateManifest(stagingManifestPath);
  }

  // Validate release.json exists
  const releasePath = join(META_DIR, 'release.json');
  if (!existsSync(releasePath)) {
    addError(releasePath, 'release.json not found in content/meta/');
  } else {
    validateJsonFile(releasePath);
  }

  // Find all JSON files
  const jsonFiles = findJsonFiles(CONTENT_DIR);

  if (jsonFiles.length === 0) {
    console.error('❌ No JSON files found in content/v1/');
    process.exit(1);
  }

  // Validate all JSON files parse correctly
  jsonFiles.forEach(file => {
    validateJsonFile(file);
  });

  // Validate index files (index.json under workspaces)
  const indexFiles = jsonFiles.filter(file => {
    const relPath = relative(CONTENT_DIR, file);
    return relPath.includes('workspaces/') && file.endsWith('index.json');
  });

  indexFiles.forEach(file => {
    validateIndex(file);
  });

  // Find and validate workspace catalogs
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  if (!existsSync(workspacesDir)) {
    addError(workspacesDir, 'workspaces directory not found');
  } else {
    const workspaces = readdirSync(workspacesDir).filter(item => {
      const itemPath = join(workspacesDir, item);
      return statSync(itemPath).isDirectory();
    });

    if (workspaces.length === 0) {
      addError(workspacesDir, 'No workspace directories found');
    } else {
      // Validate each workspace catalog
      workspaces.forEach(workspace => {
        const catalogPath = join(workspacesDir, workspace, 'catalog.json');
        if (!existsSync(catalogPath)) {
          addError(catalogPath, `Workspace "${workspace}" missing catalog.json`);
        } else {
          validateCatalog(catalogPath);
        }
      });
    }
  }

  // Report results
  if (errors.length > 0) {
    console.error('❌ Validation errors:\n');
    errors.forEach(err => {
      const relPath = relative(process.cwd(), err.file);
      console.error(`   ${relPath}: ${err.message}`);
    });
    console.error(`\n❌ Validation failed with ${errors.length} error(s)`);
    process.exit(1);
  }

  console.log('✅ All content files are valid!');
  console.log(`   Validated ${jsonFiles.length} JSON file(s)`);
  if (indexFiles.length > 0) {
    console.log(`   Validated ${indexFiles.length} index file(s) with pagination schema`);
  }
}

main();

