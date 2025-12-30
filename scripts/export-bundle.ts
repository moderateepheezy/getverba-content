#!/usr/bin/env tsx

/**
 * Bundle Export Generator
 * 
 * Generates deterministic curriculum bundles from bundle definition files.
 * Creates both unzipped folder and ZIP archive.
 * 
 * Usage:
 *   tsx scripts/export-bundle.ts --bundle content/meta/bundles/de_government_office_a1.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = process.env.CONTENT_DIR || join(__dirname, '..', 'content', 'v1');
const META_DIR = process.env.META_DIR || join(__dirname, '..', 'content', 'meta');
const EXPORTS_DIR = process.env.EXPORTS_DIR || join(__dirname, '..', 'exports');

interface BundleDefinition {
  version: number;
  id: string;
  workspace: string;
  title: string;
  description: string;
  filters: {
    scenario?: string;
    levels?: string[];
    register?: string;
    primaryStructure?: string;
  };
  includeKinds: string[];
  ordering: {
    by: string[];
    stable: boolean;
  };
}

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
  durationMinutes?: number;
  estimatedMinutes?: number;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  tags?: string[];
  analyticsSummary?: {
    primaryStructure: string;
    scenario: string;
    register: string;
    variationSlots: string[];
    goal: string;
    whyThisWorks: string[];
  };
}

interface EntryDocument {
  id: string;
  kind: string;
  title: string;
  level: string;
  estimatedMinutes?: number;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  variationSlots?: string[];
  tags?: string[];
  analytics?: {
    targetLatencyMs?: number;
    successDefinition?: string;
    keyFailureModes?: string[];
    goal?: string;
    whyThisWorks?: string[];
  };
  sessionPlan?: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
}

interface BundleItem {
  kind: string;
  id: string;
  title: string;
  level: string;
  estimatedMinutes: number;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  tags?: string[];
  analytics: {
    targetLatencyMs?: number;
    successDefinition?: string;
    keyFailureModes?: string[];
    goal?: string;
    whyThisWorks?: string[];
  };
  sessionPlan?: {
    steps: Array<{
      id: string;
      title: string;
      promptCount: number;
    }>;
  };
}

interface BundleManifest {
  version: number;
  bundleId: string;
  workspace: string;
  generatedAt: string;
  entrypoint: string;
  items: Array<{
    kind: string;
    id: string;
    path: string;
  }>;
}

/**
 * Load bundle definition
 */
function loadBundleDefinition(bundlePath: string): BundleDefinition {
  if (!existsSync(bundlePath)) {
    throw new Error(`Bundle definition not found: ${bundlePath}`);
  }
  
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));
  
  // Validate schema
  if (bundle.version !== 1) {
    throw new Error(`Invalid bundle version: ${bundle.version} (expected 1)`);
  }
  if (!bundle.id || !bundle.workspace || !bundle.title || !bundle.filters || !bundle.includeKinds || !bundle.ordering) {
    throw new Error('Bundle definition missing required fields');
  }
  if (!bundle.ordering.stable) {
    throw new Error('Bundle ordering must be stable (deterministic)');
  }
  
  return bundle;
}

/**
 * Load all section indexes for a workspace
 */
function loadSectionIndexes(workspace: string): SectionIndexItem[] {
  const items: SectionIndexItem[] = [];
  const catalogPath = join(CONTENT_DIR, 'workspaces', workspace, 'catalog.json');
  
  if (!existsSync(catalogPath)) {
    return items;
  }
  
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  
  for (const section of catalog.sections || []) {
    const indexPath = join(CONTENT_DIR, 'workspaces', workspace, section.id, 'index.json');
    if (!existsSync(indexPath)) {
      continue;
    }
    
    // Load all pages
    let currentPage: SectionIndex | null = JSON.parse(readFileSync(indexPath, 'utf-8'));
    while (currentPage) {
      items.push(...(currentPage.items || []));
      
      if (currentPage.nextPage) {
        const nextPagePath = join(CONTENT_DIR, 'workspaces', workspace, section.id, currentPage.nextPage);
        if (existsSync(nextPagePath)) {
          currentPage = JSON.parse(readFileSync(nextPagePath, 'utf-8'));
        } else {
          currentPage = null;
        }
      } else {
        currentPage = null;
      }
    }
  }
  
  return items;
}

/**
 * Filter items based on bundle criteria
 */
function filterItems(items: SectionIndexItem[], bundle: BundleDefinition): SectionIndexItem[] {
  return items.filter(item => {
    // Filter by kind
    if (!bundle.includeKinds.includes(item.kind)) {
      return false;
    }
    
    // Filter by scenario
    if (bundle.filters.scenario && item.scenario !== bundle.filters.scenario) {
      return false;
    }
    
    // Filter by levels
    if (bundle.filters.levels && bundle.filters.levels.length > 0) {
      if (!bundle.filters.levels.includes(item.level)) {
        return false;
      }
    }
    
    // Filter by register
    if (bundle.filters.register && item.register !== bundle.filters.register) {
      return false;
    }
    
    // Filter by primaryStructure
    if (bundle.filters.primaryStructure && item.primaryStructure !== bundle.filters.primaryStructure) {
      return false;
    }
    
    return true;
  });
}

/**
 * Sort items deterministically
 */
function sortItems(items: SectionIndexItem[], ordering: BundleDefinition['ordering']): SectionIndexItem[] {
  const sorted = [...items];
  
  sorted.sort((a, b) => {
    for (const key of ordering.by) {
      let aVal: any;
      let bVal: any;
      
      switch (key) {
        case 'level':
          aVal = a.level || '';
          bVal = b.level || '';
          break;
        case 'kind':
          aVal = a.kind || '';
          bVal = b.kind || '';
          break;
        case 'title':
          aVal = a.title || '';
          bVal = b.title || '';
          break;
        case 'scenario':
          aVal = a.scenario || '';
          bVal = b.scenario || '';
          break;
        case 'primaryStructure':
          aVal = a.primaryStructure || '';
          bVal = b.primaryStructure || '';
          break;
        default:
          aVal = '';
          bVal = '';
      }
      
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    
    // Final tie-breaker: ID
    return (a.id || '').localeCompare(b.id || '');
  });
  
  return sorted;
}

/**
 * Load entry document
 */
function loadEntryDocument(entryUrl: string): EntryDocument | null {
  // entryUrl format: /v1/workspaces/{workspace}/packs/{packId}/pack.json
  const match = entryUrl.match(/\/v1\/workspaces\/([^/]+)\/(packs|drills|exams)\/([^/]+)\/(pack|drill|exam)\.json$/);
  if (!match) {
    return null;
  }
  
  const [, workspace, section, itemId] = match;
  const entryPath = join(CONTENT_DIR, 'workspaces', workspace, section, itemId, `${section.slice(0, -1)}.json`);
  
  if (!existsSync(entryPath)) {
    return null;
  }
  
  try {
    return JSON.parse(readFileSync(entryPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Resolve bundle items with full metadata
 */
function resolveBundleItems(filteredItems: SectionIndexItem[]): BundleItem[] {
  const resolved: BundleItem[] = [];
  const seen = new Set<string>();
  
  for (const item of filteredItems) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) {
      continue; // Skip duplicates
    }
    seen.add(key);
    
    const entry = loadEntryDocument(item.entryUrl);
    if (!entry) {
      continue;
    }
    
    const bundleItem: BundleItem = {
      kind: item.kind,
      id: item.id,
      title: item.title || entry.title,
      level: item.level || entry.level,
      estimatedMinutes: item.durationMinutes || item.estimatedMinutes || entry.estimatedMinutes || 15,
      entryUrl: item.entryUrl,
      scenario: item.scenario || entry.scenario,
      register: item.register || entry.register,
      primaryStructure: item.primaryStructure || entry.primaryStructure,
      tags: item.tags || entry.tags || [],
      analytics: {
        targetLatencyMs: entry.analytics?.targetLatencyMs,
        successDefinition: entry.analytics?.successDefinition,
        keyFailureModes: entry.analytics?.keyFailureModes,
        goal: entry.analytics?.goal || item.analyticsSummary?.goal,
        whyThisWorks: entry.analytics?.whyThisWorks || item.analyticsSummary?.whyThisWorks || []
      }
    };
    
    if (entry.sessionPlan) {
      bundleItem.sessionPlan = {
        steps: entry.sessionPlan.steps.map(step => ({
          id: step.id,
          title: step.title,
          promptCount: step.promptIds.length
        }))
      };
    }
    
    resolved.push(bundleItem);
  }
  
  return resolved;
}

/**
 * Generate bundle.json
 */
function generateBundleJson(bundle: BundleDefinition, items: BundleItem[]): any {
  return {
    version: 1,
    bundleId: bundle.id,
    workspace: bundle.workspace,
    title: bundle.title,
    description: bundle.description,
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    totalMinutes: items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    items: items.map(item => ({
      kind: item.kind,
      id: item.id,
      title: item.title,
      level: item.level,
      estimatedMinutes: item.estimatedMinutes,
      entryUrl: item.entryUrl,
      scenario: item.scenario,
      register: item.register,
      primaryStructure: item.primaryStructure,
      tags: item.tags,
      analytics: item.analytics,
      sessionPlan: item.sessionPlan
    }))
  };
}

/**
 * Generate curriculum.md
 */
function generateCurriculumMd(bundle: BundleDefinition, items: BundleItem[]): string {
  const lines: string[] = [];
  
  lines.push(`# ${bundle.title}`);
  lines.push('');
  lines.push(bundle.description);
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  const totalMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
  lines.push(`This bundle contains **${items.length} items** totaling approximately **${totalMinutes} minutes** (${totalHours} hours) of content.`);
  lines.push('');
  
  lines.push('## Intended Outcomes');
  lines.push('');
  lines.push('Upon completion of this bundle, learners will be able to:');
  lines.push('');
  
  // Group by level
  const byLevel: Record<string, BundleItem[]> = {};
  for (const item of items) {
    if (!byLevel[item.level]) {
      byLevel[item.level] = [];
    }
    byLevel[item.level].push(item);
  }
  
  const levels = Object.keys(byLevel).sort();
  for (const level of levels) {
    const levelItems = byLevel[level];
    lines.push(`- **${level} Level**: Practice ${levelItems.length} ${levelItems.length === 1 ? 'item' : 'items'} covering ${bundle.filters.scenario || 'various scenarios'}`);
  }
  lines.push('');
  
  lines.push('## Recommended Schedule');
  lines.push('');
  const days = Math.ceil(totalMinutes / 15); // 15 minutes per day
  lines.push(`**${days} days**, **15 minutes per day**`);
  lines.push('');
  lines.push('This schedule allows for:');
  lines.push('- Daily practice sessions');
  lines.push('- Time for review and reinforcement');
  lines.push('- Gradual progression through content');
  lines.push('');
  
  lines.push('## Content Structure');
  lines.push('');
  
  // Group by level, then by kind
  for (const level of levels) {
    lines.push(`### ${level} Level`);
    lines.push('');
    
    const levelItems = byLevel[level];
    const byKind: Record<string, BundleItem[]> = {};
    for (const item of levelItems) {
      if (!byKind[item.kind]) {
        byKind[item.kind] = [];
      }
      byKind[item.kind].push(item);
    }
    
    const kinds = Object.keys(byKind).sort();
    for (const kind of kinds) {
      lines.push(`#### ${kind.charAt(0).toUpperCase() + kind.slice(1)}s`);
      lines.push('');
      
      for (const item of byKind[kind]) {
        lines.push(`**${item.title}** (${item.estimatedMinutes} min)`);
        lines.push('');
        
        if (item.primaryStructure) {
          lines.push(`- **Primary Structure**: ${item.primaryStructure}`);
        }
        
        if (item.analytics?.goal) {
          lines.push(`- **Focus**: ${item.analytics.goal}`);
        }
        
        if (item.analytics?.whyThisWorks && item.analytics.whyThisWorks.length > 0) {
          lines.push(`- **Why This Works**:`);
          for (const bullet of item.analytics.whyThisWorks.slice(0, 3)) {
            lines.push(`  - ${bullet}`);
          }
        }
        
        if (item.sessionPlan) {
          lines.push(`- **Session Plan**: ${item.sessionPlan.steps.length} ${item.sessionPlan.steps.length === 1 ? 'step' : 'steps'}`);
          for (const step of item.sessionPlan.steps) {
            lines.push(`  - ${step.title} (${step.promptCount} ${step.promptCount === 1 ? 'prompt' : 'prompts'})`);
          }
        }
        
        lines.push('');
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Generate index.html
 */
function generateIndexHtml(bundle: BundleDefinition, items: BundleItem[]): string {
  const itemsJson = JSON.stringify(items, null, 2);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${bundle.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    #sidebar {
      width: 300px;
      background: #f5f5f5;
      border-right: 1px solid #ddd;
      overflow-y: auto;
      padding: 20px;
    }
    #sidebar h2 {
      font-size: 18px;
      margin-bottom: 15px;
      color: #333;
    }
    .item {
      padding: 10px;
      margin-bottom: 8px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .item:hover {
      background: #f0f0f0;
    }
    .item.active {
      background: #007bff;
      color: white;
      border-color: #007bff;
    }
    .item-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .item-meta {
      font-size: 12px;
      opacity: 0.8;
    }
    #content {
      flex: 1;
      overflow-y: auto;
      padding: 40px;
      background: white;
    }
    #content h1 {
      margin-bottom: 20px;
      color: #333;
    }
    #content h2 {
      margin-top: 30px;
      margin-bottom: 15px;
      color: #555;
      border-bottom: 2px solid #007bff;
      padding-bottom: 5px;
    }
    #content h3 {
      margin-top: 20px;
      margin-bottom: 10px;
      color: #666;
    }
    .outline {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
    }
    .outline-item {
      padding: 8px;
      margin: 4px 0;
      background: white;
      border-left: 3px solid #007bff;
      padding-left: 12px;
    }
    pre {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
    }
    .empty-state {
      text-align: center;
      color: #999;
      margin-top: 100px;
    }
  </style>
</head>
<body>
  <div id="sidebar">
    <h2>${bundle.title}</h2>
    <div id="item-list"></div>
  </div>
  <div id="content">
    <div class="empty-state">
      <h2>Select an item from the sidebar</h2>
    </div>
  </div>
  
  <script>
    const items = ${itemsJson};
    const itemList = document.getElementById('item-list');
    const content = document.getElementById('content');
    
    function renderItem(item) {
      let html = '<h1>' + item.title + '</h1>';
      html += '<p><strong>Level:</strong> ' + item.level + ' | <strong>Duration:</strong> ' + item.estimatedMinutes + ' minutes</p>';
      
      if (item.primaryStructure) {
        html += '<h2>Primary Structure</h2><p>' + item.primaryStructure + '</p>';
      }
      
      if (item.analytics && item.analytics.goal) {
        html += '<h2>Learning Goal</h2><p>' + item.analytics.goal + '</p>';
      }
      
      if (item.sessionPlan && item.sessionPlan.steps) {
        html += '<h2>Session Plan</h2><div class="outline">';
        for (const step of item.sessionPlan.steps) {
          html += '<div class="outline-item"><strong>' + step.title + '</strong> (' + step.promptCount + ' prompts)</div>';
        }
        html += '</div>';
      }
      
      if (item.analytics && item.analytics.whyThisWorks && item.analytics.whyThisWorks.length > 0) {
        html += '<h2>Why This Works</h2><ul>';
        for (const bullet of item.analytics.whyThisWorks) {
          html += '<li>' + bullet + '</li>';
        }
        html += '</ul>';
      }
      
      html += '<h2>Full Entry Data</h2><pre>' + JSON.stringify(item, null, 2) + '</pre>';
      
      content.innerHTML = html;
    }
    
    items.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = '<div class="item-title">' + item.title + '</div><div class="item-meta">' + item.kind + ' • ' + item.level + ' • ' + item.estimatedMinutes + ' min</div>';
      div.onclick = () => {
        document.querySelectorAll('.item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        renderItem(item);
      };
      if (index === 0) {
        div.classList.add('active');
        renderItem(item);
      }
      itemList.appendChild(div);
    });
  </script>
</body>
</html>`;
}

/**
 * Generate SCORM-ish manifest
 */
function generateScormishManifest(bundle: BundleDefinition, items: BundleItem[]): BundleManifest {
  return {
    version: 1,
    bundleId: bundle.id,
    workspace: bundle.workspace,
    generatedAt: new Date().toISOString(),
    entrypoint: 'index.html',
    items: items.map(item => ({
      kind: item.kind,
      id: item.id,
      path: `items/${item.kind}s/${item.id}/${item.kind}.json`
    }))
  };
}

/**
 * Copy entry documents to bundle
 */
function copyEntryDocuments(bundleDir: string, items: BundleItem[]): void {
  for (const item of items) {
    const itemDir = join(bundleDir, 'items', `${item.kind}s`, item.id);
    mkdirSync(itemDir, { recursive: true });
    
    // Extract path from entryUrl
    const match = item.entryUrl.match(/\/v1\/workspaces\/([^/]+)\/(packs|drills|exams)\/([^/]+)\/(pack|drill|exam)\.json$/);
    if (match) {
      const [, workspace, section, itemId] = match;
      const sourcePath = join(CONTENT_DIR, 'workspaces', workspace, section, itemId, `${section.slice(0, -1)}.json`);
      const destPath = join(itemDir, `${item.kind}.json`);
      
      if (existsSync(sourcePath)) {
        copyFileSync(sourcePath, destPath);
      }
    }
  }
}

/**
 * Create ZIP archive
 */
function createZipArchive(bundleDir: string, bundleId: string): string {
  const zipPath = join(dirname(bundleDir), `${bundleId}.zip`);
  
  // Use zip command if available
  try {
    execSync(`cd "${bundleDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
    return zipPath;
  } catch (err: any) {
    // Fallback: try without cd
    try {
      execSync(`zip -r "${zipPath}" .`, { cwd: bundleDir, stdio: 'pipe' });
      return zipPath;
    } catch (err2: any) {
      console.warn(`⚠️  Could not create ZIP archive (zip command not available). Bundle folder created at: ${bundleDir}`);
      return '';
    }
  }
}

/**
 * Main export function
 */
function exportBundle(bundlePath: string): void {
  console.log(`📦 Exporting bundle from: ${bundlePath}`);
  
  // Load bundle definition
  const bundle = loadBundleDefinition(bundlePath);
  console.log(`   Bundle: ${bundle.title} (${bundle.id})`);
  
  // Load section indexes
  const allItems = loadSectionIndexes(bundle.workspace);
  console.log(`   Found ${allItems.length} items in workspace`);
  
  // Filter items
  const filteredItems = filterItems(allItems, bundle);
  console.log(`   Filtered to ${filteredItems.length} items`);
  
  if (filteredItems.length === 0) {
    throw new Error(`No items match bundle filters. Check filters: ${JSON.stringify(bundle.filters)}`);
  }
  
  // Sort items
  const sortedItems = sortItems(filteredItems, bundle.ordering);
  
  // Resolve full metadata
  const resolvedItems = resolveBundleItems(sortedItems);
  console.log(`   Resolved ${resolvedItems.length} items with full metadata`);
  
  // Create export directory
  const exportDir = join(EXPORTS_DIR, bundle.workspace, bundle.id);
  const bundleDir = join(exportDir, 'bundle');
  mkdirSync(bundleDir, { recursive: true });
  
  // Generate bundle.json
  const bundleJson = generateBundleJson(bundle, resolvedItems);
  writeFileSync(join(bundleDir, 'bundle.json'), JSON.stringify(bundleJson, null, 2));
  console.log(`   ✅ Generated bundle.json`);
  
  // Generate curriculum.md
  const curriculumMd = generateCurriculumMd(bundle, resolvedItems);
  writeFileSync(join(bundleDir, 'curriculum.md'), curriculumMd);
  console.log(`   ✅ Generated curriculum.md`);
  
  // Generate index.html
  const indexHtml = generateIndexHtml(bundle, resolvedItems);
  writeFileSync(join(bundleDir, 'index.html'), indexHtml);
  console.log(`   ✅ Generated index.html`);
  
  // Generate SCORM-ish manifest
  const scormishDir = join(bundleDir, 'scormish');
  mkdirSync(scormishDir, { recursive: true });
  const manifest = generateScormishManifest(bundle, resolvedItems);
  writeFileSync(join(scormishDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`   ✅ Generated scormish/manifest.json`);
  
  // Copy entry documents
  copyEntryDocuments(bundleDir, resolvedItems);
  console.log(`   ✅ Copied ${resolvedItems.length} entry documents`);
  
  // Create ZIP archive
  const zipPath = createZipArchive(bundleDir, bundle.id);
  if (zipPath) {
    console.log(`   ✅ Created ZIP archive: ${zipPath}`);
  }
  
  console.log(`\n✅ Bundle export complete!`);
  console.log(`   Bundle folder: ${bundleDir}`);
  if (zipPath) {
    console.log(`   ZIP archive: ${zipPath}`);
  }
}

// Main execution
const args = process.argv.slice(2);
const bundleIndex = args.indexOf('--bundle');
if (bundleIndex === -1 || !args[bundleIndex + 1]) {
  console.error('Usage: tsx scripts/export-bundle.ts --bundle <bundle-definition-path>');
  process.exit(1);
}

const bundlePath = args[bundleIndex + 1];
exportBundle(bundlePath);

