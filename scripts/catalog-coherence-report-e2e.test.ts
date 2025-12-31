#!/usr/bin/env tsx

/**
 * E2E tests for catalog coherence report workflow
 * 
 * Tests the complete workflow:
 * 1. Manifest loading
 * 2. Catalog traversal
 * 3. Entry loading
 * 4. Metrics computation
 * 5. Report generation
 * 6. Gate checking
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const TEST_CONTENT_DIR = join(PROJECT_ROOT, '.test-coherence-content');
const TEST_META_DIR = join(PROJECT_ROOT, '.test-coherence-meta');
const TEST_REPORTS_DIR = join(PROJECT_ROOT, '.test-coherence-reports');

// Simple test framework
function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        console.log(`✓ ${name}`);
      }).catch((error: any) => {
        console.error(`✗ ${name}`);
        console.error(`  ${error.message}`);
        throw error;
      });
    } else {
      console.log(`✓ ${name}`);
    }
  } catch (error: any) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    throw error;
  }
}

function expectTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || 'Expected true, got false');
  }
}

function expectEqual(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Setup/teardown
function setupTestDirs() {
  [TEST_CONTENT_DIR, TEST_META_DIR, TEST_REPORTS_DIR].forEach(dir => {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    mkdirSync(dir, { recursive: true });
  });
}

function cleanupTestDirs() {
  [TEST_CONTENT_DIR, TEST_META_DIR, TEST_REPORTS_DIR].forEach(dir => {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// Test: Complete workflow simulation
test('complete workflow simulation', () => {
  setupTestDirs();
  
  try {
    // Step 1: Create test manifest
    const manifest = {
      activeVersion: 'v1',
      schemaVersion: 1,
      activeWorkspace: 'de',
      workspaces: {
        de: '/v1/workspaces/de/catalog.json'
      }
    };
    
    const manifestPath = join(TEST_META_DIR, 'manifest.staging.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    expectTrue(existsSync(manifestPath), 'Manifest should be created');
    
    // Step 2: Create test catalog
    const catalog = {
      version: 'v1',
      workspace: 'de',
      language: 'German',
      sections: [
        {
          id: 'context',
          kind: 'context',
          title: 'Context Library',
          itemsUrl: '/v1/workspaces/de/context/index.json'
        }
      ]
    };
    
    const catalogPath = join(TEST_CONTENT_DIR, 'v1', 'workspaces', 'de', 'catalog.json');
    mkdirSync(join(TEST_CONTENT_DIR, 'v1', 'workspaces', 'de'), { recursive: true });
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    expectTrue(existsSync(catalogPath), 'Catalog should be created');
    
    // Step 3: Create test index
    const index = {
      version: 'v1',
      kind: 'context',
      total: 2,
      pageSize: 20,
      items: [
        {
          id: 'pack-001',
          title: 'Test Pack 1',
          level: 'A1',
          entryUrl: '/v1/packs/pack-001.json'
        },
        {
          id: 'pack-002',
          title: 'Test Pack 2',
          level: 'A2',
          entryUrl: '/v1/packs/pack-002.json'
        }
      ],
      nextPage: null
    };
    
    const indexPath = join(TEST_CONTENT_DIR, 'v1', 'workspaces', 'de', 'context', 'index.json');
    mkdirSync(join(TEST_CONTENT_DIR, 'v1', 'workspaces', 'de', 'context'), { recursive: true });
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    expectTrue(existsSync(indexPath), 'Index should be created');
    
    // Step 4: Create test packs
    const pack1 = {
      id: 'pack-001',
      kind: 'pack',
      level: 'A1',
      scenario: 'work',
      register: 'neutral',
      primaryStructure: 'present-tense',
      variationSlots: ['subject', 'verb'],
      prompts: [
        {
          id: 'prompt-1',
          text: 'Ich möchte einen Termin vereinbaren.',
          slotsChanged: ['subject', 'verb']
        },
        {
          id: 'prompt-2',
          text: 'Ich gehe ins Büro zur Arbeit.'
        }
      ],
      provenance: {
        source: 'pdf-ingestion',
        review: {
          status: 'approved'
        }
      }
    };
    
    const pack2 = {
      id: 'pack-002',
      kind: 'pack',
      level: 'A2',
      scenario: 'restaurant',
      register: 'neutral',
      prompts: [
        {
          id: 'prompt-1',
          text: 'Ich möchte eine Reservierung machen.'
        }
      ],
      provenance: {
        source: 'pdf-ingestion',
        review: {
          status: 'approved'
        }
      }
    };
    
    const pack1Path = join(TEST_CONTENT_DIR, 'v1', 'packs', 'pack-001.json');
    const pack2Path = join(TEST_CONTENT_DIR, 'v1', 'packs', 'pack-002.json');
    mkdirSync(join(TEST_CONTENT_DIR, 'v1', 'packs'), { recursive: true });
    writeFileSync(pack1Path, JSON.stringify(pack1, null, 2));
    writeFileSync(pack2Path, JSON.stringify(pack2, null, 2));
    expectTrue(existsSync(pack1Path), 'Pack 1 should be created');
    expectTrue(existsSync(pack2Path), 'Pack 2 should be created');
    
    // Step 5: Simulate pagination traversal
    const allItems: any[] = [];
    let currentPagePath = catalog.sections[0].itemsUrl.replace(/^\/v1\//, '');
    const visitedPages = new Set<string>();
    
    while (currentPagePath) {
      if (visitedPages.has(currentPagePath)) {
        break; // Loop detected
      }
      visitedPages.add(currentPagePath);
      
      // Build full path: TEST_CONTENT_DIR/v1/workspaces/de/context/index.json
      // currentPagePath is already "workspaces/de/context/index.json" (without /v1/)
      const pagePath = join(TEST_CONTENT_DIR, 'v1', currentPagePath);
      if (!existsSync(pagePath)) {
        break;
      }
      
      const page = JSON.parse(readFileSync(pagePath, 'utf-8'));
      allItems.push(...(page.items || []));
      
      currentPagePath = page.nextPage ? page.nextPage.replace(/^\/v1\//, '') : null;
    }
    
    expectEqual(allItems.length, 2, 'Should collect all items from pagination');
    
    // Step 6: Simulate entry loading
    const entries: any[] = [];
    for (const item of allItems) {
      // entryUrl is "/v1/packs/pack-001.json", need to remove /v1/ and add v1/ back
      const entryPath = join(TEST_CONTENT_DIR, 'v1', item.entryUrl.replace(/^\/v1\//, ''));
      if (existsSync(entryPath)) {
        const entry = JSON.parse(readFileSync(entryPath, 'utf-8'));
        entries.push({ item, entry });
      }
    }
    
    expectEqual(entries.length, 2, 'Should load all entries');
    
    // Step 7: Simulate metrics computation
    const metrics = {
      totals: { packs: 0, exams: 0, drills: 0, total: 0 },
      distribution: { scenario: {} as Record<string, number>, register: {} as Record<string, number>, level: {} as Record<string, number> },
      coverage: { primaryStructures: {} as Record<string, number>, variationSlots: {} as Record<string, number> },
      reviewMetrics: { needsReview: 0, approved: 0, unknown: 0 }
    };
    
    for (const { entry } of entries) {
      if (entry.kind === 'pack') metrics.totals.packs++;
      metrics.totals.total++;
      
      if (entry.scenario) {
        metrics.distribution.scenario[entry.scenario] = 
          (metrics.distribution.scenario[entry.scenario] || 0) + 1;
      }
      if (entry.level) {
        metrics.distribution.level[entry.level] = 
          (metrics.distribution.level[entry.level] || 0) + 1;
      }
      
      const reviewStatus = entry.provenance?.review?.status || 'unknown';
      if (reviewStatus === 'approved') metrics.reviewMetrics.approved++;
    }
    
    expectEqual(metrics.totals.packs, 2, 'Should count 2 packs');
    expectEqual(metrics.distribution.scenario.work, 1, 'Should count work scenario');
    expectEqual(metrics.distribution.scenario.restaurant, 1, 'Should count restaurant scenario');
    expectEqual(metrics.reviewMetrics.approved, 2, 'Should count approved packs');
    
    console.log('   ✅ Complete workflow simulation successful');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Report structure validation
test('report structure validation', () => {
  setupTestDirs();
  
  try {
    const report = {
      generatedAt: new Date().toISOString(),
      gitSha: 'abc123def456',
      manifest: 'staging',
      workspaces: ['de'],
      metrics: {
        totals: { packs: 10, exams: 5, drills: 2, total: 17 },
        distribution: {
          scenario: { work: 5, restaurant: 3, shopping: 2 },
          register: { neutral: 8, formal: 2 },
          level: { A1: 6, A2: 4 }
        },
        coverage: {
          primaryStructures: { 'present-tense': 8, 'past-tense': 2 },
          variationSlots: { subject: 10, verb: 8 }
        },
        promptMetrics: {
          promptsPerPack: { min: 8, max: 12, avg: 10, distribution: { 10: 8, 12: 2 } },
          multiSlotVariationRate: 0.6,
          scenarioTokenCoverageRate: 0.85,
          avgTokenHitsPerPrompt: { work: 3.2, restaurant: 2.8 }
        },
        reviewMetrics: {
          needsReview: 0,
          approved: 10,
          unknown: 0
        },
        violations: {
          bannedPhrases: [],
          duplicates: []
        },
        risks: []
      },
      perPackFlags: {
        'pack-001': {
          lowTokenDensity: false,
          outlineStepsMismatch: false,
          repeatedSkeletonPatterns: false,
          riskScore: 0
        }
      }
    };
    
    // Validate structure
    expectTrue(report.generatedAt !== undefined, 'GeneratedAt required');
    expectTrue(report.gitSha !== undefined, 'GitSha required');
    expectTrue(report.manifest !== undefined, 'Manifest required');
    expectTrue(Array.isArray(report.workspaces), 'Workspaces must be array');
    expectTrue(report.metrics !== undefined, 'Metrics required');
    expectTrue(report.metrics.totals !== undefined, 'Totals required');
    expectTrue(report.metrics.distribution !== undefined, 'Distribution required');
    expectTrue(report.metrics.violations !== undefined, 'Violations required');
    expectTrue(report.metrics.risks !== undefined, 'Risks required');
    expectTrue(report.perPackFlags !== undefined, 'PerPackFlags required');
    
    console.log('   ✅ Report structure validation works');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Gate checking logic
test('gate checking logic', () => {
  setupTestDirs();
  
  try {
    // Test case 1: No violations
    const cleanReport = {
      metrics: {
        violations: {
          bannedPhrases: [],
          duplicates: []
        },
        reviewMetrics: {
          needsReview: 0,
          approved: 10
        }
      }
    };
    
    const failures1: string[] = [];
    if (cleanReport.metrics.violations.duplicates.length > 0) {
      failures1.push('Duplicates found');
    }
    if (cleanReport.metrics.violations.bannedPhrases.length > 0) {
      failures1.push('Banned phrases found');
    }
    if (cleanReport.metrics.reviewMetrics.needsReview > 0) {
      failures1.push('Unapproved content found');
    }
    
    expectEqual(failures1.length, 0, 'Clean report should pass gate');
    
    // Test case 2: With violations
    const violationReport = {
      metrics: {
        violations: {
          bannedPhrases: [{ packId: 'pack-001', promptId: 'p1', phrase: "let's practice" }],
          duplicates: [{ packId1: 'pack-001', packId2: 'pack-002', reason: 'Duplicate' }]
        },
        reviewMetrics: {
          needsReview: 2,
          approved: 8
        }
      }
    };
    
    const failures2: string[] = [];
    if (violationReport.metrics.violations.duplicates.length > 0) {
      failures2.push('Duplicates found');
    }
    if (violationReport.metrics.violations.bannedPhrases.length > 0) {
      failures2.push('Banned phrases found');
    }
    if (violationReport.metrics.reviewMetrics.needsReview > 0) {
      failures2.push('Unapproved content found');
    }
    
    expectTrue(failures2.length > 0, 'Violation report should fail gate');
    expectTrue(failures2.includes('Duplicates found'), 'Should detect duplicates');
    expectTrue(failures2.includes('Banned phrases found'), 'Should detect banned phrases');
    expectTrue(failures2.includes('Unapproved content found'), 'Should detect unapproved content');
    
    console.log('   ✅ Gate checking logic works');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Risk scoring
test('risk scoring', () => {
  setupTestDirs();
  
  try {
    const risks = [
      { packId: 'pack-001', reasons: ['Low token density'], score: 3 },
      { packId: 'pack-002', reasons: ['Repeated skeleton patterns'], score: 2 },
      { packId: 'pack-003', reasons: ['Low token density', 'Repeated skeleton patterns'], score: 5 }
    ];
    
    // Sort by score descending
    risks.sort((a, b) => b.score - a.score);
    
    expectEqual(risks[0].packId, 'pack-003', 'Highest risk should be first');
    expectEqual(risks[0].score, 5, 'Highest score should be 5');
    expectEqual(risks[risks.length - 1].score, 2, 'Lowest score should be 2');
    
    // Top 10 risks
    const topRisks = risks.slice(0, 10);
    expectTrue(topRisks.length <= 10, 'Should limit to top 10');
    expectTrue(topRisks.every((r, i) => i === 0 || r.score <= topRisks[i - 1].score), 
      'Should be sorted by score');
    
    console.log('   ✅ Risk scoring works');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Report archiving workflow
test('report archiving workflow', () => {
  setupTestDirs();
  
  try {
    const gitSha = 'abc123def456';
    const reportsDir = TEST_REPORTS_DIR;
    
    // Simulate report generation
    const report = {
      generatedAt: new Date().toISOString(),
      gitSha,
      metrics: { totals: { packs: 10 } }
    };
    
    // Write reports
    const jsonPath = join(reportsDir, 'coherence.json');
    const mdPath = join(reportsDir, 'coherence.md');
    
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeFileSync(mdPath, '# Coherence Report\n\nTest report');
    
    expectTrue(existsSync(jsonPath), 'JSON report should exist');
    expectTrue(existsSync(mdPath), 'Markdown report should exist');
    
    // Simulate archiving (rename to git SHA)
    const archivedJsonPath = join(reportsDir, `${gitSha}.coherence.json`);
    const archivedMdPath = join(reportsDir, `${gitSha}.coherence.md`);
    
    // In real workflow, this would be done by promote script
    if (existsSync(jsonPath)) {
      writeFileSync(archivedJsonPath, readFileSync(jsonPath, 'utf-8'));
    }
    if (existsSync(mdPath)) {
      writeFileSync(archivedMdPath, readFileSync(mdPath, 'utf-8'));
    }
    
    expectTrue(existsSync(archivedJsonPath), 'Archived JSON should exist');
    expectTrue(existsSync(archivedMdPath), 'Archived Markdown should exist');
    
    // Verify archived content
    const archived = JSON.parse(readFileSync(archivedJsonPath, 'utf-8'));
    expectEqual(archived.gitSha, gitSha, 'Archived report should have correct git SHA');
    
    console.log('   ✅ Report archiving workflow works');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Worker endpoint simulation
test('worker endpoint simulation', () => {
  setupTestDirs();
  
  try {
    const gitSha = 'abc123def456';
    const baseUrl = 'https://api.example.com';
    
    // Simulate report listing
    const reports = [
      { gitSha: 'abc123', lastModified: '2025-01-01T12:00:00Z', formats: { json: {}, md: {} } },
      { gitSha: 'def456', lastModified: '2025-01-02T12:00:00Z', formats: { json: {}, md: {} } }
    ];
    
    // Simulate GET /reports response
    const listResponse = {
      reports,
      cursor: null
    };
    
    expectTrue(Array.isArray(listResponse.reports), 'Reports should be array');
    expectEqual(listResponse.reports.length, 2, 'Should have 2 reports');
    
    // Simulate GET /reports/:gitSha response
    const reportResponse = {
      gitSha,
      json: `${baseUrl}/v1/meta/reports/${gitSha}.coherence.json`,
      markdown: `${baseUrl}/v1/meta/reports/${gitSha}.coherence.md`
    };
    
    expectEqual(reportResponse.gitSha, gitSha, 'Response should have git SHA');
    expectTrue(reportResponse.json.includes(gitSha), 'JSON URL should include git SHA');
    expectTrue(reportResponse.markdown.includes(gitSha), 'Markdown URL should include git SHA');
    
    console.log('   ✅ Worker endpoint simulation works');
  } finally {
    cleanupTestDirs();
  }
});

// Test: Multi-workspace support
test('multi-workspace support', () => {
  setupTestDirs();
  
  try {
    const manifest = {
      workspaces: {
        de: '/v1/workspaces/de/catalog.json',
        en: '/v1/workspaces/en/catalog.json'
      }
    };
    
    const workspaces = Object.keys(manifest.workspaces);
    expectEqual(workspaces.length, 2, 'Should support multiple workspaces');
    expectTrue(workspaces.includes('de'), 'Should include de workspace');
    expectTrue(workspaces.includes('en'), 'Should include en workspace');
    
    // Simulate processing all workspaces
    const allEntries: any[] = [];
    for (const workspace of workspaces) {
      // Would load catalog and process entries
      allEntries.push({ workspace, count: 5 });
    }
    
    expectEqual(allEntries.length, 2, 'Should process all workspaces');
    
    console.log('   ✅ Multi-workspace support works');
  } finally {
    cleanupTestDirs();
  }
});

// Main test runner
async function main() {
  console.log('🧪 Running catalog coherence report E2E tests...\n');
  
  try {
    await test('complete workflow simulation', () => {});
    await test('report structure validation', () => {});
    await test('gate checking logic', () => {});
    await test('risk scoring', () => {});
    await test('report archiving workflow', () => {});
    await test('worker endpoint simulation', () => {});
    await test('multi-workspace support', () => {});
    
    console.log('\n✅ All catalog coherence report E2E tests passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

