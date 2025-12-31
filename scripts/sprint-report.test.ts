#!/usr/bin/env tsx

/**
 * Unit tests for sprint-report.ts
 * 
 * Tests:
 * - Report generation with valid data
 * - Metrics computation (distribution, histograms, coverage)
 * - Duplicate detection
 * - Empty state handling
 * - JSON and Markdown output
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const REPORTS_DIR = join(__dirname, '..', 'docs', 'reports');

interface Test {
  name: string;
  fn: () => void;
}

const tests: Test[] = [];
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runSprintReport(args: string[]): string {
  const scriptPath = join(__dirname, 'sprint-report.ts');
  const cmd = `npx tsx "${scriptPath}" ${args.join(' ')}`;
  try {
    return execSync(cmd, { 
      encoding: 'utf-8',
      cwd: join(__dirname, '..')
    });
  } catch (error: any) {
    throw new Error(`Sprint report failed: ${error.message}`);
  }
}

function readReportJson(): any {
  const reportPath = join(REPORTS_DIR, 'expansion-sprint-v1.json');
  if (!existsSync(reportPath)) {
    throw new Error(`Report not found: ${reportPath}`);
  }
  const content = readFileSync(reportPath, 'utf-8');
  return JSON.parse(content);
}

function readReportMarkdown(): string {
  const reportPath = join(REPORTS_DIR, 'expansion-sprint-v1.md');
  if (!existsSync(reportPath)) {
    throw new Error(`Report not found: ${reportPath}`);
  }
  return readFileSync(reportPath, 'utf-8');
}

function cleanupSprintItems(workspace: string) {
  // Clean up sprint packs
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  if (existsSync(packsDir)) {
    const packDirs = readdirSync(packsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('sprint-'));
    for (const packDir of packDirs) {
      rmSync(join(packsDir, packDir.name), { recursive: true, force: true });
    }
  }
  
  // Clean up sprint drills
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspace, 'drills');
  if (existsSync(drillsDir)) {
    const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('sprint-drill-'));
    for (const drillDir of drillDirs) {
      rmSync(join(drillsDir, drillDir.name), { recursive: true, force: true });
    }
  }
}

function cleanupReports() {
  const jsonPath = join(REPORTS_DIR, 'expansion-sprint-v1.json');
  const mdPath = join(REPORTS_DIR, 'expansion-sprint-v1.md');
  if (existsSync(jsonPath)) rmSync(jsonPath);
  if (existsSync(mdPath)) rmSync(mdPath);
}

// Test: Report generation creates JSON and Markdown files
test('Report generation creates JSON and Markdown files', () => {
  const workspace = 'de';
  
  try {
    cleanupReports();
    
    // First generate some sprint content
    cleanupSprintItems(workspace);
    execSync(`npx tsx scripts/expansion-sprint.ts --workspace ${workspace} --scenarios work --levels A1 --packsCount 2 --drillsCount 1`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    // Generate report
    runSprintReport(['--workspace', workspace]);
    
    const jsonPath = join(REPORTS_DIR, 'expansion-sprint-v1.json');
    const mdPath = join(REPORTS_DIR, 'expansion-sprint-v1.md');
    
    assert(existsSync(jsonPath), 'JSON report should exist');
    assert(existsSync(mdPath), 'Markdown report should exist');
    
    const report = readReportJson();
    assert(report.workspace === workspace, 'Report should have correct workspace');
    assert(typeof report.summary === 'object', 'Report should have summary');
    assert(typeof report.distribution === 'object', 'Report should have distribution');
    
    console.log(`   ✅ Reports generated successfully`);
  } finally {
    cleanupSprintItems(workspace);
    cleanupReports();
  }
});

// Test: Report includes all required metrics
test('Report includes all required metrics', () => {
  const workspace = 'de';
  
  try {
    cleanupReports();
    
    // Generate sprint content
    cleanupSprintItems(workspace);
    execSync(`npx tsx scripts/expansion-sprint.ts --workspace ${workspace} --scenarios work,government_office --levels A1,A2 --packsCount 4 --drillsCount 2`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    // Generate report
    runSprintReport(['--workspace', workspace]);
    
    const report = readReportJson();
    
    // Check summary
    assert(typeof report.summary.totalPacks === 'number', 'Summary should have totalPacks');
    assert(typeof report.summary.totalDrills === 'number', 'Summary should have totalDrills');
    assert(typeof report.summary.totalUnits === 'number', 'Summary should have totalUnits');
    
    // Check distribution
    assert(typeof report.distribution.byScenario === 'object', 'Should have byScenario distribution');
    assert(typeof report.distribution.byLevel === 'object', 'Should have byLevel distribution');
    
    // Check primary structure frequency
    assert(typeof report.primaryStructureFrequency === 'object', 'Should have primaryStructureFrequency');
    
    // Check slot switch density histogram
    assert(typeof report.slotSwitchDensityHistogram === 'object', 'Should have slotSwitchDensityHistogram');
    assert(Array.isArray(report.slotSwitchDensityHistogram.bins), 'Histogram should have bins array');
    assert(typeof report.slotSwitchDensityHistogram.min === 'number', 'Histogram should have min');
    assert(typeof report.slotSwitchDensityHistogram.max === 'number', 'Histogram should have max');
    assert(typeof report.slotSwitchDensityHistogram.avg === 'number', 'Histogram should have avg');
    
    // Check scenario coverage score
    assert(typeof report.scenarioCoverageScore === 'object', 'Should have scenarioCoverageScore');
    assert(typeof report.scenarioCoverageScore.min === 'number', 'Coverage should have min');
    assert(typeof report.scenarioCoverageScore.max === 'number', 'Coverage should have max');
    assert(typeof report.scenarioCoverageScore.avg === 'number', 'Coverage should have avg');
    
    // Check duplicate detection
    assert(typeof report.duplicateDetection === 'object', 'Should have duplicateDetection');
    assert(typeof report.duplicateDetection.duplicateCount === 'number', 'Should have duplicateCount');
    assert(['pass', 'fail'].includes(report.duplicateDetection.status), 'Should have valid status');
    
    console.log(`   ✅ All required metrics present`);
  } finally {
    cleanupSprintItems(workspace);
    cleanupReports();
  }
});

// Test: Markdown report is readable and formatted
test('Markdown report is readable and formatted', () => {
  const workspace = 'de';
  
  try {
    cleanupReports();
    
    // Generate sprint content
    cleanupSprintItems(workspace);
    execSync(`npx tsx scripts/expansion-sprint.ts --workspace ${workspace} --scenarios work --levels A1 --packsCount 2 --drillsCount 1`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    // Generate report
    runSprintReport(['--workspace', workspace]);
    
    const markdown = readReportMarkdown();
    
    assert(markdown.includes('# Content Expansion Sprint Report'), 'Should have title');
    assert(markdown.includes('## Summary'), 'Should have summary section');
    assert(markdown.includes('## Distribution by Scenario'), 'Should have scenario distribution');
    assert(markdown.includes('## Distribution by Level'), 'Should have level distribution');
    assert(markdown.includes('## Primary Structure Frequency'), 'Should have structure frequency');
    assert(markdown.includes('## Slot Switch Density Histogram'), 'Should have histogram');
    assert(markdown.includes('## Scenario Coverage Score'), 'Should have coverage score');
    assert(markdown.includes('## Duplicate Detection'), 'Should have duplicate detection');
    
    console.log(`   ✅ Markdown report is properly formatted`);
  } finally {
    cleanupSprintItems(workspace);
    cleanupReports();
  }
});

// Test: Duplicate detection works correctly
test('Duplicate detection identifies duplicate prompts', () => {
  const workspace = 'de';
  
  try {
    cleanupReports();
    
    // Generate sprint content
    cleanupSprintItems(workspace);
    execSync(`npx tsx scripts/expansion-sprint.ts --workspace ${workspace} --scenarios work --levels A1 --packsCount 2 --drillsCount 0`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    // Generate report
    runSprintReport(['--workspace', workspace]);
    
    const report = readReportJson();
    
    assert(typeof report.duplicateDetection.duplicateCount === 'number', 'Should have duplicate count');
    assert(report.duplicateDetection.duplicateCount >= 0, 'Duplicate count should be non-negative');
    
    // Status should be 'pass' if no duplicates, 'fail' if duplicates found
    if (report.duplicateDetection.duplicateCount === 0) {
      assert(report.duplicateDetection.status === 'pass', 'Status should be pass when no duplicates');
    } else {
      assert(report.duplicateDetection.status === 'fail', 'Status should be fail when duplicates found');
    }
    
    console.log(`   ✅ Duplicate detection: ${report.duplicateDetection.duplicateCount} duplicates, status: ${report.duplicateDetection.status}`);
  } finally {
    cleanupSprintItems(workspace);
    cleanupReports();
  }
});

// Test: Empty state handling (no sprint items)
test('Report handles empty state gracefully', () => {
  const workspace = 'de';
  
  try {
    cleanupReports();
    cleanupSprintItems(workspace);
    
    // Generate report with no sprint items
    runSprintReport(['--workspace', workspace]);
    
    const report = readReportJson();
    
    // Should still generate report with zero counts
    assert(report.summary.totalPacks === 0, 'Should have zero packs');
    assert(report.summary.totalDrills === 0, 'Should have zero drills');
    assert(report.summary.totalUnits === 0, 'Should have zero total units');
    
    console.log(`   ✅ Empty state handled gracefully`);
  } finally {
    cleanupSprintItems(workspace);
    cleanupReports();
  }
});

// Test: Distribution counts are accurate
test('Distribution counts match actual content', () => {
  const workspace = 'de';
  
  try {
    cleanupReports();
    
    // Generate sprint content with known distribution
    cleanupSprintItems(workspace);
    execSync(`npx tsx scripts/expansion-sprint.ts --workspace ${workspace} --scenarios work,government_office --levels A1,A2 --packsCount 4 --drillsCount 2`, {
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    
    // Generate report
    runSprintReport(['--workspace', workspace]);
    
    const report = readReportJson();
    
    // Verify totals match
    const totalFromDistribution = Object.values(report.distribution.byLevel).reduce((a: any, b: any) => a + b, 0);
    assert(totalFromDistribution === report.summary.totalUnits, 
      `Distribution total (${totalFromDistribution}) should match summary total (${report.summary.totalUnits})`);
    
    // Verify scenario distribution has expected scenarios
    const scenarioKeys = Object.keys(report.distribution.byScenario);
    assert(scenarioKeys.length > 0, 'Should have at least one scenario');
    
    console.log(`   ✅ Distribution counts are accurate`);
  } finally {
    cleanupSprintItems(workspace);
    cleanupReports();
  }
});

// Run all tests
console.log('🧪 Running sprint-report.ts unit tests\n');

for (const testCase of tests) {
  try {
    testCase.fn();
    passed++;
    console.log(`✅ ${testCase.name}\n`);
  } catch (error: any) {
    failed++;
    console.error(`❌ ${testCase.name}`);
    console.error(`   ${error.message}\n`);
  }
}

console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

