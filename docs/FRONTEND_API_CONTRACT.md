# Frontend API Contract

> **Version**: 1.0  
> **Last Updated**: January 2026  
> **Status**: Active

This document defines the complete API contract for the GetVerba frontend, covering all content types (Packs, Drills, Exams), index files, and i18n fields.

## Table of Contents

1. [Base URLs & Endpoints](#base-urls--endpoints)
2. [TypeScript Types](#typescript-types)
3. [Packs](#packs)
4. [Drills](#drills)
5. [Exams](#exams)
6. [Index Files](#index-files)
7. [Internationalization (i18n)](#internationalization-i18n)
8. [Error Handling](#error-handling)
9. [Caching & ETags](#caching--etags)

---

## Base URLs & Endpoints

### Base URL Pattern

```
https://{worker-domain}/v1/workspaces/{workspace}
```

**Example:**
```
https://getverba-content.workers.dev/v1/workspaces/de
```

### Workspace Identifiers

- `de` - German content
- `en` - English content (if available)
- `test-ws` - Test workspace (excluded from production)

### Content Endpoints

| Resource | Pattern | Example |
|----------|---------|---------|
| Catalog | `/v1/workspaces/{ws}/catalog.json` | `/v1/workspaces/de/catalog.json` |
| Pack Entry | `/v1/workspaces/{ws}/packs/{packId}/pack.json` | `/v1/workspaces/de/packs/doctor_pack_1_a1/pack.json` |
| Pack Prompts | `/v1/workspaces/{ws}/packs/{packId}/prompts.json` | `/v1/workspaces/de/packs/doctor_pack_1_a1/prompts.json` |
| Drill Entry | `/v1/workspaces/{ws}/drills/{drillId}/drill.json` | `/v1/workspaces/de/drills/modal_verbs_a1_tier1_pattern-switch/drill.json` |
| Drill Prompts | `/v1/workspaces/{ws}/drills/{drillId}/prompts.json` | `/v1/workspaces/de/drills/modal_verbs_a1_tier1_pattern-switch/prompts.json` |
| Exam Entry | `/v1/workspaces/{ws}/exams/{examId}/exam.json` | `/v1/workspaces/de/exams/goethe_a1/exam.json` |
| Section Index | `/v1/workspaces/{ws}/{section}/index.json` | `/v1/workspaces/de/context/index.json` |
| Section Index Page | `/v1/workspaces/{ws}/{section}/pages/{page}.json` | `/v1/workspaces/de/context/pages/2.json` |
| Scenario Index | `/v1/workspaces/{ws}/context/scenarios.json` | `/v1/workspaces/de/context/scenarios.json` |
| Scenario Pack List | `/v1/workspaces/{ws}/context/{scenarioId}/index.json` | `/v1/workspaces/de/context/doctor/index.json` |
| Mechanics Index | `/v1/workspaces/{ws}/mechanics/index.json` | `/v1/workspaces/de/mechanics/index.json` |
| Mechanic Drill List | `/v1/workspaces/{ws}/mechanics/{mechanicId}/index.json` | `/v1/workspaces/de/mechanics/modal_verbs/index.json` |

---

## TypeScript Types

### Core Types

```typescript
// Base entry document
interface BaseEntry {
  schemaVersion: number;  // Always 1
  id: string;
  kind: 'pack' | 'drill' | 'exam';
  title: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  estimatedMinutes: number;
  description?: string;
  
  // i18n fields (optional)
  title_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  
  // Metadata
  contentId: string;  // Format: "{workspace}:{kind}:{id}"
  contentHash: string;  // SHA256 hash (64 hex chars)
  revisionId: string;  // First 12 chars of contentHash
}

// Telemetry identifiers
interface TelemetryIds {
  contentId: string;  // e.g., "de:pack:doctor_pack_1_a1"
  contentHash: string;  // SHA256 hash
  revisionId: string;  // First 12 chars of contentHash
}
```

---

## Packs

### Pack Entry Document

**Endpoint:** `GET /v1/workspaces/{workspace}/packs/{packId}/pack.json`

**TypeScript Interface:**

```typescript
interface PackEntry extends BaseEntry {
  kind: 'pack';
  packVersion: string;  // Semver: "1.0.0"
  
  // Content metadata
  scenario: string;  // e.g., "doctor", "work", "housing"
  register: 'formal' | 'neutral' | 'informal' | 'casual';
  primaryStructure: string;  // e.g., "modal_verbs_requests"
  variationSlots: Array<'subject' | 'verb' | 'object' | 'modifier' | 'tense' | 'polarity' | 'time' | 'location'>;
  
  // Content structure
  outline: string[];  // Step titles
  sessionPlan: SessionPlan;
  prompts?: Prompt[];  // Inline prompts (or use promptsUrl)
  promptsUrl?: string;  // External prompts file URL
  
  // Optional metadata
  shortTitle?: string;
  shortTitle_i18n?: Record<string, string>;
  subtitle?: string;
  subtitle_i18n?: Record<string, string>;
  tags?: string[];
  thumbnailUrl?: string;
  
  // Analytics (required for generated content)
  analytics?: PackAnalytics;
  
  // Provenance & Review
  provenance?: Provenance;
  review?: Review;
}

interface SessionPlan {
  version: 1;
  steps: SessionStep[];
}

interface SessionStep {
  id: string;
  title: string;
  promptIds: string[];  // References prompts[].id
  title_i18n?: Record<string, string>;
}

interface Prompt {
  id: string;
  text: string;  // 12-140 chars
  intent: 'greet' | 'request' | 'apologize' | 'inform' | 'ask' | 'confirm' | 'schedule' | 'order' | 'ask_price' | 'thank' | 'goodbye';
  register?: 'formal' | 'neutral' | 'informal' | 'casual';
  
  // Meaning fields
  gloss_en: string;  // Natural English meaning (6-180 chars, required)
  gloss_en_i18n?: Record<string, string>;
  natural_en?: string;  // Native English paraphrase (6-180 chars, required for government_office or A2+)
  
  // Optional
  alt_de?: string;  // Native German paraphrase
  audioUrl?: string;
  slots?: {
    subject?: string[];
    verb?: string[];
    object?: string[];
    modifier?: string[];
    complement?: string[];
  };
  slotsChanged?: string[];  // Which slots differ from previous prompt
}

interface PackAnalytics {
  version: 1;
  qualityGateVersion: string;
  
  // Catalog-level analytics (required for generated)
  focus: string;  // e.g., "verb_position", "modal_verbs"
  cognitiveLoad: 'low' | 'medium' | 'high';
  responseSpeedTargetMs: number;  // 500-3000ms
  fluencyOutcome: string;  // e.g., "automatic_opening"
  whyThisWorks: string[];  // 2-5 items, each <= 120 chars
  
  // Computed metrics
  scenario: string;
  register: string;
  primaryStructure: string;
  variationSlots: string[];
  promptCount: number;
  multiSlotRate: number;  // 0..1
  scenarioTokenHitAvg: number;
  scenarioTokenQualifiedRate: number;  // 0..1
  uniqueTokenRate: number;  // 0..1
  bannedPhraseViolations: number;
  passesQualityGates: boolean;
  
  // Legacy fields (optional)
  goal?: string;
  constraints?: string[];
  levers?: string[];
  successCriteria?: string[];
  commonMistakes?: string[];
  drillType?: 'substitution' | 'pattern-switch' | 'roleplay-bounded';
}

interface Provenance {
  source: 'pdf' | 'template' | 'handcrafted';
  sourceRef: string;
  extractorVersion: string;  // Semver
  generatedAt: string;  // ISO 8601
}

interface Review {
  status: 'draft' | 'needs_review' | 'approved';
  reviewer?: string;  // Required if status === 'approved'
  reviewedAt?: string;  // ISO 8601, required if status === 'approved'
}
```

### Pack Example

```json
{
  "schemaVersion": 1,
  "id": "doctor_pack_1_a1",
  "kind": "pack",
  "packVersion": "1.0.0",
  "title": "Doctor A1 — 1: Making an Appointment",
  "level": "A1",
  "estimatedMinutes": 15,
  "description": "Practice making doctor appointments at A1 level.",
  "scenario": "doctor",
  "register": "neutral",
  "primaryStructure": "modal_verbs_requests",
  "variationSlots": ["subject", "verb", "object", "modifier"],
  "outline": [
    "Making an Appointment",
    "Confirming Details",
    "Rescheduling"
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "step-1",
        "title": "Making an Appointment",
        "promptIds": ["prompt-001", "prompt-002", "prompt-003"],
        "title_i18n": { "en": "Making an Appointment" }
      }
    ]
  },
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich brauche einen Termin.",
      "intent": "request",
      "gloss_en": "I need an appointment.",
      "natural_en": "I'd like to schedule an appointment.",
      "audioUrl": "/v1/audio/doctor_pack_1_a1/prompt-001.mp3",
      "slots": {
        "subject": ["Ich"],
        "verb": ["brauche"],
        "object": ["einen Termin"]
      }
    }
  ],
  "analytics": {
    "version": 1,
    "qualityGateVersion": "qg-2025-01-01",
    "focus": "modal_verbs",
    "cognitiveLoad": "high",
    "responseSpeedTargetMs": 1800,
    "fluencyOutcome": "health_appointments",
    "whyThisWorks": [
      "Practice doctor appointments and health conversations at A1 level",
      "Uses appointment scheduling phrases"
    ],
    "scenario": "doctor",
    "register": "neutral",
    "primaryStructure": "modal_verbs_requests",
    "variationSlots": ["subject", "verb", "object", "modifier"],
    "promptCount": 12,
    "multiSlotRate": 0.42,
    "scenarioTokenHitAvg": 2.5,
    "scenarioTokenQualifiedRate": 0.92,
    "uniqueTokenRate": 0.68,
    "bannedPhraseViolations": 0,
    "passesQualityGates": true
  },
  "title_i18n": { "en": "Doctor A1 — 1: Making an Appointment" },
  "contentId": "de:pack:doctor_pack_1_a1",
  "contentHash": "d68ee6ac287b...",
  "revisionId": "d68ee6ac287b"
}
```

### Loading Pack Prompts Separately

If `promptsUrl` is present, load prompts from that URL:

```typescript
const pack = await fetchPack(packId);
if (pack.promptsUrl) {
  const prompts = await fetch(pack.promptsUrl).then(r => r.json());
  // Use prompts array instead of pack.prompts
}
```

---

## Drills

### Drill Entry Document

**Endpoint:** `GET /v1/workspaces/{workspace}/drills/{drillId}/drill.json`

**TypeScript Interface:**

```typescript
interface DrillEntry extends BaseEntry {
  kind: 'drill';
  drillVersion?: 'v4';  // Present for v4 drills
  
  // Content metadata
  scenario?: string;  // e.g., "mechanics"
  register?: 'formal' | 'neutral' | 'informal';
  primaryStructure?: string;
  variationSlots?: string[];
  
  // Content delivery (MUST have at least one)
  prompts?: Prompt[];  // Session engine mode
  promptsUrl?: string;  // External prompts file
  exercises?: Exercise[];  // Legacy quiz mode
  
  // Session plan (required if prompts/promptsUrl present)
  sessionPlan?: SessionPlan;
  
  // Optional metadata
  shortTitle?: string;
  shortTitle_i18n?: Record<string, string>;
  subtitle?: string;
  subtitle_i18n?: Record<string, string>;
  instructions?: string;
  outline?: string[];
  passingScore?: number;  // 0-100
  tags?: string[];
  
  // Analytics (required for prompts-based drills)
  analytics?: DrillAnalytics;
  
  // Mechanic metadata (v4 drills)
  mechanicId?: string;
  mechanicLabel?: string;
  loopType?: 'pattern_switch' | 'slot_substitution' | 'contrast_pairs' | 'error-trap' | 'micro-transform' | 'fast-recall';
  difficultyTier?: 1 | 2 | 3;
  
  // Provenance & Review
  provenance?: Provenance;
  review?: Review;
}

interface Exercise {
  id: string;
  type: 'fill-blank' | 'multiple-choice' | 'translation' | 'matching';
  prompt: string;
  answer: string;
  options?: string[];  // For multiple-choice
  hint?: string;
}

interface DrillAnalytics {
  // Similar to PackAnalytics but drill-specific
  version: 1;
  primaryStructure?: string;
  variationSlots?: string[];
  slotSwitchDensity?: number;
  promptDiversityScore?: number;
  scenarioCoverageScore?: number;
  estimatedCognitiveLoad?: 'low' | 'medium' | 'high';
  intendedOutcome?: string;
  goal?: string;
  drillType?: string;
  cognitiveLoad?: 'low' | 'medium' | 'high';
}
```

### Drill Example (v4 with Prompts)

```json
{
  "schemaVersion": 1,
  "id": "modal_verbs_a1_tier1_pattern-switch",
  "kind": "drill",
  "drillVersion": "v4",
  "title": "Modal Verbs: A1 (Tier 1) - Switch",
  "level": "A1",
  "estimatedMinutes": 3,
  "description": "Master modal verb patterns (können, müssen, sollen, wollen, möchten)",
  "mechanicId": "modal_verbs",
  "mechanicLabel": "Modal Verbs",
  "loopType": "pattern_switch",
  "difficultyTier": 1,
  "scenario": "mechanics",
  "register": "neutral",
  "primaryStructure": "modal_verb_infinitive",
  "variationSlots": ["subject", "modal", "verb"],
  "prompts": [
    {
      "id": "prompt-001",
      "text": "Ich kann gehen.",
      "intent": "practice",
      "gloss_en": "I can go.",
      "slots": {
        "subject": ["Ich"],
        "modal": ["kann"],
        "verb": ["gehen"]
      }
    }
  ],
  "sessionPlan": {
    "version": 1,
    "steps": [
      {
        "id": "step-1",
        "title": "Pattern Switch",
        "promptIds": ["prompt-001", "prompt-002"],
        "title_i18n": { "en": "Pattern Switch" }
      }
    ]
  },
  "title_i18n": { "en": "Modal Verbs: A1 (Tier 1) - Switch" },
  "shortTitle_i18n": { "en": "Modal Verbs A1 Switch" },
  "subtitle_i18n": { "en": "Tier 1 - pattern switch - Master modal verb patterns" },
  "contentId": "de:drill:modal_verbs_a1_tier1_pattern-switch",
  "contentHash": "abc123...",
  "revisionId": "abc123"
}
```

### Drill Example (Legacy with Exercises)

```json
{
  "schemaVersion": 1,
  "id": "accusative_articles_a1",
  "kind": "drill",
  "title": "Accusative Articles",
  "level": "A1",
  "estimatedMinutes": 5,
  "description": "Practice accusative articles (den, die, das)",
  "instructions": "Fill in the correct article.",
  "exercises": [
    {
      "id": "ex-001",
      "type": "fill-blank",
      "prompt": "Ich sehe ___ Mann. (der)",
      "answer": "den",
      "hint": "Masculine accusative changes to den"
    }
  ],
  "passingScore": 70,
  "tags": ["grammar", "articles", "accusative"]
}
```

---

## Exams

### Exam Entry Document

**Endpoint:** `GET /v1/workspaces/{workspace}/exams/{examId}/exam.json`

**TypeScript Interface:**

```typescript
interface ExamEntry extends BaseEntry {
  kind: 'exam';
  
  // Exam metadata
  examType?: 'certification' | 'practice' | 'placement';
  examProvider?: string;  // e.g., "goethe-institut"
  officialExamInfo?: {
    name: string;
    level: string;
    durationMinutes: number;
    sections: ExamSection[];
  };
  
  // Exam structure
  sections?: ExamSection[];
  practiceModules?: PracticeModule[];
  questions?: Question[];
  questionsUrl?: string;  // External questions file
  
  // Optional
  passingScore?: number;  // 0-100
  tags?: string[];
}

interface ExamSection {
  id: string;
  title: string;
  titleEn?: string;  // English title (legacy)
  title_i18n?: Record<string, string>;
  durationMinutes?: number;
  weight?: number;  // Percentage weight
  parts?: ExamPart[];
}

interface ExamPart {
  id: string;
  title: string;
  title_i18n?: Record<string, string>;
  description?: string;
  description_i18n?: Record<string, string>;
  itemCount?: number;
  format?: string;  // e.g., "multiple_choice_pictures"
}

interface PracticeModule {
  id: string;
  title: string;
  title_i18n?: Record<string, string>;
  description?: string;
  description_i18n?: Record<string, string>;
  topics?: string[];
}

interface Question {
  id: string;
  type: 'multiple-choice' | 'fill-blank' | 'matching' | 'essay';
  question: string;
  options?: string[];
  correctAnswer?: number | string;
  points?: number;
}
```

### Exam Example

```json
{
  "schemaVersion": 1,
  "id": "goethe_a1",
  "kind": "exam",
  "title": "Goethe-Zertifikat A1: Start Deutsch 1",
  "level": "A1",
  "estimatedMinutes": 65,
  "description": "Official Goethe-Institut A1 certification exam practice.",
  "examType": "certification",
  "examProvider": "goethe-institut",
  "sections": [
    {
      "id": "hoeren",
      "title": "Hören (Listening)",
      "title_i18n": { "en": "Hören (Listening)" },
      "durationMinutes": 20,
      "weight": 25,
      "parts": [
        {
          "id": "hoeren_1",
          "title": "Teil 1: Kurze Ansagen",
          "title_i18n": { "en": "Teil 1: Kurze Ansagen" },
          "description": "Listen to short announcements and match them to pictures",
          "description_i18n": { "en": "Listen to short announcements and match them to pictures" },
          "itemCount": 6,
          "format": "multiple_choice_pictures"
        }
      ]
    }
  ],
  "practiceModules": [
    {
      "id": "intro_vocab",
      "title": "Introduction Vocabulary",
      "title_i18n": { "en": "Introduction Vocabulary" },
      "description": "Master key vocabulary for self-introduction",
      "description_i18n": { "en": "Master key vocabulary for self-introduction" },
      "topics": ["greetings", "introductions"]
    }
  ],
  "title_i18n": { "en": "Goethe-Zertifikat A1: Start Deutsch 1" },
  "description_i18n": { "en": "Official Goethe-Institut A1 certification exam practice." }
}
```

---

## Index Files

### Section Index

**Endpoint:** `GET /v1/workspaces/{workspace}/{section}/index.json`

**TypeScript Interface:**

```typescript
interface SectionIndex {
  version: 'v1';
  kind: 'context' | 'drills' | 'exams' | 'mechanics';
  total: number;
  pageSize: number;
  page?: number;  // Present on paginated pages
  items: SectionIndexItem[];
  nextPage: string | null;  // URL to next page, or null
  
  // Context scenario indexes only
  scope?: {
    scopeKind: 'scenario';
    scopeId: string;
    scopeTitle: string;
  };
  recommended?: {
    itemId: string;
    entryUrl: string;
  };
  groups?: ContextGroup[];
}

interface SectionIndexItem {
  id: string;
  kind: 'pack' | 'drill' | 'exam';
  title: string;
  level: string;
  entryUrl: string;  // Canonical URL to entry document
  durationMinutes?: number;
  
  // i18n fields
  title_i18n?: Record<string, string>;
  shortTitle?: string;
  shortTitle_i18n?: Record<string, string>;
  subtitle?: string;
  subtitle_i18n?: Record<string, string>;
  
  // Metadata
  contentId: string;
  revisionId: string;
  scenario?: string;
  register?: string;
  primaryStructure?: string;
  tags?: string[];
  
  // Grouping (for context scenario lists)
  groupId?: string;
  groupTitle?: string;
  groupTitle_i18n?: Record<string, string>;
  isRecommended?: boolean;  // true if this is the recommended item
  domainKind?: 'context' | 'mechanics' | 'exam';  // For filtering
  
  // Analytics summary (for packs)
  analyticsSummary?: {
    primaryStructure: string;
    variationSlots: string[];
    drillType: string;
    cognitiveLoad: 'low' | 'medium' | 'high';
    goal: string;
    whyThisWorks: string[];
  };
  
  // Drill-specific
  drillType?: string;
  cognitiveLoad?: 'low' | 'medium' | 'high';
  whyThisWorks?: string;
  
  // Topic grouping (optional)
  topicKey?: string;
  topicLabel?: string;
  orderInTopic?: number;
}

interface ContextGroup {
  id: string;
  title: string;
  title_i18n?: Record<string, string>;
  kind: 'context_group';
  itemIds: string[];  // References items[].id on current page
}
```

### Section Index Example

```json
{
  "version": "v1",
  "kind": "context",
  "total": 16,
  "pageSize": 12,
  "page": 1,
  "items": [
    {
      "id": "doctor_pack_1_a1",
      "kind": "pack",
      "title": "Doctor A1 — 1: Making an Appointment",
      "level": "A1",
      "durationMinutes": 15,
      "entryUrl": "/v1/workspaces/de/packs/doctor_pack_1_a1/pack.json",
      "contentId": "de:pack:doctor_pack_1_a1",
      "revisionId": "d68ee6ac287b",
      "scenario": "doctor",
      "register": "neutral",
      "primaryStructure": "modal_verbs_requests",
      "tags": ["doctor"],
      "domainKind": "context",
      "groupId": "booking-appointments",
      "groupTitle": "Booking Appointments",
      "groupTitle_i18n": { "en": "Booking Appointments" },
      "isRecommended": true,
      "title_i18n": { "en": "Doctor A1 — 1: Making an Appointment" },
      "analyticsSummary": {
        "primaryStructure": "modal_verbs_requests",
        "variationSlots": ["subject", "verb", "object", "modifier"],
        "drillType": "substitution",
        "cognitiveLoad": "high",
        "goal": "Practice doctor appointments and health conversations at A1 level",
        "whyThisWorks": [
          "Practice doctor appointments and health conversations at A1 level",
          "Uses appointment scheduling phrases"
        ]
      }
    }
  ],
  "nextPage": "/v1/workspaces/de/context/doctor/pages/2.json",
  "scope": {
    "scopeKind": "scenario",
    "scopeId": "doctor",
    "scopeTitle": "Doctor"
  },
  "recommended": {
    "itemId": "doctor_pack_1_a1",
    "entryUrl": "/v1/workspaces/de/packs/doctor_pack_1_a1/pack.json"
  },
  "groups": [
    {
      "id": "booking-appointments",
      "title": "Booking Appointments",
      "title_i18n": { "en": "Booking Appointments" },
      "kind": "context_group",
      "itemIds": ["doctor_pack_1_a1", "doctor_pack_4_a1", "doctor_pack_7_a1"]
    }
  ]
}
```

### Scenario Index

**Endpoint:** `GET /v1/workspaces/{workspace}/context/scenarios.json`

```typescript
interface ScenarioIndex {
  version: 1;
  kind: 'scenario_index';
  items: ScenarioItem[];
}

interface ScenarioItem {
  id: string;  // e.g., "doctor", "work", "housing"
  title: string;
  subtitle?: string;
  icon?: string;
  itemCount: number;
  itemsUrl: string;  // URL to scenario pack list
  title_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
}
```

### Mechanics Index

**Endpoint:** `GET /v1/workspaces/{workspace}/mechanics/index.json`

```typescript
interface MechanicsIndex {
  version: 'v1';
  kind: 'mechanics_index';
  mechanics: MechanicItem[];
}

interface MechanicItem {
  id: string;  // e.g., "modal_verbs", "case_endings_akkusativ"
  label: string;
  description?: string;
  itemsUrl: string;  // URL to mechanic drill list
  drillCount?: number;
}
```

### Catalog

**Endpoint:** `GET /v1/workspaces/{workspace}/catalog.json`

```typescript
interface Catalog {
  schemaVersion: 1;
  version: string;
  workspace: string;
  languageCode: string;
  languageName: string;
  sections: CatalogSection[];
}

interface CatalogSection {
  id: string;
  kind: 'context' | 'drills' | 'exams' | 'mechanics';
  title: string;
  itemsUrl: string;  // URL to section index
  title_i18n?: Record<string, string>;
}
```

---

## Internationalization (i18n)

### i18n Field Pattern

All user-facing strings have optional `*_i18n` fields:

```typescript
interface I18nFields {
  // Entry documents
  title_i18n?: Record<string, string>;
  description_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
  
  // Prompts
  gloss_en_i18n?: Record<string, string>;
  
  // Session steps
  // (in sessionPlan.steps[].title_i18n)
  
  // Index items
  title_i18n?: Record<string, string>;
  shortTitle_i18n?: Record<string, string>;
  subtitle_i18n?: Record<string, string>;
  groupTitle_i18n?: Record<string, string>;
}
```

### Locale Keys

- Format: BCP-47 short form (`[a-z]{2}` or `[a-z]{2}-[A-Z]{2}`)
- Examples: `"en"`, `"de"`, `"de-AT"`, `"pt-BR"`
- **Required**: When any `*_i18n` field is present, it MUST include `"en"` key

### Frontend i18n Helper

```typescript
function getLocalizedText(
  item: { [key: string]: any; [key: string + '_i18n']?: Record<string, string> },
  field: string,
  userLocale: string = 'en'
): string {
  const i18nField = `${field}_i18n`;
  const i18n = item[i18nField] as Record<string, string> | undefined;
  
  // 1. Try exact locale match
  if (i18n?.[userLocale]) {
    return i18n[userLocale];
  }
  
  // 2. Try language-only match (e.g., "de" from "de-AT")
  const lang = userLocale.split('-')[0];
  if (i18n?.[lang]) {
    return i18n[lang];
  }
  
  // 3. Fall back to English i18n
  if (i18n?.en) {
    return i18n.en;
  }
  
  // 4. Ultimate fallback to base field
  return item[field] || '';
}

// Usage
const title = getLocalizedText(pack, 'title', userLocale);
const description = getLocalizedText(pack, 'description', userLocale);
const groupTitle = getLocalizedText(item, 'groupTitle', userLocale);
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | Response Body |
|------|---------|---------------|
| 200 | Success | JSON document |
| 404 | Not Found | `{ "error": "Not found", "path": "/v1/..." }` |
| 500 | Server Error | `{ "error": "Internal server error" }` |

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;
  path?: string;
  message?: string;
}
```

---

## Caching & ETags

### Cache Headers

All content responses include:

```
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
ETag: "{contentHash}"
```

### Conditional Requests

Use `If-None-Match` header for efficient updates:

```typescript
const response = await fetch(url, {
  headers: {
    'If-None-Match': previousETag
  }
});

if (response.status === 304) {
  // Content unchanged, use cached version
} else {
  const newETag = response.headers.get('ETag');
  const data = await response.json();
  // Update cache with newETag
}
```

---

## Complete TypeScript Client Example

```typescript
class GetVerbaContentClient {
  constructor(private baseUrl: string, private workspace: string) {}
  
  async fetchCatalog(): Promise<Catalog> {
    const url = `${this.baseUrl}/v1/workspaces/${this.workspace}/catalog.json`;
    return fetch(url).then(r => r.json());
  }
  
  async fetchSectionIndex(section: string, page?: number): Promise<SectionIndex> {
    const url = page 
      ? `${this.baseUrl}/v1/workspaces/${this.workspace}/${section}/pages/${page}.json`
      : `${this.baseUrl}/v1/workspaces/${this.workspace}/${section}/index.json`;
    return fetch(url).then(r => r.json());
  }
  
  async fetchPack(packId: string): Promise<PackEntry> {
    const url = `${this.baseUrl}/v1/workspaces/${this.workspace}/packs/${packId}/pack.json`;
    return fetch(url).then(r => r.json());
  }
  
  async fetchDrill(drillId: string): Promise<DrillEntry> {
    const url = `${this.baseUrl}/v1/workspaces/${this.workspace}/drills/${drillId}/drill.json`;
    return fetch(url).then(r => r.json());
  }
  
  async fetchExam(examId: string): Promise<ExamEntry> {
    const url = `${this.baseUrl}/v1/workspaces/${this.workspace}/exams/${examId}/exam.json`;
    return fetch(url).then(r => r.json());
  }
  
  async fetchPrompts(promptsUrl: string): Promise<Prompt[]> {
    const url = `${this.baseUrl}${promptsUrl}`;
    return fetch(url).then(r => r.json());
  }
  
  getLocalizedText(item: any, field: string, locale: string = 'en'): string {
    const i18nField = `${field}_i18n`;
    const i18n = item[i18nField] as Record<string, string> | undefined;
    
    if (i18n?.[locale]) return i18n[locale];
    const lang = locale.split('-')[0];
    if (i18n?.[lang]) return i18n[lang];
    if (i18n?.en) return i18n.en;
    return item[field] || '';
  }
}

// Usage
const client = new GetVerbaContentClient('https://getverba-content.workers.dev', 'de');
const catalog = await client.fetchCatalog();
const pack = await client.fetchPack('doctor_pack_1_a1');
const title = client.getLocalizedText(pack, 'title', 'en');
```

---

## Related Documentation

- [Pack Schema](./content-pipeline/PACK_SCHEMA.md) - Detailed pack schema
- [Drills Schema](./content-pipeline/DRILLS_SCHEMA.md) - Detailed drill schema
- [I18N Contract](./content-pipeline/I18N_CONTRACT.md) - i18n implementation guide
- [Section Index Schema](./SECTION_INDEX_SCHEMA.md) - Index file structure
- [Session Plan Schema](./content-pipeline/SESSION_PLAN_SCHEMA.md) - Session plan structure
- [Context Grouping](./content-pipeline/CONTEXT_GROUPING.md) - Scenario grouping implementation

