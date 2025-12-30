/**
 * Type definitions for the ingestion pipeline
 */

export type InputSource = 'pdf' | 'url' | 'text';

export interface IngestionConfig {
  workspace: string;
  scenario: string;
  level: string;
  source: InputSource;
  inputPath?: string; // For PDF or text file
  inputText?: string; // For raw text
  inputUrl?: string; // For URL
}

export interface TextChunk {
  chunkId: string; // sha1(normalizedChunk).slice(0,10)
  text: string;
  normalizedText: string;
  charStart: number;
  charEnd: number;
  sourceLine?: number;
}

export interface ExtractedSignal {
  chunkId: string;
  topTokens: string[]; // Top 10-15 most frequent tokens
  detectedIntents: string[]; // e.g. "request_appointment", "submit_documents"
  evidence: Array<{ token: string; count: number }>;
  entities: Array<{
    type: 'date' | 'time' | 'money' | 'address' | 'capitalized' | 'other';
    value: string;
    position: number;
  }>;
  actionVerbs: string[];
  questionPatterns: boolean;
}

export interface PlannedPack {
  packId: string; // <scenario>_<topicSlug>_<level>_<shortHash>
  title: string;
  primaryStructure: string;
  variationSlots: string[];
  register: string;
  tags: string[];
  targetChunks: string[]; // chunkIds that this pack targets
  topTokens: string[];
  intentCategory: string;
}

export interface DraftPrompt {
  id: string;
  text: string;
  intent: string;
  gloss_en: string;
  natural_en?: string;
  literal_en?: string;
  notes_lite?: string; // Max 120 chars, optional
  audioUrl: string;
  slotsChanged?: string[];
  slots?: Record<string, string[]>;
}

export interface DraftPack {
  schemaVersion: number;
  id: string;
  kind: string;
  title: string;
  level: string;
  estimatedMinutes: number;
  description: string;
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  outline: string[];
  prompts: DraftPrompt[];
  sessionPlan: {
    version: number;
    steps: Array<{
      id: string;
      title: string;
      promptIds: string[];
    }>;
  };
  tags: string[];
  analytics: {
    goal: string;
    constraints: string[];
    levers: string[];
    successCriteria: string[];
    commonMistakes: string[];
    drillType: 'substitution' | 'pattern-switch' | 'roleplay-bounded';
    cognitiveLoad: 'low' | 'medium' | 'high';
  };
  _ingestionMetadata?: {
    source: InputSource;
    sourcePath?: string;
    sourceUrl?: string;
    generatedAt: string;
    chunkIds: string[];
  };
}

export interface QualityGateResult {
  passed: boolean;
  failures: Array<{
    promptId?: string;
    packId?: string;
    rule: string;
    reason: string;
  }>;
  warnings: Array<{
    promptId?: string;
    packId?: string;
    rule: string;
    reason: string;
  }>;
}

export interface IngestReport {
  timestamp: string;
  workspace: string;
  scenario: string;
  level: string;
  source: InputSource;
  sourcePath?: string;
  sourceUrl?: string;
  generatedPacks: Array<{
    packId: string;
    title: string;
    promptCount: number;
    qualityGatePassed: boolean;
  }>;
  qualityGateSummary: {
    totalPrompts: number;
    passedPrompts: number;
    failedPrompts: number;
    passRate: number;
    failures: QualityGateResult['failures'];
    warnings: QualityGateResult['warnings'];
  };
  recommendedEdits: string[];
  chunkCount: number;
  signalCount: number;
}

