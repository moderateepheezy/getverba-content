/**
 * Pack planning: determine which packs to generate from extracted signals
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import type { PlannedPack, ExtractedSignal } from './ingestTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', 'content', 'templates', 'v1', 'scenarios');

interface ScenarioTemplate {
  schemaVersion: number;
  scenarioId: string;
  defaultRegister: string;
  primaryStructure: string;
  variationSlots: string[];
  slotBanks: Record<string, string[]>;
  requiredTokens: string[];
  stepBlueprint: Array<{
    id: string;
    title: string;
    promptCount: number;
    rules?: {
      requiredSlots?: string[];
    };
  }>;
  constraints?: {
    verbPosition?: string;
    requiredTokensPerPrompt?: number;
  };
}

/**
 * Load scenario template
 */
function loadTemplate(scenario: string): ScenarioTemplate {
  const templatePath = join(TEMPLATES_DIR, `${scenario}.json`);
  if (!existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  const content = readFileSync(templatePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Compute Jaccard similarity between two token sets
 */
function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Generate stable pack ID
 */
function generatePackId(
  scenario: string,
  topicSlug: string,
  level: string,
  topTokens: string[]
): string {
  const hashInput = `${scenario}_${topicSlug}_${level}_${topTokens.slice(0, 5).join('_')}`;
  const hash = createHash('sha1');
  hash.update(hashInput);
  const shortHash = hash.digest('hex').slice(0, 8);
  return `${scenario}_${topicSlug}_${level}_${shortHash}`;
}

/**
 * Create topic slug from intent category or top tokens
 */
function createTopicSlug(intentCategory: string, topTokens: string[]): string {
  // Use intent category if available
  if (intentCategory && intentCategory !== 'inform') {
    return intentCategory.replace(/_/g, '-').toLowerCase();
  }
  
  // Otherwise use top 2-3 tokens
  const slugTokens = topTokens.slice(0, 3).map(t => t.toLowerCase());
  return slugTokens.join('-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Plan packs from extracted signals
 */
export function planPacks(
  signals: ExtractedSignal[],
  scenario: string,
  level: string,
  minPacks: number = 6,
  maxPacks: number = 12,
  overlapThreshold: number = 0.45
): PlannedPack[] {
  const template = loadTemplate(scenario);
  const plannedPacks: PlannedPack[] = [];
  
  // Group signals by intent category
  const intentGroups = new Map<string, ExtractedSignal[]>();
  for (const signal of signals) {
    const primaryIntent = signal.detectedIntents[0] || 'inform';
    if (!intentGroups.has(primaryIntent)) {
      intentGroups.set(primaryIntent, []);
    }
    intentGroups.get(primaryIntent)!.push(signal);
  }
  
  // Create packs from intent groups
  for (const [intentCategory, groupSignals] of intentGroups.entries()) {
    if (groupSignals.length === 0) continue;
    
    // Aggregate top tokens from all signals in this group
    const allTokens = new Map<string, number>();
    for (const signal of groupSignals) {
      for (const token of signal.topTokens) {
        allTokens.set(token, (allTokens.get(token) || 0) + 1);
      }
    }
    
    const aggregatedTokens = Array.from(allTokens.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([token]) => token);
    
    // Create topic slug
    const topicSlug = createTopicSlug(intentCategory, aggregatedTokens);
    
    // Generate pack ID
    const packId = generatePackId(scenario, topicSlug, level, aggregatedTokens);
    
    // Create pack plan
    const plannedPack: PlannedPack = {
      packId,
      title: generateTitle(intentCategory, scenario, level),
      primaryStructure: template.primaryStructure,
      variationSlots: template.variationSlots,
      register: template.defaultRegister,
      tags: [scenario, intentCategory, ...aggregatedTokens.slice(0, 3)],
      targetChunks: groupSignals.map(s => s.chunkId),
      topTokens: aggregatedTokens,
      intentCategory
    };
    
    plannedPacks.push(plannedPack);
  }
  
  // If we have too few packs, split larger groups
  if (plannedPacks.length < minPacks && signals.length > 0) {
    const additionalPacks = createAdditionalPacks(
      signals,
      plannedPacks,
      scenario,
      level,
      template,
      minPacks - plannedPacks.length
    );
    plannedPacks.push(...additionalPacks);
  }
  
  // If we have too many packs, merge similar ones
  if (plannedPacks.length > maxPacks) {
    return mergeSimilarPacks(plannedPacks, maxPacks, overlapThreshold);
  }
  
  // Filter out packs with too much overlap
  return filterOverlappingPacks(plannedPacks, overlapThreshold);
}

/**
 * Generate pack title
 */
function generateTitle(intentCategory: string, scenario: string, level: string): string {
  const intentLabels: Record<string, string> = {
    'request_appointment': 'Termin vereinbaren',
    'submit_documents': 'Unterlagen einreichen',
    'register': 'Anmeldung',
    'request_information': 'Auskunft einholen',
    'schedule_meeting': 'Besprechung planen',
    'order': 'Bestellen',
    'make_reservation': 'Reservierung',
    'ask_price': 'Preis erfragen',
    'request': 'Anfrage',
    'ask': 'Frage',
    'inform': 'Information',
    'schedule': 'Terminplanung'
  };
  
  const label = intentLabels[intentCategory] || intentCategory.replace(/_/g, ' ');
  const scenarioLabel = scenario.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  return `${scenarioLabel} - ${label} (${level})`;
}

/**
 * Create additional packs by splitting signals
 */
function createAdditionalPacks(
  signals: ExtractedSignal[],
  existingPacks: PlannedPack[],
  scenario: string,
  level: string,
  template: ScenarioTemplate,
  count: number
): PlannedPack[] {
  const newPacks: PlannedPack[] = [];
  const usedChunks = new Set(existingPacks.flatMap(p => p.targetChunks));
  const availableSignals = signals.filter(s => !usedChunks.has(s.chunkId));
  
  // Group by top token similarity
  const tokenGroups: ExtractedSignal[][] = [];
  for (const signal of availableSignals) {
    let added = false;
    for (const group of tokenGroups) {
      const similarity = jaccardSimilarity(
        signal.topTokens.slice(0, 5),
        group[0].topTokens.slice(0, 5)
      );
      if (similarity > 0.3) {
        group.push(signal);
        added = true;
        break;
      }
    }
    if (!added) {
      tokenGroups.push([signal]);
    }
  }
  
  // Create packs from token groups
  for (let i = 0; i < Math.min(count, tokenGroups.length); i++) {
    const group = tokenGroups[i];
    if (group.length === 0) continue;
    
    const aggregatedTokens = aggregateTokens(group);
    const intentCategory = group[0].detectedIntents[0] || 'inform';
    const topicSlug = createTopicSlug(intentCategory, aggregatedTokens);
    const packId = generatePackId(scenario, topicSlug, level, aggregatedTokens);
    
    newPacks.push({
      packId,
      title: generateTitle(intentCategory, scenario, level),
      primaryStructure: template.primaryStructure,
      variationSlots: template.variationSlots,
      register: template.defaultRegister,
      tags: [scenario, intentCategory, ...aggregatedTokens.slice(0, 3)],
      targetChunks: group.map(s => s.chunkId),
      topTokens: aggregatedTokens,
      intentCategory
    });
  }
  
  return newPacks;
}

/**
 * Aggregate tokens from multiple signals
 */
function aggregateTokens(signals: ExtractedSignal[]): string[] {
  const tokenCounts = new Map<string, number>();
  for (const signal of signals) {
    for (const token of signal.topTokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    }
  }
  return Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([token]) => token);
}

/**
 * Merge similar packs to reduce count
 */
function mergeSimilarPacks(
  packs: PlannedPack[],
  maxPacks: number,
  overlapThreshold: number
): PlannedPack[] {
  const merged: PlannedPack[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < packs.length; i++) {
    if (used.has(i)) continue;
    
    const pack = packs[i];
    let mergedPack = { ...pack };
    used.add(i);
    
    // Find similar packs to merge
    for (let j = i + 1; j < packs.length && merged.length < maxPacks; j++) {
      if (used.has(j)) continue;
      
      const otherPack = packs[j];
      const similarity = jaccardSimilarity(pack.topTokens, otherPack.topTokens);
      
      if (similarity > overlapThreshold) {
        // Merge packs
        mergedPack = {
          ...mergedPack,
          targetChunks: [...mergedPack.targetChunks, ...otherPack.targetChunks],
          topTokens: aggregateTokens([
            { topTokens: mergedPack.topTokens } as ExtractedSignal,
            { topTokens: otherPack.topTokens } as ExtractedSignal
          ]),
          tags: [...new Set([...mergedPack.tags, ...otherPack.tags])]
        };
        used.add(j);
      }
    }
    
    merged.push(mergedPack);
  }
  
  return merged.slice(0, maxPacks);
}

/**
 * Filter out packs with too much overlap
 */
function filterOverlappingPacks(
  packs: PlannedPack[],
  overlapThreshold: number
): PlannedPack[] {
  const filtered: PlannedPack[] = [];
  
  for (const pack of packs) {
    let hasOverlap = false;
    
    for (const existing of filtered) {
      const similarity = jaccardSimilarity(pack.topTokens, existing.topTokens);
      if (similarity >= overlapThreshold) {
        hasOverlap = true;
        break;
      }
    }
    
    if (!hasOverlap) {
      filtered.push(pack);
    }
  }
  
  return filtered;
}

