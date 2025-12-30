# Telemetry Event Schema (v1)

This document defines the canonical schema for practice attempt telemetry events. These events enable backend analytics to measure pack effectiveness without requiring ML models.

## Schema Version

All telemetry events must include `schemaVersion: 1`.

## Event Type

**Event Name**: `practice_attempt`

This event is logged by the frontend when a user completes a practice attempt for a prompt within a pack session.

## Event Structure

```json
{
  "schemaVersion": 1,
  "event": "practice_attempt",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "workspace": "de",
  "userAnonId": "anon_abc123xyz",
  "content": {
    "packId": "work_1",
    "packVersion": "1.0.0",
    "entryUrl": "/v1/workspaces/de/packs/work_1/pack.json",
    "sessionPlanVersion": 1,
    "stepId": "opening",
    "promptId": "prompt-001",
    "attemptIndex": 0
  },
  "result": {
    "mode": "speech",
    "pass": true,
    "latencyMs": 840,
    "asrConfidence": 0.87,
    "retryCount": 1
  },
  "signals": {
    "scenario": "government_office",
    "level": "A1",
    "primaryStructure": "verb_second_position",
    "variationSlots": ["subject", "verb", "object"]
  }
}
```

## Required Fields

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | number | Must be `1` |
| `event` | string | Must be `"practice_attempt"` |
| `timestamp` | string | ISO-8601 timestamp (UTC) |
| `workspace` | string | Workspace code (e.g., `"de"`, `"en"`) |
| `userAnonId` | string | Anonymous user identifier (FE responsibility) |
| `content` | object | Content addressing information (see below) |
| `result` | object | Attempt result data (see below) |
| `signals` | object | Content metadata signals (see below) |

### Content Object

| Field | Type | Description |
|-------|------|-------------|
| `packId` | string | Pack identifier (matches pack `id` field) |
| `packVersion` | string | Pack semantic version (e.g., `"1.0.0"`) |
| `entryUrl` | string | Canonical entry URL (e.g., `"/v1/workspaces/de/packs/work_1/pack.json"`) |
| `sessionPlanVersion` | number | Session plan version (must match `sessionPlan.version`) |
| `stepId` | string | Step identifier (must match `sessionPlan.steps[].id`) |
| `promptId` | string | Prompt identifier (must match `prompts[].id`) |
| `attemptIndex` | number | Zero-based attempt index within the session (0 = first attempt) |

### Result Object

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | Input mode: `"speech"` or `"typing"` |
| `pass` | boolean | Whether the attempt passed validation |
| `latencyMs` | number | Time from prompt display to submission (milliseconds, 0-60000) |
| `asrConfidence` | number | ASR confidence score (0.0-1.0, only for `mode: "speech"`) |
| `retryCount` | number | Number of retries before this attempt (0 = first attempt) |

### Signals Object

| Field | Type | Description |
|-------|------|-------------|
| `scenario` | string | Content scenario (matches pack `scenario` field) |
| `level` | string | CEFR level (matches pack `level` field) |
| `primaryStructure` | string | Primary grammatical structure (matches pack `primaryStructure` field) |
| `variationSlots` | string[] | Variation slots array (matches pack `variationSlots` field) |

## Stable Attempt Addressing

The `content` object provides a deterministic addressing key for each attempt:

```
(workspace, packId, sessionPlanVersion, stepId, promptId, attemptIndex)
```

This key uniquely identifies:
- **Which pack** the user is practicing
- **Which version** of the pack (via `packVersion`)
- **Which step** in the session plan
- **Which prompt** within that step
- **Which attempt** (first, second, etc.) within the session

### Stability Requirements

1. **packId**: Must be stable (never changes for a pack)
2. **packVersion**: Semantic version that increments on content changes
3. **sessionPlanVersion**: Must match `sessionPlan.version` in pack (currently always `1`)
4. **stepId**: Must be stable string (matches `sessionPlan.steps[].id`)
5. **promptId**: Must be stable string (matches `prompts[].id`)
6. **attemptIndex**: Zero-based index within the session (0 = first attempt for this prompt)

## Frontend Responsibilities

The frontend is responsible for:

1. **Generating `userAnonId`**: Create and persist an anonymous user identifier
2. **Tracking `attemptIndex`**: Count attempts within a session (reset per session)
3. **Measuring `latencyMs`**: Time from prompt display to submission
4. **Determining `pass`**: Whether the attempt met validation criteria
5. **Capturing `mode`**: Whether user used speech or typing
6. **Extracting `asrConfidence`**: From ASR service (if `mode: "speech"`)
7. **Counting `retryCount`**: Number of retries before this attempt

## Backend Responsibilities

The backend (content system) is responsible for:

1. **Defining stable IDs**: All `packId`, `stepId`, and `promptId` values must be stable
2. **Versioning packs**: `packVersion` must follow semver (x.y.z)
3. **Publishing contract**: This schema document and JSON schema validator
4. **Enforcing stability**: Validator ensures IDs don't change

## Validation Rules

1. **schemaVersion**: Must be exactly `1`
2. **event**: Must be exactly `"practice_attempt"`
3. **timestamp**: Must be valid ISO-8601 UTC timestamp
4. **workspace**: Must be non-empty string (2-10 chars)
5. **userAnonId**: Must be non-empty string (3-100 chars)
6. **content.packId**: Must match a valid pack `id`
7. **content.packVersion**: Must be valid semver (x.y.z)
8. **content.entryUrl**: Must match canonical pattern `/v1/workspaces/{workspace}/packs/{packId}/pack.json`
9. **content.sessionPlanVersion**: Must be `1` (current version)
10. **content.stepId**: Must exist in pack's `sessionPlan.steps[].id`
11. **content.promptId**: Must exist in pack's `prompts[].id`
12. **content.attemptIndex**: Must be non-negative integer (0-100)
13. **result.mode**: Must be `"speech"` or `"typing"`
14. **result.pass**: Must be boolean
15. **result.latencyMs**: Must be number (0-60000)
16. **result.asrConfidence**: Must be number (0.0-1.0) if `mode: "speech"`, optional if `mode: "typing"`
17. **result.retryCount**: Must be non-negative integer (0-10)
18. **signals.scenario**: Must match pack's `scenario` field
19. **signals.level**: Must match pack's `level` field
20. **signals.primaryStructure**: Must match pack's `primaryStructure` field
21. **signals.variationSlots**: Must match pack's `variationSlots` array

## Example Events

### Successful Speech Attempt (First Try)

```json
{
  "schemaVersion": 1,
  "event": "practice_attempt",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "workspace": "de",
  "userAnonId": "anon_abc123xyz",
  "content": {
    "packId": "work_1",
    "packVersion": "1.0.0",
    "entryUrl": "/v1/workspaces/de/packs/work_1/pack.json",
    "sessionPlanVersion": 1,
    "stepId": "opening",
    "promptId": "prompt-001",
    "attemptIndex": 0
  },
  "result": {
    "mode": "speech",
    "pass": true,
    "latencyMs": 840,
    "asrConfidence": 0.87,
    "retryCount": 0
  },
  "signals": {
    "scenario": "government_office",
    "level": "A1",
    "primaryStructure": "verb_second_position",
    "variationSlots": ["subject", "verb", "object"]
  }
}
```

### Failed Typing Attempt (After Retry)

```json
{
  "schemaVersion": 1,
  "event": "practice_attempt",
  "timestamp": "2024-01-15T10:31:12.456Z",
  "workspace": "de",
  "userAnonId": "anon_abc123xyz",
  "content": {
    "packId": "work_1",
    "packVersion": "1.0.0",
    "entryUrl": "/v1/workspaces/de/packs/work_1/pack.json",
    "sessionPlanVersion": 1,
    "stepId": "opening",
    "promptId": "prompt-001",
    "attemptIndex": 1
  },
  "result": {
    "mode": "typing",
    "pass": false,
    "latencyMs": 3200,
    "retryCount": 1
  },
  "signals": {
    "scenario": "government_office",
    "level": "A1",
    "primaryStructure": "verb_second_position",
    "variationSlots": ["subject", "verb", "object"]
  }
}
```

## Analytics Interpretation

The telemetry events enable backend analytics to answer:

1. **Pack Effectiveness**: What % of attempts pass? What's the average latency?
2. **Failure Patterns**: Which `keyFailureModes` from `analytics.keyFailureModes` correlate with failures?
3. **Success Criteria**: Do attempts meet `analytics.successDefinition` (e.g., "2 consecutive passes")?
4. **Latency Targets**: Do attempts meet `analytics.targetLatencyMs`?
5. **Mode Comparison**: Do speech vs typing modes show different success rates?
6. **Progression**: How does `attemptIndex` correlate with success rate?

## Related Documentation

- [Pack Schema](./PACK_SCHEMA.md) - Defines pack structure with stable IDs
- [Session Plan Schema](./SESSION_PLAN_SCHEMA.md) - Defines session plan structure
- [Entry URL Schema](./ENTRY_URL_SCHEMA.md) - Defines entry URL patterns

