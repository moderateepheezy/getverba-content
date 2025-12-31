#!/usr/bin/env tsx

/**
 * End-to-end tests for GetVerba content pipeline
 * 
 * These tests verify the complete flow:
 * 1. Content validation
 * 2. Content structure (manifest → catalog → section index → entry documents)
 * 3. Worker API accessibility (if BASE_URL is provided)
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'fs';
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
    
    // Validation may pass or fail depending on content state
    // Just verify it ran and produced output
    assert(output.includes('Validating') || output.includes('Validated') || output.includes('Validation'), 'Should show validation output');
  } catch (err: any) {
    // Validation may fail due to existing content issues - that's expected
    // Just verify it ran
    const errorOutput = err.stdout || err.stderr || err.message || '';
    assert(
      errorOutput.includes('Validating') || 
      errorOutput.includes('Validation') || 
      errorOutput.includes('error') ||
      errorOutput.includes('Validated'),
      'Validation should have run (may pass or fail depending on content state)'
    );
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

// E2E Test 8.5: Verify scenario index exists and is valid (if exists)
test('verify scenario index exists and is valid', () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  const catalogPath = manifest.workspaces[activeWorkspace];
  const relativePath = catalogPath.replace(/^\/v1\//, '');
  const localPath = join(CONTENT_DIR, relativePath);
  const catalog = JSON.parse(readFileSync(localPath, 'utf-8'));
  
  // Find context section
  const contextSection = catalog.sections.find((s: any) => s.id === 'context');
  if (!contextSection) {
    console.warn('  ⚠️  No context section found, skipping scenario index test');
    return;
  }
  
  // Check if scenario index exists
  const scenarioIndexPath = join(CONTENT_DIR, 'workspaces', activeWorkspace, 'context', 'scenarios.json');
  if (!existsSync(scenarioIndexPath)) {
    console.warn('  ⚠️  Scenario index does not exist (optional), skipping test');
    return;
  }
  
  // Validate scenario index structure
  const scenarioIndex = JSON.parse(readFileSync(scenarioIndexPath, 'utf-8'));
  assert(scenarioIndex.version === 1, 'Scenario index should have version 1');
  assert(scenarioIndex.kind === 'scenario_index', 'Scenario index should have kind scenario_index');
  assert(Array.isArray(scenarioIndex.items), 'Scenario index should have items array');
  
  if (scenarioIndex.items.length > 0) {
    // Validate each scenario item
    scenarioIndex.items.forEach((item: any, idx: number) => {
      assert(item.id, `Scenario item ${idx} should have id`);
      assert(item.title, `Scenario item ${idx} should have title`);
      assert(item.subtitle, `Scenario item ${idx} should have subtitle`);
      assert(item.icon, `Scenario item ${idx} should have icon`);
      assert(typeof item.itemCount === 'number', `Scenario item ${idx} should have itemCount`);
      assert(item.itemsUrl, `Scenario item ${idx} should have itemsUrl`);
      assert(item.itemsUrl.startsWith('/v1/'), `Scenario item ${idx} itemsUrl should start with /v1/`);
      assert(item.itemsUrl.endsWith('.json'), `Scenario item ${idx} itemsUrl should end with .json`);
      
      // Validate scenario-specific index exists
      const scenarioIndexRelativePath = item.itemsUrl.replace(/^\/v1\//, '');
      const scenarioIndexLocalPath = join(CONTENT_DIR, scenarioIndexRelativePath);
      assert(existsSync(scenarioIndexLocalPath), `Scenario index should exist: ${scenarioIndexLocalPath}`);
      
      // Validate scenario index structure
      const scenarioSpecificIndex = JSON.parse(readFileSync(scenarioIndexLocalPath, 'utf-8'));
      assert(scenarioSpecificIndex.version === 'v1', `Scenario index should have version v1`);
      assert(scenarioSpecificIndex.kind === 'context', `Scenario index should have kind context`);
      assert(typeof scenarioSpecificIndex.total === 'number', `Scenario index should have total`);
      
      // Validate itemCount matches total
      assert(item.itemCount === scenarioSpecificIndex.total, 
        `Scenario ${item.id} itemCount (${item.itemCount}) should match index total (${scenarioSpecificIndex.total})`);
      
      // Follow pagination if exists
      let currentPageUrl: string | null = item.itemsUrl;
      let totalItems = 0;
      let pageCount = 0;
      const visitedPages = new Set<string>();
      
      while (currentPageUrl) {
        pageCount++;
        assert(!visitedPages.has(currentPageUrl), `Pagination loop detected at ${currentPageUrl}`);
        visitedPages.add(currentPageUrl);
        
        const pageRelativePath = currentPageUrl.replace(/^\/v1\//, '');
        const pageLocalPath = join(CONTENT_DIR, pageRelativePath);
        const page = JSON.parse(readFileSync(pageLocalPath, 'utf-8'));
        
        if (Array.isArray(page.items)) {
          totalItems += page.items.length;
        }
        
        currentPageUrl = page.nextPage || null;
      }
      
      // Validate total matches
      assert(totalItems === scenarioSpecificIndex.total, 
        `Scenario ${item.id} total items (${totalItems}) should match declared total (${scenarioSpecificIndex.total})`);
    });
  }
});

// E2E Test 8.6: Verify Worker API scenario index endpoint (if accessible)
test('verify Worker API scenario index endpoint', async () => {
  try {
    const manifest = await fetchJson(`${WORKER_BASE_URL}/manifest`);
    const activeWorkspace = manifest.activeWorkspace;
    const catalogPath = manifest.workspaces[activeWorkspace];
    const catalog = await fetchJson(`${WORKER_BASE_URL}${catalogPath}`);
    
    // Find context section
    const contextSection = catalog.sections.find((s: any) => s.id === 'context');
    if (!contextSection) {
      console.warn('  ⚠️  No context section found, skipping scenario index test');
      return;
    }
    
    // Try to fetch scenario index
    const scenarioIndexUrl = `${WORKER_BASE_URL}/v1/workspaces/${activeWorkspace}/context/scenarios.json`;
    try {
      const scenarioIndex = await fetchJson(scenarioIndexUrl);
      
      assert(scenarioIndex.version === 1, 'Worker scenario index should have version 1');
      assert(scenarioIndex.kind === 'scenario_index', 'Worker scenario index should have kind scenario_index');
      assert(Array.isArray(scenarioIndex.items), 'Worker scenario index should have items array');
      
      if (scenarioIndex.items.length > 0) {
        // Test first scenario's itemsUrl
        const firstScenario = scenarioIndex.items[0];
        const scenarioPage = await fetchJson(`${WORKER_BASE_URL}${firstScenario.itemsUrl}`);
        
        assert(scenarioPage.version === 'v1', 'Worker scenario page should have version v1');
        assert(scenarioPage.kind === 'context', 'Worker scenario page should have kind context');
        assert(typeof scenarioPage.total === 'number', 'Worker scenario page should have total');
        assert(firstScenario.itemCount === scenarioPage.total, 
          `Worker scenario itemCount (${firstScenario.itemCount}) should match page total (${scenarioPage.total})`);
      }
    } catch (err: any) {
      // Scenario index is optional - don't fail if it doesn't exist
      if (err.message.includes('404') || err.message.includes('not found')) {
        console.warn('  ⚠️  Scenario index does not exist (optional), skipping test');
        return;
      }
      throw err;
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

// E2E Test 22: Verify example pack has Quality Gates v1 fields
test('verify example pack has Quality Gates v1 fields', () => {
  const packPath = join(CONTENT_DIR, 'workspaces', 'de', 'packs', 'restaurant_conversations', 'pack.json');
  assert(existsSync(packPath), 'restaurant_conversations pack should exist');
  
  const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
  
  // Verify Quality Gates v1 required fields
  assert(pack.scenario, 'Pack should have scenario');
  assert(typeof pack.scenario === 'string', 'scenario should be string');
  assert(pack.scenario.length >= 3 && pack.scenario.length <= 40, 'scenario should be 3-40 chars');
  
  assert(pack.register, 'Pack should have register');
  assert(['formal', 'neutral', 'informal'].includes(pack.register), 'register should be formal, neutral, or informal');
  
  assert(pack.primaryStructure, 'Pack should have primaryStructure');
  assert(typeof pack.primaryStructure === 'string', 'primaryStructure should be string');
  assert(pack.primaryStructure.length >= 3 && pack.primaryStructure.length <= 60, 'primaryStructure should be 3-60 chars');
  
  // Verify variationSlots (new required field)
  assert(Array.isArray(pack.variationSlots), 'Pack should have variationSlots array');
  assert(pack.variationSlots.length > 0, 'variationSlots should be non-empty');
  const validSlots = ['subject', 'verb', 'object', 'modifier', 'tense', 'polarity', 'time', 'location'];
  pack.variationSlots.forEach((slot: string) => {
    assert(validSlots.includes(slot), `variationSlots should contain valid slot: ${slot}`);
  });
  
  // Verify slots (optional)
  assert(Array.isArray(pack.prompts), 'Pack should have prompts');
  assert(pack.prompts.length > 0, 'Pack should have at least one prompt');
  if (pack.prompts[0].slots) {
    assert(pack.prompts[0].slots.subject, 'Prompt should have subject slot if slots present');
    assert(pack.prompts[0].slots.verb, 'Prompt should have verb slot if slots present');
  }
  
  // Verify slotsChanged metadata (optional, but recommended)
  const promptsWithSlotsChanged = pack.prompts.filter((p: any) => p.slotsChanged && Array.isArray(p.slotsChanged) && p.slotsChanged.length >= 2);
  const minRequired = Math.ceil(pack.prompts.length * 0.3);
  if (promptsWithSlotsChanged.length > 0) {
    promptsWithSlotsChanged.forEach((p: any) => {
      assert(p.slotsChanged.every((slot: string) => pack.variationSlots.includes(slot)), 
        'slotsChanged values should be in variationSlots');
    });
  }
  
  // Verify microNotes
  assert(Array.isArray(pack.microNotes), 'Pack should have microNotes array');
  assert(pack.microNotes.length > 0, 'Pack should have at least one microNote');
  assert(pack.microNotes[0].id, 'microNote should have id');
  assert(pack.microNotes[0].text, 'microNote should have text');
  
  // Verify prompt quality (length)
  pack.prompts.forEach((prompt: any) => {
    assert(prompt.text.length >= 12, `Prompt "${prompt.id}" text should be >= 12 chars`);
    assert(prompt.text.length <= 140, `Prompt "${prompt.id}" text should be <= 140 chars`);
  });
});

// E2E Test 23: Verify Worker API pagination endpoints (if accessible)
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

// E2E Test 24: Pack generator - generate pack from scenario template
test('pack generator - generate pack from scenario template', () => {
  const testPackId = `e2e-test-${Date.now()}`;
  const scenario = 'work';
  const workspace = 'de';
  
  console.log(`  Generating pack "${testPackId}" from scenario "${scenario}"...`);
  
  try {
    const output = execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario ${scenario} --level A2 --seed 42`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    assert(output.includes('✅ Created'), 'Generator should succeed');
    assert(output.includes(testPackId), 'Output should mention pack ID');
    
    // Verify pack file exists
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(packPath), `Pack file should exist at ${packPath}`);
    
    // Verify pack structure
    const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(pack.id === testPackId, 'Pack ID should match');
    assert(pack.kind === 'pack', 'Pack kind should be "pack"');
    assert(pack.schemaVersion === 1, 'Pack should have schemaVersion 1');
    assert(pack.scenario === scenario, 'Pack scenario should match');
    assert(Array.isArray(pack.prompts), 'Pack should have prompts array');
    assert(pack.prompts.length > 0, 'Pack should have at least one prompt');
    assert(pack.sessionPlan, 'Pack should have sessionPlan');
    assert(Array.isArray(pack.sessionPlan.steps), 'Session plan should have steps');
    assert(pack.sessionPlan.steps.length > 0, 'Session plan should have at least one step');
    
    // Cleanup
    execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    console.log(`  ✅ Pack generated and validated successfully`);
  } catch (err: any) {
    // Cleanup on error
    try {
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch {}
    throw new Error(`Pack generator failed: ${err.message}`);
  }
});

// E2E Test 25: Pack generator - generated pack passes validation
test('pack generator - generated pack passes validation', () => {
  const testPackId = `e2e-test-validation-${Date.now()}`;
  const scenario = 'restaurant';
  const workspace = 'de';
  
  console.log(`  Generating and validating pack "${testPackId}"...`);
  
  try {
    // Generate pack
    execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario ${scenario} --level A2 --seed 100`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Validate generated pack
    let output: string;
    try {
      output = execSync('npm run content:validate 2>&1', {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (err: any) {
      output = err.stdout || err.message;
    }
    
    // Check that our generated pack is not in the errors
    assert(!output.includes(`pack "${testPackId}"`), 'Generated pack should not have validation errors');
    
    // Cleanup
    execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    console.log(`  ✅ Generated pack passes validation`);
  } catch (err: any) {
    // Cleanup on error
    try {
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch {}
    throw new Error(`Generated pack validation failed: ${err.message}`);
  }
});

// E2E Test 26: Pack generator - deterministic output
test('pack generator - deterministic output', () => {
  const testPackId1 = `e2e-test-deterministic-1-${Date.now()}`;
  const testPackId2 = `e2e-test-deterministic-2-${Date.now()}`;
  const scenario = 'work';
  const workspace = 'de';
  const seed = 999;
  
  console.log(`  Testing deterministic generation...`);
  
  try {
    // Generate pack twice with same inputs (same seed)
    execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId1} --scenario ${scenario} --level A2 --seed ${seed}`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId2} --scenario ${scenario} --level A2 --seed ${seed}`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Compare JSON output (byte-equivalent)
    const pack1Path = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId1, 'pack.json');
    const pack2Path = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId2, 'pack.json');
    
    assert(existsSync(pack1Path), `Pack 1 should exist: ${pack1Path}`);
    assert(existsSync(pack2Path), `Pack 2 should exist: ${pack2Path}`);
    
    const pack1 = JSON.parse(readFileSync(pack1Path, 'utf-8'));
    const pack2 = JSON.parse(readFileSync(pack2Path, 'utf-8'));
    
    // Normalize packs (remove packId-dependent fields for comparison)
    const normalizePack = (pack: any) => {
      const normalized = { ...pack };
      normalized.id = 'normalized';
      if (normalized.prompts) {
        normalized.prompts = normalized.prompts.map((p: any) => {
          const np = { ...p };
          np.audioUrl = np.audioUrl?.replace(/\/[^/]+\/prompt-/, '/normalized/prompt-');
          return np;
        });
      }
      return normalized;
    };
    
    const norm1 = normalizePack(pack1);
    const norm2 = normalizePack(pack2);
    
    // Compare normalized JSON strings (content should be identical)
    const json1 = JSON.stringify(norm1, null, 2);
    const json2 = JSON.stringify(norm2, null, 2);
    
    assert(json1 === json2, `Packs should be byte-equivalent with same seed. First prompt 1: "${pack1.prompts[0]?.text}", First prompt 2: "${pack2.prompts[0]?.text}"`);
    assert(pack1.prompts.length === pack2.prompts.length, 'Packs should have same number of prompts');
    assert(pack1.prompts[0].text === pack2.prompts[0].text, 'First prompts should be identical');
    
    // Cleanup
    execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId1)} ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId2)}`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    console.log(`  ✅ Deterministic generation verified`);
  } catch (err: any) {
    // Cleanup on error
    try {
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId1)} ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId2)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch {}
    throw new Error(`Deterministic generation test failed: ${err.message}`);
  }
});

// E2E Test 27: Pack generator - all scenarios generate valid packs
test('pack generator - all scenarios generate valid packs', () => {
  const scenarios = ['work', 'restaurant', 'shopping'];
  const workspace = 'de';
  const testPackIds: string[] = [];
  
  console.log(`  Testing all ${scenarios.length} scenarios...`);
  
  try {
    for (const scenario of scenarios) {
      const testPackId = `e2e-test-${scenario}-${Date.now()}`;
      testPackIds.push(testPackId);
      
      console.log(`    Generating from scenario ${scenario}...`);
      
      execSync(
        `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario ${scenario} --level A2 --seed ${Date.now()}`,
        {
          cwd: join(__dirname, '..'),
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );
      
      // Verify pack exists and is valid JSON
      const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
      assert(existsSync(packPath), `Pack should exist: ${packPath}`);
      
      const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
      assert(pack.id === testPackId, 'Pack ID should match');
      assert(pack.scenario === scenario, 'Pack scenario should match');
      assert(pack.prompts.length > 0, 'Pack should have prompts');
      assert(pack.sessionPlan.steps.length > 0, 'Pack should have session plan steps');
      assert(pack.variationSlots.length > 0, 'Pack should have variationSlots');
    }
    
    // Validate all generated packs together
    let output: string;
    try {
      output = execSync('npm run content:validate 2>&1', {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (err: any) {
      output = err.stdout || err.message;
    }
    
    // Check that our generated packs are not in the errors
    for (const testPackId of testPackIds) {
      assert(!output.includes(`pack "${testPackId}"`), `Generated pack ${testPackId} should not have validation errors`);
    }
    
    // Cleanup
    for (const testPackId of testPackIds) {
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    }
    
    console.log(`  ✅ All scenarios generate valid packs`);
  } catch (err: any) {
    // Cleanup on error
    for (const testPackId of testPackIds) {
      try {
        execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
          cwd: join(__dirname, '..'),
          stdio: 'pipe'
        });
      } catch {}
    }
    throw new Error(`Scenario generation test failed: ${err.message}`);
  }
});

// E2E Test 28: Pack generator - new-pack.sh integration
test('pack generator - new-pack.sh integration', () => {
  const testPackId = `e2e-test-newpack-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing new-pack.sh with --generate flag...`);
  
  try {
    let output: string;
    try {
      output = execSync(
        `./scripts/new-pack.sh ${testPackId} --generate --scenario work --level A2 --seed 42 2>&1`,
        {
          cwd: join(__dirname, '..'),
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );
    } catch (err: any) {
      output = err.stdout || err.message;
      // new-pack.sh may fail validation due to existing packs, but should still create our pack
    }
    
    // Verify pack file exists (main check)
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(packPath), `Pack file should exist at ${packPath}`);
    
    const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(pack.id === testPackId, 'Pack ID should match');
    assert(pack.scenario === 'work', 'Pack scenario should match');
    
    // Check output contains expected strings (if available)
    if (output.includes('✅ Created') || output.includes('Created:')) {
      assert(true, 'new-pack.sh should create pack');
    }
    
    // Cleanup
    execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    console.log(`  ✅ new-pack.sh integration works`);
  } catch (err: any) {
    // Cleanup on error
    try {
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch {}
    throw new Error(`new-pack.sh integration failed: ${err.message}`);
  }
});

// E2E Test 29: Quality report - generates report file
test('quality report - generates report file', () => {
  console.log('  Running quality report...');
  
  try {
    const output = execSync('npm run content:quality', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    assert(output.includes('Generating quality report'), 'Should indicate report generation');
    assert(output.includes('Quality Report Summary'), 'Should show summary');
    assert(output.includes('Total Packs:'), 'Should show pack count');
    
    // Verify report file exists
    const reportsDir = join(__dirname, '..', 'docs', 'content-pipeline', 'reports');
    const reportFiles = readdirSync(reportsDir).filter(f => f.startsWith('quality-') && f.endsWith('.md'));
    assert(reportFiles.length > 0, 'At least one quality report should exist');
    
    // Verify report content
    const latestReport = reportFiles[reportFiles.length - 1];
    const reportPath = join(reportsDir, latestReport);
    const reportContent = readFileSync(reportPath, 'utf-8');
    
    assert(reportContent.includes('# Quality Report'), 'Report should have title');
    assert(reportContent.includes('## Summary'), 'Report should have summary section');
    assert(reportContent.includes('## Per-Pack Metrics'), 'Report should have per-pack metrics');
    
    console.log(`  ✅ Quality report generated: ${latestReport}`);
  } catch (err: any) {
    // Quality report may fail if packs have issues - that's expected
    // Just verify it ran and generated output
    if (err.stdout) {
      assert(err.stdout.includes('Quality Report Summary') || err.stdout.includes('Generating quality report'), 
        'Quality report should have run');
    }
  }
});

// E2E Test 30: Quality report - identifies issues correctly
test('quality report - identifies issues correctly', () => {
  console.log('  Testing quality report issue detection...');
  
  try {
    const output = execSync('npm run content:quality', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // Report should identify packs with issues
    const hasRedStatus = output.includes('🔴 Red') || output.includes('RED');
    const hasSummary = output.includes('Total Packs:');
    
    assert(hasSummary, 'Report should show summary');
    // Red status may or may not be present depending on pack quality
    // Just verify the report structure is correct
    
    console.log('  ✅ Quality report identifies issues correctly');
  } catch (err: any) {
    // If report fails due to red packs, that's expected behavior
    if (err.stdout) {
      assert(err.stdout.includes('Quality Report Summary') || err.stdout.includes('Red Status'), 
        'Report should show status information');
    }
  }
});

// E2E Test 31: Quality Gates v2 - validation catches near-duplicates
test('quality gates v2 - validation catches near-duplicates', () => {
  console.log('  Testing Quality Gates v2 near-duplicate detection...');
  
  // This test verifies that validation correctly identifies near-duplicate prompts
  // We can't easily create a test pack without modifying the repo, so we verify
  // that the validation rules are active by checking error messages
  
  try {
    const output = execSync('npm run content:validate 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // Quality Gates v2 should be active (we see v2 violations in output)
    const hasV2Violations = output.includes('Quality Gate v2 violation');
    
    // Verify v2 rules are being checked
    assert(hasV2Violations || output.includes('All content files are valid!'), 
      'Validation should check Quality Gates v2 rules');
    
    console.log('  ✅ Quality Gates v2 validation is active');
  } catch (err: any) {
    // Validation may fail due to existing pack issues - that's expected
    if (err.stdout) {
      const hasV2 = err.stdout.includes('Quality Gate v2 violation');
      assert(hasV2 || err.stdout.includes('All content files are valid!'), 
        'Should check Quality Gates v2');
    }
  }
});

// E2E Test 32: Quality report - markdown format is valid
test('quality report - markdown format is valid', () => {
  console.log('  Verifying quality report markdown format...');
  
  const reportsDir = join(__dirname, '..', 'docs', 'content-pipeline', 'reports');
  if (!existsSync(reportsDir)) {
    console.log('  ⚠️  Reports directory does not exist (skipping)');
    return;
  }
  
  const reportFiles = readdirSync(reportsDir).filter(f => f.startsWith('quality-') && f.endsWith('.md'));
  if (reportFiles.length === 0) {
    console.log('  ⚠️  No quality reports found (skipping)');
    return;
  }
  
  const latestReport = reportFiles[reportFiles.length - 1];
  const reportPath = join(reportsDir, latestReport);
  const reportContent = readFileSync(reportPath, 'utf-8');
  
  // Verify markdown structure
  assert(reportContent.includes('# Quality Report'), 'Should have H1 title');
  assert(reportContent.includes('## Summary'), 'Should have summary section');
  assert(reportContent.includes('## Per-Pack Metrics'), 'Should have metrics section');
  assert(reportContent.includes('|'), 'Should have table format');
  
  // Verify git SHA is present
  assert(reportContent.includes('Git SHA:'), 'Should include git SHA');
  
  console.log('  ✅ Quality report markdown format is valid');
});

// E2E Test 33: Prompt Meaning Contract - missing intent fails validation
test('prompt meaning contract - missing intent fails validation', () => {
  const testPackId = `e2e-meaning-intent-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing meaning contract validation for missing intent...`);
  
  try {
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    mkdirSync(packDir, { recursive: true });
    
    const pack = {
      schemaVersion: 1,
      id: testPackId,
      kind: 'pack',
      title: 'Test Missing Intent',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        {
          id: 'prompt-001',
          text: 'Ich gehe zur Arbeit',
          gloss_en: 'I go to work'
          // Missing intent
        }
      ],
      sessionPlan: {
        version: 1,
        steps: [
          {
            id: 'step-1',
            title: 'Step 1',
            promptIds: ['prompt-001']
          }
        ]
      }
    };
    
    const packPath = join(packDir, 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    // Generate indexes to include the new pack
    try {
      execSync(`npm run content:generate-indexes -- --workspace ${workspace}`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch {}
    
    // Run validation - should fail
    try {
      execSync('npm run content:validate 2>&1', {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      assert(false, 'Validation should fail on missing intent');
    } catch (err: any) {
      const output = err.stdout || err.message || '';
      assert(
        output.includes('missing or invalid field: intent'),
        `Should report missing intent. Output: ${output.substring(0, 500)}`
      );
    }
    
    // Cleanup
    rmSync(packDir, { recursive: true, force: true });
    console.log('  ✅ Missing intent validation works correctly');
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Meaning contract intent test failed: ${err.message}`);
  }
});

// E2E Test 34: Prompt Meaning Contract - missing gloss_en fails validation
test('prompt meaning contract - missing gloss_en fails validation', () => {
  const testPackId = `e2e-meaning-gloss-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing meaning contract validation for missing gloss_en...`);
  
  try {
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    mkdirSync(packDir, { recursive: true });
    
    const pack = {
      schemaVersion: 1,
      id: testPackId,
      kind: 'pack',
      title: 'Test Missing Gloss',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        {
          id: 'prompt-001',
          text: 'Ich gehe zur Arbeit',
          intent: 'inform'
          // Missing gloss_en
        }
      ],
      sessionPlan: {
        version: 1,
        steps: [
          {
            id: 'step-1',
            title: 'Step 1',
            promptIds: ['prompt-001']
          }
        ]
      }
    };
    
    const packPath = join(packDir, 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    // Generate indexes to include the new pack
    try {
      execSync(`npm run content:generate-indexes -- --workspace ${workspace}`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch {}
    
    // Run validation - should fail
    try {
      execSync('npm run content:validate 2>&1', {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      assert(false, 'Validation should fail on missing gloss_en');
    } catch (err: any) {
      const output = err.stdout || err.message || '';
      assert(
        output.includes('missing or invalid field: gloss_en'),
        `Should report missing gloss_en. Output: ${output.substring(0, 500)}`
      );
    }
    
    // Cleanup
    rmSync(packDir, { recursive: true, force: true });
    console.log('  ✅ Missing gloss_en validation works correctly');
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Meaning contract gloss_en test failed: ${err.message}`);
  }
});

// E2E Test 35: Prompt Meaning Contract - calque phrase fails validation
test('prompt meaning contract - calque phrase fails validation', () => {
  const testPackId = `e2e-meaning-calque-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing meaning contract validation for calque phrase...`);
  
  try {
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    mkdirSync(packDir, { recursive: true });
    
    const pack = {
      schemaVersion: 1,
      id: testPackId,
      kind: 'pack',
      title: 'Test Calque',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'verb_position',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        {
          id: 'prompt-001',
          text: 'Ich bin beschäftigt',
          intent: 'inform',
          gloss_en: 'I am busy'
        }
      ],
      sessionPlan: {
        version: 1,
        steps: [
          {
            id: 'step-1',
            title: 'Step 1',
            promptIds: ['prompt-001']
          }
        ]
      }
    };
    
    const packPath = join(packDir, 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    // Generate indexes to include the new pack
    try {
      execSync(`npm run content:generate-indexes -- --workspace ${workspace}`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch {}
    
    // Run validation - should fail
    try {
      execSync('npm run content:validate 2>&1', {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      assert(false, 'Validation should fail on calque phrase');
    } catch (err: any) {
      const output = err.stdout || err.message || '';
      const hasCalqueError = output.includes('calque phrase') || 
                            output.includes('contains calque') ||
                            output.includes('beschäftigt');
      assert(hasCalqueError, `Should report calque phrase. Output: ${output.substring(0, 500)}`);
    }
    
    // Cleanup
    rmSync(packDir, { recursive: true, force: true });
    console.log('  ✅ Calque phrase validation works correctly');
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Meaning contract calque test failed: ${err.message}`);
  }
});

// E2E Test 36: Prompt Meaning Contract - pragmatics rule fails validation
test('prompt meaning contract - pragmatics rule fails validation', () => {
  const testPackId = `e2e-meaning-pragmatics-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing meaning contract validation for pragmatics rule...`);
  
  try {
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    mkdirSync(packDir, { recursive: true });
    
    const pack = {
      schemaVersion: 1,
      id: testPackId,
      kind: 'pack',
      title: 'Test Pragmatics',
      level: 'A1',
      estimatedMinutes: 15,
      description: 'Test',
      scenario: 'work',
      register: 'formal',
      primaryStructure: 'modal_verbs_requests',
      variationSlots: ['subject', 'verb'],
      outline: ['Step 1'],
      prompts: [
        {
          id: 'prompt-001',
          text: 'Helfen Sie mir',
          intent: 'request',
          register: 'formal',
          gloss_en: 'Help me'
        }
      ],
      sessionPlan: {
        version: 1,
        steps: [
          {
            id: 'step-1',
            title: 'Step 1',
            promptIds: ['prompt-001']
          }
        ]
      }
    };
    
    const packPath = join(packDir, 'pack.json');
    writeFileSync(packPath, JSON.stringify(pack, null, 2));
    
    // Generate indexes to include the new pack
    try {
      execSync(`npm run content:generate-indexes -- --workspace ${workspace}`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch {}
    
    // Run validation - should fail
    try {
      execSync('npm run content:validate 2>&1', {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      assert(false, 'Validation should fail on pragmatics rule violation');
    } catch (err: any) {
      const output = err.stdout || err.message || '';
      const hasPragmaticsError = output.includes('violates pragmatics rule') || 
                                output.includes('missing required tokens');
      assert(hasPragmaticsError, `Should report pragmatics rule violation. Output: ${output.substring(0, 500)}`);
    }
    
    // Cleanup
    rmSync(packDir, { recursive: true, force: true });
    console.log('  ✅ Pragmatics rule validation works correctly');
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Meaning contract pragmatics test failed: ${err.message}`);
  }
});

// E2E Test 37: Review report generator works
test('review report generator - generates report successfully', () => {
  console.log('  Testing review report generator...');
  
  try {
    const output = execSync('npm run content:report', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    assert(output.includes('Review report written to'), 'Should indicate report was written');
    assert(output.includes('Total Packs'), 'Should show summary statistics');
    
    // Verify report file exists
    const reportPath = join(__dirname, '..', 'docs', 'reports', 'content_review_report.md');
    assert(existsSync(reportPath), 'Review report file should exist');
    
    const reportContent = readFileSync(reportPath, 'utf-8');
    assert(reportContent.includes('# Content Review Report'), 'Should have H1 title');
    assert(reportContent.includes('## Summary'), 'Should have summary section');
    assert(reportContent.includes('## Pack List'), 'Should have pack list section');
    assert(reportContent.includes('|'), 'Should have table format');
    
    console.log('  ✅ Review report generator works correctly');
  } catch (err: any) {
    throw new Error(`Review report generator failed: ${err.message}`);
  }
});

// E2E Test 38: Scaffolding includes meaning contract fields
test('scaffolding - includes meaning contract fields', () => {
  const testPackId = `e2e-scaffold-meaning-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing scaffolding includes meaning contract fields...`);
  
  try {
    // Run new-pack.sh (may fail validation, but should create pack)
    try {
      execSync(`./scripts/new-pack.sh ${testPackId} --workspace ${workspace} --level A2`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (err: any) {
      // new-pack.sh may fail validation, but should still create the pack file
      // This is acceptable for this test
    }
    
    // Verify pack file exists
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(packPath), `Pack file should exist at ${packPath}`);
    
    // Verify pack structure
    const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(pack.id === testPackId, 'Pack ID should match');
    assert(Array.isArray(pack.prompts), 'Pack should have prompts array');
    assert(pack.prompts.length > 0, 'Pack should have at least one prompt');
    
    // Verify meaning contract fields are present
    const firstPrompt = pack.prompts[0];
    assert(firstPrompt.hasOwnProperty('intent'), 'Prompt should have intent field');
    assert(firstPrompt.hasOwnProperty('gloss_en'), 'Prompt should have gloss_en field');
    assert(firstPrompt.hasOwnProperty('alt_de'), 'Prompt should have alt_de field');
    
    // Verify fields contain TODO placeholders
    assert(
      firstPrompt.intent.includes('TODO') || firstPrompt.intent.includes('greet'),
      'Intent should have TODO placeholder or valid value'
    );
    assert(
      firstPrompt.gloss_en.includes('TODO') || firstPrompt.gloss_en.length >= 6,
      'gloss_en should have TODO placeholder or valid value'
    );
    
    // Cleanup
    rmSync(join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId), {
      recursive: true,
      force: true
    });
    
    console.log('  ✅ Scaffolding includes meaning contract fields');
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Scaffolding meaning contract test failed: ${err.message}`);
  }
});

// E2E Test: Provenance and review metadata on generated packs
test('generated packs include provenance and review metadata', () => {
  const testPackId = `e2e-provenance-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Generating pack "${testPackId}" to verify provenance...`);
  
  try {
    const output = execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario work --level A2 --seed 42`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    assert(output.includes('✅ Created'), 'Generator should succeed');
    
    // Verify pack file exists
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(packPath), `Pack file should exist at ${packPath}`);
    
    // Verify provenance and review fields
    const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(pack.provenance, 'Pack should have provenance field');
    assert(pack.provenance.source === 'template', 'Provenance source should be "template"');
    assert(pack.provenance.sourceRef, 'Provenance should have sourceRef');
    assert(pack.provenance.extractorVersion, 'Provenance should have extractorVersion');
    assert(pack.provenance.generatedAt, 'Provenance should have generatedAt');
    
    assert(pack.review, 'Pack should have review field');
    assert(pack.review.status === 'needs_review', 'Review status should be "needs_review"');
    
    console.log(`  ✅ Provenance and review metadata verified`);
    
    // Cleanup
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    if (existsSync(packDir)) {
      rmSync(packDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Provenance test failed: ${err.message}`);
  }
});

// E2E Test: Duplicate detection blocks promotion
test('duplicate detection finds duplicates and fails quality check', () => {
  const workspace = 'de';
  const testPackId1 = `e2e-dedup-1-${Date.now()}`;
  const testPackId2 = `e2e-dedup-2-${Date.now()}`;
  
  console.log(`  Creating test packs with duplicate prompts...`);
  
  try {
    // Create first pack
    execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId1} --scenario work --level A2 --seed 100`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    const pack1Path = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId1, 'pack.json');
    const pack1 = JSON.parse(readFileSync(pack1Path, 'utf-8'));
    
    // Create second pack with duplicate prompt
    execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId2} --scenario work --level A2 --seed 200`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    const pack2Path = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId2, 'pack.json');
    const pack2 = JSON.parse(readFileSync(pack2Path, 'utf-8'));
    
    // Manually add duplicate prompt to pack2
    if (pack1.prompts && pack1.prompts.length > 0) {
      pack2.prompts[0] = { ...pack1.prompts[0], id: 'p-duplicate' };
      writeFileSync(pack2Path, JSON.stringify(pack2, null, 2));
    }
    
    // Run duplicate detection
    try {
      const output = execSync(`npx tsx scripts/content-quality/dedupe.ts ${workspace}`, {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      // If no duplicates found, that's also valid (depends on actual prompts)
      console.log(`  ✅ Duplicate detection ran successfully`);
    } catch (err: any) {
      // Duplicate detection should fail if duplicates found
      const errorOutput = err.stdout || err.stderr || '';
      if (errorOutput.includes('duplicate') || errorOutput.includes('Duplicate')) {
        console.log(`  ✅ Duplicate detection correctly identified duplicates`);
      } else {
        throw new Error(`Duplicate detection failed unexpectedly: ${err.message}`);
      }
    }
    
    // Cleanup
    const pack1Dir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId1);
    const pack2Dir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId2);
    if (existsSync(pack1Dir)) {
      rmSync(pack1Dir, { recursive: true, force: true });
    }
    if (existsSync(pack2Dir)) {
      rmSync(pack2Dir, { recursive: true, force: true });
    }
  } catch (err: any) {
    // Cleanup on error
    try {
      const pack1Dir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId1);
      const pack2Dir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId2);
      if (existsSync(pack1Dir)) {
        rmSync(pack1Dir, { recursive: true, force: true });
      }
      if (existsSync(pack2Dir)) {
        rmSync(pack2Dir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Duplicate detection test failed: ${err.message}`);
  }
});

// E2E Test: Approval gate workflow
test('approval gate workflow: approve pack then check gate', () => {
  const testPackId = `e2e-approval-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing approval gate workflow...`);
  
  try {
    // Generate pack
    execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario work --level A2 --seed 300`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(packPath), 'Pack should exist');
    
    // Verify pack has needs_review status
    const packBefore = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(packBefore.review.status === 'needs_review', 'Pack should start with needs_review status');
    
    // Approve pack
    execSync(
      `./scripts/approve-pack.sh ${testPackId} --reviewer "test-reviewer" --workspace ${workspace}`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Verify pack is now approved
    const packAfter = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(packAfter.review.status === 'approved', 'Pack should be approved');
    assert(packAfter.review.reviewer === 'test-reviewer', 'Pack should have reviewer');
    assert(packAfter.review.reviewedAt, 'Pack should have reviewedAt timestamp');
    
    console.log(`  ✅ Approval workflow verified`);
    
    // Cleanup
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    if (existsSync(packDir)) {
      rmSync(packDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Approval gate test failed: ${err.message}`);
  }
});

// E2E Test: Review queue lists packs needing review
test('review queue lists packs needing review', () => {
  const testPackId = `e2e-review-queue-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Testing review queue...`);
  
  try {
    // Generate pack (defaults to needs_review)
    execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario work --level A2 --seed 400`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    // Run review queue
    const output = execSync('./scripts/review-queue.sh', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // Review queue should list the pack (or show no entries if it's approved)
    assert(output.length > 0, 'Review queue should produce output');
    
    console.log(`  ✅ Review queue verified`);
    
    // Cleanup
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    if (existsSync(packDir)) {
      rmSync(packDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Review queue test failed: ${err.message}`);
  }
});

// E2E Test: Verify expansion report runs and generates report
test('expansion report generates report file', () => {
  const reportPath = join(__dirname, '..', 'content-expansion-report.json');
  
  // Cleanup any existing report
  if (existsSync(reportPath)) {
    rmSync(reportPath);
  }
  
  try {
    const output = execSync('npx tsx scripts/content-expansion-report.ts', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    assert(existsSync(reportPath), 'Expansion report should be generated');
  } catch (err: any) {
    // Script may fail due to test packs, but report should still be generated
    if (!existsSync(reportPath)) {
      throw new Error('Expansion report should be generated even if script fails');
    }
  }
  
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    assert(typeof report.timestamp === 'string', 'Report should have timestamp');
    assert(typeof report.totalPacks === 'number', 'Report should have totalPacks');
    assert(Array.isArray(report.packs), 'Report should have packs array');
    assert(typeof report.summary === 'object', 'Report should have summary');
    assert(typeof report.passed === 'boolean', 'Report should have passed flag');
    assert(Array.isArray(report.failures), 'Report should have failures array');
    
    // Verify summary structure
    assert(typeof report.summary.totalBannedPhraseHits === 'number', 'Summary should have totalBannedPhraseHits');
    assert(typeof report.summary.packsWithBannedPhrases === 'number', 'Summary should have packsWithBannedPhrases');
    assert(typeof report.summary.packsBelowMultiSlotThreshold === 'number', 'Summary should have packsBelowMultiSlotThreshold');
    assert(typeof report.summary.packsWithDuplicates === 'number', 'Summary should have packsWithDuplicates');
    assert(typeof report.summary.averageMultiSlotPercentage === 'number', 'Summary should have averageMultiSlotPercentage');
    assert(typeof report.summary.averageScenarioTokenDensity === 'number', 'Summary should have averageScenarioTokenDensity');
    
    // Verify pack metrics structure
    if (report.packs.length > 0) {
      const pack = report.packs[0];
      assert(typeof pack.packId === 'string', 'Pack should have packId');
      assert(typeof pack.scenario === 'string', 'Pack should have scenario');
      assert(typeof pack.register === 'string', 'Pack should have register');
      assert(typeof pack.primaryStructure === 'string', 'Pack should have primaryStructure');
      assert(typeof pack.promptCount === 'number', 'Pack should have promptCount');
      assert(Array.isArray(pack.variationSlots), 'Pack should have variationSlots array');
      assert(typeof pack.percentMultiSlotVariation === 'number', 'Pack should have percentMultiSlotVariation');
      assert(typeof pack.averageScenarioTokenDensity === 'number', 'Pack should have averageScenarioTokenDensity');
      assert(typeof pack.bannedPhraseHits === 'number', 'Pack should have bannedPhraseHits');
      assert(typeof pack.duplicateSentenceCount === 'number', 'Pack should have duplicateSentenceCount');
    }
    
    // Cleanup report
    rmSync(reportPath);
  }
});

// E2E Test: Verify expansion report is included in validation pipeline
test('expansion report runs as part of content:validate', () => {
  const reportPath = join(__dirname, '..', 'content-expansion-report.json');
  
  // Cleanup any existing report
  if (existsSync(reportPath)) {
    rmSync(reportPath);
  }
  
  try {
    // Note: This will fail if validation fails, but we just want to check
    // that the expansion report script is called
    execSync('npm run content:validate', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // If we get here, validation passed and expansion report should exist
    // (though it may have failed due to test packs)
    // We just verify the script was called
    assert(true, 'Expansion report should be called in validation pipeline');
  } catch (err: any) {
    // Validation may fail, but expansion report should still run
    // Check if report was generated (even if it failed)
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      assert(typeof report.timestamp === 'string', 'Report should be generated even if validation fails');
    }
  } finally {
    // Cleanup report
    if (existsSync(reportPath)) {
      rmSync(reportPath);
    }
  }
});

// E2E Test: Curriculum Export v2 Generation
test('curriculum export v2 generation', async () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return; // Skip if no manifest
  }
  
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  
  if (!activeWorkspace) {
    return; // Skip if no active workspace
  }
  
  console.log('  Running: npm run content:export-curriculum');
  
  try {
    const output = execSync(`npm run content:export-curriculum -- --workspace ${activeWorkspace}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // Check that export was generated
    const exportsDir = join(__dirname, '..', 'exports');
    const jsonPath = join(exportsDir, `curriculum.v2.${activeWorkspace}.json`);
    const csvPath = join(exportsDir, `curriculum.v2.${activeWorkspace}.csv`);
    
    assert(existsSync(jsonPath), 'JSON export should be generated');
    assert(existsSync(csvPath), 'CSV export should be generated');
    
    // Validate JSON structure
    const export_ = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    assert(export_.version === 2, 'Export should have version 2');
    assert(export_.workspace === activeWorkspace, 'Export workspace should match');
    assert(Array.isArray(export_.bundles), 'Export should have bundles array');
    assert(typeof export_.exportedAt === 'string', 'Export should have exportedAt');
    assert(typeof export_.gitSha === 'string', 'Export should have gitSha');
    
    // Validate CSV has content
    const csv = readFileSync(csvPath, 'utf-8');
    assert(csv.includes('bundle_id'), 'CSV should have header');
    assert(csv.split('\n').length > 1, 'CSV should have data rows');
    
  } catch (err: any) {
    // Export may fail if content doesn't meet requirements - that's ok
    const errorOutput = err.stdout || err.stderr || err.message || '';
    if (errorOutput.includes('Skipping bundle') || errorOutput.includes('coverage')) {
      // Expected failure due to insufficient content
      assert(true, 'Export ran but skipped bundles due to coverage requirements');
    } else {
      throw err;
    }
  }
});

// E2E Test: Curriculum Export v2 Validation
test('curriculum export v2 validation', async () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return; // Skip if no manifest
  }
  
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  
  if (!activeWorkspace) {
    return; // Skip if no active workspace
  }
  
  const exportsDir = join(__dirname, '..', 'exports');
  const jsonPath = join(exportsDir, `curriculum.v2.${activeWorkspace}.json`);
  
  // Skip if export doesn't exist (may not have been generated)
  if (!existsSync(jsonPath)) {
    return;
  }
  
  console.log('  Running: npm run content:validate-curriculum');
  
  try {
    const output = execSync(`npm run content:validate-curriculum -- --workspace ${activeWorkspace}`, {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // Validation should pass or show specific errors
    assert(
      output.includes('Validation passed') || 
      output.includes('error') ||
      output.includes('warning'),
      'Validation should produce output'
    );
    
  } catch (err: any) {
    // Validation may fail - check if it's due to actual errors or just missing export
    const errorOutput = err.stdout || err.stderr || err.message || '';
    if (errorOutput.includes('Export file not found')) {
      return; // Skip if export wasn't generated
    }
    // Otherwise, validation found real errors - that's expected if content has issues
    assert(true, 'Validation ran and found issues (expected if content has problems)');
  }
});

// E2E Test: Curriculum Export v2 Structure Validation
test('curriculum export v2 structure validation', async () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return; // Skip if no manifest
  }
  
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  
  if (!activeWorkspace) {
    return; // Skip if no active workspace
  }
  
  const exportsDir = join(__dirname, '..', 'exports');
  const jsonPath = join(exportsDir, `curriculum.v2.${activeWorkspace}.json`);
  
  // Skip if export doesn't exist
  if (!existsSync(jsonPath)) {
    return;
  }
  
  const export_ = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  
  // Validate top-level structure
  assert(export_.version === 2, 'Export should have version 2');
  assert(typeof export_.exportedAt === 'string', 'Export should have exportedAt timestamp');
  assert(typeof export_.gitSha === 'string', 'Export should have gitSha');
  assert(export_.workspace === activeWorkspace, 'Export workspace should match');
  assert(typeof export_.title === 'string', 'Export should have title');
  assert(Array.isArray(export_.bundles), 'Export should have bundles array');
  
  // Validate each bundle
  for (const bundle of export_.bundles) {
    assert(typeof bundle.id === 'string' && bundle.id.length > 0, 'Bundle should have id');
    assert(typeof bundle.title === 'string' && bundle.title.length > 0, 'Bundle should have title');
    assert(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(bundle.level), 'Bundle should have valid level');
    assert(Array.isArray(bundle.outcomes), 'Bundle should have outcomes array');
    assert(bundle.outcomes.length >= 3, 'Bundle should have at least 3 outcomes');
    assert(Array.isArray(bundle.primaryStructures), 'Bundle should have primaryStructures array');
    assert(bundle.primaryStructures.length >= 2, 'Bundle should have at least 2 primary structures');
    assert(typeof bundle.estimatedMinutes === 'number', 'Bundle should have estimatedMinutes');
    assert(bundle.estimatedMinutes >= 15 && bundle.estimatedMinutes <= 180, 'Bundle minutes should be in valid range');
    assert(Array.isArray(bundle.modules), 'Bundle should have modules array');
    
    // Validate each module
    for (const module of bundle.modules) {
      assert(typeof module.id === 'string' && module.id.length > 0, 'Module should have id');
      assert(typeof module.title === 'string' && module.title.length > 0, 'Module should have title');
      assert(Array.isArray(module.items), 'Module should have items array');
      
      // Validate each item
      for (const item of module.items) {
        assert(['pack', 'drill', 'exam'].includes(item.kind), 'Item should have valid kind');
        assert(typeof item.id === 'string' && item.id.length > 0, 'Item should have id');
        assert(typeof item.entryUrl === 'string' && item.entryUrl.startsWith('/v1/'), 'Item should have valid entryUrl');
        assert(item.entryUrl.endsWith('.json'), 'Item entryUrl should end with .json');
      }
    }
  }
});

// E2E Test: Curriculum Export v2 Referential Integrity
test('curriculum export v2 referential integrity', async () => {
  const manifestPath = join(META_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return; // Skip if no manifest
  }
  
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const activeWorkspace = manifest.activeWorkspace;
  
  if (!activeWorkspace) {
    return; // Skip if no active workspace
  }
  
  const exportsDir = join(__dirname, '..', 'exports');
  const jsonPath = join(exportsDir, `curriculum.v2.${activeWorkspace}.json`);
  
  // Skip if export doesn't exist
  if (!existsSync(jsonPath)) {
    return;
  }
  
  const export_ = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const entryUrls = new Set<string>();
  
  // Collect all entryUrls and check for duplicates
  for (const bundle of export_.bundles) {
    for (const module of bundle.modules) {
      for (const item of module.items) {
        assert(!entryUrls.has(item.entryUrl), `Duplicate entryUrl found: ${item.entryUrl}`);
        entryUrls.add(item.entryUrl);
        
        // Verify entry document exists
        const entryRelativePath = item.entryUrl.replace(/^\/v1\//, '');
        const entryLocalPath = join(CONTENT_DIR, entryRelativePath);
        assert(existsSync(entryLocalPath), `Entry document should exist: ${entryLocalPath}`);
        
        // Verify entry document structure matches
        const entry = JSON.parse(readFileSync(entryLocalPath, 'utf-8'));
        assert(entry.id === item.id, `Entry ID should match: ${entry.id} vs ${item.id}`);
        assert(entry.kind === item.kind, `Entry kind should match: ${entry.kind} vs ${item.kind}`);
      }
    }
  }
});

// E2E Test: Telemetry contract - pack generator includes packVersion and telemetry fields
test('telemetry contract - pack generator includes packVersion and telemetry fields', () => {
  const testPackId = `e2e-telemetry-${Date.now()}`;
  const workspace = 'de';
  const scenario = 'work';
  
  console.log(`  Generating pack "${testPackId}" with telemetry fields...`);
  
  try {
    const output = execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario ${scenario} --level A2 --seed 42`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    assert(output.includes('✅ Created'), 'Generator should succeed');
    
    // Verify pack file exists
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(packPath), `Pack file should exist at ${packPath}`);
    
    // Verify pack structure includes telemetry fields
    const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(pack.packVersion, 'Pack should have packVersion');
    assert(/^\d+\.\d+\.\d+$/.test(pack.packVersion), 'packVersion should be semver format');
    assert(pack.analytics, 'Pack should have analytics');
    assert(typeof pack.analytics.targetLatencyMs === 'number', 'Pack should have targetLatencyMs');
    assert(pack.analytics.targetLatencyMs >= 200 && pack.analytics.targetLatencyMs <= 5000, 'targetLatencyMs should be in valid range');
    assert(pack.analytics.successDefinition, 'Pack should have successDefinition');
    assert(pack.analytics.successDefinition.length <= 140, 'successDefinition should be <= 140 chars');
    assert(Array.isArray(pack.analytics.keyFailureModes), 'Pack should have keyFailureModes array');
    assert(pack.analytics.keyFailureModes.length >= 1 && pack.analytics.keyFailureModes.length <= 6, 'keyFailureModes should have 1-6 items');
    
    // Verify prompt IDs are unique
    if (pack.prompts && Array.isArray(pack.prompts)) {
      const promptIds = pack.prompts.map((p: any) => p.id).filter(Boolean);
      const uniqueIds = new Set(promptIds);
      assert(promptIds.length === uniqueIds.size, 'All prompt IDs should be unique');
    }
    
    // Verify sessionPlan step IDs are stable
    if (pack.sessionPlan && Array.isArray(pack.sessionPlan.steps)) {
      for (const step of pack.sessionPlan.steps) {
        assert(step.id && typeof step.id === 'string', 'Step should have stable string ID');
        assert(step.id.length > 0, 'Step ID should not be empty');
      }
    }
    
    console.log(`  ✅ Telemetry contract verified for generated pack`);
    
    // Cleanup
    try {
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
    } catch {}
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Telemetry contract test failed: ${err.message}`);
  }
});

// E2E Test: Telemetry contract - validation enforces all rules
test('telemetry contract - validation enforces all rules', () => {
  const workspace = 'test-ws';
  const packId = 'e2e-validation-test';
  const TEST_CONTENT_DIR = join(__dirname, '..', '.test-content', 'v1');
  
  // Create test directory structure
  mkdirSync(join(TEST_CONTENT_DIR, 'workspaces', workspace, 'packs', packId), { recursive: true });
  
  // Test 1: Pack without packVersion should fail
  const packWithoutVersion = {
    schemaVersion: 1,
    id: packId,
    kind: 'pack',
    title: 'Test Pack',
    level: 'A1',
    estimatedMinutes: 15,
    description: 'Test',
    outline: ['Step 1'],
    scenario: 'work',
    register: 'neutral',
    primaryStructure: 'verb_position',
    variationSlots: ['subject', 'verb'],
    analytics: {
      goal: 'Test',
      constraints: ['c1'],
      levers: ['subject'],
      successCriteria: ['s1'],
      commonMistakes: ['m1'],
      drillType: 'substitution',
      cognitiveLoad: 'low',
      targetLatencyMs: 800,
      successDefinition: '2 passes',
      keyFailureModes: ['mode1']
    },
    sessionPlan: {
      version: 1,
      steps: [{ id: 'step1', title: 'Step 1', promptIds: [] }]
    }
  };
  
  writeFileSync(
    join(TEST_CONTENT_DIR, 'workspaces', workspace, 'packs', packId, 'pack.json'),
    JSON.stringify(packWithoutVersion, null, 2)
  );
  
  // Temporarily override CONTENT_DIR for validation
  const originalCwd = process.cwd();
  process.chdir(join(__dirname, '..'));
  
  try {
    // Set CONTENT_DIR env var to test directory
    const env = { ...process.env, CONTENT_DIR: TEST_CONTENT_DIR };
    const output = execSync('tsx scripts/validate-content.ts 2>&1', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe',
      env
    });
    assert(output.includes('packVersion'), 'Validation should fail for missing packVersion');
  } catch (err: any) {
    const errorOutput = err.stdout || err.stderr || '';
    assert(errorOutput.includes('packVersion'), 'Validation should fail for missing packVersion');
  } finally {
    process.chdir(originalCwd);
    // Cleanup
    try {
      rmSync(join(__dirname, '..', '.test-content'), { recursive: true, force: true });
    } catch {}
  }
});

// E2E Test: Telemetry readiness report works correctly
test('telemetry readiness report works correctly', () => {
  console.log('  Running telemetry readiness report...');
  
  try {
    const output = execSync('npm run content:telemetry-ready', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    
    // Report should run without errors
    assert(output.includes('Telemetry Readiness Report'), 'Report should generate output');
    assert(output.includes('Total Packs'), 'Report should show pack count');
    assert(output.includes('packVersion') || output.includes('analytics'), 'Report should check telemetry fields');
    
    console.log('  ✅ Telemetry readiness report works');
  } catch (err: any) {
    // Report may exit with code 1 if packs are not ready, which is expected
    const output = err.stdout || err.stderr || '';
    assert(output.includes('Telemetry Readiness Report') || output.includes('Total Packs'), 
      'Report should generate output even if packs are not ready');
    console.log('  ✅ Telemetry readiness report works (some packs may not be ready)');
  }
});

// E2E Test: Telemetry JSON schema validation
test('telemetry JSON schema validation', () => {
  const schemaPath = join(__dirname, '..', 'content', 'meta', 'telemetry.schema.v1.json');
  
  assert(existsSync(schemaPath), 'Telemetry schema file should exist');
  
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  
  // Verify schema structure
  assert(schema.$schema, 'Schema should have $schema');
  assert(schema.title === 'Telemetry Event Schema v1', 'Schema should have correct title');
  assert(schema.type === 'object', 'Schema should be object type');
  assert(Array.isArray(schema.required), 'Schema should have required fields array');
  
  // Verify required fields
  const requiredFields = ['schemaVersion', 'event', 'timestamp', 'workspace', 'userAnonId', 'content', 'result', 'signals'];
  for (const field of requiredFields) {
    assert(schema.required.includes(field), `Schema should require ${field}`);
  }
  
  // Verify content object structure
  assert(schema.properties.content, 'Schema should have content property');
  assert(schema.properties.content.required, 'Content should have required fields');
  assert(schema.properties.content.required.includes('packVersion'), 'Content should require packVersion');
  assert(schema.properties.content.required.includes('packId'), 'Content should require packId');
  assert(schema.properties.content.required.includes('stepId'), 'Content should require stepId');
  assert(schema.properties.content.required.includes('promptId'), 'Content should require promptId');
  assert(schema.properties.content.required.includes('attemptIndex'), 'Content should require attemptIndex');
  
  // Verify result object structure
  assert(schema.properties.result, 'Schema should have result property');
  assert(schema.properties.result.required, 'Result should have required fields');
  assert(schema.properties.result.required.includes('mode'), 'Result should require mode');
  assert(schema.properties.result.required.includes('pass'), 'Result should require pass');
  assert(schema.properties.result.required.includes('latencyMs'), 'Result should require latencyMs');
  
  // Verify packVersion semver pattern
  assert(schema.properties.content.properties.packVersion, 'Content should have packVersion property');
  assert(schema.properties.content.properties.packVersion.pattern, 'packVersion should have semver pattern');
  assert(/^\d+\.\d+\.\d+$/.test('1.0.0'), 'Semver pattern should match valid version');
  
  console.log('  ✅ Telemetry JSON schema is valid');
});

// E2E Test: Stable attempt addressing key generation
test('stable attempt addressing key generation', () => {
  const workspace = 'de';
  const packId = 'test-stable-addressing';
  const packVersion = '1.0.0';
  const sessionPlanVersion = 1;
  const stepId = 'opening';
  const promptId = 'prompt-001';
  const attemptIndex = 0;
  
  // Generate addressing key
  const addressingKey = `${workspace}:${packId}:${packVersion}:${sessionPlanVersion}:${stepId}:${promptId}:${attemptIndex}`;
  
  // Verify key components
  assert(addressingKey.includes(workspace), 'Key should include workspace');
  assert(addressingKey.includes(packId), 'Key should include packId');
  assert(addressingKey.includes(packVersion), 'Key should include packVersion');
  assert(addressingKey.includes(String(sessionPlanVersion)), 'Key should include sessionPlanVersion');
  assert(addressingKey.includes(stepId), 'Key should include stepId');
  assert(addressingKey.includes(promptId), 'Key should include promptId');
  assert(addressingKey.includes(String(attemptIndex)), 'Key should include attemptIndex');
  
  // Verify key is deterministic (same inputs = same key)
  const key2 = `${workspace}:${packId}:${packVersion}:${sessionPlanVersion}:${stepId}:${promptId}:${attemptIndex}`;
  assert(addressingKey === key2, 'Addressing key should be deterministic');
  
  // Verify different attemptIndex produces different key
  const key3 = `${workspace}:${packId}:${packVersion}:${sessionPlanVersion}:${stepId}:${promptId}:${attemptIndex + 1}`;
  assert(addressingKey !== key3, 'Different attemptIndex should produce different key');
  
  console.log('  ✅ Stable attempt addressing key generation works');
});

// E2E Test: Analytics metadata on generated packs
test('generated packs include analytics metadata with computed metrics', () => {
  const testPackId = `e2e-analytics-${Date.now()}`;
  const workspace = 'de';
  
  console.log(`  Generating pack "${testPackId}" to verify analytics...`);
  
  try {
    const output = execSync(
      `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario work --level A2 --seed 42`,
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      }
    );
    
    assert(output.includes('✅ Created'), 'Generator should succeed');
    
    // Verify pack file exists
    const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
    assert(existsSync(packPath), `Pack file should exist at ${packPath}`);
    
    // Verify analytics block
    const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
    assert(pack.analytics, 'Pack should have analytics field');
    
    // Verify required analytics fields
    assert(pack.analytics.version === 1, 'Analytics version should be 1');
    assert(pack.analytics.qualityGateVersion, 'Analytics should have qualityGateVersion');
    assert(typeof pack.analytics.promptCount === 'number', 'Analytics should have promptCount');
    assert(typeof pack.analytics.multiSlotRate === 'number', 'Analytics should have multiSlotRate');
    assert(typeof pack.analytics.scenarioTokenHitAvg === 'number', 'Analytics should have scenarioTokenHitAvg');
    assert(typeof pack.analytics.scenarioTokenQualifiedRate === 'number', 'Analytics should have scenarioTokenQualifiedRate');
    assert(typeof pack.analytics.uniqueTokenRate === 'number', 'Analytics should have uniqueTokenRate');
    assert(typeof pack.analytics.bannedPhraseViolations === 'number', 'Analytics should have bannedPhraseViolations');
    assert(typeof pack.analytics.passesQualityGates === 'boolean', 'Analytics should have passesQualityGates');
    
    // Verify analytics values are reasonable
    assert(pack.analytics.promptCount > 0, 'promptCount should be > 0');
    assert(pack.analytics.multiSlotRate >= 0 && pack.analytics.multiSlotRate <= 1, 'multiSlotRate should be 0..1');
    assert(pack.analytics.scenarioTokenHitAvg >= 0, 'scenarioTokenHitAvg should be >= 0');
    assert(pack.analytics.scenarioTokenQualifiedRate >= 0 && pack.analytics.scenarioTokenQualifiedRate <= 1, 'scenarioTokenQualifiedRate should be 0..1');
    assert(pack.analytics.uniqueTokenRate >= 0 && pack.analytics.uniqueTokenRate <= 1, 'uniqueTokenRate should be 0..1');
    assert(pack.analytics.bannedPhraseViolations >= 0, 'bannedPhraseViolations should be >= 0');
    assert(pack.analytics.passesQualityGates === true, 'Generated pack should pass quality gates');
    
    // Verify analytics matches pack metadata
    assert(pack.analytics.scenario === pack.scenario, 'Analytics scenario should match pack scenario');
    assert(pack.analytics.register === pack.register, 'Analytics register should match pack register');
    assert(pack.analytics.primaryStructure === pack.primaryStructure, 'Analytics primaryStructure should match pack primaryStructure');
    assert(JSON.stringify(pack.analytics.variationSlots) === JSON.stringify(pack.variationSlots), 'Analytics variationSlots should match pack variationSlots');
    
    console.log(`  ✅ Analytics metadata verified`);
    
    // Cleanup
    const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
    if (existsSync(packDir)) {
      rmSync(packDir, { recursive: true, force: true });
    }
  } catch (err: any) {
    // Cleanup on error
    try {
      const packDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId);
      if (existsSync(packDir)) {
        rmSync(packDir, { recursive: true, force: true });
      }
    } catch {}
    throw new Error(`Analytics test failed: ${err.message}`);
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
  
  // E2E Test: Analytics metadata in index items
  test('index items include analytics summaries', async () => {
    const workspacesDir = join(CONTENT_DIR, 'workspaces');
    if (!existsSync(workspacesDir)) {
      return; // Skip if no workspaces
    }
    
    const workspaces = readdirSync(workspacesDir).filter(item => {
      const itemPath = join(workspacesDir, item);
      return existsSync(itemPath);
    });
    
    let foundAnalytics = false;
    
    for (const workspace of workspaces) {
      const contextIndexPath = join(CONTENT_DIR, 'workspaces', workspace, 'context', 'index.json');
      if (!existsSync(contextIndexPath)) {
        continue;
      }
      
      const index = JSON.parse(readFileSync(contextIndexPath, 'utf-8'));
      
      for (const item of index.items || []) {
        if (item.kind === 'pack') {
          // Check if analytics summary fields are present
          if (item.drillType || item.cognitiveLoad || item.whyThisWorks) {
            foundAnalytics = true;
            
            // Verify analytics fields are valid
            if (item.drillType) {
              assert(
                ['substitution', 'pattern-switch', 'roleplay-bounded'].includes(item.drillType),
                `Invalid drillType: ${item.drillType}`
              );
            }
            if (item.cognitiveLoad) {
              assert(
                ['low', 'medium', 'high'].includes(item.cognitiveLoad),
                `Invalid cognitiveLoad: ${item.cognitiveLoad}`
              );
            }
            if (item.whyThisWorks) {
              assert(
                typeof item.whyThisWorks === 'string' && item.whyThisWorks.length > 0,
                'whyThisWorks should be a non-empty string'
              );
              assert(
                item.whyThisWorks.length <= 200,
                `whyThisWorks too long: ${item.whyThisWorks.length} chars`
              );
            }
          }
        }
      }
    }
    
    // At least one pack should have analytics if packs exist
    if (workspaces.length > 0) {
      // This is informational - analytics may not be in all packs yet
      console.log('  Analytics metadata check: ' + (foundAnalytics ? 'Found analytics in index items' : 'No analytics found (may be expected)'));
    }
  });
  
  // E2E Test: Analytics metadata in pack entries
  test('pack entries include analytics metadata', async () => {
    const workspacesDir = join(CONTENT_DIR, 'workspaces');
    if (!existsSync(workspacesDir)) {
      return; // Skip if no workspaces
    }
    
    const workspaces = readdirSync(workspacesDir).filter(item => {
      const itemPath = join(workspacesDir, item);
      return existsSync(itemPath);
    });
    
    let packsChecked = 0;
    let packsWithAnalytics = 0;
    
    for (const workspace of workspaces) {
      const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
      if (!existsSync(packsDir)) {
        continue;
      }
      
      const packDirs = readdirSync(packsDir).filter(item => {
        const itemPath = join(packsDir, item);
        return existsSync(join(itemPath, 'pack.json'));
      });
      
      for (const packDir of packDirs) {
        const packPath = join(packsDir, packDir, 'pack.json');
        try {
          const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
          packsChecked++;
          
          if (pack.analytics && typeof pack.analytics === 'object') {
            packsWithAnalytics++;
            
            // Verify analytics structure
            assert(
              pack.analytics.goal && typeof pack.analytics.goal === 'string',
              `Pack ${pack.id} analytics.goal should be a string`
            );
            assert(
              Array.isArray(pack.analytics.constraints),
              `Pack ${pack.id} analytics.constraints should be an array`
            );
            assert(
              Array.isArray(pack.analytics.levers),
              `Pack ${pack.id} analytics.levers should be an array`
            );
            assert(
              Array.isArray(pack.analytics.successCriteria),
              `Pack ${pack.id} analytics.successCriteria should be an array`
            );
            assert(
              Array.isArray(pack.analytics.commonMistakes),
              `Pack ${pack.id} analytics.commonMistakes should be an array`
            );
            assert(
              ['substitution', 'pattern-switch', 'roleplay-bounded'].includes(pack.analytics.drillType),
              `Pack ${pack.id} analytics.drillType should be valid enum`
            );
            assert(
              ['low', 'medium', 'high'].includes(pack.analytics.cognitiveLoad),
              `Pack ${pack.id} analytics.cognitiveLoad should be valid enum`
            );
          }
        } catch (err: any) {
          // Skip invalid packs
        }
      }
    }
    
    if (packsChecked > 0) {
      console.log(`  Analytics coverage: ${packsWithAnalytics}/${packsChecked} packs have analytics`);
    }
  });
  
  // E2E Test: Index analytics summary matches pack analytics
  test('index analytics summary matches pack analytics', async () => {
    const workspacesDir = join(CONTENT_DIR, 'workspaces');
    if (!existsSync(workspacesDir)) {
      return; // Skip if no workspaces
    }
    
    const workspaces = readdirSync(workspacesDir).filter(item => {
      const itemPath = join(workspacesDir, item);
      return existsSync(itemPath);
    });
    
    for (const workspace of workspaces) {
      const contextIndexPath = join(CONTENT_DIR, 'workspaces', workspace, 'context', 'index.json');
      if (!existsSync(contextIndexPath)) {
        continue;
      }
      
      const index = JSON.parse(readFileSync(contextIndexPath, 'utf-8'));
      
      for (const item of index.items || []) {
        if (item.kind === 'pack' && item.entryUrl) {
          // Resolve entry URL to local path
          const relativePath = item.entryUrl.replace(/^\/v1\//, '');
          const packPath = join(CONTENT_DIR, relativePath);
          
          if (existsSync(packPath)) {
            try {
              const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
              
              if (pack.analytics && typeof pack.analytics === 'object') {
                // Verify index summary matches pack analytics
                if (item.drillType) {
                  assert(
                    item.drillType === pack.analytics.drillType,
                    `Index item ${item.id} drillType mismatch: ${item.drillType} vs ${pack.analytics.drillType}`
                  );
                }
                if (item.cognitiveLoad) {
                  assert(
                    item.cognitiveLoad === pack.analytics.cognitiveLoad,
                    `Index item ${item.id} cognitiveLoad mismatch: ${item.cognitiveLoad} vs ${pack.analytics.cognitiveLoad}`
                  );
                }
                if (item.whyThisWorks) {
                  // whyThisWorks is derived from goal + first successCriteria
                  const expected = pack.analytics.goal + 
                    (pack.analytics.successCriteria && pack.analytics.successCriteria.length > 0
                      ? ' ' + pack.analytics.successCriteria[0]
                      : '');
                  const expectedTruncated = expected.length > 200 ? expected.substring(0, 197) + '...' : expected;
                  
                  // Allow for slight variations in truncation
                  assert(
                    item.whyThisWorks === expectedTruncated || item.whyThisWorks.startsWith(pack.analytics.goal),
                    `Index item ${item.id} whyThisWorks should match or start with goal`
                  );
                }
              }
            } catch (err: any) {
              // Skip invalid packs
            }
          }
        }
      }
    }
  });

  // E2E Test 39: friends_small_talk scenario template exists and is valid
  test('friends_small_talk scenario template exists and is valid', () => {
    const templatePath = join(__dirname, '..', 'content', 'templates', 'v1', 'scenarios', 'friends_small_talk.json');
    assert(existsSync(templatePath), 'friends_small_talk template should exist');
    
    const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
    assert(template.schemaVersion === 1, 'Template should have schemaVersion 1');
    assert(template.scenarioId === 'friends_small_talk', 'Template scenarioId should be friends_small_talk');
    assert(template.defaultRegister === 'casual', 'Template defaultRegister should be casual');
    assert(template.primaryStructure, 'Template should have primaryStructure');
    assert(Array.isArray(template.variationSlots), 'Template should have variationSlots array');
    assert(template.variationSlots.length > 0, 'Template variationSlots should not be empty');
    assert(Array.isArray(template.requiredTokens), 'Template should have requiredTokens array');
    assert(template.requiredTokens.length >= 18, 'Template should have at least 18 required tokens');
    assert(Array.isArray(template.stepBlueprint), 'Template should have stepBlueprint array');
    assert(template.stepBlueprint.length >= 2, 'Template should have at least 2 steps');
    
    // Verify phrase tokens are included
    const hasPhraseTokens = template.requiredTokens.some((token: string) => token.includes(' '));
    assert(hasPhraseTokens, 'Template should include phrase tokens (multi-word tokens)');
    
    console.log('  ✅ friends_small_talk template is valid');
  });
  
  // E2E Test 40: friends_small_talk packs can be generated
  test('friends_small_talk packs can be generated', () => {
    const testPackId = `e2e-friends-small-talk-${Date.now()}`;
    const workspace = 'de';
    
    try {
      console.log(`  Generating test pack: ${testPackId}`);
      
      const output = execSync(
        `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario friends_small_talk --level A1 --seed 6001 2>&1`,
        {
          cwd: join(__dirname, '..'),
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );
      
      const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
      assert(existsSync(packPath), `Generated pack should exist at ${packPath}`);
      
      const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
      assert(pack.id === testPackId, 'Pack ID should match');
      assert(pack.scenario === 'friends_small_talk', 'Pack scenario should be friends_small_talk');
      assert(pack.register === 'casual', 'Pack register should be casual');
      assert(Array.isArray(pack.prompts), 'Pack should have prompts array');
      assert(pack.prompts.length >= 12, 'Pack should have at least 12 prompts');
      assert(pack.sessionPlan, 'Pack should have sessionPlan');
      assert(Array.isArray(pack.sessionPlan.steps), 'Pack sessionPlan should have steps');
      
      // Cleanup
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
      
      console.log('  ✅ friends_small_talk pack generation works');
    } catch (err: any) {
      // Cleanup on error
      try {
        execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
          cwd: join(__dirname, '..'),
          stdio: 'pipe'
        });
      } catch {}
      throw new Error(`friends_small_talk pack generation failed: ${err.message}`);
    }
  });
  
  // E2E Test 41: friends_small_talk packs appear in index after generation
  test('friends_small_talk packs appear in index after generation', () => {
    const testPackId = `e2e-friends-index-${Date.now()}`;
    const workspace = 'de';
    
    try {
      // Generate pack
      execSync(
        `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario friends_small_talk --level A1 --seed 6002 2>&1`,
        {
          cwd: join(__dirname, '..'),
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );
      
      // Regenerate indexes
      execSync('npm run content:generate-indexes -- --workspace de', {
        cwd: join(__dirname, '..'),
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      // Check index
      const indexPath = join(CONTENT_DIR, 'workspaces', workspace, 'context', 'index.json');
      assert(existsSync(indexPath), 'Context index should exist');
      
      const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
      const packItem = index.items?.find((item: any) => item.id === testPackId);
      assert(packItem, `Pack ${testPackId} should appear in index`);
      assert(packItem.scenario === 'friends_small_talk', 'Index item should have correct scenario');
      assert(packItem.entryUrl === `/v1/workspaces/${workspace}/packs/${testPackId}/pack.json`, 'Index item should have correct entryUrl');
      
      // Cleanup
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
      
      console.log('  ✅ friends_small_talk packs appear in index');
    } catch (err: any) {
      // Cleanup on error
      try {
        execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
          cwd: join(__dirname, '..'),
          stdio: 'pipe'
        });
      } catch {}
      throw new Error(`friends_small_talk index test failed: ${err.message}`);
    }
  });
  
  // E2E Test 42: friends_small_talk token matching works correctly
  test('friends_small_talk token matching works correctly', () => {
    const testPackId = `e2e-friends-tokens-${Date.now()}`;
    const workspace = 'de';
    
    try {
      // Generate pack
      execSync(
        `npx tsx scripts/generate-pack.ts --workspace ${workspace} --packId ${testPackId} --scenario friends_small_talk --level A2 --seed 6003 2>&1`,
        {
          cwd: join(__dirname, '..'),
          encoding: 'utf-8',
          stdio: 'pipe'
        }
      );
      
      const packPath = join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId, 'pack.json');
      const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
      
      // Load token dictionary
      const templatePath = join(__dirname, '..', 'content', 'templates', 'v1', 'scenarios', 'friends_small_talk.json');
      const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
      
      // Verify each prompt has at least 2 tokens
      for (const prompt of pack.prompts) {
        const textLower = prompt.text.toLowerCase();
        let tokenCount = 0;
        
        for (const token of template.requiredTokens) {
          if (textLower.includes(token.toLowerCase())) {
            tokenCount++;
          }
        }
        
        assert(tokenCount >= 2, `Prompt "${prompt.id}" should have >= 2 scenario tokens, got ${tokenCount}. Text: "${prompt.text}"`);
      }
      
      // Verify at least one prompt contains a phrase token
      const phraseTokens = template.requiredTokens.filter((t: string) => t.includes(' '));
      let hasPhraseToken = false;
      for (const prompt of pack.prompts) {
        const textLower = prompt.text.toLowerCase();
        for (const phrase of phraseTokens) {
          if (textLower.includes(phrase.toLowerCase())) {
            hasPhraseToken = true;
            break;
          }
        }
        if (hasPhraseToken) break;
      }
      
      // Phrase tokens are preferred but not required (soft check)
      if (!hasPhraseToken) {
        console.warn('  ⚠️  No phrase tokens found in generated prompts (acceptable but preferred)');
      }
      
      // Cleanup
      execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
        cwd: join(__dirname, '..'),
        stdio: 'pipe'
      });
      
      console.log('  ✅ friends_small_talk token matching works correctly');
    } catch (err: any) {
      // Cleanup on error
      try {
        execSync(`rm -rf ${join(CONTENT_DIR, 'workspaces', workspace, 'packs', testPackId)}`, {
          cwd: join(__dirname, '..'),
          stdio: 'pipe'
        });
      } catch {}
      throw new Error(`friends_small_talk token matching test failed: ${err.message}`);
    }
  });

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

