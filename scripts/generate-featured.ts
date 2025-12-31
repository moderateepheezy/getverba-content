#!/usr/bin/env tsx

/**
 * Deterministic Featured Content Generation
 * 
 * Generates featured.json that tells the app what to feature on Home (hero + cards).
 * Selection is deterministic and stable across runs given the same content.
 * 
 * Usage:
 *   npm run content:generate-featured -- --workspace de
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface EntryDocument {
  id: string;
  kind: string;
  title: string;
  level: string;
  scenario?: string;
  review?: {
    status: 'draft' | 'needs_review' | 'approved';
    reviewer?: string;
    reviewedAt?: string;
  };
  provenance?: {
    source: string;
  };
}

interface TrackDocument extends EntryDocument {
  items?: Array<{
    kind: string;
    entryUrl: string;
  }>;
}

interface FeaturedV1 {
  version: 1;
  workspace: string;
  generatedAt: string;
  hero: {
    kind: 'track' | 'pack' | 'exam' | 'drill';
    titleOverride?: string;
    subtitle?: string;
    entryUrl: string;
    cta: {
      label: string;
      action: 'open_entry';
    };
  };
  cards: Array<{
    id: string;
    kind: 'pack' | 'drill' | 'exam' | 'track';
    titleOverride?: string;
    entryUrl: string;
    tag?: string;
  }>;
}

/**
 * Check if an entry is approved (or handcrafted, which is auto-approved)
 */
function isApproved(entry: EntryDocument): boolean {
  // Handcrafted entries are auto-approved
  if (entry.provenance?.source === 'handcrafted') {
    return true;
  }
  // Generated entries must have review.status === 'approved'
  return entry.review?.status === 'approved';
}

/**
 * Read entry document from disk
 */
function readEntry(entryPath: string): EntryDocument | null {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Get all tracks for a workspace
 */
function getTracks(workspace: string): TrackDocument[] {
  const tracksDir = join(CONTENT_DIR, 'workspaces', workspace, 'tracks');
  if (!existsSync(tracksDir)) {
    return [];
  }
  
  const tracks: TrackDocument[] = [];
  const trackDirs = readdirSync(tracksDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory());
  
  for (const dirent of trackDirs) {
    const trackPath = join(tracksDir, dirent.name, 'track.json');
    if (existsSync(trackPath)) {
      const track = readEntry(trackPath) as TrackDocument | null;
      if (track && track.kind === 'track') {
        tracks.push(track);
      }
    }
  }
  
  return tracks;
}

/**
 * Get all packs for a workspace
 */
function getPacks(workspace: string): EntryDocument[] {
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  if (!existsSync(packsDir)) {
    return [];
  }
  
  const packs: EntryDocument[] = [];
  const packDirs = readdirSync(packsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory());
  
  for (const dirent of packDirs) {
    const packPath = join(packsDir, dirent.name, 'pack.json');
    if (existsSync(packPath)) {
      const pack = readEntry(packPath);
      if (pack && pack.kind === 'pack') {
        packs.push(pack);
      }
    }
  }
  
  return packs;
}

/**
 * Get all drills for a workspace
 */
function getDrills(workspace: string): EntryDocument[] {
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspace, 'drills');
  if (!existsSync(drillsDir)) {
    return [];
  }
  
  const drills: EntryDocument[] = [];
  const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory());
  
  for (const dirent of drillDirs) {
    const drillPath = join(drillsDir, dirent.name, 'drill.json');
    if (existsSync(drillPath)) {
      const drill = readEntry(drillPath);
      if (drill && drill.kind === 'drill') {
        drills.push(drill);
      }
    }
  }
  
  return drills;
}

/**
 * Get all exams for a workspace
 */
function getExams(workspace: string): EntryDocument[] {
  const examsDir = join(CONTENT_DIR, 'workspaces', workspace, 'exams');
  if (!existsSync(examsDir)) {
    return [];
  }
  
  const exams: EntryDocument[] = [];
  const examDirs = readdirSync(examsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory());
  
  for (const dirent of examDirs) {
    const examPath = join(examsDir, dirent.name, 'exam.json');
    if (existsSync(examPath)) {
      const exam = readEntry(examPath);
      if (exam && exam.kind === 'exam') {
        exams.push(exam);
      }
    }
  }
  
  return exams;
}

/**
 * Deterministic sort: level (primary), title (secondary), id (tertiary)
 */
function compareLevels(a: string, b: string): number {
  const levelOrder: Record<string, number> = {
    'A1': 1,
    'A2': 2,
    'B1': 3,
    'B2': 4,
    'C1': 5,
    'C2': 6
  };
  
  const aOrder = levelOrder[a.toUpperCase()] || 999;
  const bOrder = levelOrder[b.toUpperCase()] || 999;
  
  return aOrder - bOrder;
}

function sortEntries<T extends EntryDocument>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const levelCmp = compareLevels(a.level, b.level);
    if (levelCmp !== 0) return levelCmp;
    
    const titleCmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (titleCmp !== 0) return titleCmp;
    
    return a.id.localeCompare(b.id);
  });
}

/**
 * Select hero entry deterministically
 */
function selectHero(workspace: string): { kind: 'track' | 'pack' | 'exam' | 'drill'; entry: EntryDocument; entryUrl: string } | null {
  // Rule 1: Default hero for de workspace = gov_office_a1_default track if exists and approved
  if (workspace === 'de') {
    const tracks = getTracks(workspace);
    const govTrack = tracks.find(t => t.id === 'gov_office_a1_default');
    if (govTrack && isApproved(govTrack)) {
      return {
        kind: 'track',
        entry: govTrack,
        entryUrl: `/v1/workspaces/${workspace}/tracks/gov_office_a1_default/track.json`
      };
    }
  }
  
  // Rule 2: Fallback hero = first approved pack in context section at A1/A2 (stable sorting)
  const packs = getPacks(workspace);
  const approvedPacks = packs.filter(p => isApproved(p));
  const a1a2Packs = sortEntries(approvedPacks.filter(p => 
    p.level.toUpperCase() === 'A1' || p.level.toUpperCase() === 'A2'
  ));
  
  if (a1a2Packs.length > 0) {
    const pack = a1a2Packs[0];
    return {
      kind: 'pack',
      entry: pack,
      entryUrl: `/v1/workspaces/${workspace}/packs/${pack.id}/pack.json`
    };
  }
  
  // Rule 3: If no approved packs, try approved drills
  const drills = getDrills(workspace);
  const approvedDrills = drills.filter(d => isApproved(d));
  const a1a2Drills = sortEntries(approvedDrills.filter(d => 
    d.level.toUpperCase() === 'A1' || d.level.toUpperCase() === 'A2'
  ));
  
  if (a1a2Drills.length > 0) {
    const drill = a1a2Drills[0];
    return {
      kind: 'drill',
      entry: drill,
      entryUrl: `/v1/workspaces/${workspace}/drills/${drill.id}/drill.json`
    };
  }
  
  return null;
}

/**
 * Select cards deterministically
 */
function selectCards(
  workspace: string,
  hero: { kind: string; entry: EntryDocument; entryUrl: string } | null
): Array<{ id: string; kind: 'pack' | 'drill' | 'exam' | 'track'; entryUrl: string; tag?: string }> {
  const cards: Array<{ id: string; kind: 'pack' | 'drill' | 'exam' | 'track'; entryUrl: string; tag?: string }> = [];
  const usedEntryUrls = new Set<string>();
  
  if (hero) {
    usedEntryUrls.add(hero.entryUrl);
  }
  
  // Rule 1: 1-2 mechanics drills at A1 that support the hero scenario (if scenario match available)
  if (hero && hero.entry.scenario) {
    const drills = getDrills(workspace);
    const approvedDrills = drills.filter(d => isApproved(d));
    const matchingDrills = sortEntries(approvedDrills.filter(d => 
      d.level.toUpperCase() === 'A1' && 
      d.scenario === hero.entry.scenario &&
      !usedEntryUrls.has(`/v1/workspaces/${workspace}/drills/${d.id}/drill.json`)
    ));
    
    // Add up to 2 matching drills
    for (let i = 0; i < Math.min(2, matchingDrills.length); i++) {
      const drill = matchingDrills[i];
      const entryUrl = `/v1/workspaces/${workspace}/drills/${drill.id}/drill.json`;
      cards.push({
        id: `drill-${drill.id}`,
        kind: 'drill',
        entryUrl,
        tag: 'Mechanics'
      });
      usedEntryUrls.add(entryUrl);
    }
  }
  
  // Rule 2: 1 pack from context at same level (stable)
  if (hero) {
    const packs = getPacks(workspace);
    const approvedPacks = packs.filter(p => isApproved(p));
    const sameLevelPacks = sortEntries(approvedPacks.filter(p => 
      p.level === hero.entry.level &&
      !usedEntryUrls.has(`/v1/workspaces/${workspace}/packs/${p.id}/pack.json`)
    ));
    
    if (sameLevelPacks.length > 0) {
      const pack = sameLevelPacks[0];
      const entryUrl = `/v1/workspaces/${workspace}/packs/${pack.id}/pack.json`;
      cards.push({
        id: `pack-${pack.id}`,
        kind: 'pack',
        entryUrl,
        tag: pack.scenario ? pack.scenario.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : undefined
      });
      usedEntryUrls.add(entryUrl);
    }
  }
  
  // Rule 3: 0-1 exam at A1 (optional)
  const exams = getExams(workspace);
  const approvedExams = exams.filter(e => isApproved(e));
  const a1Exams = sortEntries(approvedExams.filter(e => 
    e.level.toUpperCase() === 'A1' &&
    !usedEntryUrls.has(`/v1/workspaces/${workspace}/exams/${e.id}/exam.json`)
  ));
  
  if (a1Exams.length > 0 && cards.length < 4) {
    const exam = a1Exams[0];
    const entryUrl = `/v1/workspaces/${workspace}/exams/${exam.id}/exam.json`;
    cards.push({
      id: `exam-${exam.id}`,
      kind: 'exam',
      entryUrl,
      tag: 'Assessment'
    });
    usedEntryUrls.add(entryUrl);
  }
  
  // Ensure cards length is 0-4
  return cards.slice(0, 4);
}

/**
 * Generate featured.json for a workspace
 */
function generateFeatured(workspace: string): void {
  console.log(`🎯 Generating featured content for workspace: ${workspace}`);
  
  const hero = selectHero(workspace);
  if (!hero) {
    console.error(`❌ Error: Could not select hero for workspace ${workspace}. No approved content found.`);
    process.exit(1);
  }
  
  console.log(`   Hero: ${hero.kind} - ${hero.entry.title} (${hero.entry.level})`);
  
  const cards = selectCards(workspace, hero);
  console.log(`   Cards: ${cards.length} item(s)`);
  cards.forEach((card, idx) => {
    console.log(`      ${idx + 1}. ${card.kind} - ${card.id}${card.tag ? ` (${card.tag})` : ''}`);
  });
  
  const featured: FeaturedV1 = {
    version: 1,
    workspace,
    generatedAt: new Date().toISOString(),
    hero: {
      kind: hero.kind,
      entryUrl: hero.entryUrl,
      cta: {
        label: 'Start',
        action: 'open_entry'
      }
    },
    cards: cards
  };
  
  // Write featured.json
  const featuredDir = join(CONTENT_DIR, 'workspaces', workspace, 'featured');
  if (!existsSync(featuredDir)) {
    mkdirSync(featuredDir, { recursive: true });
  }
  
  const featuredPath = join(featuredDir, 'featured.json');
  writeFileSync(featuredPath, JSON.stringify(featured, null, 2) + '\n', 'utf-8');
  
  console.log(`   ✅ Generated: ${featuredPath}`);
}

// Parse command line arguments
const args = process.argv.slice(2);
let workspace: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--workspace' && i + 1 < args.length) {
    workspace = args[i + 1];
    i++;
  }
}

if (!workspace) {
  console.error('❌ Error: --workspace argument is required');
  console.error('Usage: npm run content:generate-featured -- --workspace <workspace>');
  process.exit(1);
}

// Validate workspace exists
const workspaceDir = join(CONTENT_DIR, 'workspaces', workspace);
if (!existsSync(workspaceDir)) {
  console.error(`❌ Error: Workspace "${workspace}" not found at ${workspaceDir}`);
  process.exit(1);
}

generateFeatured(workspace);
console.log('✅ Featured content generation complete');

