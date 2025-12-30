#!/usr/bin/env tsx

/**
 * B2B Curriculum Export Pipeline
 * 
 * Generates deterministic curriculum exports for schools/employers:
 * - CSV catalog (one row per pack)
 * - Markdown files (one per pack)
 * - ZIP bundle with snapshots
 * 
 * Usage:
 *   npm run content:export -- --workspace de --out exports/
 *   npm run content:export -- --workspace de --out exports/ --zip
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');

interface SectionIndex {
  version: string;
  kind: string;
  total: number;
  pageSize: number;
  items: SectionIndexItem[];
  nextPage: string | null;
}

interface SectionIndexItem {
  id: string;
  kind: string;
  title: string;
  level: string;
  durationMinutes: number;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  analyticsSummary?: {
    primaryStructure: string;
    variationSlots: string[];
    drillType: string;
    cognitiveLoad: string;
    goal: string;
    whyThisWorks: string[];
  };
}

interface PackEntry {
  id: string;
  kind: string;
  title: string;
  level: string;
  estimatedMinutes: number;
  description?: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  outline: string[];
  prompts: Array<{
    id: string;
    text: string;
    intent?: string;
    gloss_en?: string;
    alt_de?: string;
  }>;
  sessionPlan: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
  analytics: {
    goal: string;
    successCriteria: string[];
    drillType: string;
    cognitiveLoad: string;
  };
}

interface Catalog {
  version: string;
  schemaVersion: number;
  workspace: string;
  languageCode: string;
  languageName: string;
  sections: Array<{
    id: string;
    kind: string;
    title: string;
    itemsUrl: string;
  }>;
}

interface CsvRow {
  workspace: string;
  sectionId: string;
  sectionKind: string;
  packId: string;
  title: string;
  level: string;
  estimatedMinutes: number;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string;
  goal: string;
  whyThisWorks: string;
  entryUrl: string;
  promptCount: number;
  stepCount: number;
}

/**
 * Escape CSV field
 */
function escapeCsvField(field: string): string {
  if (!field) return '';
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Load all items from pagination chain
 */
function loadAllItemsFromSection(firstPageUrl: string): SectionIndexItem[] {
  const allItems: SectionIndexItem[] = [];
  let currentUrl: string | null = firstPageUrl;
  const visitedPages = new Set<string>();
  
  while (currentUrl) {
    if (visitedPages.has(currentUrl)) {
      throw new Error(`Circular reference detected at ${currentUrl}`);
    }
    visitedPages.add(currentUrl);
    
    const relativePath = currentUrl.replace(/^\/v1\//, '');
    const indexPath = join(CONTENT_DIR, relativePath);
    
    if (!existsSync(indexPath)) {
      throw new Error(`Index file not found: ${indexPath}`);
    }
    
    const content = readFileSync(indexPath, 'utf-8');
    const index: SectionIndex = JSON.parse(content);
    
    allItems.push(...index.items);
    currentUrl = index.nextPage || null;
  }
  
  return allItems;
}

/**
 * Load pack entry document
 */
function loadPackEntry(entryUrl: string): PackEntry {
  const relativePath = entryUrl.replace(/^\/v1\//, '');
  const entryPath = join(CONTENT_DIR, relativePath);
  
  if (!existsSync(entryPath)) {
    throw new Error(`Pack entry not found: ${entryPath}`);
  }
  
  const content = readFileSync(entryPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Generate CSV row from pack
 */
function generateCsvRow(
  workspace: string,
  sectionId: string,
  sectionKind: string,
  indexItem: SectionIndexItem,
  pack: PackEntry
): CsvRow {
  const analyticsSummary = indexItem.analyticsSummary || {
    primaryStructure: pack.primaryStructure,
    variationSlots: pack.variationSlots || [],
    drillType: pack.analytics?.drillType || '',
    cognitiveLoad: pack.analytics?.cognitiveLoad || '',
    goal: pack.analytics?.goal || '',
    whyThisWorks: pack.analytics?.successCriteria || []
  };
  
  return {
    workspace,
    sectionId,
    sectionKind,
    packId: pack.id,
    title: pack.title,
    level: pack.level,
    estimatedMinutes: pack.estimatedMinutes || indexItem.durationMinutes || 15,
    scenario: pack.scenario || indexItem.scenario || '',
    register: pack.register || indexItem.register || '',
    primaryStructure: pack.primaryStructure || indexItem.primaryStructure || '',
    variationSlots: (pack.variationSlots || []).join('|'),
    goal: analyticsSummary.goal,
    whyThisWorks: analyticsSummary.whyThisWorks.join('|'),
    entryUrl: indexItem.entryUrl,
    promptCount: pack.prompts?.length || 0,
    stepCount: pack.sessionPlan?.steps?.length || 0
  };
}

/**
 * Generate markdown for a pack
 */
function generatePackMarkdown(pack: PackEntry, analyticsSummary: SectionIndexItem['analyticsSummary']): string {
  const lines: string[] = [];
  
  // Title
  lines.push(`# ${pack.title}`);
  lines.push('');
  
  // Metadata block
  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Level**: ${pack.level}`);
  lines.push(`- **Estimated Time**: ${pack.estimatedMinutes || 15} minutes`);
  lines.push(`- **Scenario**: ${pack.scenario}`);
  lines.push(`- **Register**: ${pack.register}`);
  lines.push(`- **Primary Structure**: ${pack.primaryStructure}`);
  lines.push(`- **Variation Slots**: ${(pack.variationSlots || []).join(', ')}`);
  if (analyticsSummary?.goal) {
    lines.push(`- **Goal**: ${analyticsSummary.goal}`);
  }
  lines.push('');
  
  // Why this works
  if (analyticsSummary?.whyThisWorks && analyticsSummary.whyThisWorks.length > 0) {
    lines.push('## Why This Works');
    lines.push('');
    for (const bullet of analyticsSummary.whyThisWorks) {
      lines.push(`- ${bullet}`);
    }
    lines.push('');
  }
  
  // Outline
  if (pack.outline && pack.outline.length > 0) {
    lines.push('## Outline');
    lines.push('');
    pack.outline.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}`);
    });
    lines.push('');
  }
  
  // Session Plan
  if (pack.sessionPlan && pack.sessionPlan.steps) {
    lines.push('## Session Plan');
    lines.push('');
    pack.sessionPlan.steps.forEach((step, idx) => {
      lines.push(`### Step ${idx + 1}: ${step.title}`);
      lines.push('');
      lines.push(`**Prompt IDs**: ${step.promptIds.join(', ')}`);
      lines.push('');
    });
  }
  
  // Prompts (in sessionPlan order)
  if (pack.prompts && pack.prompts.length > 0) {
    lines.push('## Prompts');
    lines.push('');
    
    // Create prompt lookup
    const promptMap = new Map(pack.prompts.map(p => [p.id, p]));
    
    // Output prompts in sessionPlan order
    if (pack.sessionPlan && pack.sessionPlan.steps) {
      for (const step of pack.sessionPlan.steps) {
        for (const promptId of step.promptIds) {
          const prompt = promptMap.get(promptId);
          if (prompt) {
            lines.push(`### ${prompt.id}`);
            lines.push('');
            lines.push(`**German**: ${prompt.text}`);
            if (prompt.gloss_en) {
              lines.push(`**English**: ${prompt.gloss_en}`);
            }
            if (prompt.intent) {
              lines.push(`**Intent**: ${prompt.intent}`);
            }
            lines.push('');
          }
        }
      }
    } else {
      // Fallback: output all prompts
      for (const prompt of pack.prompts) {
        lines.push(`### ${prompt.id}`);
        lines.push('');
        lines.push(`**German**: ${prompt.text}`);
        if (prompt.gloss_en) {
          lines.push(`**English**: ${prompt.gloss_en}`);
        }
        if (prompt.intent) {
          lines.push(`**Intent**: ${prompt.intent}`);
        }
        lines.push('');
      }
    }
  }
  
  // Suggested delivery notes
  lines.push('## Suggested Delivery');
  lines.push('');
  lines.push(`- **Time Box**: ${pack.estimatedMinutes || 15} minutes`);
  lines.push(`- **Repetition Rule**: Practice each prompt 2-3 times`);
  if (pack.variationSlots && pack.variationSlots.length > 0) {
    lines.push(`- **Substitution Slots**: ${pack.variationSlots.join(', ')}`);
  }
  lines.push('');
  
  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Content Version: v1 | Pack ID: ${pack.id}*`);
  
  // Try to get git SHA
  try {
    const gitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    if (gitSha) {
      lines.push(`*Generated from: ${gitSha.substring(0, 7)}*`);
    }
  } catch {
    // Git not available, skip
  }
  
  return lines.join('\n');
}

/**
 * Export curriculum for a workspace
 */
function exportCurriculum(workspaceId: string, outputDir: string, createZip: boolean = false): void {
  console.log(`📦 Exporting curriculum for workspace: ${workspaceId}`);
  console.log(`   Output directory: ${outputDir}`);
  
  // Validate content schema first (schema validation only, not quality gates)
  console.log('\n🔍 Validating content schema...');
  try {
    execSync('npx tsx scripts/validate-content.ts', { 
      encoding: 'utf-8', 
      stdio: 'pipe',
      cwd: join(__dirname, '..')
    });
    console.log('   ✅ Schema validation passed');
  } catch (error: any) {
    console.error('   ❌ Schema validation failed');
    if (error.stdout) {
      // Filter out warnings, show only errors
      const lines = error.stdout.split('\n');
      const errorLines = lines.filter((line: string) => line.includes('❌') || line.includes('Error:'));
      if (errorLines.length > 0) {
        console.error(errorLines.join('\n'));
      } else {
        console.error(error.stdout);
      }
    }
    if (error.stderr) {
      console.error(error.stderr);
    }
    console.error('\n⚠️  Export aborted due to schema validation failures.');
    console.error('   Fix schema errors before exporting.');
    process.exit(1);
  }
  
  // Load catalog
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspaceId, 'catalog.json');
  if (!existsSync(catalogPath)) {
    throw new Error(`Catalog not found: ${catalogPath}`);
  }
  
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  
  // Create output directories
  const workspaceOutDir = join(outputDir, workspaceId);
  const packsOutDir = join(workspaceOutDir, 'packs');
  const snapshotOutDir = join(workspaceOutDir, 'snapshot');
  const indexesOutDir = join(snapshotOutDir, 'indexes');
  const metaOutDir = join(workspaceOutDir, 'meta');
  
  mkdirSync(packsOutDir, { recursive: true });
  mkdirSync(indexesOutDir, { recursive: true });
  mkdirSync(metaOutDir, { recursive: true });
  
  // Collect all pack items
  const csvRows: CsvRow[] = [];
  const packItems: Array<{ sectionId: string; sectionKind: string; indexItem: SectionIndexItem; pack: PackEntry }> = [];
  
  for (const section of catalog.sections) {
    const itemsUrl = section.itemsUrl;
    if (!itemsUrl) continue;
    
    // Load all items from pagination chain
    const items = loadAllItemsFromSection(itemsUrl);
    
    // Process pack items
    for (const indexItem of items) {
      if (indexItem.kind === 'pack' || indexItem.kind === 'context') {
        try {
          const pack = loadPackEntry(indexItem.entryUrl);
          packItems.push({
            sectionId: section.id,
            sectionKind: section.kind,
            indexItem,
            pack
          });
          
          // Generate CSV row
          const csvRow = generateCsvRow(workspaceId, section.id, section.kind, indexItem, pack);
          csvRows.push(csvRow);
          
          // Generate markdown
          const markdown = generatePackMarkdown(pack, indexItem.analyticsSummary);
          const markdownPath = join(packsOutDir, `${pack.id}.md`);
          writeFileSync(markdownPath, markdown, 'utf-8');
          
        } catch (error: any) {
          // Skip missing pack entries (test artifacts, etc.)
          console.warn(`⚠️  Skipping ${indexItem.id}: ${error.message}`);
        }
      }
    }
    
    // Copy index files to snapshot
    let currentUrl: string | null = itemsUrl;
    const visitedPages = new Set<string>();
    let pageNum = 1;
    
    while (currentUrl) {
      if (visitedPages.has(currentUrl)) break;
      visitedPages.add(currentUrl);
      
      const relativePath = currentUrl.replace(/^\/v1\//, '');
      const indexPath = join(CONTENT_DIR, relativePath);
      
      if (existsSync(indexPath)) {
        const indexFileName = pageNum === 1 
          ? `${section.id}.json`
          : `${section.id}.page${pageNum}.json`;
        const snapshotIndexPath = join(indexesOutDir, indexFileName);
        copyFileSync(indexPath, snapshotIndexPath);
      }
      
      const content = readFileSync(indexPath, 'utf-8');
      const index: SectionIndex = JSON.parse(content);
      currentUrl = index.nextPage || null;
      pageNum++;
    }
  }
  
  // Generate CSV
  const csvHeaders = [
    'workspace', 'sectionId', 'sectionKind', 'packId', 'title', 'level',
    'estimatedMinutes', 'scenario', 'register', 'primaryStructure',
    'variationSlots', 'goal', 'whyThisWorks', 'entryUrl', 'promptCount', 'stepCount'
  ];
  
  const csvLines = [
    csvHeaders.join(','),
    ...csvRows.map(row => [
      escapeCsvField(row.workspace),
      escapeCsvField(row.sectionId),
      escapeCsvField(row.sectionKind),
      escapeCsvField(row.packId),
      escapeCsvField(row.title),
      escapeCsvField(row.level),
      row.estimatedMinutes.toString(),
      escapeCsvField(row.scenario),
      escapeCsvField(row.register),
      escapeCsvField(row.primaryStructure),
      escapeCsvField(row.variationSlots),
      escapeCsvField(row.goal),
      escapeCsvField(row.whyThisWorks),
      escapeCsvField(row.entryUrl),
      row.promptCount.toString(),
      row.stepCount.toString()
    ].join(','))
  ];
  
  const csvPath = join(workspaceOutDir, 'catalog.csv');
  writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf-8');
  console.log(`\n✅ Generated CSV: ${csvPath} (${csvRows.length} rows)`);
  console.log(`   Generated ${packItems.length} pack markdown files`);
  
  // Copy catalog to snapshot
  const snapshotCatalogPath = join(snapshotOutDir, 'catalog.json');
  copyFileSync(catalogPath, snapshotCatalogPath);
  
  // Copy manifest and release
  const manifestPath = join(META_DIR, 'manifest.json');
  const releasePath = join(META_DIR, 'release.json');
  
  if (existsSync(manifestPath)) {
    copyFileSync(manifestPath, join(metaOutDir, 'manifest.json'));
  }
  if (existsSync(releasePath)) {
    copyFileSync(releasePath, join(metaOutDir, 'release.json'));
  }
  
  // Create ZIP if requested
  if (createZip) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const zipPath = join(outputDir, `${workspaceId}_${timestamp}_curriculum.zip`);
    
    console.log(`\n📦 Creating ZIP bundle: ${zipPath}`);
    
    try {
      // Use zip command if available
      execSync(`cd "${workspaceOutDir}" && zip -r "${zipPath}" .`, {
        stdio: 'pipe'
      });
      console.log(`   ✅ ZIP created: ${zipPath}`);
    } catch (error: any) {
      console.warn(`   ⚠️  ZIP creation failed (zip command not available): ${error.message}`);
      console.log(`   📁 Export files available in: ${workspaceOutDir}`);
    }
  }
  
  console.log(`\n✅ Curriculum export complete!`);
  console.log(`   Output: ${workspaceOutDir}`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace: string | null = null;
  let outputDir = 'exports';
  let createZip = false;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if ((args[i] === '--out' || args[i] === '-o') && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else if (args[i] === '--zip') {
      createZip = true;
    }
  }
  
  if (!workspace) {
    console.error('Usage: export-curriculum.ts --workspace <ws> [--out <dir>] [--zip]');
    console.error('Example: npm run content:export -- --workspace de --out exports/ --zip');
    process.exit(1);
  }
  
  // Create output directory
  mkdirSync(outputDir, { recursive: true });
  
  exportCurriculum(workspace, outputDir, createZip);
}

main();

