#!/usr/bin/env tsx

/**
 * Content Review Report Generator
 * 
 * Scans all packs and generates a review report with:
 * - Pack list table (id, scenario, register, level, promptCount)
 * - Warnings per pack (alt_de similarity, outline mismatch, missing optional fields)
 * - Aggregate metrics (% prompts per intent, % prompts per register, pragmatics rules triggered)
 * 
 * Usage:
 *   npm run content:report
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');
const REPORTS_DIR = join(__dirname, '..', 'docs', 'reports');

interface PackEntry {
  schemaVersion: number;
  id: string;
  kind: string;
  title: string;
  level: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  outline?: string[];
  prompts?: Array<{
    id: string;
    text: string;
    intent?: string;
    register?: string;
    gloss_en?: string;
    alt_de?: string;
  }>;
  sessionPlan?: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
}

interface PackWarning {
  packId: string;
  type: string;
  message: string;
}

interface PackMetrics {
  packId: string;
  title: string;
  scenario: string;
  register: string;
  level: string;
  promptCount: number;
  warnings: PackWarning[];
}

interface ReviewReport {
  gitSha: string;
  generatedAt: string;
  packs: PackMetrics[];
  aggregates: {
    intentDistribution: Record<string, number>;
    registerDistribution: Record<string, number>;
    pragmaticsRulesTriggered: Record<string, number>;
  };
  summary: {
    totalPacks: number;
    totalPrompts: number;
    packsWithWarnings: number;
    totalWarnings: number;
  };
}

/**
 * Get git SHA
 */
function getGitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: join(__dirname, '..') }).trim();
  } catch {
    return 'not-in-git';
  }
}

/**
 * Normalize text for similarity comparison
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Compute similarity between two texts
 */
function computeSimilarity(text1: string, text2: string): number {
  const norm1 = normalizeText(text1);
  const norm2 = normalizeText(text2);
  
  if (norm1 === norm2) return 1.0;
  if (norm1.length === 0 || norm2.length === 0) return 0;
  
  // Jaccard similarity
  const tokens1 = new Set(norm1.split(/\s+/));
  const tokens2 = new Set(norm2.split(/\s+/));
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;
  
  // Simple edit distance
  const maxLen = Math.max(norm1.length, norm2.length);
  let distance = 0;
  const minLen = Math.min(norm1.length, norm2.length);
  for (let i = 0; i < minLen; i++) {
    if (norm1[i] !== norm2[i]) distance++;
  }
  distance += Math.abs(norm1.length - norm2.length);
  const editSimilarity = 1 - (distance / maxLen);
  
  return (jaccard * 0.7) + (editSimilarity * 0.3);
}

/**
 * Load pragmatics rules
 */
function loadPragmaticsRules(): any[] {
  try {
    const rulesPath = join(META_DIR, 'pragmatics', 'de_rules.json');
    if (!existsSync(rulesPath)) {
      return [];
    }
    const content = readFileSync(rulesPath, 'utf-8');
    const rules = JSON.parse(content);
    return rules.rules || [];
  } catch {
    return [];
  }
}

/**
 * Check if prompt matches pragmatics rule
 */
function matchesPragmaticsRule(prompt: any, pack: PackEntry, rule: any): boolean {
  const match = rule.match || {};
  
  if (match.scenario && pack.scenario !== match.scenario) return false;
  if (match.intent) {
    const ruleIntents = Array.isArray(match.intent) ? match.intent : [match.intent];
    if (!ruleIntents.includes(prompt.intent)) return false;
  }
  if (match.register) {
    const promptRegister = prompt.register || pack.register;
    const ruleRegisters = Array.isArray(match.register) ? match.register : [match.register];
    if (!ruleRegisters.includes(promptRegister)) return false;
  }
  if (match.primaryStructure && pack.primaryStructure !== match.primaryStructure) return false;
  
  return true;
}

/**
 * Find all pack files
 */
function findAllPacks(): PackEntry[] {
  const packs: PackEntry[] = [];
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  
  if (!existsSync(workspacesDir)) {
    return packs;
  }
  
  const workspaces = readdirSync(workspacesDir).filter(item => {
    const itemPath = join(workspacesDir, item);
    return statSync(itemPath).isDirectory();
  });
  
  for (const workspace of workspaces) {
    const packsDir = join(workspacesDir, workspace, 'packs');
    if (!existsSync(packsDir)) {
      continue;
    }
    
    const packDirs = readdirSync(packsDir).filter(item => {
      const itemPath = join(packsDir, item);
      return statSync(itemPath).isDirectory();
    });
    
    for (const packDir of packDirs) {
      const packPath = join(packsDir, packDir, 'pack.json');
      if (existsSync(packPath)) {
        try {
          const content = readFileSync(packPath, 'utf-8');
          const pack = JSON.parse(content);
          if (pack.kind === 'pack') {
            packs.push(pack);
          }
        } catch (err) {
          console.warn(`⚠️  Failed to parse pack: ${packPath}`);
        }
      }
    }
  }
  
  return packs;
}

/**
 * Compute metrics for a pack
 */
function computePackMetrics(pack: PackEntry, pragmaticsRules: any[]): PackMetrics {
  const warnings: PackWarning[] = [];
  const prompts = pack.prompts || [];
  
  // Check alt_de similarity
  prompts.forEach((prompt, idx) => {
    if (prompt.alt_de && prompt.text) {
      const similarity = computeSimilarity(prompt.text, prompt.alt_de);
      if (similarity > 0.85) {
        warnings.push({
          packId: pack.id,
          type: 'alt_de_similarity',
          message: `Prompt ${prompt.id} (${idx + 1}): alt_de is too similar to text (similarity: ${(similarity * 100).toFixed(1)}%)`
        });
      }
    }
  });
  
  // Check outline mismatch
  if (pack.outline && pack.sessionPlan && pack.sessionPlan.steps) {
    if (pack.outline.length !== pack.sessionPlan.steps.length) {
      warnings.push({
        packId: pack.id,
        type: 'outline_mismatch',
        message: `Outline length (${pack.outline.length}) does not match sessionPlan.steps.length (${pack.sessionPlan.steps.length})`
      });
    }
  }
  
  // Check missing optional recommended fields
  prompts.forEach((prompt, idx) => {
    if (!prompt.alt_de) {
      warnings.push({
        packId: pack.id,
        type: 'missing_alt_de',
        message: `Prompt ${prompt.id} (${idx + 1}): Missing optional alt_de (recommended for variety)`
      });
    }
  });
  
  return {
    packId: pack.id,
    title: pack.title,
    scenario: pack.scenario || 'unknown',
    register: pack.register || 'unknown',
    level: pack.level,
    promptCount: prompts.length,
    warnings
  };
}

/**
 * Generate review report
 */
function generateReport(): ReviewReport {
  const packs = findAllPacks();
  const pragmaticsRules = loadPragmaticsRules();
  
  const metrics = packs.map(pack => computePackMetrics(pack, pragmaticsRules));
  
  // Aggregate metrics
  const intentDistribution: Record<string, number> = {};
  const registerDistribution: Record<string, number> = {};
  const pragmaticsRulesTriggered: Record<string, number> = {};
  
  packs.forEach(pack => {
    (pack.prompts || []).forEach(prompt => {
      // Intent distribution
      if (prompt.intent) {
        intentDistribution[prompt.intent] = (intentDistribution[prompt.intent] || 0) + 1;
      }
      
      // Register distribution
      const register = prompt.register || pack.register || 'unknown';
      registerDistribution[register] = (registerDistribution[register] || 0) + 1;
      
      // Pragmatics rules triggered
      for (const rule of pragmaticsRules) {
        if (matchesPragmaticsRule(prompt, pack, rule)) {
          pragmaticsRulesTriggered[rule.id || 'unknown'] = (pragmaticsRulesTriggered[rule.id || 'unknown'] || 0) + 1;
        }
      }
    });
  });
  
  const totalPrompts = packs.reduce((sum, p) => sum + (p.prompts?.length || 0), 0);
  const packsWithWarnings = metrics.filter(m => m.warnings.length > 0).length;
  const totalWarnings = metrics.reduce((sum, m) => sum + m.warnings.length, 0);
  
  return {
    gitSha: getGitSha(),
    generatedAt: new Date().toISOString(),
    packs: metrics,
    aggregates: {
      intentDistribution,
      registerDistribution,
      pragmaticsRulesTriggered
    },
    summary: {
      totalPacks: packs.length,
      totalPrompts,
      packsWithWarnings,
      totalWarnings
    }
  };
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: ReviewReport): string {
  const lines: string[] = [];
  
  lines.push('# Content Review Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`**Git SHA:** ${report.gitSha}`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Packs:** ${report.summary.totalPacks}`);
  lines.push(`- **Total Prompts:** ${report.summary.totalPrompts}`);
  lines.push(`- **Packs with Warnings:** ${report.summary.packsWithWarnings}`);
  lines.push(`- **Total Warnings:** ${report.summary.totalWarnings}`);
  lines.push('');
  
  // Aggregate metrics
  lines.push('## Aggregate Metrics');
  lines.push('');
  
  // Intent distribution
  lines.push('### Intent Distribution');
  lines.push('');
  lines.push('| Intent | Count | Percentage |');
  lines.push('|--------|-------|------------|');
  const totalIntents = Object.values(report.aggregates.intentDistribution).reduce((a, b) => a + b, 0);
  Object.entries(report.aggregates.intentDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([intent, count]) => {
      const percentage = totalIntents > 0 ? ((count / totalIntents) * 100).toFixed(1) : '0.0';
      lines.push(`| ${intent} | ${count} | ${percentage}% |`);
    });
  lines.push('');
  
  // Register distribution
  lines.push('### Register Distribution');
  lines.push('');
  lines.push('| Register | Count | Percentage |');
  lines.push('|----------|-------|------------|');
  const totalRegisters = Object.values(report.aggregates.registerDistribution).reduce((a, b) => a + b, 0);
  Object.entries(report.aggregates.registerDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([register, count]) => {
      const percentage = totalRegisters > 0 ? ((count / totalRegisters) * 100).toFixed(1) : '0.0';
      lines.push(`| ${register} | ${count} | ${percentage}% |`);
    });
  lines.push('');
  
  // Pragmatics rules triggered
  if (Object.keys(report.aggregates.pragmaticsRulesTriggered).length > 0) {
    lines.push('### Pragmatics Rules Triggered');
    lines.push('');
    lines.push('| Rule ID | Trigger Count |');
    lines.push('|---------|---------------|');
    Object.entries(report.aggregates.pragmaticsRulesTriggered)
      .sort((a, b) => b[1] - a[1])
      .forEach(([ruleId, count]) => {
        lines.push(`| ${ruleId} | ${count} |`);
      });
    lines.push('');
  }
  
  // Pack list
  lines.push('## Pack List');
  lines.push('');
  lines.push('| Pack ID | Title | Scenario | Register | Level | Prompts | Warnings |');
  lines.push('|---------|-------|----------|----------|-------|---------|----------|');
  report.packs.forEach(p => {
    const warningCount = p.warnings.length;
    const warningEmoji = warningCount > 0 ? '⚠️' : '✅';
    lines.push(`| ${p.packId} | ${p.title} | ${p.scenario} | ${p.register} | ${p.level} | ${p.promptCount} | ${warningEmoji} ${warningCount} |`);
  });
  lines.push('');
  
  // Warnings section
  const packsWithWarnings = report.packs.filter(p => p.warnings.length > 0);
  if (packsWithWarnings.length > 0) {
    lines.push('## Warnings by Pack');
    lines.push('');
    packsWithWarnings.forEach(p => {
      lines.push(`### ${p.packId}: ${p.title}`);
      lines.push('');
      lines.push(`- **Scenario:** ${p.scenario}`);
      lines.push(`- **Register:** ${p.register}`);
      lines.push(`- **Level:** ${p.level}`);
      lines.push(`- **Prompts:** ${p.promptCount}`);
      lines.push('');
      lines.push('**Warnings:**');
      p.warnings.forEach(w => {
        lines.push(`- ${w.message}`);
      });
      lines.push('');
    });
  }
  
  return lines.join('\n');
}

/**
 * Main function
 */
function main() {
  console.log('Generating content review report...\n');
  
  const report = generateReport();
  
  // Print console summary
  console.log('Review Report Summary');
  console.log('='.repeat(50));
  console.log(`Total Packs: ${report.summary.totalPacks}`);
  console.log(`Total Prompts: ${report.summary.totalPrompts}`);
  console.log(`Packs with Warnings: ${report.summary.packsWithWarnings}`);
  console.log(`Total Warnings: ${report.summary.totalWarnings}`);
  console.log('');
  
  // Generate markdown report
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const reportPath = join(REPORTS_DIR, 'content_review_report.md');
  const markdown = generateMarkdownReport(report);
  writeFileSync(reportPath, markdown);
  
  console.log(`✅ Review report written to: ${reportPath}`);
}

main();

