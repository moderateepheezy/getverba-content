# Telemetry Contract

This document defines the telemetry event contract for pack effectiveness measurement. The content pipeline emits stable identifiers that enable reliable event-to-content joining without requiring content changes for telemetry implementation.

## Overview

All entry documents (packs, drills, exams) include three telemetry identifiers:

1. **`contentId`**: Stable identifier that survives file moves and renames
   - Format: `{workspace}:{kind}:{id}`
   - Example: `"de:pack:work_1"`
   - Deterministic from workspace, kind, and entry id

2. **`contentHash`**: SHA256 hash of normalized entry JSON
   - Excludes review fields (`reviewedAt`, `reviewer`) that change on approval
   - Excludes provenance timestamps (`generatedAt`) that change on regeneration
   - Deterministic: same content produces same hash

3. **`revisionId`**: First 12 characters of `contentHash`
   - Changes when content meaningfully changes
   - Enables version comparison in telemetry

## Event Names

The frontend should emit the following events:

### `pack_started`

Emitted when a user begins a pack session.

**Required Fields:**
- `contentId` (string): Entry content ID (e.g., `"de:pack:work_1"`)
- `revisionId` (string): Entry revision ID (12 hex chars)
- `scenario` (string): Pack scenario identifier
- `level` (string): CEFR level (A1, A2, B1, B2, C1, C2)
- `primaryStructure` (string): Primary grammatical structure identifier
- `timestamp` (string): ISO 8601 timestamp

**Optional Fields:**
- `sessionId` (string): Unique session identifier
- `userId` (string): User identifier (if available)

**Example:**
```json
{
  "event": "pack_started",
  "contentId": "de:pack:work_1",
  "revisionId": "a1b2c3d4e5f6",
  "scenario": "work",
  "level": "A2",
  "primaryStructure": "modal_verb_requests",
  "timestamp": "2025-01-15T10:30:00Z",
  "sessionId": "session-123",
  "userId": "user-456"
}
```

### `prompt_attempted`

Emitted when a user attempts a prompt (submits an answer).

**Required Fields:**
- `contentId` (string): Entry content ID
- `revisionId` (string): Entry revision ID
- `promptId` (string): Prompt identifier from pack entry
- `attemptCount` (number): Number of attempts for this prompt (1, 2, 3, ...)
- `latencyMs` (number): Time from prompt display to submission (milliseconds)
- `outcome` (string): `"correct"`, `"incorrect"`, or `"abandoned"`
- `timestamp` (string): ISO 8601 timestamp

**Optional Fields:**
- `sessionId` (string): Session identifier
- `userId` (string): User identifier
- `hintUsed` (boolean): Whether user requested a hint
- `audioPlayed` (boolean): Whether user played audio

**Example:**
```json
{
  "event": "prompt_attempted",
  "contentId": "de:pack:work_1",
  "revisionId": "a1b2c3d4e5f6",
  "promptId": "prompt-001",
  "attemptCount": 1,
  "latencyMs": 3500,
  "outcome": "correct",
  "timestamp": "2025-01-15T10:30:15Z",
  "sessionId": "session-123",
  "hintUsed": false,
  "audioPlayed": true
}
```

### `pack_completed`

Emitted when a user completes a pack session (finishes all prompts).

**Required Fields:**
- `contentId` (string): Entry content ID
- `revisionId` (string): Entry revision ID
- `scenario` (string): Pack scenario identifier
- `level` (string): CEFR level
- `primaryStructure` (string): Primary grammatical structure identifier
- `totalPrompts` (number): Total number of prompts in pack
- `correctCount` (number): Number of correct attempts
- `totalAttempts` (number): Total number of attempts (including retries)
- `totalLatencyMs` (number): Total time spent in pack (milliseconds)
- `timestamp` (string): ISO 8601 timestamp

**Optional Fields:**
- `sessionId` (string): Session identifier
- `userId` (string): User identifier
- `completionRate` (number): Percentage of prompts completed correctly (0-100)

**Example:**
```json
{
  "event": "pack_completed",
  "contentId": "de:pack:work_1",
  "revisionId": "a1b2c3d4e5f6",
  "scenario": "work",
  "level": "A2",
  "primaryStructure": "modal_verb_requests",
  "totalPrompts": 12,
  "correctCount": 10,
  "totalAttempts": 14,
  "totalLatencyMs": 420000,
  "timestamp": "2025-01-15T10:37:00Z",
  "sessionId": "session-123",
  "completionRate": 83.3
}
```

### `pack_abandoned`

Emitted when a user abandons a pack session (leaves before completion).

**Required Fields:**
- `contentId` (string): Entry content ID
- `revisionId` (string): Entry revision ID
- `scenario` (string): Pack scenario identifier
- `level` (string): CEFR level
- `primaryStructure` (string): Primary grammatical structure identifier
- `promptsCompleted` (number): Number of prompts completed before abandonment
- `totalPrompts` (number): Total number of prompts in pack
- `abandonedAtPromptId` (string | null): Prompt ID where user abandoned (null if before first prompt)
- `timestamp` (string): ISO 8601 timestamp

**Optional Fields:**
- `sessionId` (string): Session identifier
- `userId` (string): User identifier
- `timeSpentMs` (number): Time spent in pack before abandonment (milliseconds)

**Example:**
```json
{
  "event": "pack_abandoned",
  "contentId": "de:pack:work_1",
  "revisionId": "a1b2c3d4e5f6",
  "scenario": "work",
  "level": "A2",
  "primaryStructure": "modal_verb_requests",
  "promptsCompleted": 5,
  "totalPrompts": 12,
  "abandonedAtPromptId": "prompt-006",
  "timestamp": "2025-01-15T10:32:00Z",
  "sessionId": "session-123",
  "timeSpentMs": 120000
}
```

## Joining Events to Content

**Always join by `contentId + revisionId`** to ensure you're analyzing the correct content version.

### Why Both Fields?

- **`contentId`**: Identifies the entry (stable across moves/renames)
- **`revisionId`**: Identifies the content version (changes when content changes)

### Example Query Pattern

```sql
-- Join events to content metadata
SELECT 
  e.event,
  e.contentId,
  e.revisionId,
  c.scenario,
  c.level,
  c.primaryStructure,
  c.analytics.focus,
  e.timestamp
FROM events e
JOIN content_entries c 
  ON e.contentId = c.contentId 
  AND e.revisionId = c.revisionId
WHERE e.event = 'pack_completed'
  AND c.scenario = 'work'
  AND c.level = 'A2';
```

### Version Comparison

To compare effectiveness across content versions:

```sql
-- Compare completion rates across revisions
SELECT 
  contentId,
  revisionId,
  COUNT(*) as completion_count,
  AVG(completionRate) as avg_completion_rate
FROM pack_completed_events
WHERE contentId = 'de:pack:work_1'
GROUP BY contentId, revisionId
ORDER BY revisionId;
```

## Content Pipeline Guarantees

1. **Deterministic IDs**: Same entry always produces same `contentId`, `contentHash`, and `revisionId`
2. **Stable IDs**: `contentId` survives file moves and renames (based on workspace + kind + id)
3. **Version Tracking**: `revisionId` changes only when content meaningfully changes (excludes review/provenance timestamps)
4. **Validation**: All entries must have telemetry IDs before shipping (validator enforces)

## Implementation Notes

### Frontend Implementation

1. Read `contentId` and `revisionId` from entry documents or section index items
2. Include both fields in all telemetry events
3. Use `contentId` for filtering/grouping, `revisionId` for version comparison

### Backend Analysis

1. Always join events to content by `contentId + revisionId`
2. Use `revisionId` to track content evolution over time
3. Use `contentId` for stable entry-level aggregations

### Content Updates

When content is updated:
- `contentId` remains the same (stable identifier)
- `contentHash` changes (content changed)
- `revisionId` changes (first 12 chars of new hash)

This enables:
- Tracking effectiveness of content improvements
- A/B testing across content versions
- Rollback analysis (comparing old vs new content performance)

## Schema Reference

### Entry Document Fields

All entry documents (packs, drills, exams) include:

```typescript
{
  contentId: string;      // Format: "{workspace}:{kind}:{id}"
  contentHash: string;    // SHA256 hex (64 chars)
  revisionId: string;    // First 12 chars of contentHash
  // ... other fields
}
```

### Section Index Item Fields

Section index items include:

```typescript
{
  contentId: string;      // From entry document
  revisionId: string;    // From entry document
  // ... other fields
}
```

## Validation

The content validator enforces:

1. ✅ All entries must have `contentId`, `contentHash`, and `revisionId`
2. ✅ `contentId` must match pattern: `{workspace}:{kind}:{id}`
3. ✅ `contentHash` must be valid SHA256 hex (64 chars)
4. ✅ `revisionId` must be first 12 chars of `contentHash`

Run validation:
```bash
npm run content:validate
```

## Backfilling Existing Content

To add telemetry IDs to existing entries:

```bash
# Dry run (preview changes)
tsx scripts/backfill-telemetry-ids.ts --dry-run

# Apply changes
tsx scripts/backfill-telemetry-ids.ts

# For specific workspace
tsx scripts/backfill-telemetry-ids.ts --workspace de
```

After backfilling, regenerate indexes:
```bash
npm run content:generate-indexes
```

