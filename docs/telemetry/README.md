# Telemetry System

This directory contains the telemetry event contract, validation tools, and reporting system for GetVerba pack effectiveness tracking.

## Overview

The telemetry system enables offline-first, deterministic measurement of pack effectiveness without requiring a server or analytics backend. Events are logged as newline-delimited JSON (NDJSON) and validated/reported using local scripts.

## Architecture

```
┌─────────────┐
│   Frontend  │  Logs events as NDJSON
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Telemetry Pipeline (Backend Repo)  │
├─────────────────────────────────────┤
│  1. Content Dimension Generator      │  Builds lookup table from content
│  2. Event Validator                  │  Validates schema + join keys
│  3. Report Generator                 │  Computes effectiveness metrics
└─────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   Reports   │  JSON + Markdown summaries
└─────────────┘
```

## Quick Start

### 1. Generate Content Dimension

Before validating events, generate a content dimension lookup table:

```bash
npm run telemetry:dimension -- --workspace de
```

This creates `exports/analytics/content-dimension.<gitSha>.json` with all packs/exams/drills indexed by `(workspace, kind, contentId)`.

### 2. Log Events (Frontend)

Frontend should log events as newline-delimited JSON, one event per line:

```typescript
// Example: Logging a session start event
const event = {
  eventVersion: 1,
  eventName: 'content_session_started',
  occurredAt: new Date().toISOString(),
  deviceSessionId: getDeviceSessionId(),
  appSessionId: generateSessionId(),
  workspace: 'de',
  entryUrl: '/v1/workspaces/de/packs/shopping_payment_options/pack.json',
  kind: 'pack',
  contentId: 'shopping_payment_options',
  level: 'A1',
  scenario: 'shopping',
  primaryStructure: 'verb_position',
  variationSlots: ['subject', 'verb', 'object']
};

// Append to events.ndjson file
fs.appendFileSync('events.ndjson', JSON.stringify(event) + '\n');
```

See [EVENTS_V1.md](./EVENTS_V1.md) for complete event schema and examples.

### 3. Validate Events

Validate event logs against schema and content dimension:

```bash
npm run telemetry:validate -- --events ./tmp/events.ndjson --workspace de
```

The validator checks:
- ✅ Schema correctness (required fields, enums, types)
- ✅ Join key validation (contentId exists in dimension)
- ✅ Timestamp monotonicity (within sessions)
- ✅ Event ordering (started → steps → completed/abandoned)
- ✅ Attempt index sequencing (increments per prompt)

### 4. Generate Report

Generate effectiveness reports from validated events:

```bash
npm run telemetry:report -- --events ./tmp/events.ndjson --workspace de
```

This creates:
- `exports/analytics/report.<gitSha>.json` - Machine-readable metrics
- `exports/analytics/report.<gitSha>.md` - Human-readable summary

## Event Schema

All events must conform to the JSON Schema defined in `content/contracts/telemetry/events.v1.schema.json`.

### Base Fields (Required)

Every event includes:

| Field | Type | Description |
|-------|------|-------------|
| `eventVersion` | integer | Always `1` |
| `eventName` | string | Event type identifier |
| `occurredAt` | string (ISO 8601) | Timestamp |
| `deviceSessionId` | string | Device session identifier |
| `appSessionId` | string | Practice session identifier |
| `workspace` | string | Workspace ID (e.g., "de") |
| `entryUrl` | string | Content entry URL |
| `kind` | enum | "pack" \| "exam" \| "drill" |
| `contentId` | string | Content identifier |
| `level` | enum | "A1" \| "A2" \| "B1" \| "B2" \| "C1" \| "C2" |
| `scenario` | string \| null | Scenario identifier |
| `primaryStructure` | string \| null | Primary grammatical structure |
| `variationSlots` | array \| null | Variation slot enums |

### Event Types

1. **`content_session_started`** - User starts a pack/exam/drill
2. **`content_step_started`** - User starts a step
3. **`content_prompt_attempted`** - User attempts a prompt
4. **`content_prompt_result`** - Prompt attempt result (pass/retry/adjust/skip)
5. **`content_session_completed`** - User completes session
6. **`content_session_abandoned`** - User abandons session

See [EVENTS_V1.md](./EVENTS_V1.md) for detailed event documentation.

## Content Dimension

The content dimension is a lookup table generated from published content. It maps `(workspace, kind, contentId)` to content metadata for join key validation.

### Generation

```bash
npm run telemetry:dimension -- --workspace de
```

### Structure

```json
{
  "version": "v1",
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "gitSha": "abc123",
  "workspace": "de",
  "totalItems": 45,
  "items": [
    {
      "workspace": "de",
      "kind": "pack",
      "contentId": "shopping_payment_options",
      "entryUrl": "/v1/workspaces/de/packs/shopping_payment_options/pack.json",
      "title": "Shopping Payment Options",
      "level": "A1",
      "scenario": "shopping",
      "register": null,
      "primaryStructure": "verb_position",
      "variationSlots": ["subject", "verb", "object"],
      "promptCount": 12,
      "stepCount": 3,
      "estimatedMinutes": 15
    }
  ]
}
```

## Validation Rules

### Schema Validation

- Required fields must be present
- Enums must match allowed values
- Timestamps must be valid ISO 8601
- `entryUrl` must match pattern: `/v1/workspaces/{ws}/(packs|exams|drills)/{id}/(pack|exam|drill).json`

### Join Key Validation

- `contentId` must exist in content dimension
- `level` must match dimension
- `entryUrl` must match dimension

### Session Ordering

Within a single `appSessionId`:
1. `content_session_started` must occur first
2. `content_step_started` / `content_prompt_attempted` / `content_prompt_result` must occur after start
3. `content_session_completed` OR `content_session_abandoned` must occur last
4. Timestamps must be monotonic (non-decreasing)

### Attempt Index Rules

- `attemptIndex` starts at 1 for first attempt on a prompt
- `attemptIndex` increments for each retry
- Each `content_prompt_attempted` must be followed by `content_prompt_result` with same `attemptIndex`

## Report Metrics

The telemetry report computes:

### Summary Metrics

- **Sessions Started**: Total number of sessions initiated
- **Sessions Completed**: Total number of sessions completed
- **Sessions Abandoned**: Total number of sessions abandoned
- **Overall Completion Rate**: `sessionsCompleted / sessionsStarted`
- **Average Attempts per Prompt**: Average retries across all prompts

### Pack-Level Metrics

For each pack:
- Completion rate
- Average attempts per prompt (difficulty proxy)
- Median time to completion
- Abandon rate by step ID (where users drop off)
- Top hard prompts (highest average attempts)

### Top Hard Packs

Ranked by average attempts per prompt (highest = hardest).

## Use Cases

### 1. Time-to-Confidence Proof

Track how quickly users master packs:
- Low completion rate → pack may be too hard
- High retries → prompts may need adjustment
- Abandon points → identify friction steps

### 2. Content Quality Validation

Prove content is not random/generic:
- Consistent completion rates across similar packs
- Predictable difficulty progression (A1 → A2 → B1)
- Scenario-specific effectiveness (e.g., "shopping" packs perform better than generic)

### 3. B2B Curriculum Sharing

Export reports alongside curriculum exports:
- Show completion rates to schools/employers
- Demonstrate pack effectiveness
- Identify areas for improvement

## Integration with Review Harness

Telemetry validation can be integrated into the content review process:

```bash
# In promote-staging.sh or similar
npm run content:validate
npm run content:quality
npm run content:review
npm run telemetry:dimension -- --workspace de
# ... publish content ...
# Frontend logs events ...
npm run telemetry:validate -- --events ./events.ndjson --workspace de
npm run telemetry:report -- --events ./events.ndjson --workspace de
```

## Testing

Run unit tests:

```bash
npx tsx scripts/validate-telemetry.test.ts
```

Tests cover:
- ✅ Valid session flows
- ✅ Missing required fields
- ✅ Invalid enums
- ✅ Non-monotonic timestamps
- ✅ Invalid attempt index sequences

## Constraints

- **No network calls**: All validation/reporting is local
- **No third-party analytics SDK**: Pure Node.js scripts
- **Deterministic**: Same inputs produce same outputs
- **Zero-cost**: No server infrastructure required

## Related Documentation

- [EVENTS_V1.md](./EVENTS_V1.md) - Complete event schema and examples
- [Event Schema](../contracts/telemetry/events.v1.schema.json) - JSON Schema definition
- [Content Pipeline](../content-pipeline/README.md) - Content generation and validation
- [EXPORTS.md](../content-pipeline/EXPORTS.md) - B2B curriculum exports

