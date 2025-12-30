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
      if (!item.title || typeof item.title !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: title (must be string)`);
      }
      if (!item.level || typeof item.level !== 'string' || item.level.trim() === '') {
        addError(indexPath, `Item ${idx} missing or invalid field: level (must be non-empty string)`);
      }
      if (!item.entryUrl || typeof item.entryUrl !== 'string') {
        addError(indexPath, `Item ${idx} missing or invalid field: entryUrl (must be string)`);
      } else {
        // Validate entryUrl format
        if (!item.entryUrl.startsWith('/v1/') || !item.entryUrl.endsWith('.json')) {
          addError(indexPath, `Item ${idx} entryUrl must start with /v1/ and end with .json`);
        } else {
          // Validate entryUrl matches canonical pattern based on kind
          const sectionKind = index.kind;
          const itemKind = item.kind || sectionKind; // Use item.kind if present, fallback to section kind
          validateEntryUrlPattern(item.entryUrl, item.id, itemKind || sectionKind, indexPath, idx);
          
          // Validate entryUrl file exists
          validateJsonPath(item.entryUrl, `items[${idx}].entryUrl`);
        }
      }
      // durationMinutes is optional but validate type if present
      if (item.durationMinutes !== undefined && typeof item.durationMinutes !== 'number') {
        addError(indexPath, `Item ${idx} durationMinutes must be a number if present`);
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

  // Validate manifest.json exists and is valid
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    addError(manifestPath, 'manifest.json not found in content/meta/');
  } else {
    validateManifest(manifestPath);
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

