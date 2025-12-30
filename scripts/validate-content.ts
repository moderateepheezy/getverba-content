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
}

main();

