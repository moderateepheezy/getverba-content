#!/usr/bin/env tsx

/**
 * Drills v4 Report Generator
 * 
 * Generates a markdown report showing:
 * - Mechanics coverage table
 * - Per-mechanic drill counts by level
 * - LoopType distribution
 * - QualitySignals summary
 * - Review queue summary
 * 
 * Usage:
 *   tsx scripts/drills-v4-report.ts [--workspace <ws>] [--output <path>]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v4', 'mechanics');

interface DrillEntry {
  id: string;
  kind: string;
  drillVersion?: string;
  level: string;
  mechanicId: string;
  mechanicLabel: string;
  loopType: string;
  difficultyTier: number;
  analytics?: {
    qualitySignals?: {
      multiSlotRate: number;
      uniqueVerbCount: number;
      uniqueSubjectCount: number;
      bannedPhraseCheckPassed: boolean;
    };
  };
  review?: {
    status: string;
  };
}

interface Report {
  generatedAt: string;
  workspace: string;
  mechanics: Array<{
    mechanicId: string;
    mechanicLabel: string;
    drillCount: number;
    drillsByLevel: Record<string, number>;
    drillsByTier: Record<string, number>;
    drillsByLoopType: Record<string, number>;
  }>;
  summary: {
    totalDrills: number;
    totalMechanics: number;
    drillsByLevel: Record<string, number>;
    drillsByTier: Record<string, number>;
    drillsByLoopType: Record<string, number>;
    reviewStatus: {
      needs_review: number;
      approved: number;
      rejected: number;
    };
    qualityMetrics: {
      avgMultiSlotRate: number;
      avgUniqueVerbCount: number;
      avgUniqueSubjectCount: number;
      bannedPhraseFailures: number;
    };
  };
}

/**
 * Load mechanic template
 */
function loadTemplate(mechanicId: string): any {
  const templatePath = join(TEMPLATES_DIR, `${mechanicId}.json`);
  if (!existsSync(templatePath)) {
    return null;
  }
  return JSON.parse(readFileSync(templatePath, 'utf-8'));
}

/**
 * Read drill entry
 */
function readDrillEntry(drillPath: string): DrillEntry | null {
  try {
    const content = readFileSync(drillPath, 'utf-8');
    const entry: any = JSON.parse(content);
    
    // Only process v4 drills
    if (entry.drillVersion !== 'v4') {
      return null;
    }
    
    return {
      id: entry.id,
      kind: entry.kind,
      drillVersion: entry.drillVersion,
      level: entry.level,
      mechanicId: entry.mechanicId,
      mechanicLabel: entry.mechanicLabel,
      loopType: entry.loopType,
      difficultyTier: entry.difficultyTier,
      analytics: entry.analytics,
      review: entry.review
    };
  } catch (error: any) {
    return null;
  }
}

/**
 * Scan drills for a workspace
 */
function scanDrills(workspaceId: string): DrillEntry[] {
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'drills');
  const drills: DrillEntry[] = [];
  
  if (!existsSync(drillsDir)) {
    return drills;
  }
  
  const entries = readdirSync(drillsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const drillPath = join(drillsDir, entry.name, 'drill.json');
    if (!existsSync(drillPath)) continue;
    
    const drill = readDrillEntry(drillPath);
    if (drill) {
      drills.push(drill);
    }
  }
  
  return drills;
}

/**
 * Generate report
 */
function generateReport(workspaceId: string): Report {
  const drills = scanDrills(workspaceId);
  const v4Drills = drills.filter(d => d.drillVersion === 'v4');
  
  // Group by mechanic
  const drillsByMechanic = new Map<string, DrillEntry[]>();
  for (const drill of v4Drills) {
    if (!drillsByMechanic.has(drill.mechanicId)) {
      drillsByMechanic.set(drill.mechanicId, []);
    }
    drillsByMechanic.get(drill.mechanicId)!.push(drill);
  }
  
  // Build mechanics data
  const mechanics: Report['mechanics'] = [];
  for (const [mechanicId, mechanicDrills] of drillsByMechanic.entries()) {
    const template = loadTemplate(mechanicId);
    const mechanicLabel = template ? template.mechanicLabel : mechanicId;
    
    const drillsByLevel: Record<string, number> = {};
    const drillsByTier: Record<string, number> = {};
    const drillsByLoopType: Record<string, number> = {};
    
    for (const drill of mechanicDrills) {
      drillsByLevel[drill.level] = (drillsByLevel[drill.level] || 0) + 1;
      drillsByTier[`tier${drill.difficultyTier}`] = (drillsByTier[`tier${drill.difficultyTier}`] || 0) + 1;
      drillsByLoopType[drill.loopType] = (drillsByLoopType[drill.loopType] || 0) + 1;
    }
    
    mechanics.push({
      mechanicId,
      mechanicLabel,
      drillCount: mechanicDrills.length,
      drillsByLevel,
      drillsByTier,
      drillsByLoopType
    });
  }
  
  // Sort mechanics by drill count (descending)
  mechanics.sort((a, b) => b.drillCount - a.drillCount);
  
  // Build summary
  const drillsByLevel: Record<string, number> = {};
  const drillsByTier: Record<string, number> = {};
  const drillsByLoopType: Record<string, number> = {};
  const reviewStatus = {
    needs_review: 0,
    approved: 0,
    rejected: 0
  };
  
  let totalMultiSlotRate = 0;
  let totalUniqueVerbCount = 0;
  let totalUniqueSubjectCount = 0;
  let bannedPhraseFailures = 0;
  let qualityMetricsCount = 0;
  
  for (const drill of v4Drills) {
    drillsByLevel[drill.level] = (drillsByLevel[drill.level] || 0) + 1;
    drillsByTier[`tier${drill.difficultyTier}`] = (drillsByTier[`tier${drill.difficultyTier}`] || 0) + 1;
    drillsByLoopType[drill.loopType] = (drillsByLoopType[drill.loopType] || 0) + 1;
    
    if (drill.review) {
      const status = drill.review.status || 'needs_review';
      if (status === 'needs_review') reviewStatus.needs_review++;
      else if (status === 'approved') reviewStatus.approved++;
      else if (status === 'rejected') reviewStatus.rejected++;
    } else {
      reviewStatus.needs_review++;
    }
    
    if (drill.analytics?.qualitySignals) {
      const qs = drill.analytics.qualitySignals;
      if (typeof qs.multiSlotRate === 'number') {
        totalMultiSlotRate += qs.multiSlotRate;
        qualityMetricsCount++;
      }
      if (typeof qs.uniqueVerbCount === 'number') {
        totalUniqueVerbCount += qs.uniqueVerbCount;
      }
      if (typeof qs.uniqueSubjectCount === 'number') {
        totalUniqueSubjectCount += qs.uniqueSubjectCount;
      }
      if (qs.bannedPhraseCheckPassed === false) {
        bannedPhraseFailures++;
      }
    }
  }
  
  return {
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    mechanics,
    summary: {
      totalDrills: v4Drills.length,
      totalMechanics: mechanics.length,
      drillsByLevel,
      drillsByTier,
      drillsByLoopType,
      reviewStatus,
      qualityMetrics: {
        avgMultiSlotRate: qualityMetricsCount > 0 ? totalMultiSlotRate / qualityMetricsCount : 0,
        avgUniqueVerbCount: v4Drills.length > 0 ? totalUniqueVerbCount / v4Drills.length : 0,
        avgUniqueSubjectCount: v4Drills.length > 0 ? totalUniqueSubjectCount / v4Drills.length : 0,
        bannedPhraseFailures
      }
    }
  };
}

/**
 * Format report as markdown
 */
function formatMarkdown(report: Report): string {
  const lines: string[] = [];
  
  lines.push('# Drills v4 Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`**Workspace:** ${report.workspace}`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Drills:** ${report.summary.totalDrills}`);
  lines.push(`- **Total Mechanics:** ${report.summary.totalMechanics}`);
  lines.push('');
  
  // Review Status
  lines.push('### Review Status');
  lines.push('');
  lines.push(`- **Needs Review:** ${report.summary.reviewStatus.needs_review}`);
  lines.push(`- **Approved:** ${report.summary.reviewStatus.approved}`);
  lines.push(`- **Rejected:** ${report.summary.reviewStatus.rejected}`);
  lines.push('');
  
  // Quality Metrics
  lines.push('### Quality Metrics');
  lines.push('');
  lines.push(`- **Avg Multi-Slot Rate:** ${(report.summary.qualityMetrics.avgMultiSlotRate * 100).toFixed(1)}%`);
  lines.push(`- **Avg Unique Verbs:** ${report.summary.qualityMetrics.avgUniqueVerbCount.toFixed(1)}`);
  lines.push(`- **Avg Unique Subjects:** ${report.summary.qualityMetrics.avgUniqueSubjectCount.toFixed(1)}`);
  lines.push(`- **Banned Phrase Failures:** ${report.summary.qualityMetrics.bannedPhraseFailures}`);
  lines.push('');
  
  // Distribution
  lines.push('### Distribution by Level');
  lines.push('');
  lines.push('| Level | Count |');
  lines.push('|-------|-------|');
  for (const [level, count] of Object.entries(report.summary.drillsByLevel).sort()) {
    lines.push(`| ${level} | ${count} |`);
  }
  lines.push('');
  
  lines.push('### Distribution by Tier');
  lines.push('');
  lines.push('| Tier | Count |');
  lines.push('|------|-------|');
  for (const [tier, count] of Object.entries(report.summary.drillsByTier).sort()) {
    lines.push(`| ${tier} | ${count} |`);
  }
  lines.push('');
  
  lines.push('### Distribution by Loop Type');
  lines.push('');
  lines.push('| Loop Type | Count |');
  lines.push('|-----------|-------|');
  for (const [loopType, count] of Object.entries(report.summary.drillsByLoopType).sort()) {
    lines.push(`| ${loopType} | ${count} |`);
  }
  lines.push('');
  
  // Mechanics Coverage
  lines.push('## Mechanics Coverage');
  lines.push('');
  lines.push('| Mechanic | Label | Drills | Levels | Tiers | Loop Types |');
  lines.push('|----------|-------|--------|--------|-------|------------|');
  
  for (const mechanic of report.mechanics) {
    const levels = Object.keys(mechanic.drillsByLevel).sort().join(', ');
    const tiers = Object.keys(mechanic.drillsByTier).sort().join(', ');
    const loopTypes = Object.keys(mechanic.drillsByLoopType).sort().join(', ');
    
    lines.push(`| ${mechanic.mechanicId} | ${mechanic.mechanicLabel} | ${mechanic.drillCount} | ${levels} | ${tiers} | ${loopTypes} |`);
  }
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace = 'de';
  let outputPath: string | null = null;
  
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if ((args[i] === '--output' || args[i] === '-o') && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    }
  }
  
  console.log(`📊 Generating drills v4 report for workspace: ${workspace}...\n`);
  
  const report = generateReport(workspace);
  const markdown = formatMarkdown(report);
  
  if (outputPath) {
    writeFileSync(outputPath, markdown, 'utf-8');
    console.log(`✅ Report written to: ${outputPath}`);
  } else {
    // Default: write to docs/reports/
    const reportsDir = join(__dirname, '..', 'docs', 'reports');
    if (!existsSync(reportsDir)) {
      const { mkdirSync } = require('fs');
      mkdirSync(reportsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const defaultPath = join(reportsDir, `drills-v4-${timestamp}.md`);
    writeFileSync(defaultPath, markdown, 'utf-8');
    console.log(`✅ Report written to: ${defaultPath}`);
  }
  
  console.log('\n' + markdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateReport, formatMarkdown };

