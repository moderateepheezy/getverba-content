#!/usr/bin/env tsx

/**
 * Curriculum Bundle Export Generator
 * 
 * Generates B2B-ready curriculum bundles (SCORM-ish) from content:
 * - bundle.json (manifest)
 * - packs/drills/exams (copied entry documents)
 * - teacher_notes.md (derived from analytics)
 * - qa_report.json (quality metrics)
 * - Optional: imsmanifest.xml (SCORM stub)
 * 
 * Usage:
 *   npm run content:export-bundle -- --workspace de --section context --out ./exports
 *   npm run content:export-bundle -- --workspace de --section all --scenario government_office --level A1
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
}

interface PackEntry {
  id: string;
  kind: string;
  title: string;
  level: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  outline: string[];
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
    whyThisWorks?: string[];
    exitConditions?: {
      targetMinutes: number;
      completeWhen: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

interface Catalog {
  version: string;
  workspace: string;
  sections: Array<{
    id: string;
    kind: string;
    title: string;
    itemsUrl: string;
  }>;
}

interface BundleManifest {
  version: 'v1';
  bundleId: string;
  generatedAt: string;
  gitSha: string;
  workspace: string;
  section: string;
  scenario?: string;
  level?: string;
  items: Array<{
    id: string;
    kind: string;
    title: string;
    level: string;
    entryUrl: string;
    entryPath: string;
  }>;
  metadata: {
    totalPacks: number;
    totalDrills: number;
    totalExams: number;
    totalItems: number;
  };
}

/**
 * Get git SHA
 */
function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
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
 * Load entry document
 */
function loadEntry(entryUrl: string): PackEntry | null {
  const relativePath = entryUrl.replace(/^\/v1\//, '');
  const entryPath = join(CONTENT_DIR, relativePath);
  
  if (!existsSync(entryPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(entryPath, 'utf-8');
    return JSON.parse(content);
  } catch (err: any) {
    console.warn(`⚠️  Failed to load entry ${entryUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Filter items by criteria
 */
function filterItems(
  items: SectionIndexItem[],
  scenario?: string,
  level?: string
): SectionIndexItem[] {
  return items.filter(item => {
    if (scenario && item.scenario !== scenario) {
      return false;
    }
    if (level && item.level !== level) {
      return false;
    }
    return true;
  });
}

/**
 * Generate bundle ID
 */
function generateBundleId(
  workspace: string,
  section: string,
  scenario: string | undefined,
  level: string | undefined,
  gitSha: string
): string {
  const parts = [
    workspace,
    section,
    scenario || 'all',
    level || 'all',
    gitSha
  ];
  return parts.join('__');
}

/**
 * Generate teacher notes markdown
 */
function generateTeacherNotes(items: Array<{ item: SectionIndexItem; entry: PackEntry }>): string {
  const lines: string[] = [];
  
  lines.push('# Teacher Notes');
  lines.push('');
  lines.push(`**Generated**: ${new Date().toISOString()}`);
  lines.push(`**Total Items**: ${items.length}`);
  lines.push('');
  
  for (const { item, entry } of items) {
    lines.push(`## ${entry.title}`);
    lines.push('');
    lines.push(`- **ID**: ${entry.id}`);
    lines.push(`- **Level**: ${entry.level}`);
    lines.push(`- **Scenario**: ${entry.scenario || 'N/A'}`);
    lines.push(`- **Register**: ${entry.register || 'N/A'}`);
    lines.push(`- **Primary Structure**: ${entry.primaryStructure || 'N/A'}`);
    lines.push(`- **Variation Slots**: ${(entry.variationSlots || []).join(', ')}`);
    lines.push(`- **Estimated Time**: ${entry.estimatedMinutes || 15} minutes`);
    
    if (entry.analytics) {
      if (entry.analytics.goal) {
        lines.push(`- **Goal**: ${entry.analytics.goal}`);
      }
      if (entry.analytics.whyThisWorks && Array.isArray(entry.analytics.whyThisWorks)) {
        lines.push(`- **Why This Works**:`);
        entry.analytics.whyThisWorks.forEach(bullet => {
          lines.push(`  - ${bullet}`);
        });
      }
      if (entry.analytics.exitConditions) {
        lines.push(`- **Exit Conditions**:`);
        lines.push(`  - Target Minutes: ${entry.analytics.exitConditions.targetMinutes}`);
        lines.push(`  - Complete When: ${entry.analytics.exitConditions.completeWhen}`);
      }
    }
    
    if (entry.outline && entry.outline.length > 0) {
      lines.push('');
      lines.push('### Outline');
      lines.push('');
      entry.outline.forEach((step, idx) => {
        lines.push(`${idx + 1}. ${step}`);
      });
    }
    
    if (entry.sessionPlan && entry.sessionPlan.steps) {
      lines.push('');
      lines.push('### Session Plan');
      lines.push('');
      entry.sessionPlan.steps.forEach((step, idx) => {
        lines.push(`**Step ${idx + 1}: ${step.title}**`);
        lines.push(`- Prompt IDs: ${step.promptIds.join(', ')}`);
        lines.push('');
      });
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Generate QA report
 */
function generateQAReport(
  items: Array<{ item: SectionIndexItem; entry: PackEntry }>
): any {
  const packs = items.filter(({ entry }) => entry.kind === 'pack');
  const drills = items.filter(({ entry }) => entry.kind === 'drill');
  const exams = items.filter(({ entry }) => entry.kind === 'exam');
  
  // Scenario coverage
  const scenarioCounts: Record<string, number> = {};
  packs.forEach(({ entry }) => {
    const scenario = entry.scenario || 'unknown';
    scenarioCounts[scenario] = (scenarioCounts[scenario] || 0) + 1;
  });
  
  // Structure coverage
  const structureCounts: Record<string, number> = {};
  packs.forEach(({ entry }) => {
    const structure = entry.primaryStructure || 'unknown';
    structureCounts[structure] = (structureCounts[structure] || 0) + 1;
  });
  
  // Level distribution
  const levelCounts: Record<string, number> = {};
  items.forEach(({ entry }) => {
    const level = entry.level || 'unknown';
    levelCounts[level] = (levelCounts[level] || 0) + 1;
  });
  
  // Duplicate detection
  const titles = new Map<string, string[]>();
  const ids = new Set<string>();
  const duplicateTitles: string[] = [];
  const duplicateIds: string[] = [];
  
  items.forEach(({ entry }) => {
    const title = entry.title.toLowerCase();
    if (!titles.has(title)) {
      titles.set(title, []);
    }
    titles.get(title)!.push(entry.id);
    
    if (ids.has(entry.id)) {
      duplicateIds.push(entry.id);
    }
    ids.add(entry.id);
  });
  
  titles.forEach((ids, title) => {
    if (ids.length > 1) {
      duplicateTitles.push(`${title} (${ids.join(', ')})`);
    }
  });
  
  return {
    version: 'v1',
    generatedAt: new Date().toISOString(),
    summary: {
      totalItems: items.length,
      totalPacks: packs.length,
      totalDrills: drills.length,
      totalExams: exams.length
    },
    coverage: {
      scenarios: scenarioCounts,
      structures: structureCounts,
      levels: levelCounts
    },
    quality: {
      duplicateTitles: duplicateTitles.length > 0 ? duplicateTitles : null,
      duplicateIds: duplicateIds.length > 0 ? duplicateIds : null,
      itemsWithAnalytics: items.filter(({ entry }) => entry.analytics).length,
      itemsWithWhyThisWorks: items.filter(({ entry }) => entry.analytics?.whyThisWorks).length,
      itemsWithExitConditions: items.filter(({ entry }) => entry.analytics?.exitConditions).length
    }
  };
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const workspaceIndex = args.indexOf('--workspace');
  const sectionIndex = args.indexOf('--section');
  const outIndex = args.indexOf('--out');
  const scenarioIndex = args.indexOf('--scenario');
  const levelIndex = args.indexOf('--level');
  const formatIndex = args.indexOf('--format');
  
  const workspace = workspaceIndex >= 0 && args[workspaceIndex + 1] 
    ? args[workspaceIndex + 1] 
    : null;
  const section = sectionIndex >= 0 && args[sectionIndex + 1] 
    ? args[sectionIndex + 1] 
    : null;
  const outDir = outIndex >= 0 && args[outIndex + 1] 
    ? args[outIndex + 1] 
    : './exports';
  const scenario = scenarioIndex >= 0 && args[scenarioIndex + 1] 
    ? args[scenarioIndex + 1] 
    : undefined;
  const level = levelIndex >= 0 && args[levelIndex + 1] 
    ? args[levelIndex + 1] 
    : undefined;
  const format = formatIndex >= 0 && args[formatIndex + 1] 
    ? args[formatIndex + 1] 
    : 'bundle';
  
  if (!workspace) {
    console.error('❌ Error: --workspace argument required');
    process.exit(1);
  }
  
  if (!section) {
    console.error('❌ Error: --section argument required');
    process.exit(1);
  }
  
  // Validate content first
  console.log('🔍 Validating content...');
  try {
    execSync('npm run content:validate', { 
      cwd: join(__dirname, '..'),
      stdio: 'pipe'
    });
    console.log('   ✅ Validation passed');
  } catch (err: any) {
    console.error('❌ Content validation failed. Export aborted.');
    process.exit(1);
  }
  
  // Load catalog
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  if (!existsSync(catalogPath)) {
    console.error(`❌ Error: Catalog not found: ${catalogPath}`);
    process.exit(1);
  }
  
  const catalog: Catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  
  // Collect items from sections
  const allItems: SectionIndexItem[] = [];
  
  if (section === 'all') {
    // Process all sections
    for (const catSection of catalog.sections) {
      if (catSection.itemsUrl) {
        const items = loadAllItemsFromSection(catSection.itemsUrl);
        allItems.push(...items);
      }
    }
  } else {
    // Process specific section
    const catSection = catalog.sections.find(s => s.id === section);
    if (!catSection || !catSection.itemsUrl) {
      console.error(`❌ Error: Section "${section}" not found in catalog`);
      process.exit(1);
    }
    const items = loadAllItemsFromSection(catSection.itemsUrl);
    allItems.push(...items);
  }
  
  // Filter items
  const filteredItems = filterItems(allItems, scenario, level);
  
  console.log(`📦 Found ${filteredItems.length} item(s) matching criteria`);
  
  if (filteredItems.length === 0) {
    console.error('❌ No items found matching criteria');
    process.exit(1);
  }
  
  // Load entry documents
  const itemsWithEntries: Array<{ item: SectionIndexItem; entry: PackEntry }> = [];
  for (const item of filteredItems) {
    const entry = loadEntry(item.entryUrl);
    if (entry) {
      itemsWithEntries.push({ item, entry });
    } else {
      console.warn(`⚠️  Skipping ${item.id}: entry not found`);
    }
  }
  
  // Generate bundle ID
  const gitSha = getGitSha();
  const bundleId = generateBundleId(workspace, section, scenario, level, gitSha);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bundleDir = join(outDir, workspace, timestamp, bundleId);
  
  // Create bundle directory structure
  mkdirSync(bundleDir, { recursive: true });
  mkdirSync(join(bundleDir, 'packs'), { recursive: true });
  mkdirSync(join(bundleDir, 'drills'), { recursive: true });
  mkdirSync(join(bundleDir, 'exams'), { recursive: true });
  
  // Copy entry documents
  const bundleItems: BundleManifest['items'] = [];
  for (const { item, entry } of itemsWithEntries) {
    const relativePath = item.entryUrl.replace(/^\/v1\//, '');
    const sourcePath = join(CONTENT_DIR, relativePath);
    const fileName = basename(sourcePath);
    const targetDir = entry.kind === 'pack' ? 'packs' :
                     entry.kind === 'drill' ? 'drills' :
                     entry.kind === 'exam' ? 'exams' : 'packs';
    const targetPath = join(bundleDir, targetDir, fileName);
    
    copyFileSync(sourcePath, targetPath);
    
    bundleItems.push({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      level: entry.level,
      entryUrl: item.entryUrl,
      entryPath: `${targetDir}/${fileName}`
    });
  }
  
  // Generate bundle.json
  const bundleManifest: BundleManifest = {
    version: 'v1',
    bundleId,
    generatedAt: new Date().toISOString(),
    gitSha,
    workspace,
    section,
    scenario,
    level,
    items: bundleItems,
    metadata: {
      totalPacks: bundleItems.filter(i => i.kind === 'pack').length,
      totalDrills: bundleItems.filter(i => i.kind === 'drill').length,
      totalExams: bundleItems.filter(i => i.kind === 'exam').length,
      totalItems: bundleItems.length
    }
  };
  
  writeFileSync(
    join(bundleDir, 'bundle.json'),
    JSON.stringify(bundleManifest, null, 2),
    'utf-8'
  );
  
  // Generate teacher_notes.md
  const teacherNotes = generateTeacherNotes(itemsWithEntries);
  writeFileSync(join(bundleDir, 'teacher_notes.md'), teacherNotes, 'utf-8');
  
  // Generate qa_report.json
  const qaReport = generateQAReport(itemsWithEntries);
  writeFileSync(
    join(bundleDir, 'qa_report.json'),
    JSON.stringify(qaReport, null, 2),
    'utf-8'
  );
  
  // Generate SCORM stub if requested
  if (format.includes('scormstub')) {
    const scormStub = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${bundleId}" version="1.0"
    xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
    xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                        http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
    <adlcp:location>metadata.xml</adlcp:location>
  </metadata>
  <organizations default="${bundleId}">
    <organization identifier="${bundleId}">
      <title>${workspace} - ${section} Curriculum Bundle</title>
    </organization>
  </organizations>
  <resources>
    <!-- Resources would be defined here for full SCORM compatibility -->
  </resources>
</manifest>`;
    writeFileSync(join(bundleDir, 'imsmanifest.xml'), scormStub, 'utf-8');
  }
  
  console.log(`✅ Bundle generated: ${bundleDir}`);
  console.log(`   Items: ${bundleItems.length}`);
  console.log(`   Packs: ${bundleManifest.metadata.totalPacks}`);
  console.log(`   Drills: ${bundleManifest.metadata.totalDrills}`);
  console.log(`   Exams: ${bundleManifest.metadata.totalExams}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

