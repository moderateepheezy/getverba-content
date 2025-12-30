/**
 * Bundle Builder
 * 
 * Builds curriculum bundle artifacts and ZIP file.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import type {
  CurriculumBundle,
  BundleSelectionCriteria,
  BundleItem,
  SectionIndexItem,
  EntryDocument
} from './exportTypes.js';
import { planBundle } from './bundlePlanner.js';
import { generateSCORMManifest } from './scormLikeManifest.js';
import { generateSyllabus } from './syllabusMd.js';
import { generateIntegrityReport, printIntegritySummary } from './integrityReport.js';

/**
 * Load all items from workspace catalog
 */
export function loadAllItemsFromWorkspace(
  workspace: string,
  contentDir: string,
  includeSections?: string[]
): BundleItem[] {
  const catalogPath = join(contentDir, 'workspaces', workspace, 'catalog.json');
  if (!existsSync(catalogPath)) {
    throw new Error(`Catalog not found: ${catalogPath}`);
  }
  
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  const allItems: BundleItem[] = [];
  
  for (const section of catalog.sections) {
    // Filter by includeSections if specified
    if (includeSections && includeSections.length > 0) {
      if (!includeSections.includes(section.id)) {
        continue;
      }
    }
    
    if (!section.itemsUrl) continue;
    
    // Load all items from pagination chain
    const indexItems = loadAllItemsFromSection(section.itemsUrl, contentDir);
    
    for (const indexItem of indexItems) {
      // Determine kind
      let kind: 'pack' | 'drill' | 'exam';
      if (indexItem.kind === 'pack' || indexItem.kind === 'context') {
        kind = 'pack';
      } else if (indexItem.kind === 'exam' || indexItem.kind === 'exams') {
        kind = 'exam';
      } else {
        kind = 'drill';
      }
      
      // Load entry document to get full metadata
      const entry = loadEntryDocument(indexItem.entryUrl, contentDir);
      
      if (!entry) {
        console.warn(`⚠️  Skipping ${indexItem.id}: entry document not found`);
        continue;
      }
      
      // Extract whyThisWorks metadata
      const whyThisWorks = indexItem.analyticsSummary ? {
        primaryStructure: indexItem.analyticsSummary.primaryStructure,
        variationSlots: indexItem.analyticsSummary.variationSlots,
        qualitySignals: [] // Will be populated from entry document if available
      } : undefined;
      
      // Extract quality signals from entry document
      if (entry && whyThisWorks) {
        const qualitySignals: string[] = [];
        if (entry.variationSlots && entry.variationSlots.length >= 2) {
          qualitySignals.push('multi_slot_variation');
        }
        if (entry.sessionPlan && entry.sessionPlan.steps && entry.sessionPlan.steps.length > 0) {
          qualitySignals.push('session_plan_present');
        }
        if (entry.prompts && entry.prompts.some(p => p.slotsChanged && p.slotsChanged.length > 0)) {
          qualitySignals.push('slots_changed_present');
        }
        whyThisWorks.qualitySignals = qualitySignals;
      }
      
      const item: BundleItem = {
        kind,
        id: entry.id,
        entryUrl: indexItem.entryUrl,
        title: entry.title,
        level: entry.level,
        scenario: entry.scenario || indexItem.scenario,
        register: entry.register || indexItem.register,
        primaryStructure: entry.primaryStructure || indexItem.primaryStructure,
        estimatedMinutes: entry.estimatedMinutes || indexItem.durationMinutes || 15,
        tags: entry.tags || indexItem.tags,
        whyThisWorks,
        entryDocument: entry
      };
      
      allItems.push(item);
    }
  }
  
  return allItems;
}

/**
 * Load all items from section index (handles pagination)
 */
function loadAllItemsFromSection(firstPageUrl: string, contentDir: string): SectionIndexItem[] {
  const allItems: SectionIndexItem[] = [];
  let currentUrl: string | null = firstPageUrl;
  const visitedPages = new Set<string>();
  
  while (currentUrl) {
    if (visitedPages.has(currentUrl)) {
      throw new Error(`Circular reference detected at ${currentUrl}`);
    }
    visitedPages.add(currentUrl);
    
    const relativePath = currentUrl.replace(/^\/v1\//, '');
    const indexPath = join(contentDir, relativePath);
    
    if (!existsSync(indexPath)) {
      console.warn(`⚠️  Index file not found: ${indexPath}, skipping`);
      break;
    }
    
    const content = readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(content);
    
    allItems.push(...index.items);
    currentUrl = index.nextPage || null;
  }
  
  return allItems;
}

/**
 * Load entry document
 */
function loadEntryDocument(entryUrl: string, contentDir: string): EntryDocument | null {
  try {
    const relativePath = entryUrl.replace(/^\/v1\//, '');
    const entryPath = join(contentDir, relativePath);
    
    if (!existsSync(entryPath)) {
      return null;
    }
    
    const content = readFileSync(entryPath, 'utf-8');
    return JSON.parse(content);
  } catch (error: any) {
    console.warn(`⚠️  Failed to load entry ${entryUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Build bundle from criteria
 */
export function buildBundle(
  criteria: BundleSelectionCriteria,
  contentDir: string,
  outputDir: string
): CurriculumBundle {
  console.log(`\n📦 Building bundle: ${criteria.bundleId}`);
  console.log(`   Workspace: ${criteria.workspace}`);
  console.log(`   Title: ${criteria.title}`);
  
  // Load all items from workspace
  const allItems = loadAllItemsFromWorkspace(
    criteria.workspace,
    contentDir,
    criteria.includeSections
  );
  console.log(`   Found ${allItems.length} items in workspace`);
  
  // Plan bundle (filter, sort, group)
  const modules = planBundle(allItems, criteria);
  console.log(`   Planned ${modules.length} modules`);
  
  // Calculate totals
  let totalPacks = 0;
  let totalDrills = 0;
  let totalExams = 0;
  let totalMinutes = 0;
  
  for (const module of modules) {
    for (const item of module.items) {
      if (item.kind === 'pack') totalPacks++;
      else if (item.kind === 'drill') totalDrills++;
      else if (item.kind === 'exam') totalExams++;
      totalMinutes += item.estimatedMinutes || 0;
    }
  }
  
  // Create bundle
  const version = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const bundle: CurriculumBundle = {
    bundleId: criteria.bundleId,
    workspace: criteria.workspace,
    title: criteria.title,
    version,
    generatedAt: new Date().toISOString(),
    selection: {
      levels: criteria.levels,
      scenarios: criteria.scenarios,
      tags: criteria.tags,
      explicitPackIds: criteria.explicitPackIds,
      explicitDrillIds: criteria.explicitDrillIds,
      explicitExamIds: criteria.explicitExamIds
    },
    modules: modules.map(module => ({
      id: module.id,
      title: module.title,
      items: module.items.map(item => ({
        kind: item.kind,
        id: item.id,
        entryUrl: item.entryUrl,
        title: item.title,
        level: item.level,
        scenario: item.scenario,
        register: item.register,
        primaryStructure: item.primaryStructure,
        estimatedMinutes: item.estimatedMinutes,
        whyThisWorks: item.whyThisWorks
      }))
    })),
    totals: {
      packs: totalPacks,
      drills: totalDrills,
      exams: totalExams,
      estimatedMinutes: totalMinutes
    }
  };
  
  return bundle;
}

/**
 * Write bundle artifacts to disk
 */
export function writeBundleArtifacts(
  bundle: CurriculumBundle,
  contentDir: string,
  bundleOutputDir: string
): void {
  // Create directories
  mkdirSync(bundleOutputDir, { recursive: true });
  const contentDirPath = join(bundleOutputDir, 'content');
  const scormDirPath = join(bundleOutputDir, 'scorm');
  const reportsDirPath = join(bundleOutputDir, 'reports');
  
  mkdirSync(contentDirPath, { recursive: true });
  mkdirSync(scormDirPath, { recursive: true });
  mkdirSync(reportsDirPath, { recursive: true });
  
  // Write bundle.json
  const bundleJsonPath = join(bundleOutputDir, 'bundle.json');
  writeFileSync(bundleJsonPath, JSON.stringify(bundle, null, 2) + '\n', 'utf-8');
  console.log(`   ✅ bundle.json`);
  
  // Write SCORM manifest
  const scormManifestPath = join(scormDirPath, 'imsmanifest.xml');
  const scormManifest = generateSCORMManifest(bundle);
  writeFileSync(scormManifestPath, scormManifest, 'utf-8');
  console.log(`   ✅ scorm/imsmanifest.xml`);
  
  // Write syllabus
  const syllabusPath = join(bundleOutputDir, 'syllabus.md');
  const syllabus = generateSyllabus(bundle);
  writeFileSync(syllabusPath, syllabus, 'utf-8');
  console.log(`   ✅ syllabus.md`);
  
  // Copy entry documents to content/
  for (const module of bundle.modules) {
    for (const item of module.items) {
      const relativePath = item.entryUrl.replace(/^\/v1\//, '');
      const sourcePath = join(contentDir, relativePath);
      const destPath = join(contentDirPath, relativePath);
      
      if (existsSync(sourcePath)) {
        // Create directory structure
        const destDir = dirname(destPath);
        mkdirSync(destDir, { recursive: true });
        copyFileSync(sourcePath, destPath);
      }
    }
  }
  console.log(`   ✅ content/ (${bundle.totals.packs + bundle.totals.drills + bundle.totals.exams} entry documents)`);
  
  // Generate integrity report
  const integrityReport = generateIntegrityReport(bundle, contentDirPath);
  const integrityReportPath = join(reportsDirPath, 'integrity.json');
  writeFileSync(integrityReportPath, JSON.stringify(integrityReport, null, 2) + '\n', 'utf-8');
  console.log(`   ✅ reports/integrity.json`);
  
  // Print integrity summary
  printIntegritySummary(integrityReport);
  
  // Check for errors
  if (integrityReport.errors.length > 0) {
    console.error(`\n❌ Bundle has ${integrityReport.errors.length} errors. Review integrity report.`);
  }
}

/**
 * Create ZIP file from bundle directory
 */
export function createBundleZip(
  bundleOutputDir: string,
  zipPath: string
): void {
  console.log(`\n📦 Creating ZIP: ${zipPath}`);
  
  try {
    // Use zip command if available
    execSync(`cd "${bundleOutputDir}" && zip -r "${zipPath}" . -x "*.DS_Store"`, {
      stdio: 'pipe'
    });
    console.log(`   ✅ ZIP created: ${zipPath}`);
  } catch (error: any) {
    console.warn(`   ⚠️  ZIP creation failed (zip command not available): ${error.message}`);
    console.log(`   📁 Bundle files available in: ${bundleOutputDir}`);
    throw error;
  }
}

