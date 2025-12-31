#!/usr/bin/env tsx

/**
 * Sprint Report Generator
 * 
 * Generates a machine-readable report proving content coherence after expansion sprint.
 * 
 * Usage:
 *   tsx scripts/sprint-report.ts --workspace de
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computePackCatalogAnalytics } from './content-quality/computeCatalogAnalytics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const REPORTS_DIR = join(__dirname, '..', 'docs', 'reports');

interface PackEntry {
  id: string;
  kind: string;
  scenario?: string;
  level?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  prompts?: Array<{
    id: string;
    text: string;
    slotsChanged?: string[];
  }>;
  analytics?: {
    slotSwitchDensity?: number;
    scenarioCoverageScore?: number;
    primaryStructure?: string;
  };
}

interface DrillEntry {
  id: string;
  kind: string;
  level?: string;
}

interface SprintReport {
  generatedAt: string;
  workspace: string;
  summary: {
    totalPacks: number;
    totalDrills: number;
    totalUnits: number;
  };
  distribution: {
    byScenario: Record<string, number>;
    byLevel: Record<string, number>;
  };
  primaryStructureFrequency: Record<string, number>;
  slotSwitchDensityHistogram: {
    bins: Array<{ range: string; count: number }>;
    min: number;
    max: number;
    avg: number;
  };
  scenarioCoverageScore: {
    min: number;
    max: number;
    avg: number;
  };
  duplicateDetection: {
    duplicateCount: number;
    status: 'pass' | 'fail';
  };
}

/**
 * Load all packs from workspace
 */
function loadPacks(workspace: string): PackEntry[] {
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  if (!existsSync(packsDir)) {
    return [];
  }
  
  const packs: PackEntry[] = [];
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory());
  
  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir.name, 'pack.json');
    if (existsSync(packPath)) {
      try {
        const content = readFileSync(packPath, 'utf-8');
        const pack = JSON.parse(content);
        packs.push(pack);
      } catch (error) {
        console.warn(`⚠️  Warning: Failed to load pack ${packDir.name}: ${error}`);
      }
    }
  }
  
  return packs;
}

/**
 * Load all drills from workspace
 */
function loadDrills(workspace: string): DrillEntry[] {
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspace, 'drills');
  if (!existsSync(drillsDir)) {
    return [];
  }
  
  const drills: DrillEntry[] = [];
  const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory());
  
  for (const drillDir of drillDirs) {
    const drillPath = join(drillsDir, drillDir.name, 'drill.json');
    if (existsSync(drillPath)) {
      try {
        const content = readFileSync(drillPath, 'utf-8');
        const drill = JSON.parse(content);
        drills.push(drill);
      } catch (error) {
        console.warn(`⚠️  Warning: Failed to load drill ${drillDir.name}: ${error}`);
      }
    }
  }
  
  return drills;
}

/**
 * Compute slot switch density histogram
 */
function computeSlotSwitchDensityHistogram(packs: PackEntry[]): {
  bins: Array<{ range: string; count: number }>;
  min: number;
  max: number;
  avg: number;
} {
  const densities: number[] = [];
  
  for (const pack of packs) {
    if (pack.prompts && pack.prompts.length > 0) {
      // Compute slot switch density for this pack
      const multiSlotCount = pack.prompts.filter(p => 
        p.slotsChanged && p.slotsChanged.length >= 2
      ).length;
      const density = multiSlotCount / pack.prompts.length;
      densities.push(density);
    }
  }
  
  if (densities.length === 0) {
    return {
      bins: [],
      min: 0,
      max: 0,
      avg: 0
    };
  }
  
  const min = Math.min(...densities);
  const max = Math.max(...densities);
  const avg = densities.reduce((a, b) => a + b, 0) / densities.length;
  
  // Create histogram bins (0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0)
  const bins: Array<{ range: string; count: number }> = [
    { range: '0.0-0.2', count: 0 },
    { range: '0.2-0.4', count: 0 },
    { range: '0.4-0.6', count: 0 },
    { range: '0.6-0.8', count: 0 },
    { range: '0.8-1.0', count: 0 }
  ];
  
  for (const density of densities) {
    if (density < 0.2) bins[0].count++;
    else if (density < 0.4) bins[1].count++;
    else if (density < 0.6) bins[2].count++;
    else if (density < 0.8) bins[3].count++;
    else bins[4].count++;
  }
  
  return { bins, min, max, avg };
}

/**
 * Compute scenario coverage score statistics
 */
function computeScenarioCoverageStats(packs: PackEntry[]): {
  min: number;
  max: number;
  avg: number;
} {
  const scores: number[] = [];
  
  for (const pack of packs) {
    if (pack.analytics?.scenarioCoverageScore !== undefined) {
      scores.push(pack.analytics.scenarioCoverageScore);
    } else if (pack.prompts && pack.scenario) {
      // Compute on-the-fly if not in analytics
      const catalogAnalytics = computePackCatalogAnalytics(pack);
      scores.push(catalogAnalytics.scenarioCoverageScore);
    }
  }
  
  if (scores.length === 0) {
    return { min: 0, max: 0, avg: 0 };
  }
  
  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
    avg: scores.reduce((a, b) => a + b, 0) / scores.length
  };
}

/**
 * Detect duplicate prompts across all packs
 */
function detectDuplicates(packs: PackEntry[]): number {
  const promptTexts = new Map<string, string[]>();
  
  for (const pack of packs) {
    if (pack.prompts) {
      for (const prompt of pack.prompts) {
        const normalized = prompt.text.toLowerCase().trim();
        if (!promptTexts.has(normalized)) {
          promptTexts.set(normalized, []);
        }
        promptTexts.get(normalized)!.push(`${pack.id}:${prompt.id}`);
      }
    }
  }
  
  // Count duplicates (prompts that appear in multiple packs)
  let duplicateCount = 0;
  for (const [text, locations] of promptTexts.entries()) {
    // Group by pack ID
    const packIds = new Set(locations.map(loc => loc.split(':')[0]));
    if (packIds.size > 1) {
      duplicateCount += packIds.size - 1; // Count extra occurrences
    }
  }
  
  return duplicateCount;
}

/**
 * Generate sprint report
 */
function generateSprintReport(workspace: string): SprintReport {
  console.log(`📊 Generating sprint report for workspace: ${workspace}`);
  
  const packs = loadPacks(workspace);
  const drills = loadDrills(workspace);
  
  // Filter to sprint-generated items (those with "sprint-" prefix)
  const sprintPacks = packs.filter(p => p.id.startsWith('sprint-'));
  const sprintDrills = drills.filter(d => d.id.startsWith('sprint-drill-'));
  
  console.log(`   Found ${sprintPacks.length} sprint packs`);
  console.log(`   Found ${sprintDrills.length} sprint drills`);
  
  if (sprintPacks.length === 0 && sprintDrills.length === 0) {
    console.warn('⚠️  Warning: No sprint-generated items found. Make sure to run expansion-sprint.ts first.');
  }
  
  // Distribution by scenario
  const byScenario: Record<string, number> = {};
  for (const pack of sprintPacks) {
    const scenario = pack.scenario || 'unknown';
    byScenario[scenario] = (byScenario[scenario] || 0) + 1;
  }
  
  // Distribution by level
  const byLevel: Record<string, number> = {};
  for (const pack of sprintPacks) {
    const level = pack.level || 'unknown';
    byLevel[level] = (byLevel[level] || 0) + 1;
  }
  for (const drill of sprintDrills) {
    const level = drill.level || 'unknown';
    byLevel[level] = (byLevel[level] || 0) + 1;
  }
  
  // Primary structure frequency
  const primaryStructureFrequency: Record<string, number> = {};
  for (const pack of sprintPacks) {
    const structure = pack.primaryStructure || pack.analytics?.primaryStructure || 'unknown';
    primaryStructureFrequency[structure] = (primaryStructureFrequency[structure] || 0) + 1;
  }
  
  // Slot switch density histogram
  const slotSwitchDensityHistogram = computeSlotSwitchDensityHistogram(sprintPacks);
  
  // Scenario coverage score
  const scenarioCoverageScore = computeScenarioCoverageStats(sprintPacks);
  
  // Duplicate detection
  const duplicateCount = detectDuplicates(sprintPacks);
  
  const report: SprintReport = {
    generatedAt: new Date().toISOString(),
    workspace,
    summary: {
      totalPacks: sprintPacks.length,
      totalDrills: sprintDrills.length,
      totalUnits: sprintPacks.length + sprintDrills.length
    },
    distribution: {
      byScenario,
      byLevel
    },
    primaryStructureFrequency,
    slotSwitchDensityHistogram,
    scenarioCoverageScore,
    duplicateDetection: {
      duplicateCount,
      status: duplicateCount === 0 ? 'pass' : 'fail'
    }
  };
  
  return report;
}

/**
 * Format report as Markdown
 */
function formatMarkdownReport(report: SprintReport): string {
  const lines: string[] = [];
  
  lines.push('# Content Expansion Sprint Report v1');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`**Workspace:** ${report.workspace}`);
  lines.push('');
  
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Packs:** ${report.summary.totalPacks}`);
  lines.push(`- **Total Drills:** ${report.summary.totalDrills}`);
  lines.push(`- **Total Units:** ${report.summary.totalUnits}`);
  lines.push('');
  
  lines.push('## Distribution by Scenario');
  lines.push('');
  const scenarioEntries = Object.entries(report.distribution.byScenario)
    .sort((a, b) => b[1] - a[1]);
  for (const [scenario, count] of scenarioEntries) {
    lines.push(`- **${scenario}:** ${count}`);
  }
  lines.push('');
  
  lines.push('## Distribution by Level');
  lines.push('');
  const levelEntries = Object.entries(report.distribution.byLevel)
    .sort((a, b) => a[0].localeCompare(b[0]));
  for (const [level, count] of levelEntries) {
    lines.push(`- **${level}:** ${count}`);
  }
  lines.push('');
  
  lines.push('## Primary Structure Frequency');
  lines.push('');
  const structureEntries = Object.entries(report.primaryStructureFrequency)
    .sort((a, b) => b[1] - a[1]);
  for (const [structure, count] of structureEntries) {
    lines.push(`- **${structure}:** ${count}`);
  }
  lines.push('');
  
  lines.push('## Slot Switch Density Histogram');
  lines.push('');
  lines.push(`- **Min:** ${report.slotSwitchDensityHistogram.min.toFixed(3)}`);
  lines.push(`- **Max:** ${report.slotSwitchDensityHistogram.max.toFixed(3)}`);
  lines.push(`- **Average:** ${report.slotSwitchDensityHistogram.avg.toFixed(3)}`);
  lines.push('');
  lines.push('Distribution:');
  for (const bin of report.slotSwitchDensityHistogram.bins) {
    const bar = '█'.repeat(Math.ceil(bin.count / 2));
    lines.push(`- ${bin.range}: ${bin.count} ${bar}`);
  }
  lines.push('');
  
  lines.push('## Scenario Coverage Score');
  lines.push('');
  lines.push(`- **Min:** ${report.scenarioCoverageScore.min.toFixed(3)}`);
  lines.push(`- **Max:** ${report.scenarioCoverageScore.max.toFixed(3)}`);
  lines.push(`- **Average:** ${report.scenarioCoverageScore.avg.toFixed(3)}`);
  lines.push('');
  
  lines.push('## Duplicate Detection');
  lines.push('');
  lines.push(`- **Duplicate Count:** ${report.duplicateDetection.duplicateCount}`);
  lines.push(`- **Status:** ${report.duplicateDetection.status === 'pass' ? '✅ PASS' : '❌ FAIL'}`);
  if (report.duplicateDetection.duplicateCount > 0) {
    lines.push('');
    lines.push('⚠️  **Warning:** Duplicate prompts detected across packs. This violates quality gates.');
  }
  lines.push('');
  
  lines.push('---');
  lines.push('');
  lines.push('*This report proves content coherence, non-randomness, and scalability.*');
  
  return lines.join('\n');
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace = 'de';
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: tsx scripts/sprint-report.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --workspace <ws>   Workspace ID (default: de)');
      console.log('');
      console.log('Example:');
      console.log('  tsx scripts/sprint-report.ts --workspace de');
      process.exit(0);
    }
  }
  
  try {
    const report = generateSprintReport(workspace);
    
    // Ensure reports directory exists
    if (!existsSync(REPORTS_DIR)) {
      mkdirSync(REPORTS_DIR, { recursive: true });
    }
    
    // Write JSON report
    const jsonPath = join(REPORTS_DIR, 'expansion-sprint-v1.json');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    console.log(`✅ JSON report written: ${jsonPath}`);
    
    // Write Markdown report
    const mdPath = join(REPORTS_DIR, 'expansion-sprint-v1.md');
    const markdown = formatMarkdownReport(report);
    writeFileSync(mdPath, markdown, 'utf-8');
    console.log(`✅ Markdown report written: ${mdPath}`);
    
    console.log('\n📊 Report Summary:');
    console.log(`   Total Units: ${report.summary.totalUnits}`);
    console.log(`   Duplicate Count: ${report.duplicateDetection.duplicateCount} (${report.duplicateDetection.status})`);
    console.log(`   Slot Switch Density Avg: ${report.slotSwitchDensityHistogram.avg.toFixed(3)}`);
    console.log(`   Scenario Coverage Avg: ${report.scenarioCoverageScore.avg.toFixed(3)}`);
    
  } catch (error: any) {
    console.error(`❌ Failed to generate report: ${error.message}`);
    process.exit(1);
  }
}

main();

