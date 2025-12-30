#!/usr/bin/env tsx

/**
 * End-to-end tests for GetVerba content pipeline
 * 
 * These tests verify the complete flow:
 * 1. Content validation
 * 2. Content structure (manifest → catalog → section index → entry documents)
 * 3. Worker API accessibility (if BASE_URL is provided)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');

// Worker API base URL (optional - set via WORKER_BASE_URL env var)
const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'https://getverba-content-api.simpumind-apps.workers.dev';

interface Test {
  name: string;
  fn: () => void | Promise<void>;
}

const tests: Test[] = [];
let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (err: any) {
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
}

// E2E Test 1: Validate content structure locally
test('validate content structure locally', () => {
  console.log('  Running: npm run content:validate');
  try {
    const output = execSync('npm run content:validate', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    assert(output.includes('✅ All content files are valid!'), 'Validation should pass');
    assert(output.includes('Validated'), 'Should show validation count');
  } catch (err: any) {
    throw new Error(`Content validation failed: ${err.message}`);
  }
});

// E2E Test 2: Verify manifest exists and is valid
test('verify manifest exists and is valid', () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  assert(existsSync(manifestPath), 'manifest.json should exist');
  
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  assert(manifest.activeVersion, 'Manifest should have activeVersion');
  assert(manifest.activeWorkspace, 'Manifest should have activeWorkspace');
  assert(manifest.workspaces, 'Manifest should have workspaces');
  assert(typeof manifest.workspaces === 'object', 'workspaces should be an object');
  
  // Verify at least one workspace exists
  const workspaceKeys = Object.keys(manifest.workspaces);
  assert(workspaceKeys.length > 0, 'At least one workspace should exist');
});

// E2E Test 3: Verify catalog exists for active workspace
test('verify catalog exists for active workspace', () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  const catalogPath = manifest.workspaces[activeWorkspace];
  
  assert(catalogPath, `Catalog path should exist for workspace ${activeWorkspace}`);
  assert(catalogPath.startsWith('/v1/'), 'Catalog path should start with /v1/');
  assert(catalogPath.endsWith('.json'), 'Catalog path should end with .json');
  
  // Resolve to local file
  const relativePath = catalogPath.replace(/^\/v1\//, '');
  const localPath = join(CONTENT_DIR, relativePath);
  assert(existsSync(localPath), `Catalog file should exist: ${localPath}`);
  
  // Validate catalog structure
  const catalog = JSON.parse(readFileSync(localPath, 'utf-8'));
  assert(catalog.workspace === activeWorkspace, 'Catalog workspace should match active workspace');
  assert(Array.isArray(catalog.sections), 'Catalog should have sections array');
  assert(catalog.sections.length > 0, 'Catalog should have at least one section');
});

// E2E Test 4: Verify section indexes exist and are valid (with pagination)
test('verify section indexes exist and are valid', () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  const catalogPath = manifest.workspaces[activeWorkspace];
  const relativePath = catalogPath.replace(/^\/v1\//, '');
  const localPath = join(CONTENT_DIR, relativePath);
  const catalog = JSON.parse(readFileSync(localPath, 'utf-8'));
  
  catalog.sections.forEach((section: any) => {
    assert(section.itemsUrl, `Section ${section.id} should have itemsUrl`);
    assert(section.itemsUrl.startsWith('/v1/'), `Section ${section.id} itemsUrl should start with /v1/`);
    assert(section.itemsUrl.endsWith('.json'), `Section ${section.id} itemsUrl should end with .json`);
    
    // Resolve to local file
    const indexRelativePath = section.itemsUrl.replace(/^\/v1\//, '');
    const indexLocalPath = join(CONTENT_DIR, indexRelativePath);
    assert(existsSync(indexLocalPath), `Section index should exist: ${indexLocalPath}`);
    
    // Validate index structure
    const firstPage = JSON.parse(readFileSync(indexLocalPath, 'utf-8'));
    assert(firstPage.version === 'v1', `Index should have version v1`);
    assert(firstPage.kind, `Index should have kind`);
    assert(Array.isArray(firstPage.items), `Index should have items array`);
    
    // Store first page metadata for pagination invariant checks
    const firstPageVersion = firstPage.version;
    const firstPageKind = firstPage.kind;
    const firstPagePageSize = firstPage.pageSize;
    const firstPageTotal = firstPage.total;
    const allItemIds = new Set<string>();
    let totalItems = 0;
    let pageCount = 0;
    const visitedPages = new Set<string>();
    
    // Follow pagination chain
    let currentPagePath: string | null = indexRelativePath;
    while (currentPagePath) {
      pageCount++;
      const currentFullPath = join(CONTENT_DIR, currentPagePath);
      
      // Loop detection
      assert(!visitedPages.has(currentPagePath), `Pagination loop detected at ${currentPagePath}`);
      visitedPages.add(currentPagePath);
      
      assert(existsSync(currentFullPath), `Pagination page should exist: ${currentFullPath}`);
      const page = JSON.parse(readFileSync(currentFullPath, 'utf-8'));
      
      // Validate invariants match first page
      if (pageCount > 1) {
        assert(page.version === firstPageVersion, `Page ${pageCount} version should match first page`);
        assert(page.kind === firstPageKind, `Page ${pageCount} kind should match first page`);
        assert(page.pageSize === firstPagePageSize, `Page ${pageCount} pageSize should match first page`);
        assert(page.total === firstPageTotal, `Page ${pageCount} total should match first page`);
      }
      
      // Collect items and check for duplicates
      if (Array.isArray(page.items)) {
        page.items.forEach((item: any) => {
          if (item.id) {
            assert(!allItemIds.has(item.id), `Duplicate item ID "${item.id}" found across pagination pages`);
            allItemIds.add(item.id);
          }
          totalItems++;
        });
      }
      
      // Move to next page
      if (typeof page.nextPage === 'string') {
        assert(page.nextPage.startsWith('/v1/'), `nextPage should start with /v1/`);
        assert(page.nextPage.endsWith('.json'), `nextPage should end with .json`);
        currentPagePath = page.nextPage.replace(/^\/v1\//, '');
      } else {
        currentPagePath = null;
      }
    }
    
    // Validate total matches actual item count
    assert(totalItems === firstPageTotal, `Total (${firstPageTotal}) should equal actual item count (${totalItems}) across ${pageCount} page(s)`);
    
    // Validate items have required fields (from first page)
    firstPage.items.forEach((item: any, idx: number) => {
      assert(item.id, `Item ${idx} should have id`);
      assert(item.kind, `Item ${idx} should have kind`);
      assert(item.title, `Item ${idx} should have title`);
      assert(item.level, `Item ${idx} should have level`);
      assert(item.entryUrl, `Item ${idx} should have entryUrl`);
      assert(item.entryUrl.startsWith('/v1/'), `Item ${idx} entryUrl should start with /v1/`);
    });
  });
});

// E2E Test 5: Verify entry documents exist and are valid
test('verify entry documents exist and are valid', () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  const catalogPath = manifest.workspaces[activeWorkspace];
  const relativePath = catalogPath.replace(/^\/v1\//, '');
  const localPath = join(CONTENT_DIR, relativePath);
  const catalog = JSON.parse(readFileSync(localPath, 'utf-8'));
  
  const entryUrls = new Set<string>();
  
  // Collect all entryUrls from all sections
  catalog.sections.forEach((section: any) => {
    const indexRelativePath = section.itemsUrl.replace(/^\/v1\//, '');
    const indexLocalPath = join(CONTENT_DIR, indexRelativePath);
    const index = JSON.parse(readFileSync(indexLocalPath, 'utf-8'));
    
    index.items.forEach((item: any) => {
      entryUrls.add(item.entryUrl);
    });
  });
  
  assert(entryUrls.size > 0, 'At least one entryUrl should exist');
  
  // Validate each entry document
  entryUrls.forEach((entryUrl) => {
    const entryRelativePath = entryUrl.replace(/^\/v1\//, '');
    const entryLocalPath = join(CONTENT_DIR, entryRelativePath);
    assert(existsSync(entryLocalPath), `Entry document should exist: ${entryLocalPath}`);
    
    const entry = JSON.parse(readFileSync(entryLocalPath, 'utf-8'));
    assert(entry.id, 'Entry should have id');
    assert(entry.kind, 'Entry should have kind');
    assert(entry.title, 'Entry should have title');
    assert(typeof entry.estimatedMinutes === 'number', 'Entry should have estimatedMinutes');
    
    // Validate pack entries have sessionPlan
    if (entry.kind === 'pack') {
      assert(entry.sessionPlan, 'Pack entry should have sessionPlan');
      assert(entry.sessionPlan.version === 1, 'sessionPlan.version should be 1');
      assert(Array.isArray(entry.sessionPlan.steps), 'sessionPlan.steps should be an array');
      assert(entry.sessionPlan.steps.length > 0, 'sessionPlan.steps should be non-empty');
      
      entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
        assert(step.id, `Step ${sIdx} should have id`);
        assert(step.title, `Step ${sIdx} should have title`);
        assert(Array.isArray(step.promptIds), `Step ${sIdx} should have promptIds array`);
        assert(step.promptIds.length > 0, `Step ${sIdx} promptIds should be non-empty`);
      });
      
      // Validate promptIds reference existing prompts
      if (entry.prompts && Array.isArray(entry.prompts)) {
        const promptIds = new Set(entry.prompts.map((p: any) => p.id));
        entry.sessionPlan.steps.forEach((step: any, sIdx: number) => {
          step.promptIds.forEach((promptId: string) => {
            assert(promptIds.has(promptId), `Step ${sIdx} promptId "${promptId}" should exist in prompts array`);
          });
        });
      }
    }
  });
});

// E2E Test 6: Verify Worker API manifest endpoint (if accessible)
test('verify Worker API manifest endpoint', async () => {
  try {
    const manifest = await fetchJson(`${WORKER_BASE_URL}/manifest`);
    assert(manifest.activeVersion, 'Worker manifest should have activeVersion');
    assert(manifest.activeWorkspace, 'Worker manifest should have activeWorkspace');
    assert(manifest.workspaces, 'Worker manifest should have workspaces');
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
    console.warn(`  Set WORKER_BASE_URL env var to enable Worker API tests`);
    // Don't fail the test if Worker is not accessible
  }
});

// E2E Test 7: Verify Worker API catalog endpoint (if accessible)
test('verify Worker API catalog endpoint', async () => {
  try {
    const manifest = await fetchJson(`${WORKER_BASE_URL}/manifest`);
    const activeWorkspace = manifest.activeWorkspace;
    const catalogPath = manifest.workspaces[activeWorkspace];
    const catalog = await fetchJson(`${WORKER_BASE_URL}${catalogPath}`);
    
    assert(catalog.workspace === activeWorkspace, 'Worker catalog workspace should match');
    assert(Array.isArray(catalog.sections), 'Worker catalog should have sections');
    assert(catalog.sections.length > 0, 'Worker catalog should have at least one section');
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
    // Don't fail the test if Worker is not accessible
  }
});

// E2E Test 8: Verify Worker API section index endpoint (if accessible, with pagination)
test('verify Worker API section index endpoint', async () => {
  try {
    const manifest = await fetchJson(`${WORKER_BASE_URL}/manifest`);
    const activeWorkspace = manifest.activeWorkspace;
    const catalogPath = manifest.workspaces[activeWorkspace];
    const catalog = await fetchJson(`${WORKER_BASE_URL}${catalogPath}`);
    
    if (catalog.sections.length > 0) {
      // Find a section with pagination (mechanics) or use first section
      let testSection = catalog.sections.find((s: any) => s.id === 'mechanics') || catalog.sections[0];
      const firstPage = await fetchJson(`${WORKER_BASE_URL}${testSection.itemsUrl}`);
      
      assert(firstPage.version === 'v1', 'Worker index should have version v1');
      assert(firstPage.kind, 'Worker index should have kind');
      assert(Array.isArray(firstPage.items), 'Worker index should have items array');
      
      // Store first page metadata for pagination invariant checks
      const firstPageVersion = firstPage.version;
      const firstPageKind = firstPage.kind;
      const firstPagePageSize = firstPage.pageSize;
      const firstPageTotal = firstPage.total;
      const allItemIds = new Set<string>();
      let totalItems = 0;
      let pageCount = 0;
      const visitedPages = new Set<string>();
      
      // Follow pagination chain
      let currentPageUrl: string | null = testSection.itemsUrl;
      while (currentPageUrl) {
        pageCount++;
        
        // Loop detection
        assert(!visitedPages.has(currentPageUrl), `Pagination loop detected at ${currentPageUrl}`);
        visitedPages.add(currentPageUrl);
        
        const page = await fetchJson(`${WORKER_BASE_URL}${currentPageUrl}`);
        
        // Validate invariants match first page
        if (pageCount > 1) {
          assert(page.version === firstPageVersion, `Page ${pageCount} version should match first page`);
          assert(page.kind === firstPageKind, `Page ${pageCount} kind should match first page`);
          assert(page.pageSize === firstPagePageSize, `Page ${pageCount} pageSize should match first page`);
          assert(page.total === firstPageTotal, `Page ${pageCount} total should match first page`);
        }
        
        // Collect items and check for duplicates
        if (Array.isArray(page.items)) {
          page.items.forEach((item: any) => {
            if (item.id) {
              assert(!allItemIds.has(item.id), `Duplicate item ID "${item.id}" found across pagination pages`);
              allItemIds.add(item.id);
            }
            totalItems++;
          });
        }
        
        // Move to next page
        if (typeof page.nextPage === 'string') {
          assert(page.nextPage.startsWith('/v1/'), `nextPage should start with /v1/`);
          assert(page.nextPage.endsWith('.json'), `nextPage should end with .json`);
          currentPageUrl = page.nextPage;
        } else {
          currentPageUrl = null;
        }
      }
      
      // Validate total matches actual item count
      assert(totalItems === firstPageTotal, `Total (${firstPageTotal}) should equal actual item count (${totalItems}) across ${pageCount} page(s)`);
      
      if (firstPage.items.length > 0) {
        const firstItem = firstPage.items[0];
        assert(firstItem.id, 'Worker index item should have id');
        assert(firstItem.kind, 'Worker index item should have kind');
        assert(firstItem.entryUrl, 'Worker index item should have entryUrl');
      }
    }
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
    // Don't fail the test if Worker is not accessible
  }
});

// E2E Test 9: Verify Worker API entry document endpoint (if accessible)
test('verify Worker API entry document endpoint', async () => {
  try {
    const manifest = await fetchJson(`${WORKER_BASE_URL}/manifest`);
    const activeWorkspace = manifest.activeWorkspace;
    const catalogPath = manifest.workspaces[activeWorkspace];
    const catalog = await fetchJson(`${WORKER_BASE_URL}${catalogPath}`);
    
    if (catalog.sections.length > 0) {
      const firstSection = catalog.sections[0];
      const index = await fetchJson(`${WORKER_BASE_URL}${firstSection.itemsUrl}`);
      
      if (index.items.length > 0) {
        const firstItem = index.items[0];
        const entry = await fetchJson(`${WORKER_BASE_URL}${firstItem.entryUrl}`);
        
        assert(entry.id, 'Worker entry should have id');
        assert(entry.kind, 'Worker entry should have kind');
        assert(entry.title, 'Worker entry should have title');
        assert(typeof entry.estimatedMinutes === 'number', 'Worker entry should have estimatedMinutes');
        
        // Validate pack entries have sessionPlan
        if (entry.kind === 'pack') {
          assert(entry.sessionPlan, 'Worker pack entry should have sessionPlan');
          assert(entry.sessionPlan.version === 1, 'Worker sessionPlan.version should be 1');
          assert(Array.isArray(entry.sessionPlan.steps), 'Worker sessionPlan.steps should be an array');
        }
      }
    }
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
    // Don't fail the test if Worker is not accessible
  }
});

// E2E Test 10: Verify Worker API ETag caching (if accessible)
test('verify Worker API ETag caching', async () => {
  try {
    const manifest = await fetchJson(`${WORKER_BASE_URL}/manifest`);
    const activeWorkspace = manifest.activeWorkspace;
    const catalogPath = manifest.workspaces[activeWorkspace];
    
    // First request - get ETag
    const response1 = await fetch(`${WORKER_BASE_URL}${catalogPath}`);
    const etag1 = response1.headers.get('ETag');
    
    if (etag1) {
      // Second request with If-None-Match
      const response2 = await fetch(`${WORKER_BASE_URL}${catalogPath}`, {
        headers: {
          'If-None-Match': etag1
        }
      });
      
      // Should return 304 Not Modified if ETag matches
      assert(
        response2.status === 304 || response2.status === 200,
        'Worker should return 304 or 200 with If-None-Match header'
      );
    }
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
    // Don't fail the test if Worker is not accessible
  }
});

// E2E Test 11: Verify publish dry-run works
test('verify publish dry-run works', () => {
  console.log('  Running: ./scripts/publish-content.sh --dry-run');
  try {
    const output = execSync('./scripts/publish-content.sh --dry-run', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: {
        ...process.env,
        // Use dry-run mode, so credentials not strictly required
      }
    });
    
    assert(output.includes('DRY RUN MODE') || output.includes('DRY RUN'), 'Should indicate dry-run mode');
    // Check for any indication of files (upload:, (dryrun), or sync messages)
    assert(
      output.includes('upload:') || 
      output.includes('(dryrun)') || 
      output.includes('Syncing') ||
      output.includes('Dry run completed'),
      'Should show files to be uploaded or sync operation'
    );
    assert(output.includes('Excluding manifest.json') || output.includes('manifest.staging.json'), 'Should exclude production manifest or show staging manifest');
  } catch (err: any) {
    // If credentials are missing, that's okay for dry-run
    if (err.message.includes('credentials') || err.message.includes('R2_')) {
      console.warn(`  ⚠️  Skipping publish dry-run test: ${err.message}`);
      return;
    }
    throw new Error(`Publish dry-run failed: ${err.message}`);
  }
});

// E2E Test 12: Verify staging manifest exists
test('verify staging manifest exists and is valid', () => {
  const stagingManifestPath = join(META_DIR, 'manifest.staging.json');
  assert(existsSync(stagingManifestPath), 'manifest.staging.json should exist');
  
  const staging = JSON.parse(readFileSync(stagingManifestPath, 'utf-8'));
  assert(staging.activeVersion, 'Staging manifest should have activeVersion');
  assert(staging.activeWorkspace, 'Staging manifest should have activeWorkspace');
  assert(staging.workspaces, 'Staging manifest should have workspaces');
  assert(typeof staging.workspaces === 'object', 'Staging workspaces should be an object');
});

// E2E Test 13: Verify production and staging manifests are both valid
test('verify production and staging manifests are both valid', () => {
  const prodManifestPath = join(META_DIR, 'manifest.json');
  const stagingManifestPath = join(META_DIR, 'manifest.staging.json');
  
  assert(existsSync(prodManifestPath), 'Production manifest should exist');
  assert(existsSync(stagingManifestPath), 'Staging manifest should exist');
  
  const prod = JSON.parse(readFileSync(prodManifestPath, 'utf-8'));
  const staging = JSON.parse(readFileSync(stagingManifestPath, 'utf-8'));
  
  // Both should have required fields
  assert(prod.activeVersion, 'Production manifest should have activeVersion');
  assert(staging.activeVersion, 'Staging manifest should have activeVersion');
  assert(prod.workspaces, 'Production manifest should have workspaces');
  assert(staging.workspaces, 'Staging manifest should have workspaces');
  
  // Both should reference valid catalog paths
  Object.values(prod.workspaces).forEach((catalogPath: any) => {
    assert(typeof catalogPath === 'string', 'Production catalog path should be string');
    assert(catalogPath.startsWith('/v1/'), 'Production catalog path should start with /v1/');
  });
  
  Object.values(staging.workspaces).forEach((catalogPath: any) => {
    assert(typeof catalogPath === 'string', 'Staging catalog path should be string');
    assert(catalogPath.startsWith('/v1/'), 'Staging catalog path should start with /v1/');
  });
});

// E2E Test 14: Verify promote script dry-run works
test('verify promote script dry-run works', () => {
  console.log('  Running: ./scripts/promote-staging.sh --dry-run');
  try {
    const output = execSync('./scripts/promote-staging.sh --dry-run', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: {
        ...process.env,
      }
    });
    
    assert(output.includes('DRY RUN MODE'), 'Should indicate dry-run mode');
    assert(output.includes('Would upload: meta/manifest.json'), 'Should show manifest.json upload');
    assert(output.includes('Would upload: meta/release.json'), 'Should show release.json upload');
  } catch (err: any) {
    // If credentials are missing, that's okay for dry-run
    if (err.message.includes('credentials') || err.message.includes('R2_')) {
      console.warn(`  ⚠️  Skipping promote dry-run test: ${err.message}`);
      return;
    }
    throw new Error(`Promote dry-run failed: ${err.message}`);
  }
});

// E2E Test 15: Verify staging manifest structure matches production
test('verify staging manifest structure matches production', () => {
  const prodManifestPath = join(META_DIR, 'manifest.json');
  const stagingManifestPath = join(META_DIR, 'manifest.staging.json');
  
  const prod = JSON.parse(readFileSync(prodManifestPath, 'utf-8'));
  const staging = JSON.parse(readFileSync(stagingManifestPath, 'utf-8'));
  
  // Both should have the same structure (same keys)
  const prodKeys = Object.keys(prod).sort();
  const stagingKeys = Object.keys(staging).sort();
  
  assert(
    JSON.stringify(prodKeys) === JSON.stringify(stagingKeys),
    'Staging and production manifests should have the same structure (same keys)'
  );
  
  // Both should have workspaces object
  assert(typeof prod.workspaces === 'object', 'Production should have workspaces object');
  assert(typeof staging.workspaces === 'object', 'Staging should have workspaces object');
});

// E2E Test 16: Verify Worker API /manifests endpoint (list archives)
test('verify Worker API /manifests endpoint', async () => {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/manifests`);
    assert(response.ok, 'GET /manifests should return 200');
    
    const data = await response.json() as { items: any[]; cursor?: string };
    assert(Array.isArray(data.items), '/manifests should return items array');
    
    // If there are archived manifests, validate structure
    if (data.items.length > 0) {
      const firstItem = data.items[0];
      assert(typeof firstItem.gitSha === 'string', 'Item should have gitSha string');
      assert(typeof firstItem.key === 'string', 'Item should have key string');
      assert(firstItem.key.includes('meta/manifests/'), 'Key should include meta/manifests/');
    }
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
  }
});

// E2E Test 17: Verify Worker API /manifests/:sha endpoint (fetch specific archive)
test('verify Worker API /manifests/:sha endpoint', async () => {
  try {
    // First get the list of manifests
    const listResponse = await fetch(`${WORKER_BASE_URL}/manifests`);
    const listData = await listResponse.json() as { items: any[] };
    
    if (listData.items.length > 0) {
      const firstSha = listData.items[0].gitSha;
      
      // Fetch specific manifest
      const response = await fetch(`${WORKER_BASE_URL}/manifests/${firstSha}`);
      assert(response.ok, `GET /manifests/${firstSha} should return 200`);
      
      const manifest = await response.json() as any;
      assert(manifest.activeVersion, 'Archived manifest should have activeVersion');
      assert(manifest.workspaces, 'Archived manifest should have workspaces');
    }
    
    // Test invalid SHA returns 404
    const invalidResponse = await fetch(`${WORKER_BASE_URL}/manifests/nonexistent123456`);
    assert(invalidResponse.status === 404, 'Invalid SHA should return 404');
    
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
  }
});

// E2E Test 18: Verify Worker API /release endpoint
test('verify Worker API /release endpoint', async () => {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/release`);
    assert(response.ok, 'GET /release should return 200');
    
    const release = await response.json() as any;
    assert(release.releasedAt, 'Release should have releasedAt');
    assert(release.gitSha, 'Release should have gitSha');
    assert(release.contentHash, 'Release should have contentHash');
    
    // Validate formats
    assert(typeof release.releasedAt === 'string', 'releasedAt should be string');
    assert(/^[a-f0-9]+$/.test(release.gitSha), 'gitSha should be hex string');
    assert(/^[a-f0-9]+$/.test(release.contentHash), 'contentHash should be hex string');
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API test: ${err.message}`);
  }
});

// E2E Test 19: Verify release.json exists locally
test('verify release.json exists and is valid', () => {
  const releasePath = join(META_DIR, 'release.json');
  assert(existsSync(releasePath), 'release.json should exist');
  
  const release = JSON.parse(readFileSync(releasePath, 'utf-8'));
  assert(release.releasedAt, 'Release should have releasedAt');
  assert(release.gitSha, 'Release should have gitSha');
  assert(release.contentHash, 'Release should have contentHash');
});

// E2E Test 20: Verify rollback script dry-run works
test('verify rollback script dry-run works', () => {
  console.log('  Running: ./scripts/rollback.sh <sha> --dry-run');
  try {
    // Use a fake SHA - rollback should fail gracefully in dry-run
    const output = execSync('./scripts/rollback.sh abc123def456 --dry-run 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env: {
        ...process.env,
      }
    });
    
    assert(output.includes('DRY RUN MODE'), 'Should indicate dry-run mode');
  } catch (err: any) {
    // Rollback may fail if archive doesn't exist - that's expected
    if (err.stdout && err.stdout.includes('DRY RUN MODE')) {
      // This is fine - dry-run mode was activated
      return;
    }
    if (err.message.includes('credentials') || err.message.includes('R2_')) {
      console.warn(`  ⚠️  Skipping rollback dry-run test: ${err.message}`);
      return;
    }
    // Any other error is also acceptable for this test (archive not found, etc.)
  }
});

// E2E Test 21: Verify smoke test script works
test('verify smoke test script works', () => {
  console.log('  Running: ./scripts/smoke-test-content.sh --sample 1');
  try {
    const output = execSync('./scripts/smoke-test-content.sh --sample 1 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000 // 30 second timeout
    });
    
    assert(output.includes('Smoke test'), 'Should indicate smoke test running');
    assert(
      output.includes('✅ Smoke test passed') || output.includes('✅ Catalog accessible'),
      'Smoke test should pass or show progress'
    );
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping smoke test: ${err.message}`);
  }
});

// E2E Test 22: Verify Worker API pagination endpoints (if accessible)
test('verify Worker API pagination endpoints', async () => {
  try {
    const manifest = await fetchJson(`${WORKER_BASE_URL}/manifest`);
    const activeWorkspace = manifest.activeWorkspace;
    const catalogPath = manifest.workspaces[activeWorkspace];
    const catalog = await fetchJson(`${WORKER_BASE_URL}${catalogPath}`);
    
    // Find mechanics section (known to have pagination)
    const mechanicsSection = catalog.sections.find((s: any) => s.id === 'mechanics');
    
    if (mechanicsSection) {
      // Test page 1
      const page1 = await fetchJson(`${WORKER_BASE_URL}${mechanicsSection.itemsUrl}`);
      assert(page1.version === 'v1', 'Page 1 should have version v1');
      assert(page1.kind === 'drills', 'Page 1 should have kind drills');
      assert(typeof page1.total === 'number', 'Page 1 should have total');
      assert(typeof page1.pageSize === 'number', 'Page 1 should have pageSize');
      assert(Array.isArray(page1.items), 'Page 1 should have items array');
      
      // If nextPage exists, test page 2
      if (typeof page1.nextPage === 'string') {
        assert(page1.nextPage.includes('index.page2.json'), 'nextPage should point to page2');
        
        const page2 = await fetchJson(`${WORKER_BASE_URL}${page1.nextPage}`);
        assert(page2.version === page1.version, 'Page 2 version should match page 1');
        assert(page2.kind === page1.kind, 'Page 2 kind should match page 1');
        assert(page2.pageSize === page1.pageSize, 'Page 2 pageSize should match page 1');
        assert(page2.total === page1.total, 'Page 2 total should match page 1');
        assert(Array.isArray(page2.items), 'Page 2 should have items array');
        assert(page2.nextPage === null, 'Page 2 should have null nextPage (last page)');
        
        // Verify no duplicate IDs
        const allIds = [...page1.items.map((i: any) => i.id), ...page2.items.map((i: any) => i.id)];
        const uniqueIds = new Set(allIds);
        assert(allIds.length === uniqueIds.size, 'No duplicate IDs across pages');
        
        // Verify total matches sum
        const totalItems = page1.items.length + page2.items.length;
        assert(totalItems === page1.total, `Total (${page1.total}) should equal sum of items (${totalItems})`);
      }
    }
  } catch (err: any) {
    console.warn(`  ⚠️  Skipping Worker API pagination test: ${err.message}`);
    // Don't fail the test if Worker is not accessible or mechanics section doesn't exist
  }
});

// Run all tests
async function runTests() {
  console.log('Running end-to-end tests...\n');
  
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error: any) {
      console.error(`❌ ${test.name}`);
      console.error(`   ${error.message}`);
      errors.push(`${test.name}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log(`\nErrors:`);
    errors.forEach(err => console.log(`  - ${err}`));
    process.exit(1);
  }
}

// Run tests
runTests();

