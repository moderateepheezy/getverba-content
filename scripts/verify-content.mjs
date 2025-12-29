#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const BASE_URL = process.env.BASE_URL || 'https://getverba-content-api.simpumind-apps.workers.dev';

let failures = [];
let successes = [];

function curl(url) {
  try {
    const result = execSync(`curl -s -o /dev/null -w "%{http_code}" "${url}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return parseInt(result.trim(), 10);
  } catch (err) {
    return null;
  }
}

function verify(url, description) {
  console.log(`🔍 Checking: ${description}`);
  console.log(`   ${url}`);
  
  const statusCode = curl(url);
  
  if (statusCode === 200) {
    console.log(`   ✅ Status: ${statusCode}\n`);
    successes.push({ url, description, statusCode });
    return true;
  } else {
    console.log(`   ❌ Status: ${statusCode || 'FAILED'}\n`);
    failures.push({ url, description, statusCode });
    return false;
  }
}

function extractItemsUrls(catalog) {
  const urls = [];
  
  if (Array.isArray(catalog.sections)) {
    catalog.sections.forEach(section => {
      if (section.itemsUrl) {
        urls.push(section.itemsUrl);
      }
    });
  }
  
  return urls;
}

function extractPackUrls(index) {
  const urls = [];
  
  if (Array.isArray(index.items)) {
    index.items.forEach(item => {
      if (item.packUrl) {
        urls.push(item.packUrl);
      }
    });
  }
  
  return urls;
}

async function verifyAll() {
  console.log('🔍 Verifying content endpoints...\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  // 1. Health check
  verify(`${BASE_URL}/health`, 'Health endpoint');

  // 2. Catalog
  const catalogPath = join(CONTENT_DIR, 'workspaces', 'de', 'catalog.json');
  if (!existsSync(catalogPath)) {
    failures.push({ url: catalogPath, description: 'Local catalog.json not found', statusCode: null });
    console.error('❌ Local catalog.json not found');
  } else {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
    verify(`${BASE_URL}/v1/workspaces/de/catalog.json`, 'German workspace catalog');

    // 3. ItemsUrl endpoints from catalog
    const itemsUrls = extractItemsUrls(catalog);
    for (const itemsUrl of itemsUrls) {
      verify(`${BASE_URL}${itemsUrl}`, `ItemsUrl: ${itemsUrl}`);
      
      // Read the index file to get pack URLs
      const indexPath = join(CONTENT_DIR, itemsUrl.replace('/v1/', ''));
      if (existsSync(indexPath)) {
        const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
        const packUrls = extractPackUrls(index);
        
        // Verify first pack URL
        if (packUrls.length > 0) {
          verify(`${BASE_URL}${packUrls[0]}`, `Pack file: ${packUrls[0]}`);
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Verification Summary');
  console.log('='.repeat(50));
  console.log(`✅ Successful: ${successes.length}`);
  console.log(`❌ Failed: ${failures.length}`);
  
  if (failures.length > 0) {
    console.log('\n❌ Failed endpoints:');
    failures.forEach(f => {
      console.log(`   ${f.description}`);
      console.log(`   ${f.url}`);
      console.log(`   Status: ${f.statusCode || 'FAILED'}\n`);
    });
    console.error('\n❌ Verification failed');
    process.exit(1);
  } else {
    console.log('\n✅ All endpoints verified successfully!');
  }
}

verifyAll();

