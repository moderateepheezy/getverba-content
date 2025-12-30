#!/usr/bin/env tsx

/**
 * Telemetry Event Validator
 * 
 * Validates newline-delimited JSON event logs against:
 * - JSON Schema (events.v1.schema.json)
 * - Content dimension (join key validation)
 * - Session ordering rules
 * - Attempt index rules
 * 
 * Usage:
 *   npm run telemetry:validate -- --events ./tmp/events.ndjson --workspace de
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const EXPORTS_DIR = join(__dirname, '..', 'exports', 'analytics');
const SCHEMA_PATH = join(__dirname, '..', 'content', 'contracts', 'telemetry', 'events.v1.schema.json');

interface TelemetryEvent {
  eventVersion: number;
  eventName: string;
  occurredAt: string;
  deviceSessionId: string;
  appSessionId: string;
  workspace: string;
  entryUrl: string;
  kind: 'pack' | 'exam' | 'drill';
  contentId: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  scenario?: string | null;
  primaryStructure?: string | null;
  variationSlots?: string[] | null;
  stepId?: string;
  promptId?: string;
  attemptIndex?: number;
  result?: 'pass' | 'retry' | 'adjust' | 'skip';
  latencyMs?: number;
  abandonReason?: 'user_exit' | 'timeout' | 'error' | 'unknown';
  errorCode?: string;
  errorMessage?: string;
}

interface ContentDimension {
  version: string;
  generatedAt: string;
  gitSha: string;
  workspace: string;
  totalItems: number;
  items: Array<{
    workspace: string;
    kind: string;
    contentId: string;
    entryUrl: string;
    title: string;
    level: string;
    scenario: string | null;
    register: string | null;
    primaryStructure: string | null;
    variationSlots: string[] | null;
    promptCount: number;
    stepCount: number;
    estimatedMinutes: number;
  }>;
}

interface ValidationError {
  line: number;
  event: TelemetryEvent | null;
  field?: string;
  message: string;
}

interface SessionState {
  started: boolean;
  completed: boolean;
  abandoned: boolean;
  lastTimestamp: string | null;
  stepIds: Set<string>;
  promptAttempts: Map<string, number>; // promptId -> last attemptIndex
}

/**
 * Get git SHA for loading dimension
 */
function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Load content dimension
 */
function loadContentDimension(workspace: string): Map<string, ContentDimension['items'][0]> {
  const gitSha = getGitSha();
  const dimensionPath = join(EXPORTS_DIR, `content-dimension.${gitSha}.json`);
  
  // Try to load dimension file
  if (!existsSync(dimensionPath)) {
    console.warn(`⚠️  Content dimension not found at ${dimensionPath}`);
    console.warn(`   Run: npm run telemetry:dimension -- --workspace ${workspace}`);
    return new Map();
  }
  
  const dimension: ContentDimension = JSON.parse(readFileSync(dimensionPath, 'utf-8'));
  const lookup = new Map<string, ContentDimension['items'][0]>();
  
  for (const item of dimension.items) {
    const key = `${item.workspace}:${item.kind}:${item.contentId}`;
    lookup.set(key, item);
    // Also index by entryUrl
    lookup.set(item.entryUrl, item);
  }
  
  return lookup;
}

/**
 * Validate event against schema
 */
function validateEventSchema(event: any, line: number): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // Required base fields
  const requiredFields = [
    'eventVersion', 'eventName', 'occurredAt', 'deviceSessionId', 
    'appSessionId', 'workspace', 'entryUrl', 'kind', 'contentId', 'level'
  ];
  
  for (const field of requiredFields) {
    if (!(field in event)) {
      errors.push({
        line,
        event: null,
        field,
        message: `Missing required field: ${field}`
      });
    }
  }
  
  if (errors.length > 0) {
    return errors; // Don't continue validation if base fields are missing
  }
  
  // Validate eventVersion
  if (event.eventVersion !== 1) {
    errors.push({
      line,
      event: event as TelemetryEvent,
      field: 'eventVersion',
      message: `Invalid eventVersion: expected 1, got ${event.eventVersion}`
    });
  }
  
  // Validate eventName enum
  const validEventNames = [
    'content_session_started',
    'content_step_started',
    'content_prompt_attempted',
    'content_prompt_result',
    'content_session_completed',
    'content_session_abandoned'
  ];
  if (!validEventNames.includes(event.eventName)) {
    errors.push({
      line,
      event: event as TelemetryEvent,
      field: 'eventName',
      message: `Invalid eventName: ${event.eventName}. Must be one of: ${validEventNames.join(', ')}`
    });
  }
  
  // Validate timestamp format
  if (typeof event.occurredAt === 'string') {
    const timestamp = new Date(event.occurredAt);
    if (isNaN(timestamp.getTime())) {
      errors.push({
        line,
        event: event as TelemetryEvent,
        field: 'occurredAt',
        message: `Invalid timestamp format: ${event.occurredAt}`
      });
    }
  }
  
  // Validate kind enum
  const validKinds = ['pack', 'exam', 'drill'];
  if (!validKinds.includes(event.kind)) {
    errors.push({
      line,
      event: event as TelemetryEvent,
      field: 'kind',
      message: `Invalid kind: ${event.kind}. Must be one of: ${validKinds.join(', ')}`
    });
  }
  
  // Validate level enum
  const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  if (!validLevels.includes(event.level)) {
    errors.push({
      line,
      event: event as TelemetryEvent,
      field: 'level',
      message: `Invalid level: ${event.level}. Must be one of: ${validLevels.join(', ')}`
    });
  }
  
  // Validate entryUrl format
  if (typeof event.entryUrl === 'string') {
    const urlPattern = /^\/v1\/workspaces\/[^/]+\/(packs|exams|drills)\/[^/]+\/(pack|exam|drill)\.json$/;
    if (!urlPattern.test(event.entryUrl)) {
      errors.push({
        line,
        event: event as TelemetryEvent,
        field: 'entryUrl',
        message: `Invalid entryUrl format: ${event.entryUrl}`
      });
    }
  }
  
  // Event-specific validations
  if (event.eventName === 'content_step_started' || 
      event.eventName === 'content_prompt_attempted' || 
      event.eventName === 'content_prompt_result') {
    if (!event.stepId) {
      errors.push({
        line,
        event: event as TelemetryEvent,
        field: 'stepId',
        message: `Missing required field: stepId for event ${event.eventName}`
      });
    }
  }
  
  if (event.eventName === 'content_prompt_attempted' || 
      event.eventName === 'content_prompt_result') {
    if (!event.promptId) {
      errors.push({
        line,
        event: event as TelemetryEvent,
        field: 'promptId',
        message: `Missing required field: promptId for event ${event.eventName}`
      });
    }
    if (typeof event.attemptIndex !== 'number' || event.attemptIndex < 1) {
      errors.push({
        line,
        event: event as TelemetryEvent,
        field: 'attemptIndex',
        message: `Invalid attemptIndex: must be integer >= 1`
      });
    }
  }
  
  if (event.eventName === 'content_prompt_result') {
    const validResults = ['pass', 'retry', 'adjust', 'skip'];
    if (!validResults.includes(event.result)) {
      errors.push({
        line,
        event: event as TelemetryEvent,
        field: 'result',
        message: `Invalid result: ${event.result}. Must be one of: ${validResults.join(', ')}`
      });
    }
  }
  
  if (event.eventName === 'content_session_abandoned') {
    const validReasons = ['user_exit', 'timeout', 'error', 'unknown'];
    if (!validReasons.includes(event.abandonReason)) {
      errors.push({
        line,
        event: event as TelemetryEvent,
        field: 'abandonReason',
        message: `Invalid abandonReason: ${event.abandonReason}. Must be one of: ${validReasons.join(', ')}`
      });
    }
  }
  
  return errors;
}

/**
 * Validate join keys against content dimension
 */
function validateJoinKeys(
  event: TelemetryEvent,
  line: number,
  dimension: Map<string, ContentDimension['items'][0]>
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  const key = `${event.workspace}:${event.kind}:${event.contentId}`;
  const item = dimension.get(key) || dimension.get(event.entryUrl);
  
  if (!item) {
    errors.push({
      line,
      event,
      field: 'contentId',
      message: `Content not found in dimension: ${event.workspace}:${event.kind}:${event.contentId} (entryUrl: ${event.entryUrl})`
    });
  } else {
    // Validate level matches
    if (item.level !== event.level) {
      errors.push({
        line,
        event,
        field: 'level',
        message: `Level mismatch: event has ${event.level}, dimension has ${item.level}`
      });
    }
    
    // Validate entryUrl matches
    if (item.entryUrl !== event.entryUrl) {
      errors.push({
        line,
        event,
        field: 'entryUrl',
        message: `EntryUrl mismatch: event has ${event.entryUrl}, dimension has ${item.entryUrl}`
      });
    }
  }
  
  return errors;
}

/**
 * Validate session ordering
 */
function validateSessionOrdering(
  events: TelemetryEvent[],
  dimension: Map<string, ContentDimension['items'][0]>
): ValidationError[] {
  const errors: ValidationError[] = [];
  const sessions = new Map<string, SessionState>();
  
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const line = i + 1;
    const sessionId = event.appSessionId;
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        started: false,
        completed: false,
        abandoned: false,
        lastTimestamp: null,
        stepIds: new Set(),
        promptAttempts: new Map()
      });
    }
    
    const state = sessions.get(sessionId)!;
    
    // Check timestamp monotonicity
    if (state.lastTimestamp && event.occurredAt < state.lastTimestamp) {
      errors.push({
        line,
        event,
        message: `Timestamp not monotonic: ${event.occurredAt} < ${state.lastTimestamp}`
      });
    }
    state.lastTimestamp = event.occurredAt;
    
    // Validate event ordering
    if (event.eventName === 'content_session_started') {
      if (state.started) {
        errors.push({
          line,
          event,
          message: `Duplicate content_session_started for session ${sessionId}`
        });
      }
      state.started = true;
    } else if (event.eventName === 'content_session_completed' || 
               event.eventName === 'content_session_abandoned') {
      if (!state.started) {
        errors.push({
          line,
          event,
          message: `${event.eventName} without content_session_started`
        });
      }
      if (state.completed || state.abandoned) {
        errors.push({
          line,
          event,
          message: `Multiple completion/abandon events for session ${sessionId}`
        });
      }
      if (event.eventName === 'content_session_completed') {
        state.completed = true;
      } else {
        state.abandoned = true;
      }
    } else if (event.eventName === 'content_step_started') {
      if (!state.started) {
        errors.push({
          line,
          event,
          message: `content_step_started without content_session_started`
        });
      }
      if (state.completed || state.abandoned) {
        errors.push({
          line,
          event,
          message: `content_step_started after session completed/abandoned`
        });
      }
      if (event.stepId) {
        state.stepIds.add(event.stepId);
      }
    } else if (event.eventName === 'content_prompt_attempted' || 
               event.eventName === 'content_prompt_result') {
      if (!state.started) {
        errors.push({
          line,
          event,
          message: `${event.eventName} without content_session_started`
        });
      }
      if (state.completed || state.abandoned) {
        errors.push({
          line,
          event,
          message: `${event.eventName} after session completed/abandoned`
        });
      }
      
      // Validate attempt index
      if (event.promptId && typeof event.attemptIndex === 'number') {
        const lastAttempt = state.promptAttempts.get(event.promptId) || 0;
        if (event.attemptIndex !== lastAttempt + 1) {
          errors.push({
            line,
            event,
            message: `Invalid attemptIndex: expected ${lastAttempt + 1}, got ${event.attemptIndex} for prompt ${event.promptId}`
          });
        }
        
        if (event.eventName === 'content_prompt_result') {
          state.promptAttempts.set(event.promptId, event.attemptIndex);
        }
      }
    }
  }
  
  return errors;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const eventsIndex = args.indexOf('--events');
  const workspaceIndex = args.indexOf('--workspace');
  
  const eventsPath = eventsIndex >= 0 && args[eventsIndex + 1] 
    ? args[eventsIndex + 1] 
    : null;
  const workspace = workspaceIndex >= 0 && args[workspaceIndex + 1] 
    ? args[workspaceIndex + 1] 
    : null;
  
  if (!eventsPath) {
    console.error('❌ Error: --events argument required');
    console.error('Usage: npm run telemetry:validate -- --events ./tmp/events.ndjson --workspace de');
    process.exit(1);
  }
  
  if (!workspace) {
    console.error('❌ Error: --workspace argument required');
    console.error('Usage: npm run telemetry:validate -- --events ./tmp/events.ndjson --workspace de');
    process.exit(1);
  }
  
  if (!existsSync(eventsPath)) {
    console.error(`❌ Error: Events file not found: ${eventsPath}`);
    process.exit(1);
  }
  
  console.log(`🔍 Validating telemetry events: ${eventsPath}`);
  console.log(`   Workspace: ${workspace}`);
  
  // Load content dimension
  const dimension = loadContentDimension(workspace);
  if (dimension.size === 0) {
    console.warn('⚠️  Warning: Content dimension is empty. Join key validation will be skipped.');
  } else {
    console.log(`   Content dimension: ${dimension.size} items`);
  }
  
  // Load and parse events
  const eventsContent = readFileSync(eventsPath, 'utf-8');
  const lines = eventsContent.split('\n').filter(line => line.trim());
  const events: TelemetryEvent[] = [];
  const allErrors: ValidationError[] = [];
  
  // Parse and validate each event
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const lineContent = lines[i].trim();
    
    if (!lineContent) {
      continue;
    }
    
    let event: any;
    try {
      event = JSON.parse(lineContent);
    } catch (err: any) {
      allErrors.push({
        line,
        event: null,
        message: `Invalid JSON: ${err.message}`
      });
      continue;
    }
    
    // Schema validation
    const schemaErrors = validateEventSchema(event, line);
    allErrors.push(...schemaErrors);
    
    if (schemaErrors.length === 0) {
      events.push(event as TelemetryEvent);
      
      // Join key validation (only if schema is valid)
      if (dimension.size > 0) {
        const joinErrors = validateJoinKeys(event as TelemetryEvent, line, dimension);
        allErrors.push(...joinErrors);
      }
    }
  }
  
  // Session ordering validation
  const orderingErrors = validateSessionOrdering(events, dimension);
  allErrors.push(...orderingErrors);
  
  // Report results
  console.log(`\n📊 Validation Results:`);
  console.log(`   Total events: ${events.length}`);
  console.log(`   Total errors: ${allErrors.length}`);
  
  if (allErrors.length > 0) {
    console.log(`\n❌ Validation failed. First 10 errors:`);
    for (let i = 0; i < Math.min(10, allErrors.length); i++) {
      const err = allErrors[i];
      console.log(`   Line ${err.line}: ${err.message}`);
      if (err.field) {
        console.log(`      Field: ${err.field}`);
      }
    }
    if (allErrors.length > 10) {
      console.log(`   ... and ${allErrors.length - 10} more errors`);
    }
    process.exit(1);
  } else {
    console.log(`\n✅ All events validated successfully!`);
    process.exit(0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

