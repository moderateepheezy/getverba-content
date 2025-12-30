# Telemetry Events v1

This document defines the telemetry event contract for GetVerba pack effectiveness tracking.

## Overview

Events are logged as newline-delimited JSON (NDJSON), one event per line. Each event must conform to the JSON Schema defined in `content/contracts/telemetry/events.v1.schema.json`.

## Base Event Fields

All events include these required fields:

| Field | Type | Description |
|-------|------|-------------|
| `eventVersion` | integer | Always `1` for v1 events |
| `eventName` | string | Event type identifier |
| `occurredAt` | string (ISO 8601) | Timestamp when event occurred |
| `deviceSessionId` | string | Unique identifier for device session |
| `appSessionId` | string | Unique identifier for practice session (pack/exam/drill) |
| `workspace` | string | Workspace ID (e.g., "de", "en") |
| `entryUrl` | string | Content entry URL (e.g., "/v1/workspaces/de/packs/shopping_payment_options/pack.json") |
| `kind` | string enum | Content type: "pack", "exam", or "drill" |
| `contentId` | string | Content identifier (packId, examId, or drillId) |
| `level` | string enum | CEFR level: "A1", "A2", "B1", "B2", "C1", "C2" |
| `scenario` | string \| null | Scenario identifier (e.g., "shopping", "work") or null for non-context content |
| `primaryStructure` | string \| null | Primary grammatical structure or null |
| `variationSlots` | array \| null | Array of variation slot enums or null |

## Event Types

### content_session_started

Fires when a user starts a pack/exam/drill session.

**When**: User opens a pack/exam/drill and begins practice.

**Required Fields**: Base fields only.

**Example**:
```json
{
  "eventVersion": 1,
  "eventName": "content_session_started",
  "occurredAt": "2025-01-15T10:30:00.000Z",
  "deviceSessionId": "device-abc123",
  "appSessionId": "session-xyz789",
  "workspace": "de",
  "entryUrl": "/v1/workspaces/de/packs/shopping_payment_options/pack.json",
  "kind": "pack",
  "contentId": "shopping_payment_options",
  "level": "A1",
  "scenario": "shopping",
  "primaryStructure": "verb_position",
  "variationSlots": ["subject", "verb", "object", "modifier"]
}
```

### content_step_started

Fires when a user starts a step within a session.

**When**: User begins a step in the session plan.

**Required Fields**: Base fields + `stepId`.

**Example**:
```json
{
  "eventVersion": 1,
  "eventName": "content_step_started",
  "occurredAt": "2025-01-15T10:30:15.000Z",
  "deviceSessionId": "device-abc123",
  "appSessionId": "session-xyz789",
  "workspace": "de",
  "entryUrl": "/v1/workspaces/de/packs/shopping_payment_options/pack.json",
  "kind": "pack",
  "contentId": "shopping_payment_options",
  "level": "A1",
  "scenario": "shopping",
  "primaryStructure": "verb_position",
  "variationSlots": ["subject", "verb", "object", "modifier"],
  "stepId": "payment_methods"
}
```

### content_prompt_attempted

Fires when a user attempts a prompt (speaks/inputs).

**When**: User makes an attempt to respond to a prompt.

**Required Fields**: Base fields + `stepId`, `promptId`, `attemptIndex`.

**Optional Fields**: `latencyMs` (time from prompt display to attempt start).

**Example**:
```json
{
  "eventVersion": 1,
  "eventName": "content_prompt_attempted",
  "occurredAt": "2025-01-15T10:30:20.000Z",
  "deviceSessionId": "device-abc123",
  "appSessionId": "session-xyz789",
  "workspace": "de",
  "entryUrl": "/v1/workspaces/de/packs/shopping_payment_options/pack.json",
  "kind": "pack",
  "contentId": "shopping_payment_options",
  "level": "A1",
  "scenario": "shopping",
  "primaryStructure": "verb_position",
  "variationSlots": ["subject", "verb", "object", "modifier"],
  "stepId": "payment_methods",
  "promptId": "prompt-001",
  "attemptIndex": 1,
  "latencyMs": 2500
}
```

### content_prompt_result

Fires after a prompt attempt is evaluated.

**When**: System determines if attempt passed, needs retry, adjustment, or was skipped.

**Required Fields**: Base fields + `stepId`, `promptId`, `attemptIndex`, `result`.

**Optional Fields**: `latencyMs` (total time for attempt).

**Result Values**:
- `"pass"`: Attempt was successful
- `"retry"`: Attempt failed, user should try again
- `"adjust"`: Attempt was close but needs adjustment
- `"skip"`: User skipped this prompt

**Example**:
```json
{
  "eventVersion": 1,
  "eventName": "content_prompt_result",
  "occurredAt": "2025-01-15T10:30:25.000Z",
  "deviceSessionId": "device-abc123",
  "appSessionId": "session-xyz789",
  "workspace": "de",
  "entryUrl": "/v1/workspaces/de/packs/shopping_payment_options/pack.json",
  "kind": "pack",
  "contentId": "shopping_payment_options",
  "level": "A1",
  "scenario": "shopping",
  "primaryStructure": "verb_position",
  "variationSlots": ["subject", "verb", "object", "modifier"],
  "stepId": "payment_methods",
  "promptId": "prompt-001",
  "attemptIndex": 1,
  "result": "pass",
  "latencyMs": 3500
}
```

### content_session_completed

Fires when a user completes a pack/exam/drill session.

**When**: User finishes all steps in the session.

**Required Fields**: Base fields only.

**Example**:
```json
{
  "eventVersion": 1,
  "eventName": "content_session_completed",
  "occurredAt": "2025-01-15T10:45:00.000Z",
  "deviceSessionId": "device-abc123",
  "appSessionId": "session-xyz789",
  "workspace": "de",
  "entryUrl": "/v1/workspaces/de/packs/shopping_payment_options/pack.json",
  "kind": "pack",
  "contentId": "shopping_payment_options",
  "level": "A1",
  "scenario": "shopping",
  "primaryStructure": "verb_position",
  "variationSlots": ["subject", "verb", "object", "modifier"]
}
```

### content_session_abandoned

Fires when a user abandons a session before completion.

**When**: User exits session early (not completing all steps).

**Required Fields**: Base fields + `abandonReason`.

**Optional Fields**: `errorCode`, `errorMessage`, `stepId` (step where abandonment occurred).

**Abandon Reason Values**:
- `"user_exit"`: User explicitly exited
- `"timeout"`: Session timed out
- `"error"`: An error occurred
- `"unknown"`: Unknown reason

**Example**:
```json
{
  "eventVersion": 1,
  "eventName": "content_session_abandoned",
  "occurredAt": "2025-01-15T10:32:00.000Z",
  "deviceSessionId": "device-abc123",
  "appSessionId": "session-xyz789",
  "workspace": "de",
  "entryUrl": "/v1/workspaces/de/packs/shopping_payment_options/pack.json",
  "kind": "pack",
  "contentId": "shopping_payment_options",
  "level": "A1",
  "scenario": "shopping",
  "primaryStructure": "verb_position",
  "variationSlots": ["subject", "verb", "object", "modifier"],
  "abandonReason": "user_exit",
  "stepId": "payment_methods"
}
```

## Event Ordering

Within a single `appSessionId`, events must follow this order:

1. `content_session_started` (first)
2. `content_step_started` (one or more)
3. `content_prompt_attempted` (one or more per step)
4. `content_prompt_result` (one per attempt)
5. `content_session_completed` OR `content_session_abandoned` (last)

## Attempt Index Rules

- `attemptIndex` starts at 1 for the first attempt on a prompt
- `attemptIndex` increments for each retry of the same prompt
- Each `content_prompt_attempted` must be followed by a `content_prompt_result` with the same `attemptIndex`

## Timestamp Requirements

- `occurredAt` must be ISO 8601 format (e.g., "2025-01-15T10:30:00.000Z")
- Timestamps must be monotonic within a session (each event's timestamp >= previous event's timestamp)
- Timestamps should be accurate to millisecond precision

## Validation

Events are validated against the JSON Schema and content dimension table:

1. **Schema validation**: Event structure matches schema
2. **Join key validation**: `contentId`, `entryUrl`, `workspace` exist in content dimension
3. **Session validation**: Events within a session follow ordering rules
4. **Attempt index validation**: `attemptIndex` increments correctly per prompt

## Related Documentation

- [Telemetry README](./README.md) - How to log events and run validation
- [Content Dimension](./README.md#content-dimension) - Content lookup table
- [Event Schema](../contracts/telemetry/events.v1.schema.json) - JSON Schema definition

