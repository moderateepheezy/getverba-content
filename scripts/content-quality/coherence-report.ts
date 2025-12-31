#!/usr/bin/env tsx

/**
 * Catalog Coherence Report
 * 
 * Generates a comprehensive report proving catalog coherence at scale:
 * - Coverage matrix (scenario × level × primaryStructure × register)
 * - Variation slots distribution
 * - Token density stats per scenario
 * - Generic phrase count (should be 0)
 * - Near-duplicate detection (similarity threshold 0.92)
 * - Orphan checks (index items vs entry docs)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { normalizeForMatching } from '../pdf-ingestion/textNormalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', '..', 'content', 'v1');
const REPORTS_DIR = join(__dirname, '..', '..', 'reports', 'coherence');

// Generic phrases that should not appear in production content
const GENERIC_PHRASES = [
  "in today's lesson",
  "let's practice",
  "this sentence",
  "i like to",
  "the quick brown fox",
  "lorem ipsum",
  "practice german",
  "learn german",
  "study german"
];

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
  }>;
  analytics?: any;
}

interface CoverageMatrix {
  [scenario: string]: {
    [level: string]: {
      [primaryStructure: string]: {
        [register: string]: number;
      };
    };
  };
}

interface CoherenceReport {
  workspace: string;
  timestamp: string;
  coverageMatrix: CoverageMatrix;
  variationSlotsDistribution: Record<string, number>;
  tokenDensityStats: Record<string, {
    avgTokensPerPrompt: number;
    totalTokens: number;
    uniqueTokens: number;
  }>;
  genericPhraseCount: number;
  genericPhrases: Array<{
    packId: string;
    promptId: string;
    phrase: string;
    text: string;
  }>;
  nearDuplicates: Array<{
    cluster: string[];
    similarity: number;
    packIds: string[];
  }>;
  orphans: Array<{
    indexItem: {
      id: string;
      entryUrl: string;
    };
    issue: string;
  }>;
}

/**
 * Load all packs from workspace
 */
function loadAllPacks(workspace: string): PackEntry[] {
  const packs: PackEntry[] = [];
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  
  if (!existsSync(packsDir)) {
    return packs;
  }
  
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const packId of packDirs) {
    const packPath = join(packsDir, packId, 'pack.json');
    if (existsSync(packPath)) {
      try {
        const content = readFileSync(packPath, 'utf-8');
        const pack = JSON.parse(content);
        packs.push(pack);
      } catch (error: any) {
        console.warn(`Failed to load pack ${packId}: ${error.message}`);
      }
    }
  }
  
  return packs;
}

/**
 * Compute Jaccard similarity between two texts
 */
function computeJaccardSimilarity(text1: string, text2: string): number {
  const normalize = (text: string) => normalizeForMatching(text);
  const tokens1 = new Set(normalize(text1).split(/\s+/).filter(t => t.length > 0));
  const tokens2 = new Set(normalize(text2).split(/\s+/).filter(t => t.length > 0));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Find near-duplicate clusters
 */
function findNearDuplicates(packs: PackEntry[], threshold: number = 0.92): Array<{
  cluster: string[];
  similarity: number;
  packIds: string[];
}> {
  const clusters: Array<{
    cluster: string[];
    similarity: number;
    packIds: string[];
  }> = [];
  
  const processed = new Set<string>();
  
  for (let i = 0; i < packs.length; i++) {
    const pack1 = packs[i];
    if (!pack1.prompts) continue;
    
    for (const prompt1 of pack1.prompts) {
      const key1 = `${pack1.id}:${prompt1.id}`;
      if (processed.has(key1)) continue;
      
      const cluster = [prompt1.text];
      const packIds = new Set([pack1.id]);
      processed.add(key1);
      
      for (let j = i + 1; j < packs.length; j++) {
        const pack2 = packs[j];
        if (!pack2.prompts) continue;
        
        for (const prompt2 of pack2.prompts) {
          const key2 = `${pack2.id}:${prompt2.id}`;
          if (processed.has(key2)) continue;
          
          const similarity = computeJaccardSimilarity(prompt1.text, prompt2.text);
          if (similarity >= threshold) {
            cluster.push(prompt2.text);
            packIds.add(pack2.id);
            processed.add(key2);
          }
        }
      }
      
      if (cluster.length > 1) {
        clusters.push({
          cluster,
          similarity: threshold,
          packIds: Array.from(packIds)
        });
      }
    }
  }
  
  return clusters;
}

/**
 * Check for generic phrases
 */
function findGenericPhrases(packs: PackEntry[]): Array<{
  packId: string;
  promptId: string;
  phrase: string;
  text: string;
}> {
  const found: Array<{
    packId: string;
    promptId: string;
    phrase: string;
    text: string;
  }> = [];
  
  for (const pack of packs) {
    if (!pack.prompts) continue;
    
    for (const prompt of pack.prompts) {
      const textLower = prompt.text.toLowerCase();
      for (const phrase of GENERIC_PHRASES) {
        if (textLower.includes(phrase.toLowerCase())) {
          found.push({
            packId: pack.id,
            promptId: prompt.id,
            phrase,
            text: prompt.text
          });
        }
      }
    }
  }
  
  return found;
}

/**
 * Check for orphan index items
 */
function findOrphans(workspace: string): Array<{
  indexItem: {
    id: string;
    entryUrl: string;
  };
  issue: string;
}> {
  const orphans: Array<{
    indexItem: {
      id: string;
      entryUrl: string;
    };
    issue: string;
  }> = [];
  
  // Find all section indexes
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspace);
  if (!existsSync(workspaceDir)) {
    return orphans;
  }
  
  const sections = readdirSync(workspaceDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const section of sections) {
    const indexPath = join(workspaceDir, section, 'index.json');
    if (!existsSync(indexPath)) continue;
    
    try {
      const index = JSON.parse(readFileSync(indexPath, 'utf-8')));
      if (!index.items || !Array.isArray(index.items)) continue;
      
      for (const item of index.items) {
        if (!item.entryUrl) continue;
        
        // Parse entry URL: /v1/workspaces/{ws}/packs/{id}/pack.json
        const match = item.entryUrl.match(/^\/v1\/workspaces\/([^/]+)\/(packs|drills)\/([^/]+)\/(pack|drill)\.json$/);
        if (!match) {
          orphans.push({
            indexItem: {
              id: item.id,
              entryUrl: item.entryUrl
            },
            issue: 'Invalid entryUrl format'
          });
          continue;
        }
        
        const [, ws, sectionType, entryId, entryType] = match;
        const entryPath = join(CONTENT_DIR, 'workspaces', ws, sectionType, entryId, `${entryType}.json`);
        
        if (!existsSync(entryPath)) {
          orphans.push({
            indexItem: {
              id: item.id,
              entryUrl: item.entryUrl
            },
            issue: 'Entry file not found'
          });
          continue;
        }
        
        // Check metadata match
        try {
          const entry = JSON.parse(readFileSync(entryPath, 'utf-8'));
          
          if (item.level && entry.level && item.level !== entry.level) {
            orphans.push({
              indexItem: {
                id: item.id,
                entryUrl: item.entryUrl
              },
              issue: `Level mismatch: index=${item.level}, entry=${entry.level}`
            });
          }
          
          if (item.title && entry.title && item.title !== entry.title) {
            orphans.push({
              indexItem: {
                id: item.id,
                entryUrl: item.entryUrl
              },
              issue: `Title mismatch: index="${item.title}", entry="${entry.title}"`
            });
          }
        } catch (error: any) {
          orphans.push({
            indexItem: {
              id: item.id,
              entryUrl: item.entryUrl
            },
            issue: `Error reading entry: ${error.message}`
          });
        }
      }
    } catch (error: any) {
      console.warn(`Failed to process index ${indexPath}: ${error.message}`);
    }
  }
  
  return orphans;
}

/**
 * Generate coherence report
 */
function generateReport(workspace: string): CoherenceReport {
  const packs = loadAllPacks(workspace);
  
  // Coverage matrix
  const coverageMatrix: CoverageMatrix = {};
  
  // Variation slots distribution
  const variationSlotsDistribution: Record<string, number> = {};
  
  // Token density stats per scenario
  const tokenDensityStats: Record<string, {
    avgTokensPerPrompt: number;
    totalTokens: number;
    uniqueTokens: Set<string>;
  }> = {};
  
  for (const pack of packs) {
    // Coverage matrix
    if (!coverageMatrix[pack.scenario]) {
      coverageMatrix[pack.scenario] = {};
    }
    if (!coverageMatrix[pack.scenario][pack.level]) {
      coverageMatrix[pack.scenario][pack.level] = {};
    }
    if (!coverageMatrix[pack.scenario][pack.level][pack.primaryStructure]) {
      coverageMatrix[pack.scenario][pack.level][pack.primaryStructure] = {};
    }
    if (!coverageMatrix[pack.scenario][pack.level][pack.primaryStructure][pack.register]) {
      coverageMatrix[pack.scenario][pack.level][pack.primaryStructure][pack.register] = 0;
    }
    coverageMatrix[pack.scenario][pack.level][pack.primaryStructure][pack.register]++;
    
    // Variation slots distribution
    for (const slot of pack.variationSlots) {
      variationSlotsDistribution[slot] = (variationSlotsDistribution[slot] || 0) + 1;
    }
    
    // Token density stats
    if (!tokenDensityStats[pack.scenario]) {
      tokenDensityStats[pack.scenario] = {
        avgTokensPerPrompt: 0,
        totalTokens: 0,
        uniqueTokens: new Set<string>()
      };
    }
    
    if (pack.prompts) {
      for (const prompt of pack.prompts) {
        const tokens = prompt.text.split(/\s+/).filter(t => t.length > 0);
        tokenDensityStats[pack.scenario].totalTokens += tokens.length;
        tokens.forEach(t => tokenDensityStats[pack.scenario].uniqueTokens.add(t.toLowerCase()));
      }
      
      const promptCount = pack.prompts.length;
      if (promptCount > 0) {
        tokenDensityStats[pack.scenario].avgTokensPerPrompt = 
          tokenDensityStats[pack.scenario].totalTokens / promptCount;
      }
    }
  }
  
  // Convert uniqueTokens Sets to numbers
  const tokenDensityStatsFinal: Record<string, {
    avgTokensPerPrompt: number;
    totalTokens: number;
    uniqueTokens: number;
  }> = {};
  for (const [scenario, stats] of Object.entries(tokenDensityStats)) {
    tokenDensityStatsFinal[scenario] = {
      avgTokensPerPrompt: stats.avgTokensPerPrompt,
      totalTokens: stats.totalTokens,
      uniqueTokens: stats.uniqueTokens.size
    };
  }
  
  // Generic phrases
  const genericPhrases = findGenericPhrases(packs);
  
  // Near-duplicates
  const nearDuplicates = findNearDuplicates(packs, 0.92);
  
  // Orphans
  const orphans = findOrphans(workspace);
  
  return {
    workspace,
    timestamp: new Date().toISOString(),
    coverageMatrix,
    variationSlotsDistribution,
    tokenDensityStats: tokenDensityStatsFinal,
    genericPhraseCount: genericPhrases.length,
    genericPhrases,
    nearDuplicates,
    orphans
  };
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(report: CoherenceReport): string {
  const lines: string[] = [];
  
  lines.push('# Catalog Coherence Report');
  lines.push('');
  lines.push(`**Workspace**: ${report.workspace}`);
  lines.push(`**Generated**: ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');
  
  // Coverage Matrix
  lines.push('## Coverage Matrix');
  lines.push('');
  lines.push('Scenario × Level × PrimaryStructure × Register');
  lines.push('');
  
  for (const [scenario, levels] of Object.entries(report.coverageMatrix)) {
    lines.push(`### ${scenario}`);
    lines.push('');
    for (const [level, structures] of Object.entries(levels)) {
      for (const [structure, registers] of Object.entries(structures)) {
        for (const [register, count] of Object.entries(registers)) {
          lines.push(`- **${level}** / **${structure}** / **${register}**: ${count} pack(s)`);
        }
      }
    }
    lines.push('');
  }
  
  // Variation Slots Distribution
  lines.push('## Variation Slots Distribution');
  lines.push('');
  for (const [slot, count] of Object.entries(report.variationSlotsDistribution)) {
    lines.push(`- **${slot}**: ${count} pack(s)`);
  }
  lines.push('');
  
  // Token Density Stats
  lines.push('## Token Density Stats');
  lines.push('');
  for (const [scenario, stats] of Object.entries(report.tokenDensityStats)) {
    lines.push(`### ${scenario}`);
    lines.push(`- Average tokens per prompt: ${stats.avgTokensPerPrompt.toFixed(1)}`);
    lines.push(`- Total tokens: ${stats.totalTokens}`);
    lines.push(`- Unique tokens: ${stats.uniqueTokens}`);
    lines.push('');
  }
  
  // Generic Phrases
  lines.push('## Generic Phrases');
  lines.push('');
  if (report.genericPhraseCount === 0) {
    lines.push('✅ **No generic phrases found**');
  } else {
    lines.push(`❌ **Found ${report.genericPhraseCount} generic phrase(s)**`);
    lines.push('');
    for (const item of report.genericPhrases) {
      lines.push(`- **${item.packId}/${item.promptId}**: "${item.phrase}"`);
      lines.push(`  Text: "${item.text.substring(0, 100)}..."`);
      lines.push('');
    }
  }
  lines.push('');
  
  // Near-Duplicates
  lines.push('## Near-Duplicate Clusters');
  lines.push('');
  if (report.nearDuplicates.length === 0) {
    lines.push('✅ **No near-duplicates found**');
  } else {
    lines.push(`⚠️  **Found ${report.nearDuplicates.length} near-duplicate cluster(s)** (similarity ≥ 0.92)`);
    lines.push('');
    for (let i = 0; i < report.nearDuplicates.length; i++) {
      const cluster = report.nearDuplicates[i];
      lines.push(`### Cluster ${i + 1}`);
      lines.push(`- Packs: ${cluster.packIds.join(', ')}`);
      lines.push(`- Similarity: ${(cluster.similarity * 100).toFixed(1)}%`);
      lines.push(`- Cluster size: ${cluster.cluster.length} prompt(s)`);
      lines.push('');
    }
  }
  lines.push('');
  
  // Orphans
  lines.push('## Orphan Checks');
  lines.push('');
  if (report.orphans.length === 0) {
    lines.push('✅ **No orphan issues found**');
  } else {
    lines.push(`⚠️  **Found ${report.orphans.length} orphan issue(s)**`);
    lines.push('');
    for (const orphan of report.orphans) {
      lines.push(`- **${orphan.indexItem.id}**: ${orphan.issue}`);
      lines.push(`  Entry URL: ${orphan.indexItem.entryUrl}`);
      lines.push('');
    }
  }
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace = 'de';
  let outDir = REPORTS_DIR;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--outDir' && i + 1 < args.length) {
      outDir = args[i + 1];
      i++;
    }
  }
  
  console.log('📊 Generating Catalog Coherence Report...');
  console.log(`   Workspace: ${workspace}`);
  console.log(`   Output: ${outDir}`);
  console.log('');
  
  // Generate report
  const report = generateReport(workspace);
  
  // Create output directory
  mkdirSync(outDir, { recursive: true });
  
  // Write JSON report
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const jsonPath = join(outDir, `coherence.${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`✅ JSON report: ${jsonPath}`);
  
  // Write Markdown report
  const mdPath = join(outDir, `coherence.${timestamp}.md`);
  const md = generateMarkdownReport(report);
  writeFileSync(mdPath, md);
  console.log(`✅ Markdown report: ${mdPath}`);
  console.log('');
  
  // Summary
  console.log('📊 Summary:');
  console.log(`   Total packs: ${Object.values(report.coverageMatrix).reduce((sum, levels) => {
    return sum + Object.values(levels).reduce((sum2, structures) => {
      return sum2 + Object.values(structures).reduce((sum3, registers) => {
        return sum3 + Object.values(registers).reduce((a, b) => a + b, 0);
      }, 0);
    }, 0);
  }, 0)}`);
  console.log(`   Generic phrases: ${report.genericPhraseCount} ${report.genericPhraseCount === 0 ? '✅' : '❌'}`);
  console.log(`   Near-duplicate clusters: ${report.nearDuplicates.length}`);
  console.log(`   Orphan issues: ${report.orphans.length}`);
  console.log('');
  
  // Exit with error if generic phrases found
  if (report.genericPhraseCount > 0) {
    console.error('❌ Coherence check failed: Generic phrases found in content');
    process.exit(1);
  }
  
  console.log('✅ Coherence report complete');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

