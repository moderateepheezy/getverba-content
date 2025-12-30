/**
 * B2B Curriculum Export Type Definitions
 * 
 * TypeScript types for curriculum bundle exports (SCORM-ish school bundles).
 */

export type CurriculumBundle = {
  bundleId: string;
  workspace: string;
  title: string;
  version: string; // e.g. "2025-12-30"
  generatedAt: string; // ISO
  selection: {
    levels?: string[];
    scenarios?: string[];
    tags?: string[];
    explicitPackIds?: string[];
    explicitDrillIds?: string[];
    explicitExamIds?: string[];
  };
  modules: Array<{
    id: string;      // "m1"
    title: string;   // "Appointments & Documents"
    items: Array<{
      kind: "pack" | "drill" | "exam";
      id: string;
      entryUrl: string; // canonical path
      title: string;
      level?: string;
      scenario?: string;
      register?: string;
      primaryStructure?: string;
      estimatedMinutes?: number;
      whyThisWorks?: {
        primaryStructure?: string;
        variationSlots?: string[];
        qualitySignals?: string[]; // e.g. ["token_gate", "multi_slot_variation", "denylist_pass"]
      };
    }>;
  }>;
  totals: {
    packs: number;
    drills: number;
    exams: number;
    estimatedMinutes: number;
  };
};

export type BundleSelectionCriteria = {
  workspace: string;
  bundleId: string;
  title: string;
  levels?: string[];
  scenarios?: string[];
  tags?: string[];
  includeSections?: string[]; // e.g. ["context", "mechanics"]
  maxPacks?: number;
  maxDrills?: number;
  maxExams?: number;
  explicitPackIds?: string[];
  explicitDrillIds?: string[];
  explicitExamIds?: string[];
};

export type SectionIndexItem = {
  id: string;
  kind: string;
  title: string;
  level: string;
  durationMinutes?: number;
  entryUrl: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  tags?: string[];
  analyticsSummary?: {
    primaryStructure?: string;
    variationSlots?: string[];
    goal?: string;
    whyThisWorks?: string[];
  };
};

export type EntryDocument = {
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
  sessionPlan?: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
  prompts?: Array<{
    id: string;
    text: string;
    slotsChanged?: string[];
  }>;
  analytics?: {
    goal?: string;
    successCriteria?: string[];
  };
};

export type BundleItem = {
  kind: "pack" | "drill" | "exam";
  id: string;
  entryUrl: string;
  title: string;
  level: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  estimatedMinutes: number;
  tags?: string[];
  whyThisWorks?: {
    primaryStructure?: string;
    variationSlots?: string[];
    qualitySignals?: string[];
  };
  entryDocument?: EntryDocument; // Full entry document for integrity checks
};

export type IntegrityReport = {
  errors: Array<{
    type: "duplicate_id" | "missing_entry" | "invalid_entry";
    message: string;
    itemId?: string;
  }>;
  warnings: Array<{
    type: string;
    message: string;
  }>;
  stats: {
    levelDistribution: Record<string, number>;
    scenarioDistribution: Record<string, number>;
    primaryStructureDistribution: Record<string, number>;
    registerDistribution: Record<string, number>;
  };
  coherence: {
    itemsWithScenario: number;
    itemsWithRegister: number;
    itemsWithPrimaryStructure: number;
    packsWithSessionPlan: number;
    promptsWithSlotsChanged: number;
    packsPassingWhyThisWorks: number;
    totalItems: number;
    totalPacks: number;
    totalPrompts: number;
  };
  coherenceScorecard: {
    scenarioCoverage: number; // percentage
    registerCoverage: number;
    primaryStructureCoverage: number;
    sessionPlanCoverage: number;
    slotsChangedCoverage: number;
    whyThisWorksPassRate: number;
  };
};

