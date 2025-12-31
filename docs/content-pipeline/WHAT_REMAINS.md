# What Remains: GetVerba Backend Content System

**Last Updated:** 2025-01-15  
**Status:** Production-safe, deterministic content engine. Remaining work is product leverage and proof.

---

## 1. Executive Summary

The GetVerba content engine is **production-safe and deterministic**. All core systems are implemented and validated:

- ✅ **Zero-cost content generation**: Deterministic pack generation from templates with seeded randomness
- ✅ **Quality gates**: Hard constraints prevent generic/low-value content (non-generic, scenario-bound, multi-slot variation)
- ✅ **Production-safe publishing**: Staging → promote → rollback workflow with manifest-based versioning
- ✅ **Session plans**: Deterministic prompt ordering with step-based progression
- ✅ **Mechanics drills**: Grammar-focused exercises with discrete rule testing
- ✅ **Government office scenarios**: High-coherence scenario templates with formal register enforcement
- ✅ **PDF ingestion**: Infrastructure exists but intentionally paused

**Current State:**
- Backend risk is no longer technical
- What remains is product leverage and proof
- Systems are ready for scale (20-50 pack sprints)

**Remaining Work:**
1. **Catalog-Level Analytics Metadata** (HIGH PRIORITY): Consolidate and enforce analytics fields that prove non-randomness
2. **Content Expansion Sprint** (READY): Execute 20-50 pack sprint and generate proof artifacts
3. **Pack Effectiveness Telemetry** (DEFERRED): Schema definition only (FE-assisted)
4. **B2B/Curriculum Exports v2** (DEFERRED): Explicitly skipped for now
5. **PDF → Packs Scaling** (PAUSED): Documented limitations, no code until app proves retention
6. **Drill Coverage Gaps**: German morphology "struggle packs" for verb conjugation, case endings, separable verbs

---

## 2. Completed Systems (Do Not Reopen)

These systems are production-ready and MUST NOT be reopened unless critical bugs are found.

### 2.1 Content Schemas

**Status:** ✅ Complete

- **Catalog schema** (`schemaVersion: 1`): Workspace-level catalog with sections (context, mechanics, exams)
- **Section index schema** (`schemaVersion: 1`): Paginated index files with deterministic sorting
- **Pack entry schema** (`schemaVersion: 1`): Full pack documents with session plans, prompts, analytics
- **Drill entry schema** (`schemaVersion: 1`): Grammar exercise documents with exercises array
- **Session plan schema** (`schemaVersion: 1`): Step-based progression with prompt ordering

**Validation:** `scripts/validate-content.ts` enforces all schema requirements.

**Entry URLs:** Canonical URL pattern `/v1/workspaces/{workspace}/{kind}/{id}/{kind}.json` enforced.

### 2.2 Validation + Quality Gates

**Status:** ✅ Complete

**Quality Gates v1** (hard constraints):
- Generic template denylist (hard fail on template phrases)
- Multi-slot variation (hard fail if <2 distinct verbs or <2 distinct subjects)
- Register consistency (hard fail if formal pack lacks "Sie"/"Ihnen")
- Concreteness markers (hard fail if <2 prompts contain digits/currency/time/weekdays)
- Context token requirement (hard fail if <2 scenario tokens per prompt)
- Prompt meaning contract (hard fail if approved generated pack lacks `gloss_en` or `intent`)

**Validation Scripts:**
- `scripts/validate-content.ts`: Schema + quality gate validation
- `scripts/content-quality-report.ts`: Quality metrics and red/yellow/green status
- `scripts/content-quality/dedupe.ts`: Near-duplicate detection

**Enforcement:** All gates are hard-fail (cannot publish if failed).

### 2.3 Staging → Promote → Rollback

**Status:** ✅ Complete

**Workflow:**
1. **Staging manifest** (`content/meta/manifest.staging.json`): Test target
2. **Production manifest** (`content/meta/manifest.json`): App target
3. **Promote command**: `./scripts/promote-staging.sh` (instant flip)
4. **Rollback command**: `./scripts/rollback.sh <git-sha>`

**Manifest Structure:**
- Workspace-level hashes for content integrity
- Section-level versioning
- Deterministic ordering

**Validation:** Promotion requires validation pass and approval gate check.

### 2.4 Review + Approval Gates

**Status:** ✅ Complete

**Review Workflow:**
- Generated packs default to `review.status="needs_review"`
- Handcrafted packs default to `review.status="approved"`
- Approval script: `./scripts/approve-pack.sh <packId> --reviewer <name> --workspace <ws>`
- Batch approval: `./scripts/approve-batch.sh --sourceRef <ref> --limit <N> --reviewer <name>`

**Approval Gate:**
- `scripts/check-approval-gate.ts`: Validates all approved packs pass quality gates
- Hard fail if approved pack fails validation

**Review Reports:**
- `scripts/review-report.ts`: Lists pending/approved packs with warnings
- `content/review/pending.json`: Pending items queue
- `content/review/approved.json`: Approved items log

### 2.5 Deduplication + Near-Deduplication

**Status:** ✅ Complete

**Deduplication:**
- Exact duplicate detection (identical prompt text)
- Near-duplicate detection (Jaccard + Levenshtein similarity >0.85)
- Cross-pack duplicate scanning
- Hard fail on exact duplicates, warning on near-duplicates

**Scripts:**
- `scripts/content-quality/dedupe.ts`: Duplicate detection algorithm
- `scripts/dedupe-content.ts`: CLI wrapper

**Reports:** Quality reports include duplicate counts and similarity scores.

### 2.6 Government Office Scenarios

**Status:** ✅ Complete

**Implementation:**
- Scenario templates in `content/templates/v1/scenarios/`
- Formal register enforcement (Sie/Ihnen requirement)
- Scenario token dictionaries for context validation
- High-coherence scenario structure

**Validation:** Register consistency gate enforces formal packs contain formal address.

### 2.7 Mechanics Drills (Current Coverage)

**Status:** ✅ Complete (coverage gaps documented in section 6)

**Implementation:**
- Drill entry schema with exercises array
- Exercise types: `fill-blank`, `multiple-choice`, `translation`, `matching`
- Section index integration (`/v1/workspaces/{ws}/mechanics/index.json`)
- Provenance and review metadata

**Current Coverage:**
- Basic verb endings
- Basic mechanics patterns

**Coverage Gaps:** See section 6 (Drill Coverage Gaps).

---

## 3. High-Priority Remaining Work

### 3.1 Catalog-Level Analytics Metadata

**Status:** ⚠️ Partially Complete — Needs Consolidation + Enforcement

**Purpose:** Explain why a pack works — without ML. This is what future investors, schools, and you will point to.

**What Exists:**
- `analytics` object on Pack entries (required for generated, optional for handcrafted)
- `analyticsSummary` on section index items (required for pack items)
- Basic fields: `goal`, `constraints`, `levers`, `successCriteria`, `commonMistakes`, `drillType`, `cognitiveLoad`
- Validator checks for analytics completeness and alignment with pack metadata

**What Is Missing:**
- **Derived metrics** not yet computed or enforced:
  - `slotSwitchDensity`: Fraction of prompts that change 2+ slots (currently computed but not stored)
  - `promptDiversityScore`: Deterministic diversity metric based on slot variation patterns
  - `scenarioCoverageScore`: Coverage percentage of scenario tokens across prompts
- **Required fields** not yet enforced:
  - `primaryStructure` (exists, must be required on all packs)
  - `variationSlots` (exists, must be required on all packs)
  - `estimatedCognitiveLoad` (exists as `cognitiveLoad`, must be standardized to `low`/`medium`/`high`)
  - `intendedOutcome` (new field, e.g., "A1 work intake readiness")

**Required Fields to Add/Enforce:**

| Field | Type | Description | Status |
|-------|------|-------------|--------|
| `primaryStructure` | string | Already exists, MUST be required | ⚠️ Enforce |
| `variationSlots` | string[] | Already exists, MUST be required | ⚠️ Enforce |
| `slotSwitchDensity` | number | Derived: % prompts with 2+ slot changes | ❌ Add |
| `promptDiversityScore` | number | Derived: deterministic diversity metric | ❌ Add |
| `scenarioCoverageScore` | number | Derived: % scenario tokens covered | ❌ Add |
| `estimatedCognitiveLoad` | enum | Standardize: `low`/`medium`/`high` | ⚠️ Standardize |
| `intendedOutcome` | string | New: e.g., "A1 work intake readiness" | ❌ Add |

**Validator Requirements:**
- Hard fail if `primaryStructure` missing on any pack
- Hard fail if `variationSlots` missing or empty on any pack
- Hard fail if derived metrics cannot be computed
- Hard fail if `intendedOutcome` missing on generated packs
- Warning if `estimatedCognitiveLoad` inconsistent with `variationSlots.length`

**Implementation Tasks:**
1. Add derived metric computation to `scripts/content-quality/computeAnalytics.ts`
2. Update `scripts/validate-content.ts` to enforce required analytics fields
3. Update `scripts/generate-pack.ts` to include all required fields
4. Migrate existing packs: `scripts/migrate-analytics.ts --workspace <ws>`
5. Update `scripts/generate-indexes.ts` to include derived metrics in `analyticsSummary`

**Acceptance Criteria:**
- ✅ All packs have `primaryStructure` and `variationSlots`
- ✅ All generated packs have complete analytics block with derived metrics
- ✅ Validator hard-fails on missing required fields
- ✅ Index items include derived metrics in `analyticsSummary`

**Evidence Artifacts:**
- Analytics completeness report: `npm run content:quality-report` shows % packs with complete analytics
- Derived metrics distribution in quality reports

---

### 3.2 Content Expansion Sprint (20–50 Packs)

**Status:** ✅ Ready, Not Executed at Scale

**Purpose:** Prove "This catalog is not random" with evidence artifacts.

**Preconditions (Already Met):**
- ✅ Pack generator: `scripts/generate-pack.ts`
- ✅ Quality gates: All gates implemented and enforced
- ✅ Review workflow: Approval gates and batch approval
- ✅ Sprint runner: `scripts/run-expansion-sprint.sh`
- ✅ Coherence reports: `scripts/catalog-coherence-report.ts`
- ✅ Deduplication: Cross-pack duplicate detection

**What's Left:**
1. **Run a real expansion sprint** (20-50 packs across 3-4 scenarios)
2. **Generate the Sprint Report** (`scripts/sprint-report.sh`)
3. **Commit the report as evidence** in `docs/reports/` or `content/meta/sprints/`

**Sprint Execution:**

```bash
# Example: Government Office A1 Sprint
./scripts/run-expansion-sprint.sh \
  --workspace de \
  --scenario government_office \
  --packs 20 \
  --drills 10 \
  --level A1 \
  --source template \
  --autoApproveTop 5 \
  --reviewer "Afees"
```

**Required Outputs:**

1. **Sprint Report** (`sprint.md` + `sprint.json`):
   - Total packs/drills generated
   - Quality gate pass rates
   - Duplicate scan results (must show 0 exact duplicates)
   - Scenario clustering distribution
   - Variation density distribution
   - Analytics completeness metrics

2. **Coherence Report** (`coherence.md` + `coherence.json`):
   - Scenario coverage percentages
   - Primary structure diversity
   - Risk scores per pack
   - Coverage gaps

3. **Quality Report** (`quality-report.json`):
   - Red/yellow/green status summary
   - Per-pack metrics
   - Aggregate distributions

4. **Release Checklist** (`RELEASE_CHECKLIST.md`):
   - Summary of generated content
   - Validation status
   - Approval gate status
   - Publish commands

**Acceptance Criteria:**
- ✅ Sprint generates 20-50 packs with 0 exact duplicates
- ✅ Strong scenario clustering (80%+ coverage for target scenarios)
- ✅ Variation density distribution shows multi-slot variation (30%+ prompts change 2+ slots)
- ✅ All approved packs pass quality gates
- ✅ Sprint report committed to `docs/reports/` or `content/meta/sprints/`
- ✅ Report proves non-randomness with metrics

**Evidence Artifacts:**
- Sprint report markdown file
- Sprint metrics JSON file
- Coherence report
- Quality report
- Release checklist

**This is the moment that proves: "This catalog is not random."**

---

## 4. Deferred (Explicitly Not Implemented)

### 4.1 PDF → Packs Scaling

**Status:** ⏸️ Paused (Intentionally)

**Decision:** No more code until app proves speaking retention.

**What's Left (Document Only):**
- Document known limitations
- Document supported PDF types
- Document explicit refusal cases
- Document manual review requirement

**Current State:**
- PDF ingestion infrastructure exists (`scripts/pdf-to-packs.ts`, `scripts/pdf-to-packs-batch.ts`)
- PDF profiles system exists (`content/meta/pdf-profiles/`)
- Token mining system exists (`scripts/pdf-ingestion/tokenMining.ts`)
- Intentionally paused pending app validation

**Documentation Tasks:**
1. Update `docs/content-pipeline/PDF_INGESTION.md` with:
   - Known limitations (PDF types that don't work)
   - Supported PDF types (structured forms, textbooks, etc.)
   - Explicit refusal cases (free-form text, images, etc.)
   - Manual review requirement for all PDF-generated packs

**No Implementation Needed:** Keep infrastructure, document limitations.

---

### 4.2 B2B / Curriculum Exports v2

**Status:** ⏸️ Explicitly Deferred

**Decision:** Skip for now. Backend schemas remain exportable.

**What's Left (Backend Side Only):**
- Keep placeholder docs (`docs/content-pipeline/B2B_EXPORTS.md`)
- Ensure content schemas remain exportable (they already are)

**Current State:**
- B2B export v1 exists (`scripts/export-curriculum.ts`)
- B2B export v2 exists (`scripts/export-curriculum-v2.ts`)
- Bundle schema exists (`docs/content-pipeline/B2B_EXPORT_SCHEMA.md`)
- SCORM-like manifest generation exists

**No Implementation Needed:** Schemas are already exportable. Keep docs as placeholders.

---

### 4.3 Telemetry Ingestion (Engine-Side)

**Status:** ⏸️ Deferred (FE-Assisted)

**Decision:** Backend groundwork exists, but not wired. FE will handle event logging.

**What Remains (Backend Side Only):**
- Define telemetry schema (no ML, no cloud compute)
- Define where this attaches (packId + sessionPlan step)
- Store only aggregates, not raw speech

**Current State:**
- Telemetry event schema exists (`content/contracts/telemetry/events.v1.schema.json`)
- Event types defined (`docs/telemetry/EVENTS_V1.md`)
- Content dimension table exists (`scripts/generate-content-dimension.ts`)
- Telemetry validation exists (`scripts/validate-telemetry.ts`)

**Backend Task = Schema + Contract Only:**
- ✅ Schema already defined
- ✅ Contract already documented
- ❌ No aggregation storage needed (FE will handle)
- ❌ No ingestion endpoint needed (FE will log directly)

**No Implementation Needed:** Schema and contract are complete. FE will implement logging.

---

## 5. Future-Ready Hooks (No Implementation Yet)

These are architectural hooks that enable future features but require no implementation now.

### 5.1 Pack Effectiveness Telemetry Schema

**Status:** ✅ Schema Defined, No Aggregation Storage

**Schema Fields (for future aggregation):**
- `attemptCount`: Number of attempts per pack/session
- `retryCount`: Number of retries per prompt
- `avgResponseLatency`: Average response time in seconds
- `completionRate`: Fraction of sessions completed

**Attachment Points:**
- `packId` + `sessionPlan.stepId` (granular)
- `packId` (aggregate)

**Storage:** FE will log events. Backend may aggregate later (not required now).

**Related:** See section 4.3 (Telemetry Ingestion).

---

### 5.2 B2B Export Compatibility

**Status:** ✅ Schemas Already Exportable

**Current State:**
- All content schemas are JSON (exportable)
- Bundle export scripts exist
- SCORM-like manifest generation exists

**Future Hooks:**
- Multi-workspace bundle exports
- Custom bundle metadata
- LMS integration endpoints

**No Implementation Needed:** Schemas are ready. Keep export scripts maintained.

---

### 5.3 Multi-Workspace Scaling

**Status:** ✅ Architecture Supports Multiple Workspaces

**Current State:**
- Workspace-based content structure (`content/v1/workspaces/{ws}/`)
- Workspace-specific catalogs
- Workspace-specific section indexes

**Future Hooks:**
- Cross-workspace analytics
- Workspace-level rollups
- Multi-language bundle exports

**No Implementation Needed:** Architecture already supports it.

---

### 5.4 Analytics Aggregation

**Status:** ✅ Hooks Exist, No Aggregation Logic

**Current State:**
- Analytics metadata on packs
- Catalog rollups (`scripts/generate-catalog-rollups.ts`)
- Content dimension table for telemetry joins

**Future Hooks:**
- Catalog-level analytics aggregation
- Scenario-level effectiveness metrics
- Structure-level performance correlation

**No Implementation Needed:** Hooks exist. Aggregation logic deferred until telemetry data available.

---

## 6. What Will NOT Be Built

These are explicit exclusions. Do not implement these features.

### 6.1 Free-Form Chat

**Exclusion:** No conversational AI or free-form chat interface.

**Rationale:** GetVerba is scenario-bound, prompt-based practice. Free-form chat dilutes the deterministic, structured learning model.

---

### 6.2 Grammar Lectures

**Exclusion:** No grammar explanation screens or lecture content.

**Rationale:** GetVerba is practice-first. Grammar is learned through pattern repetition, not explanation.

---

### 6.3 Vocabulary Dumps

**Exclusion:** No standalone vocabulary lists or flashcard systems.

**Rationale:** Vocabulary is learned in context (scenario-bound prompts), not as isolated lists.

---

### 6.4 Instructor-Dependent Flows

**Exclusion:** No flows that require human instructors or live teaching.

**Rationale:** GetVerba is self-service, deterministic practice. All content must be machine-validatable.

---

## 7. Drill Coverage Gaps

**Status:** ⚠️ Partial Coverage

**Current Coverage:**
- Basic verb endings
- Basic mechanics patterns

**Remaining Work:**

### 6.1 German Morphology "Struggle Packs"

**Purpose:** Target common German morphology pain points for A1-A2 learners.

**Required Packs:**

1. **Verb Conjugation Rhythms**
   - Regular verb patterns (ich/du/er/sie/es/wir/ihr/Sie)
   - Irregular verb patterns (sein, haben, werden)
   - Modal verb conjugation
   - Tag: `grammar`, `verbs`, `conjugation`

2. **Case Endings (Akkusativ/Dativ)**
   - Accusative case endings (den/die/das)
   - Dative case endings (dem/der/dem)
   - Preposition case requirements (für+Akk, mit+Dativ)
   - Tag: `grammar`, `cases`, `prepositions`

3. **Separable Verbs Timing**
   - Separable prefix placement (Ich stehe um 7 Uhr auf)
   - Inseparable prefix patterns
   - Tag: `grammar`, `verbs`, `separable`

**Treatment:**
- These should be treated as **mechanics libraries**, not home-screen heroes
- Tag with `mechanics` section
- Lower priority than scenario-bound packs
- Generate via template-based system (not PDF)

**Backend Task:**
- Generate + tag only (no special UI treatment)
- Use existing drill generation workflow
- Add to mechanics section index

**Implementation:**
- Create drill templates for each morphology type
- Generate via `scripts/new-drill.sh` or batch generation
- Tag appropriately for mechanics section

---

## 8. Release Evidence & Proof Artifacts

**Status:** ⚠️ Partially Complete

**Purpose:** Non-code proof baked into the repo. These are your defensive moat against "AI did this randomly."

**What Exists:**
- Quality reports: `reports/content-quality-report.{de,en}.json`
- Review reports: `docs/reports/content_review_report.md`
- PDF ingestion reports: `reports/pdf-ingestion/run-*/`

**What's Missing:**
- Expansion Sprint report (see section 3.2)
- Quality gate stats summary
- Duplicate scan output (committed to repo)
- Analytics completeness report

**Required Artifacts:**

1. **Expansion Sprint Report** (`docs/reports/expansion-sprint-{date}.md`):
   - Total packs generated
   - Duplicate scan results (0 exact duplicates)
   - Scenario clustering distribution
   - Variation density distribution
   - Quality gate pass rates

2. **Quality Gate Stats** (`docs/reports/quality-gate-stats.md`):
   - Per-gate pass/fail rates
   - Common failure modes
   - Improvement trends

3. **Duplicate Scan Output** (`docs/reports/duplicate-scan-{date}.json`):
   - Exact duplicate pairs (should be empty)
   - Near-duplicate pairs with similarity scores
   - Cross-pack duplicate analysis

4. **Analytics Completeness Report** (`docs/reports/analytics-completeness.md`):
   - % packs with complete analytics
   - Missing field distribution
   - Derived metrics coverage

**Commit Strategy:**
- Commit reports to `docs/reports/` after each sprint
- Include in release notes
- Reference in investor/school materials

**This is your proof that the catalog is deterministic and non-random.**

---

## 9. Appendix

### 9.1 Key Scripts

**Content Generation:**
- `scripts/generate-pack.ts`: Generate pack from template
- `scripts/generate-pack-from-template.ts`: Template-based generation
- `scripts/new-pack.sh`: Scaffold new pack
- `scripts/new-drill.sh`: Scaffold new drill

**Validation:**
- `scripts/validate-content.ts`: Schema + quality gate validation
- `scripts/content-quality-report.ts`: Quality metrics report
- `scripts/content-quality/dedupe.ts`: Duplicate detection

**Indexing:**
- `scripts/generate-indexes.ts`: Generate section indexes
- `scripts/generate-catalog-rollups.ts`: Generate catalog analytics rollups

**Review:**
- `scripts/approve-pack.sh`: Approve single pack
- `scripts/approve-batch.sh`: Batch approval
- `scripts/review-report.ts`: Review status report
- `scripts/check-approval-gate.ts`: Approval gate validation

**Sprints:**
- `scripts/run-expansion-sprint.sh`: Expansion sprint orchestrator
- `scripts/sprint-report.sh`: Sprint report generator
- `scripts/catalog-coherence-report.ts`: Coherence report

**Publishing:**
- `scripts/publish-content.sh`: Publish to R2
- `scripts/promote-staging.sh`: Promote staging to production
- `scripts/rollback.sh`: Rollback to previous version

**Exports:**
- `scripts/export-curriculum-v2.ts`: B2B curriculum export
- `scripts/export-catalog-analytics.ts`: Catalog analytics export

**Telemetry:**
- `scripts/generate-content-dimension.ts`: Content dimension table
- `scripts/validate-telemetry.ts`: Telemetry event validation

---

### 9.2 Key Validation Commands

```bash
# Full validation (schema + quality + expansion)
npm run content:validate

# Quality report only
npm run content:quality-report

# Deduplication check
npm run content:dedupe

# Review report
npm run content:report

# Coherence report
npm run content:coherence

# Generate indexes
npm run content:generate-indexes

# Generate catalog rollups
npm run content:generate-catalog-rollups

# Check approval gate
tsx scripts/check-approval-gate.ts

# Telemetry readiness
npm run content:telemetry-ready
```

---

### 9.3 Where Evidence Reports Live

**Reports Directory:**
- `docs/reports/`: Human-readable reports (markdown)
- `reports/`: JSON metrics and data files
- `content/meta/sprints/`: Sprint artifacts (reports, checklists, logs)

**Key Report Files:**
- `docs/reports/content_review_report.md`: Review status
- `reports/content-quality-report.{de,en}.json`: Quality metrics
- `reports/pdf-ingestion/run-*/`: PDF ingestion reports
- `content/meta/sprints/{timestamp}/sprint.md`: Sprint reports
- `content/meta/sprints/{timestamp}/coherence.md`: Coherence reports

**Commit Strategy:**
- Commit sprint reports to `docs/reports/` after each sprint
- Commit quality reports after major content updates
- Keep PDF ingestion reports in `reports/pdf-ingestion/` (not committed unless significant)

---

## 10. Summary

**Completed:** Core content engine is production-safe and deterministic. All quality gates, validation, and publishing workflows are implemented.

**High Priority:**
1. **Analytics Metadata**: Consolidate and enforce required fields + derived metrics
2. **Expansion Sprint**: Execute 20-50 pack sprint and commit proof artifacts

**Deferred:**
- PDF → Packs scaling (paused)
- B2B exports v2 (explicitly skipped)
- Telemetry ingestion (FE-assisted)

**Future Hooks:** Architecture supports multi-workspace, analytics aggregation, and B2B exports. No implementation needed until requirements emerge.

**What Won't Be Built:** Free-form chat, grammar lectures, vocabulary dumps, instructor-dependent flows.

**Remaining Work:** Product leverage and proof. The backend is ready for scale. Focus on analytics consolidation and sprint execution to prove non-randomness.

---

**This document is authoritative. Update it when completing high-priority items or when deferring new work.**

