#!/usr/bin/env tsx

/**
 * Level Accuracy Analysis Script
 * 
 * Scans all existing content (drills, packs, exams) and generates a report
 * on level accuracy, identifying content items with level mismatches.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { vocabularyGradingService, type ContentGrade } from './vocabulary-grading/vocabularyGradingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const META_DIR = join(__dirname, '..', 'content', 'meta');
const REPORT_FILE = join(META_DIR, 'level-accuracy-report.json');

interface LevelMismatch {
  id: string;
  kind: 'drill' | 'pack' | 'exam';
  claimedLevel: string;
  detectedLevel: string | null;
  confidence: number;
  accuracy: number;
  issues: string[];
  entryUrl: string;
  workspace: string;
}

interface LevelAccuracyReport {
  generatedAt: string;
  summary: {
    totalItems: number;
    accurate: number;
    mismatched: number;
    accuracyRate: number;
    byKind: {
      drill: { total: number; accurate: number; mismatched: number };
      pack: { total: number; accurate: number; mismatched: number };
      exam: { total: number; accurate: number; mismatched: number };
    };
    byLevel: Record<string, { total: number; accurate: number; mismatched: number }>;
  };
  mismatches: LevelMismatch[];
}

async function scanDrills(workspaceId: string): Promise<Array<{ path: string; entry: any }>> {
  const drills: Array<{ path: string; entry: any }> = [];
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'drills');

  if (!existsSync(drillsDir)) {
    return drills;
  }

  const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const drillDir of drillDirs) {
    const drillPath = join(drillsDir, drillDir, 'drill.json');
    if (existsSync(drillPath)) {
      try {
        const entry = JSON.parse(readFileSync(drillPath, 'utf-8'));
        drills.push({ path: drillPath, entry });
      } catch (error) {
        console.warn(`Failed to parse ${drillPath}: ${error}`);
      }
    }
  }

  return drills;
}

async function scanPacks(workspaceId: string): Promise<Array<{ path: string; entry: any }>> {
  const packs: Array<{ path: string; entry: any }> = [];
  const packsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'packs');

  if (!existsSync(packsDir)) {
    return packs;
  }

  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const packDir of packDirs) {
    const packPath = join(packsDir, packDir, 'pack.json');
    if (existsSync(packPath)) {
      try {
        const entry = JSON.parse(readFileSync(packPath, 'utf-8'));
        packs.push({ path: packPath, entry });
      } catch (error) {
        console.warn(`Failed to parse ${packPath}: ${error}`);
      }
    }
  }

  return packs;
}

async function scanExams(workspaceId: string): Promise<Array<{ path: string; entry: any }>> {
  const exams: Array<{ path: string; entry: any }> = [];
  const examsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'exams');

  if (!existsSync(examsDir)) {
    return exams;
  }

  const examDirs = readdirSync(examsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const examDir of examDirs) {
    const examPath = join(examsDir, examDir, 'exam.json');
    if (existsSync(examPath)) {
      try {
        const entry = JSON.parse(readFileSync(examPath, 'utf-8'));
        exams.push({ path: examPath, entry });
      } catch (error) {
        console.warn(`Failed to parse ${examPath}: ${error}`);
      }
    }
  }

  return exams;
}

function getEntryUrl(entry: any, kind: string, workspaceId: string): string {
  if (entry.entryUrl) {
    return entry.entryUrl;
  }

  // Construct from path
  if (kind === 'drill') {
    return `/v1/workspaces/${workspaceId}/drills/${entry.id}/drill.json`;
  } else if (kind === 'pack') {
    return `/v1/workspaces/${workspaceId}/packs/${entry.id}/pack.json`;
  } else if (kind === 'exam') {
    return `/v1/workspaces/${workspaceId}/exams/${entry.id}/exam.json`;
  }
  return '';
}

async function analyzeContent(): Promise<LevelAccuracyReport> {
  console.log('🔍 Analyzing level accuracy across all content...\n');

  const workspaces = readdirSync(join(CONTENT_DIR, 'workspaces'), { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  const allItems: Array<{ entry: any; kind: string; workspace: string; path: string }> = [];
  const mismatches: LevelMismatch[] = [];
  const summary = {
    totalItems: 0,
    accurate: 0,
    mismatched: 0,
    accuracyRate: 0,
    byKind: {
      drill: { total: 0, accurate: 0, mismatched: 0 },
      pack: { total: 0, accurate: 0, mismatched: 0 },
      exam: { total: 0, accurate: 0, mismatched: 0 }
    },
    byLevel: {} as Record<string, { total: number; accurate: number; mismatched: number }>
  };

  // Scan all content
  for (const workspaceId of workspaces) {
    console.log(`📦 Scanning workspace: ${workspaceId}`);

    const drills = await scanDrills(workspaceId);
    for (const { entry } of drills) {
      allItems.push({ entry, kind: 'drill', workspace: workspaceId, path: '' });
    }

    const packs = await scanPacks(workspaceId);
    for (const { entry } of packs) {
      allItems.push({ entry, kind: 'pack', workspace: workspaceId, path: '' });
    }

    const exams = await scanExams(workspaceId);
    for (const { entry } of exams) {
      allItems.push({ entry, kind: 'exam', workspace: workspaceId, path: '' });
    }
  }

  console.log(`\n📊 Found ${allItems.length} content items to analyze\n`);

  // Analyze each item
  let processed = 0;
  for (const { entry, kind, workspace } of allItems) {
    processed++;
    if (processed % 10 === 0) {
      process.stdout.write(`\r   Processed: ${processed}/${allItems.length}...`);
    }

    // Skip if no level
    if (!entry.level || typeof entry.level !== 'string') {
      continue;
    }

    // Skip if no prompts
    if (!entry.prompts || !Array.isArray(entry.prompts) || entry.prompts.length === 0) {
      continue;
    }

    const claimedLevel = entry.level.toUpperCase();
    const language = entry.language || 'de';

    // Grade the content
    let grade: ContentGrade;
    try {
      grade = await vocabularyGradingService.gradeContent(entry, language);
    } catch (error) {
      console.warn(`\n⚠️  Failed to grade ${entry.id}: ${error}`);
      continue;
    }

    // Update summary
    summary.totalItems++;
    summary.byKind[kind as keyof typeof summary.byKind].total++;

    if (!summary.byLevel[claimedLevel]) {
      summary.byLevel[claimedLevel] = { total: 0, accurate: 0, mismatched: 0 };
    }
    summary.byLevel[claimedLevel].total++;

    // Check if there's a mismatch
    const isMismatch = grade.accuracy < 0.85 || grade.issues.length > 0;

    if (isMismatch) {
      summary.mismatched++;
      summary.byKind[kind as keyof typeof summary.byKind].mismatched++;
      summary.byLevel[claimedLevel].mismatched++;

      const entryUrl = getEntryUrl(entry, kind, workspace);
      mismatches.push({
        id: entry.id,
        kind: kind as 'drill' | 'pack' | 'exam',
        claimedLevel,
        detectedLevel: grade.detectedLevel || null,
        confidence: grade.confidence,
        accuracy: grade.accuracy,
        issues: grade.issues,
        entryUrl,
        workspace
      });
    } else {
      summary.accurate++;
      summary.byKind[kind as keyof typeof summary.byKind].accurate++;
      summary.byLevel[claimedLevel].accurate++;
    }
  }

  process.stdout.write(`\r   Processed: ${allItems.length}/${allItems.length}...\n`);

  summary.accuracyRate = summary.totalItems > 0 
    ? summary.accurate / summary.totalItems 
    : 0;

  const report: LevelAccuracyReport = {
    generatedAt: new Date().toISOString(),
    summary,
    mismatches: mismatches.sort((a, b) => b.accuracy - a.accuracy) // Sort by accuracy (worst first)
  };

  return report;
}

async function main() {
  try {
    const report = await analyzeContent();

    // Ensure meta directory exists
    if (!existsSync(META_DIR)) {
      mkdirSync(META_DIR, { recursive: true });
    }

    // Save report
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf-8');

    // Print summary
    console.log('\n✅ Analysis complete!\n');
    console.log('📊 Summary:');
    console.log(`   Total items: ${report.summary.totalItems}`);
    console.log(`   Accurate: ${report.summary.accurate} (${(report.summary.accuracyRate * 100).toFixed(1)}%)`);
    console.log(`   Mismatched: ${report.summary.mismatched} (${((1 - report.summary.accuracyRate) * 100).toFixed(1)}%)`);
    console.log('\n📁 By kind:');
    console.log(`   Drills: ${report.summary.byKind.drill.accurate}/${report.summary.byKind.drill.total} accurate`);
    console.log(`   Packs: ${report.summary.byKind.pack.accurate}/${report.summary.byKind.pack.total} accurate`);
    console.log(`   Exams: ${report.summary.byKind.exam.accurate}/${report.summary.byKind.exam.total} accurate`);
    console.log('\n📈 By level:');
    for (const [level, stats] of Object.entries(report.summary.byLevel)) {
      const rate = stats.total > 0 ? (stats.accurate / stats.total * 100).toFixed(1) : '0.0';
      console.log(`   ${level}: ${stats.accurate}/${stats.total} accurate (${rate}%)`);
    }

    if (report.mismatches.length > 0) {
      console.log(`\n⚠️  Found ${report.mismatches.length} items with level mismatches`);
      console.log(`   Report saved to: ${REPORT_FILE}`);
      console.log(`   Run: tsx scripts/fix-level-mismatches.ts to fix issues`);
    } else {
      console.log('\n✅ All content has accurate level labeling!');
    }

    // Cache stats
    const cacheStats = vocabularyGradingService.getCacheStats();
    console.log(`\n💾 Vocabulary cache: ${cacheStats.size} tokens across ${cacheStats.languages.length} language(s)`);
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  }
}

main();

