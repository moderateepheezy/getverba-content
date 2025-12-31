#!/usr/bin/env tsx

/**
 * Quality Report Generator
 * 
 * Scans all packs and generates a quality report with metrics:
 * - Per-pack metrics (token coverage, multi-slot rate, duplicate similarity, etc.)
 * - Per-scenario coverage
 * - Red/yellow/green status summary
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { detectDuplicates } from './content-quality/dedupe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const REPORTS_DIR = join(__dirname, '..', 'docs', 'content-pipeline', 'reports');

interface PackEntry {
  schemaVersion: number;
  id: string;
  kind: string;
  title: string;
  level: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  prompts?: Array<{
    id: string;
    text: string;
    slots?: Record<string, string[]>;
    slotsChanged?: string[];
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

interface PackMetrics {
  packId: string;
  title: string;
  scenario: string;
  level: string;
  promptCount: number;
  avgPromptLength: number;
  avgPromptWords: number;
  scenarioTokenCoverage: {
    uniqueScenarioTokensUsed: number;
    perStepScenarioTokenPresence: boolean[];
  };
  multiSlotRate: number;
  nearDuplicateRate: number;
  status: 'RED' | 'YELLOW' | 'GREEN';
  issues: string[];
}

interface ScenarioMetrics {
  scenario: string;
  packCount: number;
  avgRichness: number;
  totalPacks: number;
}

interface QualityReport {
  gitSha: string;
  generatedAt: string;
  packs: PackMetrics[];
  scenarios: ScenarioMetrics[];
  summary: {
    totalPacks: number;
    redCount: number;
    yellowCount: number;
    greenCount: number;
  };
}

// Scenario token dictionaries (from QUALITY_GATES.md)
const SCENARIO_TOKEN_DICTS: Record<string, string[]> = {
  work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
  restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
  shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung', 'warenkorb', 'preis'],
  doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination'],
  housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address'],
  casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time', 'grüßen', 'hallo', 'auf wiedersehen', 'morgen', 'abend', 'tag', 'sehen', 'treffen', 'freund', 'zeit', 'tschüss'],
  intro_lesson: ['welcome', 'course', 'lesson', 'learn', 'language', 'english', 'start', 'begin', 'offer', 'introduction', 'willkommen', 'kurs', 'lernen', 'sprache', 'englisch', 'beginnen', 'anbieten', 'einführung'],
  friends_small_talk: ['wochenende', 'heute', 'morgen', 'spaeter', 'abends', 'zeit', 'lust', 'plan', 'idee', 'treffen', 'mitkommen', 'kino', 'cafe', 'restaurant', 'spaziergang', 'park', 'training', 'gym', 'serie', 'film', 'konzert', 'bar', 'pizza', 'kaffee', 'hast du lust', 'lass uns', 'wie waere es', 'hast du zeit', 'wollen wir', 'ich haette lust', 'kommst du mit', 'ich kann heute nicht']
};

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
 * Normalize prompt text for comparison
 */
function normalizePrompt(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute Jaccard similarity between two texts
 */
function jaccardSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(normalizePrompt(text1).split(/\s+/));
  const tokens2 = new Set(normalizePrompt(text2).split(/\s+/));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  if (union.size === 0) return 1.0;
  return intersection.size / union.size;
}

/**
 * Compute Levenshtein distance (normalized)
 */
function normalizedEditDistance(text1: string, text2: string): number {
  const norm1 = normalizePrompt(text1);
  const norm2 = normalizePrompt(text2);
  
  if (norm1 === norm2) return 0;
  if (norm1.length === 0) return 1;
  if (norm2.length === 0) return 1;
  
  const maxLen = Math.max(norm1.length, norm2.length);
  const distance = levenshteinDistance(norm1, norm2);
  return distance / maxLen;
}

/**
 * Compute Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Compute similarity between two prompts (using Jaccard and normalized edit distance)
 */
function computeSimilarity(text1: string, text2: string): number {
  const jaccard = jaccardSimilarity(text1, text2);
  const editDist = 1 - normalizedEditDistance(text1, text2);
  
  // Weighted average (Jaccard is more reliable for word-level similarity)
  return (jaccard * 0.7) + (editDist * 0.3);
}

/**
 * Count scenario tokens in text
 */
function countScenarioTokens(text: string, scenario: string): Set<string> {
  const tokens = SCENARIO_TOKEN_DICTS[scenario] || [];
  const textLower = text.toLowerCase();
  const found = new Set<string>();
  
  for (const token of tokens) {
    if (textLower.includes(token.toLowerCase())) {
      found.add(token);
    }
  }
  
  return found;
}

/**
 * Compute metrics for a single pack
 */
function computePackMetrics(pack: PackEntry): PackMetrics {
  const issues: string[] = [];
  const prompts = pack.prompts || [];
  
  // Basic counts
  const promptCount = prompts.length;
  
  // Average prompt length
  const totalLength = prompts.reduce((sum, p) => sum + p.text.length, 0);
  const avgPromptLength = promptCount > 0 ? totalLength / promptCount : 0;
  
  // Average word count
  const totalWords = prompts.reduce((sum, p) => sum + p.text.split(/\s+/).length, 0);
  const avgPromptWords = promptCount > 0 ? totalWords / promptCount : 0;
  
  // Scenario token coverage
  const allScenarioTokens = new Set<string>();
  const perStepTokens: boolean[] = [];
  
  if (pack.sessionPlan && pack.sessionPlan.steps) {
    for (const step of pack.sessionPlan.steps) {
      let stepHasToken = false;
      for (const promptId of step.promptIds) {
        const prompt = prompts.find(p => p.id === promptId);
        if (prompt) {
          const tokens = countScenarioTokens(prompt.text, pack.scenario);
          tokens.forEach(t => allScenarioTokens.add(t));
          if (tokens.size > 0) {
            stepHasToken = true;
          }
        }
      }
      perStepTokens.push(stepHasToken);
    }
  } else {
    // Fallback: check all prompts
    prompts.forEach(p => {
      const tokens = countScenarioTokens(p.text, pack.scenario);
      tokens.forEach(t => allScenarioTokens.add(t));
    });
    perStepTokens.push(allScenarioTokens.size > 0);
  }
  
  // Multi-slot rate
  let multiSlotCount = 0;
  prompts.forEach(p => {
    if (p.slotsChanged && p.slotsChanged.length >= 2) {
      multiSlotCount++;
    } else if (!p.slotsChanged && pack.variationSlots) {
      // Fallback heuristic: check if previous prompt exists and compare slots
      const index = prompts.indexOf(p);
      if (index > 0) {
        const prev = prompts[index - 1];
        // Simple heuristic: if text differs significantly, assume multi-slot change
        const similarity = computeSimilarity(prev.text, p.text);
        if (similarity < 0.7) {
          multiSlotCount++;
        }
      }
    }
  });
  const multiSlotRate = promptCount > 0 ? multiSlotCount / promptCount : 0;
  
  // Near-duplicate rate
  let nearDuplicateCount = 0;
  const similarityThreshold = 0.92;
  
  for (let i = 0; i < prompts.length - 1; i++) {
    const similarity = computeSimilarity(prompts[i].text, prompts[i + 1].text);
    if (similarity >= similarityThreshold) {
      nearDuplicateCount++;
    }
  }
  const nearDuplicateRate = promptCount > 1 ? nearDuplicateCount / (promptCount - 1) : 0;
  
  // Determine status
  let status: 'RED' | 'YELLOW' | 'GREEN' = 'GREEN';
  
  // RED thresholds
  if (nearDuplicateRate > 0.20) {
    status = 'RED';
    issues.push(`Near-duplicate rate too high: ${(nearDuplicateRate * 100).toFixed(1)}% (threshold: 20%)`);
  }
  
  if (promptCount >= 8 && allScenarioTokens.size < 6) {
    status = 'RED';
    issues.push(`Insufficient scenario tokens: ${allScenarioTokens.size} unique tokens (threshold: 6 for packs with >= 8 prompts)`);
  }
  
  const stepsWithoutTokens = perStepTokens.filter(hasToken => !hasToken).length;
  if (stepsWithoutTokens > 0) {
    status = 'RED';
    issues.push(`${stepsWithoutTokens} step(s) have no scenario tokens`);
  }
  
  // Check slot coverage
  if (pack.variationSlots && pack.variationSlots.length > 0) {
    const usedSlots = new Set<string>();
    prompts.forEach(p => {
      if (p.slotsChanged) {
        p.slotsChanged.forEach(slot => usedSlots.add(slot));
      }
      if (p.slots) {
        Object.keys(p.slots).forEach(slot => usedSlots.add(slot));
      }
    });
    
    const missingSlots = pack.variationSlots.filter(slot => !usedSlots.has(slot));
    if (missingSlots.length > 0) {
      status = 'RED';
      issues.push(`Variation slots declared but not used: ${missingSlots.join(', ')}`);
    }
  }
  
  // YELLOW thresholds
  if (status === 'GREEN') {
    if (nearDuplicateRate > 0.10) {
      status = 'YELLOW';
      issues.push(`Near-duplicate rate elevated: ${(nearDuplicateRate * 100).toFixed(1)}%`);
    }
    
    if (multiSlotRate < 0.30) {
      status = 'YELLOW';
      issues.push(`Multi-slot variation below target: ${(multiSlotRate * 100).toFixed(1)}% (target: 30%)`);
    }
    
    if (allScenarioTokens.size < 4) {
      status = 'YELLOW';
      issues.push(`Scenario token coverage could be improved: ${allScenarioTokens.size} unique tokens`);
    }
  }
  
  return {
    packId: pack.id,
    title: pack.title,
    scenario: pack.scenario,
    level: pack.level,
    promptCount,
    avgPromptLength: Math.round(avgPromptLength * 10) / 10,
    avgPromptWords: Math.round(avgPromptWords * 10) / 10,
    scenarioTokenCoverage: {
      uniqueScenarioTokensUsed: allScenarioTokens.size,
      perStepScenarioTokenPresence: perStepTokens
    },
    multiSlotRate: Math.round(multiSlotRate * 1000) / 1000,
    nearDuplicateRate: Math.round(nearDuplicateRate * 1000) / 1000,
    status,
    issues
  };
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
 * Generate quality report
 */
function generateReport(failOnRed: boolean = false): QualityReport {
  const packs = findAllPacks();
  const metrics = packs.map(computePackMetrics);
  
  // Compute scenario metrics
  const scenarioMap = new Map<string, { packs: PackMetrics[], totalRichness: number }>();
  
  metrics.forEach(m => {
    if (!scenarioMap.has(m.scenario)) {
      scenarioMap.set(m.scenario, { packs: [], totalRichness: 0 });
    }
    const entry = scenarioMap.get(m.scenario)!;
    entry.packs.push(m);
    entry.totalRichness += m.scenarioTokenCoverage.uniqueScenarioTokensUsed;
  });
  
  const scenarios: ScenarioMetrics[] = Array.from(scenarioMap.entries()).map(([scenario, data]) => ({
    scenario,
    packCount: data.packs.length,
    avgRichness: data.packs.length > 0 ? data.totalRichness / data.packs.length : 0,
    totalPacks: data.packs.length
  }));
  
  // Summary
  const redCount = metrics.filter(m => m.status === 'RED').length;
  const yellowCount = metrics.filter(m => m.status === 'YELLOW').length;
  const greenCount = metrics.filter(m => m.status === 'GREEN').length;
  
  const report: QualityReport = {
    gitSha: getGitSha(),
    generatedAt: new Date().toISOString(),
    packs: metrics,
    scenarios,
    summary: {
      totalPacks: packs.length,
      redCount,
      yellowCount,
      greenCount
    }
  };
  
  return report;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: QualityReport): string {
  const lines: string[] = [];
  
  lines.push('# Quality Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`**Git SHA:** ${report.gitSha}`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total Packs:** ${report.summary.totalPacks}`);
  lines.push(`- 🟢 **Green:** ${report.summary.greenCount}`);
  lines.push(`- 🟡 **Yellow:** ${report.summary.yellowCount}`);
  lines.push(`- 🔴 **Red:** ${report.summary.redCount}`);
  lines.push('');
  
  // Per-scenario metrics
  lines.push('## Per-Scenario Coverage');
  lines.push('');
  lines.push('| Scenario | Packs | Avg Richness |');
  lines.push('|----------|-------|--------------|');
  report.scenarios.forEach(s => {
    lines.push(`| ${s.scenario} | ${s.packCount} | ${s.avgRichness.toFixed(1)} |`);
  });
  lines.push('');
  
  // Per-pack metrics
  lines.push('## Per-Pack Metrics');
  lines.push('');
  lines.push('| Pack ID | Title | Scenario | Level | Status | Prompts | Avg Length | Tokens | Multi-Slot | Duplicates | Issues |');
  lines.push('|---------|-------|----------|-------|--------|---------|------------|--------|------------|------------|--------|');
  
  report.packs.forEach(p => {
    const statusEmoji = p.status === 'GREEN' ? '🟢' : p.status === 'YELLOW' ? '🟡' : '🔴';
    const issuesStr = p.issues.length > 0 ? p.issues.join('; ') : '-';
    lines.push(
      `| ${p.packId} | ${p.title} | ${p.scenario} | ${p.level} | ${statusEmoji} ${p.status} | ${p.promptCount} | ${p.avgPromptLength.toFixed(1)} | ${p.scenarioTokenCoverage.uniqueScenarioTokensUsed} | ${(p.multiSlotRate * 100).toFixed(1)}% | ${(p.nearDuplicateRate * 100).toFixed(1)}% | ${issuesStr} |`
    );
  });
  lines.push('');
  
  // Red packs details
  const redPacks = report.packs.filter(p => p.status === 'RED');
  if (redPacks.length > 0) {
    lines.push('## 🔴 Red Status Packs (Action Required)');
    lines.push('');
    redPacks.forEach(p => {
      lines.push(`### ${p.packId}: ${p.title}`);
      lines.push('');
      lines.push(`- **Scenario:** ${p.scenario}`);
      lines.push(`- **Level:** ${p.level}`);
      lines.push(`- **Prompts:** ${p.promptCount}`);
      lines.push('');
      lines.push('**Issues:**');
      p.issues.forEach(issue => {
        lines.push(`- ${issue}`);
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
  const args = process.argv.slice(2);
  const failOnRed = args.includes('--fail-on-red');
  
  console.log('Generating quality report...\n');
  
  // Check for duplicates across all workspaces
  console.log('🔍 Checking for duplicate prompts...');
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  let hasDuplicates = false;
  
  if (existsSync(workspacesDir)) {
    const workspaces = readdirSync(workspacesDir).filter(item => {
      const itemPath = join(workspacesDir, item);
      return statSync(itemPath).isDirectory();
    });
    
    for (const workspace of workspaces) {
      try {
        const result = detectDuplicates(workspace);
        if (result.duplicates.length > 0) {
          hasDuplicates = true;
          console.error(`❌ Workspace "${workspace}": Found ${result.duplicates.length} duplicate group(s)`);
        } else {
          console.log(`✅ Workspace "${workspace}": No duplicates`);
        }
      } catch (error: any) {
        console.warn(`⚠️  Workspace "${workspace}": ${error.message}`);
      }
    }
  }
  
  if (hasDuplicates) {
    console.error('\n❌ Duplicate detection failed. All duplicates must be removed.');
    process.exit(1);
  }
  
  console.log('');
  
  const report = generateReport(failOnRed);
  
  // Print console summary
  console.log('Quality Report Summary');
  console.log('='.repeat(50));
  console.log(`Total Packs: ${report.summary.totalPacks}`);
  console.log(`🟢 Green: ${report.summary.greenCount}`);
  console.log(`🟡 Yellow: ${report.summary.yellowCount}`);
  console.log(`🔴 Red: ${report.summary.redCount}`);
  console.log('');
  
  // Print red packs
  const redPacks = report.packs.filter(p => p.status === 'RED');
  if (redPacks.length > 0) {
    console.log('🔴 Red Status Packs:');
    redPacks.forEach(p => {
      console.log(`  - ${p.packId}: ${p.title}`);
      p.issues.forEach(issue => {
        console.log(`    • ${issue}`);
      });
    });
    console.log('');
  }
  
  // Generate markdown report
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const reportPath = join(REPORTS_DIR, `quality-${report.gitSha.substring(0, 8)}.md`);
  const markdown = generateMarkdownReport(report);
  writeFileSync(reportPath, markdown);
  
  console.log(`✅ Quality report written to: ${reportPath}`);
  
  // Exit with error if red packs found and fail-on-red is set
  if (failOnRed && redPacks.length > 0) {
    console.error(`\n❌ Quality check failed: ${redPacks.length} pack(s) with RED status`);
    process.exit(1);
  }
}

main();

