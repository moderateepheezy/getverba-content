/**
 * Curriculum Export v2 Type Definitions
 * 
 * TypeScript types for deterministic curriculum bundle exports.
 */

export type CurriculumExportV2 = {
  version: 2;
  exportedAt: string;        // ISO timestamp
  gitSha: string;            // from meta/release.json
  workspace: string;         // e.g. "de"
  title: string;             // e.g. "GetVerba A1 Government Office Mini-Course"
  description?: string;

  bundles: CurriculumBundleV2[];
};

export type CurriculumBundleV2 = {
  id: string;                // stable, slug (e.g. "gov_office_a1_core")
  title: string;
  level: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2';
  scenario?: string;         // e.g. "government_office"
  register?: 'formal'|'neutral'|'casual';

  // Deterministic "why this works" summary for teachers
  outcomes: string[];        // 3–8 bullets
  primaryStructures: string[]; // aggregated coverage
  estimatedMinutes: number;  // sum of pack/drill estimatedMinutes

  // Ordered learning path
  modules: CurriculumModuleV2[];
};

export type CurriculumModuleV2 = {
  id: string;               // stable, slug
  title: string;
  items: CurriculumItemRefV2[]; // ordered
};

export type CurriculumItemRefV2 =
  | { kind: 'pack'; id: string; entryUrl: string; minutes?: number }
  | { kind: 'drill'; id: string; entryUrl: string; minutes?: number }
  | { kind: 'exam'; id: string; entryUrl: string; minutes?: number };

/**
 * Optional bundle configuration override
 */
export type BundleConfigV2 = {
  bundles?: Array<{
    id: string;
    title?: string;
    outcomes?: string[];
    modules?: Array<{
      id: string;
      title?: string;
      itemOrder?: string[]; // item IDs in desired order
      excludeItems?: string[]; // item IDs to exclude
    }>;
  }>;
};

