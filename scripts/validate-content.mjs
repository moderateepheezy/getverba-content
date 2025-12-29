#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

let errors = [];
let warnings = [];

function validatePath(path) {
  if (!path.startsWith('/v1/')) {
    errors.push(`Path "${path}" must start with /v1/`);
    return false;
  }
  return true;
}

function validateCatalog(catalogPath) {
  try {
    const content = readFileSync(catalogPath, 'utf-8');
    const catalog = JSON.parse(content);

    // Required fields
    if (!catalog.workspace) errors.push(`Catalog missing "workspace" field`);
    if (!catalog.language) errors.push(`Catalog missing "language" field`);
    if (!Array.isArray(catalog.sections)) {
      errors.push(`Catalog "sections" must be an array`);
      return;
    }

    // Validate sections
    catalog.sections.forEach((section, idx) => {
      if (!section.id) errors.push(`Section ${idx} missing "id"`);
      if (!section.kind) errors.push(`Section ${idx} missing "kind"`);
      if (!section.title) errors.push(`Section ${idx} missing "title"`);
      if (!section.itemsUrl) {
        errors.push(`Section ${idx} missing "itemsUrl"`);
      } else {
        validatePath(section.itemsUrl);
        // Check if itemsUrl file exists
        const itemsPath = join(CONTENT_DIR, section.itemsUrl.replace('/v1/', ''));
        if (!existsSync(itemsPath)) {
          errors.push(`Section ${idx} itemsUrl "${section.itemsUrl}" file does not exist`);
        }
      }
    });

    return catalog;
  } catch (err) {
    errors.push(`Failed to parse catalog: ${err.message}`);
    return null;
  }
}

function validateIndex(indexPath) {
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content);

    if (!Array.isArray(index.items)) {
      errors.push(`Index file "${indexPath}" must have "items" array`);
      return;
    }

    // Validate each item
    index.items.forEach((item, idx) => {
      if (!item.id) errors.push(`Index item ${idx} missing "id"`);
      if (!item.title) errors.push(`Index item ${idx} missing "title"`);
      if (!item.type) errors.push(`Index item ${idx} missing "type"`);
      if (!item.level) errors.push(`Index item ${idx} missing "level"`);
      if (typeof item.durationMins !== 'number') {
        errors.push(`Index item ${idx} missing or invalid "durationMins"`);
      }
      if (!item.packUrl) {
        errors.push(`Index item ${idx} missing "packUrl"`);
      } else {
        validatePath(item.packUrl);
        // Check if pack file exists
        const packPath = join(CONTENT_DIR, item.packUrl.replace('/v1/', ''));
        if (!existsSync(packPath)) {
          errors.push(`Index item ${idx} packUrl "${item.packUrl}" file does not exist`);
        }
      }
    });

    return index;
  } catch (err) {
    errors.push(`Failed to parse index file "${indexPath}": ${err.message}`);
    return null;
  }
}

function validatePack(packPath) {
  try {
    const content = readFileSync(packPath, 'utf-8');
    const pack = JSON.parse(content);

    // Required fields
    if (!pack.id) errors.push(`Pack missing "id" field`);
    if (!pack.type) errors.push(`Pack missing "type" field`);
    if (!['context', 'exam', 'mechanics'].includes(pack.type)) {
      errors.push(`Pack type must be one of: context, exam, mechanics`);
    }
    if (!pack.title) errors.push(`Pack missing "title" field`);
    if (!pack.language) errors.push(`Pack missing "language" field`);
    if (!pack.level) errors.push(`Pack missing "level" field`);
    if (typeof pack.durationMins !== 'number') {
      errors.push(`Pack missing or invalid "durationMins" field`);
    }
    if (!Array.isArray(pack.tags)) {
      errors.push(`Pack "tags" must be an array`);
    }
    if (!Array.isArray(pack.items)) {
      errors.push(`Pack "items" must be an array`);
    }

    // Validate items array
    if (Array.isArray(pack.items)) {
      pack.items.forEach((item, idx) => {
        if (!item.id) errors.push(`Pack item ${idx} missing "id"`);
      });
    }

    return pack;
  } catch (err) {
    errors.push(`Failed to parse pack file "${packPath}": ${err.message}`);
    return null;
  }
}

function findJsonFiles(dir, fileList = []) {
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

// Main validation
function validate() {
  console.log('Validating content structure...\n');

  if (!existsSync(CONTENT_DIR)) {
    errors.push(`Content directory "${CONTENT_DIR}" does not exist`);
    console.error('❌ Validation failed');
    process.exit(1);
  }

  // Find all JSON files
  const jsonFiles = findJsonFiles(CONTENT_DIR);

  // Validate catalogs
  const catalogFiles = jsonFiles.filter(f => f.includes('catalog.json'));
  catalogFiles.forEach(catalogPath => {
    validateCatalog(catalogPath);
  });

  // Validate index files
  const indexFiles = jsonFiles.filter(f => f.includes('index.json') && !f.includes('catalog.json'));
  indexFiles.forEach(indexPath => {
    validateIndex(indexPath);
  });

  // Validate pack files
  const packFiles = jsonFiles.filter(f => f.includes('packs/'));
  packFiles.forEach(packPath => {
    validatePack(packPath);
  });

  // Report results
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(w => console.log(`   ${w}`));
    console.log();
  }

  if (errors.length > 0) {
    console.error('❌ Validation errors:');
    errors.forEach(e => console.error(`   ${e}`));
    console.error('\n❌ Validation failed');
    process.exit(1);
  }

  console.log('✅ All content files are valid!');
  console.log(`   Validated ${jsonFiles.length} JSON files`);
}

validate();

