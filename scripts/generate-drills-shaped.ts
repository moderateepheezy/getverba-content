#!/usr/bin/env tsx

/**
 * Generate Shaped Drills Index (BE Shaping Spec v4)
 * 
 * Generates `/v1/workspaces/{ws}/drills/index.json` with DrillGroups containing nested Categories and Tiers.
 * 
 * This implements the BE shaping spec from DRILLS_V4_BE_SHAPING.md.
 * 
 * Usage:
 *   tsx scripts/generate-drills-shaped.ts [--workspace <ws>]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const TEMPLATES_DIR = join(__dirname, '..', 'content', 'templates', 'v4', 'mechanics');

/**
 * Workspace language mapping
 * Maps workspace ID to language code
 */
const WORKSPACE_LANGUAGES: Record<string, string> = {
  'de': 'de', // German
  // Add more as workspaces are added
};

/**
 * Category label mapping
 * Maps loopType to human-readable labels in different languages
 */
const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  'pattern_switch': { 'en': 'Pattern', 'de': 'Muster' },
  'slot_substitution': { 'en': 'Slot', 'de': 'Platzhalter' },
  'contrast_pairs': { 'en': 'Pairs', 'de': 'Paare' },
  'micro_transform': { 'en': 'Transform', 'de': 'Umwandlung' },
  'error_trap': { 'en': 'Trap', 'de': 'Falle' },
  'fast_recall': { 'en': 'Recall', 'de': 'Abruf' }
};

/**
 * Mechanic label translations (workspace language)
 * Maps mechanicId to workspace language labels
 */
const MECHANIC_LABELS_DE: Record<string, string> = {
  'case_endings_akkusativ': 'Akkusativ-Endungen',
  'modal_verbs': 'Modalverben',
  'negation': 'Verneinung',
  'verb_present_tense': 'Präsens-Verben',
  'question_formation': 'Fragebildung',
  'word_order_main_clause': 'Wortstellung: Hauptsatz',
  'time_expressions_inversion': 'Zeitausdrücke & Umstellung',
  'politeness_templates': 'Höflichkeitsformeln'
};

interface DrillEntry {
  id: string;
  kind: string;
  drillVersion?: string;
  level: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  mechanicId: string;
  mechanicLabel: string;
  loopType: string;
  difficultyTier: number;
  entryUrl?: string;
  // Full drill data for tier title/description extraction
  drillData?: any;
}

interface DrillTier {
  id: string;
  tier: number;
  level: string;
  title: string;
  title_i18n?: Record<string, string>;
  description: string;
  description_i18n?: Record<string, string>;
  durationMinutes: number;
  status: string;
  entryUrl: string;
}

interface DrillCategory {
  id: string;
  category: string;
  loopType: string;
  tiers: DrillTier[];
}

interface DrillGroup {
  id: string;
  kind: string;
  mechanic: string;
  title: string;
  subtitle?: string;
  description: string;
  description_i18n?: Record<string, string>;
  estimatedDuration: string;
  order: number;
  categories: DrillCategory[];
}

interface ShapedDrillsResponse {
  drillGroups: DrillGroup[];
}

/**
 * Get workspace language
 */
function getWorkspaceLanguage(workspaceId: string): string {
  return WORKSPACE_LANGUAGES[workspaceId] || 'en';
}

/**
 * Get category label in workspace language
 */
function getCategoryLabel(loopType: string, workspaceLang: string): string {
  return CATEGORY_LABELS[loopType]?.[workspaceLang] || CATEGORY_LABELS[loopType]?.['en'] || loopType;
}

/**
 * Get mechanic label in workspace language
 */
function getMechanicLabel(mechanicId: string, workspaceLang: string, fallback: string): string {
  if (workspaceLang === 'de') {
    return MECHANIC_LABELS_DE[mechanicId] || fallback;
  }
  return fallback;
}

/**
 * Generate unique tier title (not repeating drill group title)
 */
function generateTierTitle(
  tier: number,
  level: string,
  loopType: string,
  workspaceLang: string,
  drillData: any
): { title: string; title_i18n?: Record<string, string> } {
  const tierLabels: Record<string, Record<number, Record<string, string>>> = {
    'de': {
      1: { 'pattern_switch': 'Stufe 1: Grundformen', 'contrast_pairs': 'Stufe 1: Kontrastpaare', 'slot_substitution': 'Stufe 1: Grundübungen', 'micro_transform': 'Stufe 1: Einfache Umwandlung', 'error_trap': 'Stufe 1: Häufige Fehler', 'fast_recall': 'Stufe 1: Schnellabruf' },
      2: { 'pattern_switch': 'Stufe 2: Erweiterte Formen', 'contrast_pairs': 'Stufe 2: Erweiterte Paare', 'slot_substitution': 'Stufe 2: Erweiterte Übungen', 'micro_transform': 'Stufe 2: Komplexe Umwandlung', 'error_trap': 'Stufe 2: Erweiterte Fallen', 'fast_recall': 'Stufe 2: Erweiterter Abruf' },
      3: { 'pattern_switch': 'Stufe 3: Komplexe Formen', 'contrast_pairs': 'Stufe 3: Komplexe Paare', 'slot_substitution': 'Stufe 3: Komplexe Übungen', 'micro_transform': 'Stufe 3: Fortgeschrittene Umwandlung', 'error_trap': 'Stufe 3: Fortgeschrittene Fallen', 'fast_recall': 'Stufe 3: Fortgeschrittener Abruf' },
      4: { 'pattern_switch': 'Stufe 4: Fortgeschrittene Formen', 'contrast_pairs': 'Stufe 4: Fortgeschrittene Paare', 'slot_substitution': 'Stufe 4: Fortgeschrittene Übungen', 'micro_transform': 'Stufe 4: Fortgeschrittene Umwandlung', 'error_trap': 'Stufe 4: Fortgeschrittene Fallen', 'fast_recall': 'Stufe 4: Fortgeschrittener Abruf' },
      5: { 'pattern_switch': 'Stufe 5: Erweiterte Fortgeschrittene', 'contrast_pairs': 'Stufe 5: Erweiterte Fortgeschrittene Paare', 'slot_substitution': 'Stufe 5: Erweiterte Fortgeschrittene Übungen', 'micro_transform': 'Stufe 5: Erweiterte Fortgeschrittene Umwandlung', 'error_trap': 'Stufe 5: Erweiterte Fortgeschrittene Fallen', 'fast_recall': 'Stufe 5: Erweiterte Fortgeschrittene Abruf' },
      6: { 'pattern_switch': 'Stufe 6: Meisterformen', 'contrast_pairs': 'Stufe 6: Meisterpaare', 'slot_substitution': 'Stufe 6: Meisterübungen', 'micro_transform': 'Stufe 6: Meisterumwandlung', 'error_trap': 'Stufe 6: Meisterfallen', 'fast_recall': 'Stufe 6: Meisterabruf' },
      7: { 'pattern_switch': 'Stufe 7: Expertenformen', 'contrast_pairs': 'Stufe 7: Expertenpaare', 'slot_substitution': 'Stufe 7: Expertenübungen', 'micro_transform': 'Stufe 7: Expertenumwandlung', 'error_trap': 'Stufe 7: Expertenfallen', 'fast_recall': 'Stufe 7: Expertenabruf' }
    },
    'en': {
      1: { 'pattern_switch': 'Tier 1: Basic Forms', 'contrast_pairs': 'Tier 1: Contrast Pairs', 'slot_substitution': 'Tier 1: Basic Practice', 'micro_transform': 'Tier 1: Simple Transform', 'error_trap': 'Tier 1: Common Errors', 'fast_recall': 'Tier 1: Quick Recall' },
      2: { 'pattern_switch': 'Tier 2: Extended Forms', 'contrast_pairs': 'Tier 2: Extended Pairs', 'slot_substitution': 'Tier 2: Extended Practice', 'micro_transform': 'Tier 2: Complex Transform', 'error_trap': 'Tier 2: Extended Traps', 'fast_recall': 'Tier 2: Extended Recall' },
      3: { 'pattern_switch': 'Tier 3: Complex Forms', 'contrast_pairs': 'Tier 3: Complex Pairs', 'slot_substitution': 'Tier 3: Complex Practice', 'micro_transform': 'Tier 3: Advanced Transform', 'error_trap': 'Tier 3: Advanced Traps', 'fast_recall': 'Tier 3: Advanced Recall' },
      4: { 'pattern_switch': 'Tier 4: Advanced Forms', 'contrast_pairs': 'Tier 4: Advanced Pairs', 'slot_substitution': 'Tier 4: Advanced Practice', 'micro_transform': 'Tier 4: Advanced Transform', 'error_trap': 'Tier 4: Advanced Traps', 'fast_recall': 'Tier 4: Advanced Recall' },
      5: { 'pattern_switch': 'Tier 5: Extended Advanced', 'contrast_pairs': 'Tier 5: Extended Advanced Pairs', 'slot_substitution': 'Tier 5: Extended Advanced Practice', 'micro_transform': 'Tier 5: Extended Advanced Transform', 'error_trap': 'Tier 5: Extended Advanced Traps', 'fast_recall': 'Tier 5: Extended Advanced Recall' },
      6: { 'pattern_switch': 'Tier 6: Master Forms', 'contrast_pairs': 'Tier 6: Master Pairs', 'slot_substitution': 'Tier 6: Master Practice', 'micro_transform': 'Tier 6: Master Transform', 'error_trap': 'Tier 6: Master Traps', 'fast_recall': 'Tier 6: Master Recall' },
      7: { 'pattern_switch': 'Tier 7: Expert Forms', 'contrast_pairs': 'Tier 7: Expert Pairs', 'slot_substitution': 'Tier 7: Expert Practice', 'micro_transform': 'Tier 7: Expert Transform', 'error_trap': 'Tier 7: Expert Traps', 'fast_recall': 'Tier 7: Expert Recall' }
    }
  };

  const title = tierLabels[workspaceLang]?.[tier]?.[loopType] || 
                tierLabels['en']?.[tier]?.[loopType] || 
                `${workspaceLang === 'de' ? 'Stufe' : 'Tier'} ${tier}`;

  // Generate title_i18n with all languages
  const title_i18n: Record<string, string> = {
    'en': tierLabels['en']?.[tier]?.[loopType] || `Tier ${tier}`,
    [workspaceLang]: title
  };
  
  // Add German if workspace is not German
  if (workspaceLang !== 'de' && tierLabels['de']?.[tier]?.[loopType]) {
    title_i18n['de'] = tierLabels['de']?.[tier]?.[loopType];
  }

  return { title, title_i18n };
}

/**
 * Generate tier description
 */
function generateTierDescription(
  tier: number,
  level: string,
  loopType: string,
  workspaceLang: string,
  mechanicLabel: string,
  drillData: any
): { description: string; description_i18n?: Record<string, string> } {
  // Try to extract from drill file subtitle or generate
  const baseDescription = drillData?.subtitle || '';
  
  // Generate descriptions based on tier and loopType
  const descriptions: Record<string, Record<number, Record<string, string>>> = {
    'de': {
      1: {
        'pattern_switch': 'Übe die Grundformen mit einfachen Sätzen',
        'contrast_pairs': 'Übe durch Kontrastpaare',
        'slot_substitution': 'Übe durch Platzhalter-Ersetzung',
        'micro_transform': 'Übe einfache Umwandlungen',
        'error_trap': 'Übe häufige Fehler zu vermeiden',
        'fast_recall': 'Übe schnellen Abruf'
      },
      2: {
        'pattern_switch': 'Übe erweiterte Formen mit komplexeren Sätzen',
        'contrast_pairs': 'Übe erweiterte Kontrastpaare',
        'slot_substitution': 'Übe erweiterte Platzhalter-Ersetzung',
        'micro_transform': 'Übe komplexe Umwandlungen',
        'error_trap': 'Übe erweiterte Fehlerfallen',
        'fast_recall': 'Übe erweiterten Abruf'
      },
      3: {
        'pattern_switch': 'Übe komplexe Formen mit fortgeschrittenen Sätzen',
        'contrast_pairs': 'Übe komplexe Kontrastpaare',
        'slot_substitution': 'Übe komplexe Platzhalter-Ersetzung',
        'micro_transform': 'Übe fortgeschrittene Umwandlungen',
        'error_trap': 'Übe fortgeschrittene Fehlerfallen',
        'fast_recall': 'Übe fortgeschrittenen Abruf'
      },
      4: {
        'pattern_switch': 'Übe fortgeschrittene Formen mit anspruchsvollen Sätzen',
        'contrast_pairs': 'Übe fortgeschrittene Kontrastpaare',
        'slot_substitution': 'Übe fortgeschrittene Platzhalter-Ersetzung',
        'micro_transform': 'Übe fortgeschrittene Umwandlungen',
        'error_trap': 'Übe fortgeschrittene Fehlerfallen',
        'fast_recall': 'Übe fortgeschrittenen Abruf'
      },
      5: {
        'pattern_switch': 'Übe erweiterte fortgeschrittene Formen',
        'contrast_pairs': 'Übe erweiterte fortgeschrittene Kontrastpaare',
        'slot_substitution': 'Übe erweiterte fortgeschrittene Platzhalter-Ersetzung',
        'micro_transform': 'Übe erweiterte fortgeschrittene Umwandlungen',
        'error_trap': 'Übe erweiterte fortgeschrittene Fehlerfallen',
        'fast_recall': 'Übe erweiterte fortgeschrittene Abruf'
      },
      6: {
        'pattern_switch': 'Übe Meisterformen mit sehr anspruchsvollen Sätzen',
        'contrast_pairs': 'Übe Meisterkontrastpaare',
        'slot_substitution': 'Übe Meisterplatzhalter-Ersetzung',
        'micro_transform': 'Übe Meisterumwandlungen',
        'error_trap': 'Übe Meisterfehlerfallen',
        'fast_recall': 'Übe Meisterabruf'
      },
      7: {
        'pattern_switch': 'Übe Expertenformen mit höchst anspruchsvollen Sätzen',
        'contrast_pairs': 'Übe Expertenkontrastpaare',
        'slot_substitution': 'Übe Expertenplatzhalter-Ersetzung',
        'micro_transform': 'Übe Expertenumwandlungen',
        'error_trap': 'Übe Expertenfehlerfallen',
        'fast_recall': 'Übe Expertenabruf'
      }
    },
    'en': {
      1: {
        'pattern_switch': 'Practice basic forms with simple sentences',
        'contrast_pairs': 'Practice through contrast pairs',
        'slot_substitution': 'Practice through slot substitution',
        'micro_transform': 'Practice simple transformations',
        'error_trap': 'Practice avoiding common errors',
        'fast_recall': 'Practice quick recall'
      },
      2: {
        'pattern_switch': 'Practice extended forms with more complex sentences',
        'contrast_pairs': 'Practice extended contrast pairs',
        'slot_substitution': 'Practice extended slot substitution',
        'micro_transform': 'Practice complex transformations',
        'error_trap': 'Practice extended error traps',
        'fast_recall': 'Practice extended recall'
      },
      3: {
        'pattern_switch': 'Practice complex forms with advanced sentences',
        'contrast_pairs': 'Practice complex contrast pairs',
        'slot_substitution': 'Practice complex slot substitution',
        'micro_transform': 'Practice advanced transformations',
        'error_trap': 'Practice advanced error traps',
        'fast_recall': 'Practice advanced recall'
      },
      4: {
        'pattern_switch': 'Practice advanced forms with challenging sentences',
        'contrast_pairs': 'Practice advanced contrast pairs',
        'slot_substitution': 'Practice advanced slot substitution',
        'micro_transform': 'Practice advanced transformations',
        'error_trap': 'Practice advanced error traps',
        'fast_recall': 'Practice advanced recall'
      },
      5: {
        'pattern_switch': 'Practice extended advanced forms',
        'contrast_pairs': 'Practice extended advanced contrast pairs',
        'slot_substitution': 'Practice extended advanced slot substitution',
        'micro_transform': 'Practice extended advanced transformations',
        'error_trap': 'Practice extended advanced error traps',
        'fast_recall': 'Practice extended advanced recall'
      },
      6: {
        'pattern_switch': 'Practice master forms with very challenging sentences',
        'contrast_pairs': 'Practice master contrast pairs',
        'slot_substitution': 'Practice master slot substitution',
        'micro_transform': 'Practice master transformations',
        'error_trap': 'Practice master error traps',
        'fast_recall': 'Practice master recall'
      },
      7: {
        'pattern_switch': 'Practice expert forms with highly challenging sentences',
        'contrast_pairs': 'Practice expert contrast pairs',
        'slot_substitution': 'Practice expert slot substitution',
        'micro_transform': 'Practice expert transformations',
        'error_trap': 'Practice expert error traps',
        'fast_recall': 'Practice expert recall'
      }
    }
  };

  const description = descriptions[workspaceLang]?.[tier]?.[loopType] || 
                      descriptions['en']?.[tier]?.[loopType] || 
                      `Practice ${mechanicLabel.toLowerCase()} at tier ${tier}`;

  // Generate description_i18n with all languages
  const description_i18n: Record<string, string> = {
    'en': descriptions['en']?.[tier]?.[loopType] || `Practice ${mechanicLabel.toLowerCase()} at tier ${tier}`,
    [workspaceLang]: description
  };
  
  // Add German if workspace is not German
  if (workspaceLang !== 'de' && descriptions['de']?.[tier]?.[loopType]) {
    description_i18n['de'] = descriptions['de']?.[tier]?.[loopType];
  }

  return { description, description_i18n };
}

/**
 * Load mechanic template
 */
function loadTemplate(mechanicId: string): any {
  const templatePath = join(TEMPLATES_DIR, `${mechanicId}.json`);
  if (!existsSync(templatePath)) {
    return null;
  }
  return JSON.parse(readFileSync(templatePath, 'utf-8'));
}

/**
 * Read drill entry from file (including full data for tier info)
 */
function readDrillEntry(drillPath: string, workspaceId: string): DrillEntry | null {
  try {
    const drillJson = JSON.parse(readFileSync(drillPath, 'utf-8'));
    
    // Only process v4 drills
    if (drillJson.drillVersion !== 'v4') {
      return null;
    }

    // Build entryUrl
    const drillId = drillJson.id;
    const entryUrl = `/v1/workspaces/${workspaceId}/drills/${drillId}/drill.json`;

    return {
      id: drillId,
      kind: drillJson.kind,
      drillVersion: drillJson.drillVersion,
      level: drillJson.level,
      title: drillJson.title,
      subtitle: drillJson.subtitle || '',
      estimatedMinutes: drillJson.estimatedMinutes,
      mechanicId: drillJson.mechanicId,
      mechanicLabel: drillJson.mechanicLabel,
      loopType: drillJson.loopType,
      difficultyTier: drillJson.difficultyTier,
      entryUrl,
      drillData: drillJson // Store full data for tier title/description extraction
    };
  } catch (error: any) {
    console.warn(`⚠️  Failed to read drill at ${drillPath}: ${error.message}`);
    return null;
  }
}

/**
 * Scan all drills for a workspace
 */
function scanDrills(workspaceId: string): Map<string, DrillEntry[]> {
  const drillsByMechanic = new Map<string, DrillEntry[]>();
  const drillsDir = join(CONTENT_DIR, 'workspaces', workspaceId, 'drills');
  
  if (!existsSync(drillsDir)) {
    return drillsByMechanic;
  }

  const drillDirs = readdirSync(drillsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const drillDir of drillDirs) {
    const drillPath = join(drillsDir, drillDir, 'drill.json');
    if (!existsSync(drillPath)) continue;

    const drill = readDrillEntry(drillPath, workspaceId);
    if (!drill) continue;

    if (!drillsByMechanic.has(drill.mechanicId)) {
      drillsByMechanic.set(drill.mechanicId, []);
    }
    drillsByMechanic.get(drill.mechanicId)!.push(drill);
  }

  return drillsByMechanic;
}

/**
 * Compute estimated duration range for a group
 */
function computeEstimatedDuration(tiers: DrillTier[]): string {
  if (tiers.length === 0) return '3–5 min';
  
  const durations = tiers.map(t => t.durationMinutes);
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  
  if (min === max) {
    return `${min} min`;
  }
  return `${min}–${max} min`;
}

/**
 * Generate shaped drills index
 */
function generateShapedDrills(workspaceId: string): ShapedDrillsResponse {
  const drillsByMechanic = scanDrills(workspaceId);
  const templates = readdirSync(TEMPLATES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));

  const workspaceLang = getWorkspaceLanguage(workspaceId);
  const drillGroups: DrillGroup[] = [];
  let order = 1;

  for (const mechanicId of templates.sort()) {
    const template = loadTemplate(mechanicId);
    if (!template) continue;

    const drills = drillsByMechanic.get(mechanicId) || [];
    if (drills.length === 0) continue; // Skip mechanics with no drills

    // Group drills by loopType → level → tier
    const drillsByLoopType = new Map<string, Map<string, Map<number, DrillEntry>>>();
    
    for (const drill of drills) {
      if (!drillsByLoopType.has(drill.loopType)) {
        drillsByLoopType.set(drill.loopType, new Map());
      }
      const byLevel = drillsByLoopType.get(drill.loopType)!;
      
      if (!byLevel.has(drill.level)) {
        byLevel.set(drill.level, new Map());
      }
      const byTier = byLevel.get(drill.level)!;
      
      // Store drill for this tier (if multiple, keep first one)
      if (!byTier.has(drill.difficultyTier)) {
        byTier.set(drill.difficultyTier, drill);
      }
    }

    // Build categories
    const categories: DrillCategory[] = [];
    
    for (const [loopType, byLevel] of drillsByLoopType.entries()) {
      const categoryLabel = getCategoryLabel(loopType, workspaceLang);
      const tiers: DrillTier[] = [];
      
      // Collect all tiers across all levels
      for (const [level, byTier] of byLevel.entries()) {
        for (const [tierNum, drill] of byTier.entries()) {
          const tierTitle = generateTierTitle(tierNum, level, loopType, workspaceLang, drill.drillData);
          const tierDesc = generateTierDescription(tierNum, level, loopType, workspaceLang, template.mechanicLabel, drill.drillData);
          
          tiers.push({
            id: `${mechanicId}_${level.toLowerCase()}_${loopType.replace(/_/g, '-')}_t${tierNum}`,
            tier: tierNum,
            level: level,
            title: tierTitle.title,
            title_i18n: tierTitle.title_i18n,
            description: tierDesc.description,
            description_i18n: tierDesc.description_i18n,
            durationMinutes: drill.estimatedMinutes,
            status: 'available',
            entryUrl: drill.entryUrl!
          });
        }
      }
      
      // Sort tiers by level, then tier
      tiers.sort((a, b) => {
        const levelOrder: Record<string, number> = { 'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6 };
        const levelCmp = (levelOrder[a.level] || 999) - (levelOrder[b.level] || 999);
        if (levelCmp !== 0) return levelCmp;
        return a.tier - b.tier;
      });
      
      if (tiers.length > 0) {
        categories.push({
          id: loopType,
          category: categoryLabel,
          loopType: loopType,
          tiers: tiers
        });
      }
    }
    
    // Sort categories by loopType (consistent ordering)
    categories.sort((a, b) => a.loopType.localeCompare(b.loopType));

    if (categories.length === 0) continue;

    // Get description from template (use workspace language)
    const description = template.description_i18n?.[workspaceLang] || 
                        template.description_i18n?.en || 
                        template.description || '';
    const subtitle = template.description ? template.description.substring(0, 60) : undefined;

    // Get title in workspace language
    const title = getMechanicLabel(mechanicId, workspaceLang, template.mechanicLabel);

    drillGroups.push({
      id: mechanicId,
      kind: 'drill_group',
      mechanic: mechanicId,
      title: title,
      subtitle: subtitle,
      description: description,
      description_i18n: template.description_i18n,
      estimatedDuration: computeEstimatedDuration(categories.flatMap(c => c.tiers)),
      order: order++,
      categories: categories
    });
  }

  return {
    drillGroups
  };
}

/**
 * Generate shaped drills index for a workspace
 */
function generateShapedDrillsIndex(workspaceId: string): void {
  const workspaceDir = join(CONTENT_DIR, 'workspaces', workspaceId);
  if (!existsSync(workspaceDir)) {
    console.error(`❌ Workspace directory not found: ${workspaceDir}`);
    process.exit(1);
  }

  const drillsDir = join(workspaceDir, 'drills');
  if (!existsSync(drillsDir)) {
    mkdirSync(drillsDir, { recursive: true });
  }

  console.log(`📦 Generating shaped drills index for workspace: ${workspaceId}...`);

  const shapedDrills = generateShapedDrills(workspaceId);
  const outputPath = join(drillsDir, 'index.json');
  
  writeFileSync(outputPath, JSON.stringify(shapedDrills, null, 2) + '\n', 'utf-8');
  console.log(`✅ Generated ${workspaceId}/drills/index.json (${shapedDrills.drillGroups.length} drill groups)`);
}

// Main execution
const args = process.argv.slice(2);
const workspaceIndex = args.indexOf('--workspace');
const workspaceId = workspaceIndex >= 0 && args[workspaceIndex + 1] 
  ? args[workspaceIndex + 1]
  : 'de';

generateShapedDrillsIndex(workspaceId);
