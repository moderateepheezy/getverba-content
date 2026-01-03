#!/usr/bin/env tsx

/**
 * Deterministic Section Index Generation
 * 
 * Generates paginated section indexes from canonical entry documents on disk.
 * Replaces manual index editing with automated generation.
 * 
 * Usage:
 *   npm run content:generate-indexes [--workspace <ws>]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deriveTopicFields, type PackEntry } from './content-quality/deriveTopicFields.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

// Section configuration: sectionId -> kind -> content folder
const SECTION_CONFIG: Record<string, { kind: string; folders: string[] }> = {
  context: {
    kind: 'context',
    folders: ['packs']
  },
  drills: {
    kind: 'drills',
    folders: ['drills']
  },
  mechanics: {
    kind: 'drills',
    folders: ['drills']
  },
  exams: {
    kind: 'exams',
    folders: ['exams']
  },
  tracks: {
    kind: 'tracks',
    folders: ['tracks']
  }
};

interface AnalyticsSummary {
  primaryStructure: string;
  scenario: string;
  register: string;
  variationSlots: string[];
  targetResponseSeconds?: number;
  drillType: string;
  cognitiveLoad: string;
  goal: string;
  whyThisWorks: string[];
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
  signals?: {
    multiSlot: 'low' | 'med' | 'high';
    difficultyHint: 'foundation' | 'standard' | 'stretch';
  };
  tags?: string[];
  // Telemetry identifiers (required)
  contentId: string;
  revisionId: string;
  // Catalog-level analytics fields (optional, for pack items)
  focus?: string;
  cognitiveLoad?: 'low' | 'medium' | 'high';
  fluencyOutcome?: string;
  // Analytics summary (required for kind="pack")
  analyticsSummary?: AnalyticsSummary;
  // Legacy analytics fields (deprecated, use analyticsSummary)
  drillType?: string;
  whyThisWorks?: string;
  // Topic grouping metadata (optional, for pack browsing)
  topicKey?: string;
  topicLabel?: string;
  shortTitle?: string;
  orderInTopic?: number;
  // Grouping metadata (for context scenario feeds)
  groupId?: string;
  groupTitle?: string;
  groupTitle_i18n?: Record<string, string>;
  // Domain classification (context vs mechanics vs exam)
  domainKind?: 'context' | 'mechanics' | 'exam';
  // Recommended flag (for deterministic recommendation)
  isRecommended?: boolean;
  // Exam-specific fields (optional, for exam items)
  phraseCount?: number;
  // i18n fields (optional, for localization)
  title_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  topicLabel_i18n?: Record<string, string>;
}

interface ContextGroup {
  id: string;
  title: string;
  title_i18n?: Record<string, string>;
  kind: 'context_group';
  itemIds: string[];
}

interface Scope {
  scopeKind: 'scenario';
  scopeId: string;
  scopeTitle: string;
}

interface Recommended {
  itemId: string;
  entryUrl: string;
}

interface SectionIndex {
  version: string;
  kind: string;
  total: number;
  pageSize: number;
  page: number;
  items: SectionIndexItem[];
  nextPage: string | null;
  // New fields for context scenario feeds (additive, optional)
  scope?: Scope;
  recommended?: Recommended;
  groups?: ContextGroup[];
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
  // Telemetry identifiers (required)
  contentId?: string;
  contentHash?: string;
  revisionId?: string;
  // Domain classification (optional)
  domainKind?: 'context' | 'mechanics' | 'exam';
  // Grouping metadata (optional, for context scenario feeds)
  groupId?: string;
  groupTitle?: string;
  groupTitle_i18n?: Record<string, string>;
  // Exam-specific fields (optional)
  phraseCount?: number;
  analytics?: {
    version?: number;
    goal: string;
    successCriteria: string[];
    drillType: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    targetResponseSeconds?: number;
    primaryStructure?: string;
    scenario?: string;
    register?: string;
    variationSlots?: string[];
    minDistinctSubjects?: number;
    minDistinctVerbs?: number;
    minMultiSlotRate?: number;
    canonicalIntents?: string[];
    anchorPhrases?: string[];
    // Catalog-level analytics (required for generated packs)
    focus?: string;
    responseSpeedTargetMs?: number;
    fluencyOutcome?: string;
    whyThisWorks?: string[];
    // Topic grouping metadata (optional, explicit override)
    topicKey?: string;
    topicLabel?: string;
    shortTitle?: string;
    orderInTopic?: number;
  };
}

/**
 * Detect domainKind (context vs mechanics vs exam)
 * 
 * Rules:
 * - If pack has a scenario (doctor, work, etc.), it's context (even if topicKey suggests mechanics)
 * - If pack is in drills/mechanics folder or explicitly marked, it's mechanics
 * - Exams are always exam
 * - Default to context
 */
function detectDomainKind(item: SectionIndexItem): 'context' | 'mechanics' | 'exam' {
  // Exams are always exam
  if (item.kind === 'exam') {
    return 'exam';
  }
  
  // If explicitly set, use it
  if (item.domainKind) {
    return item.domainKind;
  }
  
  // Packs with a scenario are ALWAYS context (scenario-based conversation practice)
  // This is the key rule: scenario packs are context, not mechanics
  if (item.scenario) {
    return 'context';
  }
  
  // Mechanics indicators: grammar-focused topicKeys (only if no scenario)
  const mechanicsTopicKeys = [
    'dative-case',
    'accusative-case',
    'genitive-case',
    'verb-conjugation',
    'word-order',
    'prepositions',
    'articles',
    'adjectives',
    'pronouns',
    'subjunctive',
    'passive-voice',
    'relative-clauses',
    'conditional',
    'imperative'
  ];
  
  // Note: "modal-verbs-requests" and "modal-verbs-suggestions" are NOT mechanics
  // They are context topics that happen to use modal verbs
  
  if (item.topicKey && mechanicsTopicKeys.includes(item.topicKey)) {
    return 'mechanics';
  }
  
  // If primaryStructure suggests mechanics (only if no scenario)
  if (item.primaryStructure) {
    const mechanicsStructures = [
      'dative_case',
      'accusative_case',
      'genitive_case',
      'verb_conjugation',
      'word_order',
      'prepositions',
      'articles',
      'adjectives',
      'pronouns'
    ];
    
    if (mechanicsStructures.some(ms => item.primaryStructure!.toLowerCase().includes(ms))) {
      return 'mechanics';
    }
  }
  
  // Default to context
  return 'context';
}

/**
 * Filter items to only include context packs (exclude mechanics)
 */
function filterContextItems(items: SectionIndexItem[]): SectionIndexItem[] {
  return items.filter(item => {
    const domainKind = detectDomainKind(item);
    return domainKind === 'context';
  });
}

/**
 * Create groups from items (minimum 3 items per group)
 * Groups are based on groupId field
 */
function createGroups(
  items: SectionIndexItem[],
  minItemsPerGroup: number = 3
): ContextGroup[] {
  // Group items by groupId
  const groupMap = new Map<string, SectionIndexItem[]>();
  
  for (const item of items) {
    if (item.groupId && item.groupTitle) {
      if (!groupMap.has(item.groupId)) {
        groupMap.set(item.groupId, []);
      }
      groupMap.get(item.groupId)!.push(item);
    }
  }
  
  // Create groups (only if they have minimum items)
  const groups: ContextGroup[] = [];
  
  for (const [groupId, groupItems] of groupMap.entries()) {
    if (groupItems.length >= minItemsPerGroup) {
      const firstItem = groupItems[0];
      groups.push({
        id: groupId,
        title: firstItem.groupTitle!,
        title_i18n: firstItem.groupTitle_i18n,
        kind: 'context_group',
        itemIds: groupItems.map(item => item.id)
      });
    }
  }
  
  // Sort groups by first appearance order in items array
  const groupOrder = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.groupId && !groupOrder.has(item.groupId)) {
      groupOrder.set(item.groupId, i);
    }
  }
  
  return groups.sort((a, b) => {
    const aOrder = groupOrder.get(a.id) ?? 999;
    const bOrder = groupOrder.get(b.id) ?? 999;
    return aOrder - bOrder;
  });
}

/**
 * Select recommended item (deterministic, max 1)
 * Prefers first incomplete pack by stable order (A1 then A2, then by sequenceIndex, else by id)
 * If all completed/unknown, defaults to first pack by stable order
 */
function selectRecommended(
  items: SectionIndexItem[]
): { itemId: string; entryUrl: string } | undefined {
  if (items.length === 0) {
    return undefined;
  }
  
  // For now, we don't have user progress data, so default to first item by stable order
  // Stable order: level (A1 < A2 < ...), then orderInTopic, then id
  const sorted = [...items].sort((a, b) => {
    // Primary: level
    const levelCmp = compareLevels(a.level, b.level);
    if (levelCmp !== 0) return levelCmp;
    
    // Secondary: orderInTopic (if present)
    if (a.orderInTopic !== undefined && b.orderInTopic !== undefined) {
      const orderCmp = a.orderInTopic - b.orderInTopic;
      if (orderCmp !== 0) return orderCmp;
    } else if (a.orderInTopic !== undefined) {
      return -1;
    } else if (b.orderInTopic !== undefined) {
      return 1;
    }
    
    // Tertiary: id (stable tie-break)
    return a.id.localeCompare(b.id);
  });
  
  const recommended = sorted[0];
  return {
    itemId: recommended.id,
    entryUrl: recommended.entryUrl
  };
}

/**
 * Level comparison for deterministic sorting
 * A1 < A2 < B1 < B2 < C1 < C2
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

/**
 * Deterministic sort: level (primary), title (secondary), id (tertiary)
 */
function sortItems(items: SectionIndexItem[]): SectionIndexItem[] {
  return [...items].sort((a, b) => {
    // Primary: level
    const levelCmp = compareLevels(a.level, b.level);
    if (levelCmp !== 0) return levelCmp;
    
    // Secondary: title (localeCompare for stable sort)
    const titleCmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (titleCmp !== 0) return titleCmp;
    
    // Tertiary: id (stable tie-break)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Read entry document and extract index item data
 */
function readEntryDocument(
  entryPath: string,
  workspaceId: string,
  entryType: 'pack' | 'drill' | 'exam'
): SectionIndexItem | null {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entry: EntryDocument = JSON.parse(content);
    
    // Validate required fields
    if (!entry.id || !entry.kind || !entry.title || !entry.level) {
      console.warn(`⚠️  Skipping ${entryPath}: missing required fields`);
      return null;
    }
    
    // Determine entry URL pattern
    let entryUrl: string;
    if (entryType === 'pack') {
      entryUrl = `/v1/workspaces/${workspaceId}/packs/${entry.id}/pack.json`;
    } else if (entryType === 'exam') {
      entryUrl = `/v1/workspaces/${workspaceId}/exams/${entry.id}/exam.json`;
    } else {
      entryUrl = `/v1/workspaces/${workspaceId}/drills/${entry.id}/drill.json`;
    }
    
    // Extract durationMinutes from estimatedMinutes
    const durationMinutes = entry.estimatedMinutes || 15; // fallback
    
    // Validate telemetry identifiers are present
    if (!entry.contentId || typeof entry.contentId !== 'string') {
      console.warn(`⚠️  Entry ${entry.id} missing contentId, cannot generate index item`);
      return null;
    }
    if (!entry.revisionId || typeof entry.revisionId !== 'string') {
      console.warn(`⚠️  Entry ${entry.id} missing revisionId, cannot generate index item`);
      return null;
    }
    
    // Enrich with pack metadata (scenario, register, primaryStructure, tags)
    const item: SectionIndexItem = {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      level: entry.level,
      durationMinutes,
      entryUrl,
      contentId: entry.contentId,
      revisionId: entry.revisionId
    };
    
    // Add optional metadata fields if present in pack
    if (entry.scenario) {
      item.scenario = entry.scenario;
    }
    if (entry.register) {
      item.register = entry.register;
    }
    if (entry.primaryStructure) {
      item.primaryStructure = entry.primaryStructure;
    }
    if (entry.tags && Array.isArray(entry.tags)) {
      item.tags = entry.tags;
    }
    
    // Add catalog-level analytics fields if present (for pack items)
    if (entryType === 'pack' && entry.analytics && typeof entry.analytics === 'object') {
      if (entry.analytics.focus && typeof entry.analytics.focus === 'string') {
        item.focus = entry.analytics.focus;
      }
      if (entry.analytics.cognitiveLoad && typeof entry.analytics.cognitiveLoad === 'string') {
        item.cognitiveLoad = entry.analytics.cognitiveLoad as 'low' | 'medium' | 'high';
      }
      if (entry.analytics.fluencyOutcome && typeof entry.analytics.fluencyOutcome === 'string') {
        item.fluencyOutcome = entry.analytics.fluencyOutcome;
      }
    }
    
    // Add exam-specific fields (phraseCount)
    if (entryType === 'exam' && typeof entry.phraseCount === 'number') {
      item.phraseCount = entry.phraseCount;
    }
    
    // Add analytics summary for pack items (required)
    if (entryType === 'pack' && entry.analytics && typeof entry.analytics === 'object') {
      if (!entry.primaryStructure) {
        console.warn(`⚠️  Pack ${entry.id} missing primaryStructure, cannot generate analyticsSummary`);
      } else if (!Array.isArray(entry.variationSlots) || entry.variationSlots.length === 0) {
        console.warn(`⚠️  Pack ${entry.id} missing variationSlots, cannot generate analyticsSummary`);
      } else if (!entry.analytics.drillType || !entry.analytics.cognitiveLoad || !entry.analytics.goal) {
        console.warn(`⚠️  Pack ${entry.id} missing required analytics fields, cannot generate analyticsSummary`);
      } else {
        // Generate whyThisWorks array from successCriteria (2-4 bullets, each <= 80 chars)
        const whyThisWorks: string[] = [];
        if (Array.isArray(entry.analytics.successCriteria)) {
          for (const criterion of entry.analytics.successCriteria) {
            if (typeof criterion === 'string' && criterion.trim().length > 0) {
              const trimmed = criterion.trim();
              // Truncate to 80 chars
              const bullet = trimmed.length > 80 ? trimmed.substring(0, 77) + '...' : trimmed;
              whyThisWorks.push(bullet);
              // Stop at 4 bullets
              if (whyThisWorks.length >= 4) break;
            }
          }
        }
        
        // Ensure we have at least 2 bullets (use goal if needed)
        if (whyThisWorks.length < 2 && entry.analytics.goal) {
          const goalBullet = entry.analytics.goal.length > 80 
            ? entry.analytics.goal.substring(0, 77) + '...' 
            : entry.analytics.goal;
          if (whyThisWorks.length === 0 || whyThisWorks[0] !== goalBullet) {
            whyThisWorks.unshift(goalBullet);
          }
        }
        
        // Ensure goal is <= 120 chars
        const goal = entry.analytics.goal.length > 120
          ? entry.analytics.goal.substring(0, 117) + '...'
          : entry.analytics.goal;
        
        item.analyticsSummary = {
          primaryStructure: entry.primaryStructure,
          scenario: entry.scenario || '',
          register: entry.register || '',
          variationSlots: entry.variationSlots,
          targetResponseSeconds: entry.analytics.targetResponseSeconds,
          drillType: entry.analytics.drillType,
          cognitiveLoad: entry.analytics.cognitiveLoad,
          goal: goal,
          whyThisWorks: whyThisWorks.length >= 2 ? whyThisWorks : [goal, 'See pack entry for details']
        };
        
        // Compute signals from analytics metrics
        if (entry.analytics.multiSlotRate !== undefined && typeof entry.analytics.multiSlotRate === 'number') {
          const multiSlotRate = entry.analytics.multiSlotRate;
          let multiSlot: 'low' | 'med' | 'high';
          if (multiSlotRate < 0.3) {
            multiSlot = 'low';
          } else if (multiSlotRate < 0.6) {
            multiSlot = 'med';
          } else {
            multiSlot = 'high';
          }
          
          // Determine difficultyHint based on level and primaryStructure
          let difficultyHint: 'foundation' | 'standard' | 'stretch';
          const level = entry.level || 'A1';
          const isA1 = level === 'A1';
          const isA2 = level === 'A2';
          const isB1Plus = ['B1', 'B2', 'C1', 'C2'].includes(level);
          
          // Foundation: A1 with simple structures
          if (isA1 && (entry.primaryStructure.includes('greeting') || entry.primaryStructure.includes('basic'))) {
            difficultyHint = 'foundation';
          }
          // Stretch: B1+ or complex structures
          else if (isB1Plus || entry.primaryStructure.includes('complex') || entry.primaryStructure.includes('advanced')) {
            difficultyHint = 'stretch';
          }
          // Standard: everything else
          else {
            difficultyHint = 'standard';
          }
          
          item.signals = {
            multiSlot,
            difficultyHint
          };
        }
      }
    }
    
    // Legacy analytics fields (for backwards compatibility, deprecated)
    if (entry.analytics && typeof entry.analytics === 'object') {
      if (entry.analytics.drillType) {
        item.drillType = entry.analytics.drillType;
      }
      if (entry.analytics.cognitiveLoad) {
        item.cognitiveLoad = entry.analytics.cognitiveLoad;
      }
      // Generate whyThisWorks from goal + first successCriteria (legacy format)
      if (entry.analytics.goal && typeof entry.analytics.goal === 'string') {
        const goal = entry.analytics.goal;
        const firstCriterion = Array.isArray(entry.analytics.successCriteria) && entry.analytics.successCriteria.length > 0
          ? entry.analytics.successCriteria[0]
          : null;
        
        if (firstCriterion) {
          item.whyThisWorks = `${goal} ${firstCriterion}`;
        } else {
          item.whyThisWorks = goal;
        }
        
        // Truncate to reasonable length (max 200 chars for index)
        if (item.whyThisWorks.length > 200) {
          item.whyThisWorks = item.whyThisWorks.substring(0, 197) + '...';
        }
      }
    }
    
    // Add topic grouping metadata for pack items
    if (entryType === 'pack') {
      const packEntry: PackEntry = {
        id: entry.id,
        title: entry.title,
        level: entry.level,
        scenario: entry.scenario,
        primaryStructure: entry.primaryStructure,
        tags: entry.tags,
        analytics: entry.analytics ? {
          topicKey: entry.analytics.topicKey,
          topicLabel: entry.analytics.topicLabel,
          shortTitle: entry.analytics.shortTitle,
          orderInTopic: entry.analytics.orderInTopic,
          primaryStructure: entry.analytics.primaryStructure
        } : undefined
      };
      
      const topicFields = deriveTopicFields(packEntry);
      
      if (topicFields.topicKey) {
        item.topicKey = topicFields.topicKey;
      }
      if (topicFields.topicLabel) {
        item.topicLabel = topicFields.topicLabel;
      }
      if (topicFields.shortTitle) {
        item.shortTitle = topicFields.shortTitle;
      }
      if (topicFields.orderInTopic !== undefined) {
        item.orderInTopic = topicFields.orderInTopic;
      }
    }
    
    // Extract i18n fields from entry (if present)
    if (entry.title_i18n && typeof entry.title_i18n === 'object') {
      item.title_i18n = entry.title_i18n;
    }
    if (entry.subtitle_i18n && typeof entry.subtitle_i18n === 'object') {
      item.subtitle_i18n = entry.subtitle_i18n;
    }
    if (entry.shortTitle_i18n && typeof entry.shortTitle_i18n === 'object') {
      item.shortTitle_i18n = entry.shortTitle_i18n;
    }
    // For topicLabel_i18n, check analytics
    if (entry.analytics && entry.analytics.topicLabel_i18n && typeof entry.analytics.topicLabel_i18n === 'object') {
      item.topicLabel_i18n = entry.analytics.topicLabel_i18n;
    }
    
    // Extract grouping metadata from entry (if present)
    if (entry.groupId && typeof entry.groupId === 'string') {
      item.groupId = entry.groupId;
    }
    if (entry.groupTitle && typeof entry.groupTitle === 'string') {
      item.groupTitle = entry.groupTitle;
    }
    if (entry.groupTitle_i18n && typeof entry.groupTitle_i18n === 'object') {
      item.groupTitle_i18n = entry.groupTitle_i18n;
    }
    
    // Detect and set domainKind
    item.domainKind = detectDomainKind(item);
    
    return item;
  } catch (error: any) {
    console.warn(`⚠️  Failed to read ${entryPath}: ${error.message}`);
    return null;
  }
}

/**
 * Read track document and extract index item data
 */
function readTrackDocument(
  entryPath: string,
  workspaceId: string
): SectionIndexItem | null {
  try {
    const content = readFileSync(entryPath, 'utf-8');
    const entry: any = JSON.parse(content);
    
    // Validate required fields
    if (!entry.id || !entry.kind || !entry.title || !entry.level) {
      console.warn(`⚠️  Skipping ${entryPath}: missing required fields`);
      return null;
    }
    
    if (entry.kind !== 'track') {
      console.warn(`⚠️  Skipping ${entryPath}: kind is not "track"`);
      return null;
    }
    
    // Determine entry URL pattern
    const entryUrl = `/v1/workspaces/${workspaceId}/tracks/${entry.id}/track.json`;
    
    // Extract durationMinutes from estimatedMinutes
    const durationMinutes = entry.estimatedMinutes || 15; // fallback
    
    // Build index item (tracks don't have telemetry identifiers)
    const item: SectionIndexItem = {
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      level: entry.level,
      durationMinutes,
      entryUrl,
      // Tracks don't have telemetry identifiers, use placeholder values
      contentId: `${workspaceId}:track:${entry.id}`,
      revisionId: '000000000000'
    };
    
    // Add optional metadata fields if present
    if (entry.scenario) {
      item.scenario = entry.scenario;
    }
    if (entry.tags && Array.isArray(entry.tags)) {
      item.tags = entry.tags;
    }
    
    return item;
  } catch (error: any) {
    console.warn(`⚠️  Failed to read ${entryPath}: ${error.message}`);
    return null;
  }
}

/**
 * Scan directory for entry files
 */
function scanEntryDirectory(
  dirPath: string,
  entryType: 'pack' | 'drill' | 'exam' | 'track',
  workspaceId: string
): SectionIndexItem[] {
  const items: SectionIndexItem[] = [];
  
  if (!existsSync(dirPath)) {
    return items;
  }
  
  const entries = readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    let entryFileName: string;
    if (entryType === 'pack') {
      entryFileName = 'pack.json';
    } else if (entryType === 'exam') {
      entryFileName = 'exam.json';
    } else if (entryType === 'track') {
      entryFileName = 'track.json';
    } else {
      entryFileName = 'drill.json';
    }
    
    const entryPath = join(dirPath, entry.name, entryFileName);
    
    if (existsSync(entryPath)) {
      let item: SectionIndexItem | null;
      if (entryType === 'track') {
        item = readTrackDocument(entryPath, workspaceId);
      } else {
        item = readEntryDocument(entryPath, workspaceId, entryType as 'pack' | 'drill' | 'exam');
      }
      if (item) {
        items.push(item);
      }
    }
  }
  
  return items;
}

/**
 * Read existing index to get pageSize (if present)
 */
function getPageSizeFromExistingIndex(indexPath: string): number | null {
  if (!existsSync(indexPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(indexPath, 'utf-8');
    const index: SectionIndex = JSON.parse(content);
    return index.pageSize || null;
  } catch {
    return null;
  }
}

/**
 * Generate paginated index files
 */
function generateIndex(
  workspaceId: string,
  sectionId: string,
  config: { kind: string; folders: string[] },
  defaultPageSize: number = 20
): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  const sectionDir = join(workspaceDir, sectionId);
  
  // Check if section directory exists
  if (!existsSync(sectionDir)) {
    console.log(`⏭️  Skipping ${workspaceId}/${sectionId}: section directory not found`);
    return;
  }
  
  // Get pageSize from existing index if present
  const existingIndexPath = join(sectionDir, 'index.json');
  const pageSize = getPageSizeFromExistingIndex(existingIndexPath) || defaultPageSize;
  
  // Collect all items from configured folders
  const allItems: SectionIndexItem[] = [];
  
  for (const folder of config.folders) {
    const folderPath = join(workspaceDir, folder);
    let entryType: 'pack' | 'drill' | 'exam' | 'track';
    
    if (folder === 'packs') {
      entryType = 'pack';
    } else if (folder === 'exams') {
      entryType = 'exam';
    } else if (folder === 'tracks') {
      entryType = 'track';
    } else {
      entryType = 'drill';
    }
    
    const items = scanEntryDirectory(folderPath, entryType, workspaceId);
    allItems.push(...items);
  }
  
  if (allItems.length === 0) {
    // Create empty index file (catalog may reference it)
    const emptyIndex: SectionIndex = {
      version: 'v1',
      kind: config.kind,
      total: 0,
      pageSize: pageSize,
      page: 1,
      items: [],
      nextPage: null
    };
    
    writeFileSync(existingIndexPath, JSON.stringify(emptyIndex, null, 2), 'utf-8');
    console.log(`📝 Created empty index: ${workspaceId}/${sectionId} (no entries found)`);
    
    // Remove any paginated index files (shouldn't exist for empty sections)
    let pageNum = 2;
    while (true) {
      const pagePath = join(sectionDir, `index.page${pageNum}.json`);
      if (existsSync(pagePath)) {
        rmSync(pagePath, { force: true });
        pageNum++;
      } else {
        break;
      }
    }
    return;
  }
  
  // Sort deterministically
  const sortedItems = sortItems(allItems);
  
  // Paginate
  const total = sortedItems.length;
  const pages: SectionIndexItem[][] = [];
  
  for (let i = 0; i < sortedItems.length; i += pageSize) {
    pages.push(sortedItems.slice(i, i + pageSize));
  }
  
  // Remove old pagination files (index.page2.json, index.page3.json, etc.)
  if (existsSync(sectionDir)) {
    const files = readdirSync(sectionDir);
    for (const file of files) {
      if (file.match(/^index\.page\d+\.json$/)) {
        const filePath = join(sectionDir, file);
        rmSync(filePath);
      }
    }
    // Remove old pages directory if it exists
    const pagesDir = join(sectionDir, 'pages');
    if (existsSync(pagesDir)) {
      const pageFiles = readdirSync(pagesDir);
      for (const file of pageFiles) {
        if (file.match(/^\d+\.json$/)) {
          rmSync(join(pagesDir, file));
        }
      }
    }
  }
  
  // Create pages directory if needed (for page 2+)
  const pagesDir = join(sectionDir, 'pages');
  if (pages.length > 1 && !existsSync(pagesDir)) {
    mkdirSync(pagesDir, { recursive: true });
  }
  
  // Write paginated index files
  for (let pageNum = 0; pageNum < pages.length; pageNum++) {
    const pageItems = pages[pageNum];
    const isLastPage = pageNum === pages.length - 1;
    const pageNumber = pageNum + 1; // 1-based
    
    const index: SectionIndex = {
      version: 'v1',
      kind: config.kind,
      total,
      pageSize,
      page: pageNumber,
      items: pageItems,
      nextPage: isLastPage ? null : `/v1/workspaces/${workspaceId}/${sectionId}/pages/${pageNumber + 1}.json`
    };
    
    let filePath: string;
    if (pageNum === 0) {
      // Page 1: index.json
      filePath = join(sectionDir, 'index.json');
    } else {
      // Page 2+: pages/{n}.json
      filePath = join(pagesDir, `${pageNumber}.json`);
    }
    
    const jsonContent = JSON.stringify(index, null, 2);
    writeFileSync(filePath, jsonContent + '\n', 'utf-8');
    
    const relativePath = pageNum === 0 
      ? `${workspaceId}/${sectionId}/index.json`
      : `${workspaceId}/${sectionId}/pages/${pageNumber}.json`;
    console.log(`✅ Generated ${relativePath} (${pageItems.length} items, page ${pageNumber})`);
  }
  
  console.log(`   Total: ${total} items across ${pages.length} page(s)`);
}

/**
 * Icon mapping for scenarios
 */
function getScenarioIcon(scenarioId: string): string {
  const iconMap: Record<string, string> = {
    work: 'briefcase',
    travel: 'airplane',
    social: 'users',
    government_office: 'building',
    doctor: 'medical',
    housing: 'home',
    restaurant: 'utensils',
    shopping: 'shopping-cart'
  };
  return iconMap[scenarioId] || 'sparkle';
}

/**
 * Generate subtitle from scenario template
 */
function getScenarioSubtitle(scenarioId: string, workspaceId: string): string {
  const templatesDir = join(__dirname, '..', 'content', 'templates', 'v1', 'scenarios');
  const templatePath = join(templatesDir, `${scenarioId}.json`);
  
  if (existsSync(templatePath)) {
    try {
      const content = readFileSync(templatePath, 'utf-8');
      const template = JSON.parse(content);
      
      // Extract subtopics from stepBlueprint titles (up to 3)
      if (template.stepBlueprint && Array.isArray(template.stepBlueprint)) {
        const subtopics = template.stepBlueprint
          .slice(0, 3)
          .map((step: any) => step.title)
          .filter((title: string) => title && typeof title === 'string');
        
        if (subtopics.length > 0) {
          return subtopics.join(' · ');
        }
      }
    } catch (error) {
      // Fall through to default
    }
  }
  
  return 'Common situations';
}

/**
 * Generate scenario-specific paginated index
 */
function generateScenarioIndex(
  workspaceId: string,
  scenarioId: string,
  items: SectionIndexItem[],
  defaultPageSize: number = 12
): number {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  const scenarioDir = join(workspaceDir, 'context', scenarioId);
  
  // Create scenario directory if it doesn't exist
  if (!existsSync(scenarioDir)) {
    mkdirSync(scenarioDir, { recursive: true });
  }
  
  // Get pageSize from existing index if present
  const existingIndexPath = join(scenarioDir, 'index.json');
  const pageSize = getPageSizeFromExistingIndex(existingIndexPath) || defaultPageSize;
  
  if (items.length === 0) {
    // Create empty index
    const emptyIndex: SectionIndex = {
      version: 'v1',
      kind: 'context',
      total: 0,
      pageSize: pageSize,
      page: 1,
      items: [],
      nextPage: null
    };
    
    writeFileSync(existingIndexPath, JSON.stringify(emptyIndex, null, 2), 'utf-8');
    console.log(`   📝 Created empty scenario index: context/${scenarioId} (no items)`);
    
    // Remove old pagination files
    let pageNum = 2;
    while (true) {
      const pagePath = join(scenarioDir, `index.page${pageNum}.json`);
      if (existsSync(pagePath)) {
        rmSync(pagePath, { force: true });
        pageNum++;
      } else {
        break;
      }
    }
    return 0;
  }
  
  // Filter out mechanics packs (only include context packs)
  const contextItems = filterContextItems(items);
  
  if (contextItems.length === 0) {
    // Create empty index
    const emptyIndex: SectionIndex = {
      version: 'v1',
      kind: 'context',
      total: 0,
      pageSize: pageSize,
      page: 1,
      items: [],
      nextPage: null,
      scope: {
        scopeKind: 'scenario',
        scopeId: scenarioId,
        scopeTitle: scenarioId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      }
    };
    
    writeFileSync(existingIndexPath, JSON.stringify(emptyIndex, null, 2), 'utf-8');
    console.log(`   📝 Created empty scenario index: context/${scenarioId} (no context items, filtered mechanics)`);
    
    // Remove old pagination files
    let pageNum = 2;
    while (true) {
      const pagePath = join(scenarioDir, `index.page${pageNum}.json`);
      if (existsSync(pagePath)) {
        rmSync(pagePath, { force: true });
        pageNum++;
      } else {
        break;
      }
    }
    return 0;
  }
  
  // Sort deterministically
  const sortedItems = sortItems(contextItems);
  
  // Paginate
  const total = sortedItems.length;
  const pages: SectionIndexItem[][] = [];
  
  for (let i = 0; i < sortedItems.length; i += pageSize) {
    pages.push(sortedItems.slice(i, i + pageSize));
  }
  
  // Remove old pagination files
  if (existsSync(scenarioDir)) {
    const files = readdirSync(scenarioDir);
    for (const file of files) {
      if (file.match(/^index\.page\d+\.json$/)) {
        const filePath = join(scenarioDir, file);
        rmSync(filePath);
      }
    }
    // Remove old pages directory if it exists
    const pagesDir = join(scenarioDir, 'pages');
    if (existsSync(pagesDir)) {
      const pageFiles = readdirSync(pagesDir);
      for (const file of pageFiles) {
        if (file.match(/^\d+\.json$/)) {
          rmSync(join(pagesDir, file));
        }
      }
    }
  }
  
  // Write paginated index files
  for (let pageNum = 0; pageNum < pages.length; pageNum++) {
    const pageItems = pages[pageNum];
    const isLastPage = pageNum === pages.length - 1;
    const pageNumber = pageNum + 1; // 1-based
    
    // Create groups for this page (minimum 3 items per group)
    const groups = createGroups(pageItems, 3);
    
    // Select recommended item (deterministic, max 1)
    const recommended = selectRecommended(pageItems);
    
    // Mark recommended item
    if (recommended) {
      const recommendedItem = pageItems.find(item => item.id === recommended.itemId);
      if (recommendedItem) {
        recommendedItem.isRecommended = true;
      }
    }
    
    // Create scope
    const scope: Scope = {
      scopeKind: 'scenario',
      scopeId: scenarioId,
      scopeTitle: scenarioId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    };
    
    const index: SectionIndex = {
      version: 'v1',
      kind: 'context',
      total,
      pageSize,
      page: pageNumber,
      items: pageItems,
      nextPage: isLastPage ? null : `/v1/workspaces/${workspaceId}/context/${scenarioId}/index.page${pageNumber + 1}.json`,
      scope,
      recommended: recommended,
      groups: groups.length > 0 ? groups : undefined
    };
    
    let filePath: string;
    if (pageNum === 0) {
      // Page 1: index.json
      filePath = join(scenarioDir, 'index.json');
    } else {
      // Page 2+: index.page{n}.json (matching existing structure)
      filePath = join(scenarioDir, `index.page${pageNumber}.json`);
    }
    
    const jsonContent = JSON.stringify(index, null, 2);
    writeFileSync(filePath, jsonContent + '\n', 'utf-8');
  }
  
  return total;
}

/**
 * Generate scenario index (context/scenarios.json)
 */
function generateScenarioIndexFile(workspaceId: string, allContextItems: SectionIndexItem[]): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  const contextDir = join(workspaceDir, 'context');
  
  // Group items by scenario
  const scenarioGroups = new Map<string, SectionIndexItem[]>();
  
  for (const item of allContextItems) {
    if (item.scenario) {
      if (!scenarioGroups.has(item.scenario)) {
        scenarioGroups.set(item.scenario, []);
      }
      scenarioGroups.get(item.scenario)!.push(item);
    }
  }
  
  // Generate scenario-specific indexes and collect metadata
  const scenarioItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    icon: string;
    itemCount: number;
    itemsUrl: string;
  }> = [];
  
  // Sort scenarios deterministically (alphabetically)
  const sortedScenarioIds = Array.from(scenarioGroups.keys()).sort();
  
  for (const scenarioId of sortedScenarioIds) {
    const items = scenarioGroups.get(scenarioId)!;
    
    // Generate scenario-specific index
    const itemCount = generateScenarioIndex(workspaceId, scenarioId, items, 12);
    
    // Generate title (capitalize first letter, replace underscores with spaces)
    const title = scenarioId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Get subtitle and icon
    const subtitle = getScenarioSubtitle(scenarioId, workspaceId);
    const icon = getScenarioIcon(scenarioId);
    
    scenarioItems.push({
      id: scenarioId,
      title,
      subtitle,
      icon,
      itemCount,
      itemsUrl: `/v1/workspaces/${workspaceId}/context/${scenarioId}/index.json`
    });
  }
  
  // Only create scenarios.json if we have scenarios
  if (scenarioItems.length === 0) {
    return;
  }
  
  // Create scenario index document
  const scenarioIndex = {
    version: 1,
    kind: 'scenario_index',
    scenarios: scenarioItems
  };
  
  const scenarioIndexPath = join(contextDir, 'scenarios.json');
  writeFileSync(scenarioIndexPath, JSON.stringify(scenarioIndex, null, 2) + '\n', 'utf-8');
  
  console.log(`✅ Generated ${workspaceId}/context/scenarios.json (${scenarioItems.length} scenario(s))`);
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  // Parse workspace argument
  let targetWorkspace: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      targetWorkspace = args[i + 1];
      break;
    }
  }
  
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  
  if (!existsSync(workspacesDir)) {
    console.error('❌ Error: content/v1/workspaces directory not found');
    process.exit(1);
  }
  
  // Get list of workspaces
  const workspaces = targetWorkspace 
    ? [targetWorkspace]
    : readdirSync(workspacesDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
  
  if (workspaces.length === 0) {
    console.error('❌ Error: No workspaces found');
    process.exit(1);
  }
  
  console.log(`📦 Generating indexes for ${workspaces.length} workspace(s)...\n`);
  
  // Generate indexes for each workspace and section
  for (const workspaceId of workspaces) {
    const workspacePath = join(workspacesDir, workspaceId);
    
    if (!existsSync(workspacePath)) {
      console.warn(`⚠️  Workspace ${workspaceId} not found, skipping`);
      continue;
    }
    
    console.log(`\n📁 Workspace: ${workspaceId}`);
    
    for (const [sectionId, config] of Object.entries(SECTION_CONFIG)) {
      generateIndex(workspaceId, sectionId, config);
      
      // Generate scenario index for context section
      if (sectionId === 'context') {
        // Collect all context items to generate scenario index
        const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
        const allContextItems: SectionIndexItem[] = [];
        
        for (const folder of config.folders) {
          const folderPath = join(workspaceDir, folder);
          let entryType: 'pack' | 'drill' | 'exam' | 'track';
          
          if (folder === 'packs') {
            entryType = 'pack';
          } else if (folder === 'exams') {
            entryType = 'exam';
          } else if (folder === 'tracks') {
            entryType = 'track';
          } else {
            entryType = 'drill';
          }
          
          const items = scanEntryDirectory(folderPath, entryType, workspaceId);
          allContextItems.push(...items);
        }
        
        // Generate scenario index
        generateScenarioIndexFile(workspaceId, allContextItems);
      }
    }
  }
  
  console.log('\n✅ Index generation complete!');
}

// Run if executed directly
main();

export { generateIndex, sortItems, compareLevels };

