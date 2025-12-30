#!/usr/bin/env tsx

/**
 * Telemetry Report Generator
 * 
 * Analyzes telemetry events and generates effectiveness reports:
 * - Completion rates per pack
 * - Retries per prompt (difficulty proxy)
 * - Time-to-first-pass
 * - Abandon points by step
 * - Top hard packs
 * 
 * Usage:
 *   npm run telemetry:report -- --events ./tmp/events.ndjson --workspace de
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXPORTS_DIR = join(__dirname, '..', 'exports', 'analytics');

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
  level: string;
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

interface SessionMetrics {
  appSessionId: string;
  contentId: string;
  entryUrl: string;
  startedAt: string | null;
  completedAt: string | null;
  abandonedAt: string | null;
  abandonReason: string | null;
  abandonStepId: string | null;
  totalSteps: number;
  completedSteps: Set<string>;
  promptAttempts: Map<string, number[]>; // promptId -> attempt indices
  promptResults: Map<string, string[]>; // promptId -> results
  timeToCompletion: number | null; // milliseconds
}

interface PackMetrics {
  contentId: string;
  entryUrl: string;
  title?: string;
  level: string;
  scenario: string | null;
  primaryStructure: string | null;
  sessionsStarted: number;
  sessionsCompleted: number;
  sessionsAbandoned: number;
  completionRate: number;
  avgAttemptsPerPrompt: number;
  medianTimeToCompletion: number | null;
  abandonRateByStepId: Record<string, number>;
  topHardPrompts: Array<{ promptId: string; avgAttempts: number }>;
}

interface Report {
  version: 'v1';
  generatedAt: string;
  gitSha: string;
  workspace: string;
  totalEvents: number;
  totalSessions: number;
  summary: {
    sessionsStarted: number;
    sessionsCompleted: number;
    sessionsAbandoned: number;
    overallCompletionRate: number;
    avgAttemptsPerPrompt: number;
  };
  packMetrics: PackMetrics[];
  topHardPacks: Array<{ contentId: string; avgAttemptsPerPrompt: number }>;
}

/**
 * Get git SHA for versioning
 */
function getGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Parse events and compute session metrics
 */
function computeSessionMetrics(events: TelemetryEvent[]): Map<string, SessionMetrics> {
  const sessions = new Map<string, SessionMetrics>();
  
  for (const event of events) {
    const sessionId = event.appSessionId;
    
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        appSessionId: sessionId,
        contentId: event.contentId,
        entryUrl: event.entryUrl,
        startedAt: null,
        completedAt: null,
        abandonedAt: null,
        abandonReason: null,
        abandonStepId: null,
        totalSteps: 0,
        completedSteps: new Set(),
        promptAttempts: new Map(),
        promptResults: new Map(),
        timeToCompletion: null
      });
    }
    
    const metrics = sessions.get(sessionId)!;
    
    if (event.eventName === 'content_session_started') {
      metrics.startedAt = event.occurredAt;
    } else if (event.eventName === 'content_session_completed') {
      metrics.completedAt = event.occurredAt;
      if (metrics.startedAt) {
        const start = new Date(metrics.startedAt).getTime();
        const end = new Date(event.occurredAt).getTime();
        metrics.timeToCompletion = end - start;
      }
    } else if (event.eventName === 'content_session_abandoned') {
      metrics.abandonedAt = event.occurredAt;
      metrics.abandonReason = event.abandonReason || 'unknown';
      metrics.abandonStepId = event.stepId || null;
    } else if (event.eventName === 'content_step_started') {
      if (event.stepId) {
        metrics.completedSteps.add(event.stepId);
        metrics.totalSteps = Math.max(metrics.totalSteps, metrics.completedSteps.size);
      }
    } else if (event.eventName === 'content_prompt_attempted') {
      if (event.promptId && event.attemptIndex) {
        if (!metrics.promptAttempts.has(event.promptId)) {
          metrics.promptAttempts.set(event.promptId, []);
        }
        metrics.promptAttempts.get(event.promptId)!.push(event.attemptIndex);
      }
    } else if (event.eventName === 'content_prompt_result') {
      if (event.promptId && event.result) {
        if (!metrics.promptResults.has(event.promptId)) {
          metrics.promptResults.set(event.promptId, []);
        }
        metrics.promptResults.get(event.promptId)!.push(event.result);
      }
    }
  }
  
  return sessions;
}

/**
 * Compute pack-level metrics
 */
function computePackMetrics(
  sessions: Map<string, SessionMetrics>,
  events: TelemetryEvent[]
): Map<string, PackMetrics> {
  const packMetrics = new Map<string, PackMetrics>();
  
  // Group sessions by contentId
  const sessionsByPack = new Map<string, SessionMetrics[]>();
  for (const session of sessions.values()) {
    if (!sessionsByPack.has(session.contentId)) {
      sessionsByPack.set(session.contentId, []);
    }
    sessionsByPack.get(session.contentId)!.push(session);
  }
  
  // Get pack metadata from first event
  const packMetadata = new Map<string, {
    entryUrl: string;
    level: string;
    scenario: string | null;
    primaryStructure: string | null;
  }>();
  
  for (const event of events) {
    if (!packMetadata.has(event.contentId)) {
      packMetadata.set(event.contentId, {
        entryUrl: event.entryUrl,
        level: event.level,
        scenario: event.scenario || null,
        primaryStructure: event.primaryStructure || null
      });
    }
  }
  
  // Compute metrics per pack
  for (const [contentId, packSessions] of sessionsByPack.entries()) {
    const metadata = packMetadata.get(contentId)!;
    
    let sessionsStarted = 0;
    let sessionsCompleted = 0;
    let sessionsAbandoned = 0;
    const timeToCompletions: number[] = [];
    const abandonSteps: string[] = [];
    const promptAttemptCounts: Map<string, number[]> = new Map();
    
    for (const session of packSessions) {
      if (session.startedAt) {
        sessionsStarted++;
      }
      if (session.completedAt) {
        sessionsCompleted++;
        if (session.timeToCompletion !== null) {
          timeToCompletions.push(session.timeToCompletion);
        }
      }
      if (session.abandonedAt) {
        sessionsAbandoned++;
        if (session.abandonStepId) {
          abandonSteps.push(session.abandonStepId);
        }
      }
      
      // Aggregate prompt attempts
      for (const [promptId, attempts] of session.promptAttempts.entries()) {
        if (!promptAttemptCounts.has(promptId)) {
          promptAttemptCounts.set(promptId, []);
        }
        promptAttemptCounts.get(promptId)!.push(attempts.length);
      }
    }
    
    // Compute abandon rate by step
    const abandonRateByStepId: Record<string, number> = {};
    const stepAbandonCounts = new Map<string, number>();
    for (const stepId of abandonSteps) {
      stepAbandonCounts.set(stepId, (stepAbandonCounts.get(stepId) || 0) + 1);
    }
    for (const [stepId, count] of stepAbandonCounts.entries()) {
      abandonRateByStepId[stepId] = count / sessionsAbandoned;
    }
    
    // Compute average attempts per prompt
    let totalAttempts = 0;
    let totalPrompts = 0;
    for (const attempts of promptAttemptCounts.values()) {
      for (const attemptCount of attempts) {
        totalAttempts += attemptCount;
        totalPrompts++;
      }
    }
    const avgAttemptsPerPrompt = totalPrompts > 0 ? totalAttempts / totalPrompts : 0;
    
    // Compute top hard prompts
    const promptAverages: Array<{ promptId: string; avgAttempts: number }> = [];
    for (const [promptId, attempts] of promptAttemptCounts.entries()) {
      const sum = attempts.reduce((a, b) => a + b, 0);
      const avg = attempts.length > 0 ? sum / attempts.length : 0;
      promptAverages.push({ promptId, avgAttempts: avg });
    }
    promptAverages.sort((a, b) => b.avgAttempts - a.avgAttempts);
    const topHardPrompts = promptAverages.slice(0, 10);
    
    // Compute median time to completion
    timeToCompletions.sort((a, b) => a - b);
    const medianTimeToCompletion = timeToCompletions.length > 0
      ? timeToCompletions[Math.floor(timeToCompletions.length / 2)]
      : null;
    
    packMetrics.set(contentId, {
      contentId,
      entryUrl: metadata.entryUrl,
      level: metadata.level,
      scenario: metadata.scenario,
      primaryStructure: metadata.primaryStructure,
      sessionsStarted,
      sessionsCompleted,
      sessionsAbandoned,
      completionRate: sessionsStarted > 0 ? sessionsCompleted / sessionsStarted : 0,
      avgAttemptsPerPrompt,
      medianTimeToCompletion,
      abandonRateByStepId,
      topHardPrompts
    });
  }
  
  return packMetrics;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report: Report): string {
  const lines: string[] = [];
  
  lines.push('# Telemetry Effectiveness Report');
  lines.push('');
  lines.push(`**Generated**: ${report.generatedAt}`);
  lines.push(`**Git SHA**: ${report.gitSha}`);
  lines.push(`**Workspace**: ${report.workspace}`);
  lines.push(`**Total Events**: ${report.totalEvents}`);
  lines.push(`**Total Sessions**: ${report.totalSessions}`);
  lines.push('');
  
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Sessions Started**: ${report.summary.sessionsStarted}`);
  lines.push(`- **Sessions Completed**: ${report.summary.sessionsCompleted}`);
  lines.push(`- **Sessions Abandoned**: ${report.summary.sessionsAbandoned}`);
  lines.push(`- **Overall Completion Rate**: ${(report.summary.overallCompletionRate * 100).toFixed(1)}%`);
  lines.push(`- **Average Attempts per Prompt**: ${report.summary.avgAttemptsPerPrompt.toFixed(2)}`);
  lines.push('');
  
  lines.push('## Top Hard Packs');
  lines.push('');
  lines.push('| Pack ID | Avg Attempts per Prompt |');
  lines.push('|---------|-------------------------|');
  for (const pack of report.topHardPacks.slice(0, 10)) {
    lines.push(`| ${pack.contentId} | ${pack.avgAttemptsPerPrompt.toFixed(2)} |`);
  }
  lines.push('');
  
  lines.push('## Pack Metrics');
  lines.push('');
  for (const pack of report.packMetrics) {
    lines.push(`### ${pack.contentId}`);
    lines.push('');
    lines.push(`- **Level**: ${pack.level}`);
    lines.push(`- **Scenario**: ${pack.scenario || 'N/A'}`);
    lines.push(`- **Primary Structure**: ${pack.primaryStructure || 'N/A'}`);
    lines.push(`- **Sessions Started**: ${pack.sessionsStarted}`);
    lines.push(`- **Sessions Completed**: ${pack.sessionsCompleted}`);
    lines.push(`- **Sessions Abandoned**: ${pack.sessionsAbandoned}`);
    lines.push(`- **Completion Rate**: ${(pack.completionRate * 100).toFixed(1)}%`);
    lines.push(`- **Avg Attempts per Prompt**: ${pack.avgAttemptsPerPrompt.toFixed(2)}`);
    if (pack.medianTimeToCompletion !== null) {
      const minutes = Math.round(pack.medianTimeToCompletion / 60000);
      lines.push(`- **Median Time to Completion**: ${minutes} minutes`);
    }
    
    if (Object.keys(pack.abandonRateByStepId).length > 0) {
      lines.push(`- **Abandon Points**:`);
      for (const [stepId, rate] of Object.entries(pack.abandonRateByStepId)) {
        lines.push(`  - ${stepId}: ${(rate * 100).toFixed(1)}%`);
      }
    }
    
    if (pack.topHardPrompts.length > 0) {
      lines.push(`- **Top Hard Prompts**:`);
      for (const prompt of pack.topHardPrompts.slice(0, 5)) {
        lines.push(`  - ${prompt.promptId}: ${prompt.avgAttempts.toFixed(2)} avg attempts`);
      }
    }
    
    lines.push('');
  }
  
  return lines.join('\n');
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
    console.error('Usage: npm run telemetry:report -- --events ./tmp/events.ndjson --workspace de');
    process.exit(1);
  }
  
  if (!workspace) {
    console.error('❌ Error: --workspace argument required');
    console.error('Usage: npm run telemetry:report -- --events ./tmp/events.ndjson --workspace de');
    process.exit(1);
  }
  
  if (!existsSync(eventsPath)) {
    console.error(`❌ Error: Events file not found: ${eventsPath}`);
    process.exit(1);
  }
  
  console.log(`📊 Generating telemetry report: ${eventsPath}`);
  console.log(`   Workspace: ${workspace}`);
  
  // Load and parse events
  const eventsContent = readFileSync(eventsPath, 'utf-8');
  const lines = eventsContent.split('\n').filter(line => line.trim());
  const events: TelemetryEvent[] = [];
  
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      events.push(event as TelemetryEvent);
    } catch (err: any) {
      console.warn(`⚠️  Skipping invalid JSON line: ${err.message}`);
    }
  }
  
  console.log(`   Parsed ${events.length} events`);
  
  // Compute metrics
  const sessionMetrics = computeSessionMetrics(events);
  const packMetrics = computePackMetrics(sessionMetrics, events);
  
  // Compute summary
  let totalSessionsStarted = 0;
  let totalSessionsCompleted = 0;
  let totalSessionsAbandoned = 0;
  let totalAttempts = 0;
  let totalPrompts = 0;
  
  for (const pack of packMetrics.values()) {
    totalSessionsStarted += pack.sessionsStarted;
    totalSessionsCompleted += pack.sessionsCompleted;
    totalSessionsAbandoned += pack.sessionsAbandoned;
    totalAttempts += pack.avgAttemptsPerPrompt * pack.sessionsStarted;
    totalPrompts += pack.sessionsStarted;
  }
  
  const overallCompletionRate = totalSessionsStarted > 0 
    ? totalSessionsCompleted / totalSessionsStarted 
    : 0;
  const avgAttemptsPerPrompt = totalPrompts > 0 
    ? totalAttempts / totalPrompts 
    : 0;
  
  // Build report
  const packMetricsArray = Array.from(packMetrics.values());
  packMetricsArray.sort((a, b) => b.avgAttemptsPerPrompt - a.avgAttemptsPerPrompt);
  
  const topHardPacks = packMetricsArray
    .slice(0, 10)
    .map(p => ({ contentId: p.contentId, avgAttemptsPerPrompt: p.avgAttemptsPerPrompt }));
  
  const gitSha = getGitSha();
  const report: Report = {
    version: 'v1',
    generatedAt: new Date().toISOString(),
    gitSha,
    workspace,
    totalEvents: events.length,
    totalSessions: sessionMetrics.size,
    summary: {
      sessionsStarted: totalSessionsStarted,
      sessionsCompleted: totalSessionsCompleted,
      sessionsAbandoned: totalSessionsAbandoned,
      overallCompletionRate,
      avgAttemptsPerPrompt
    },
    packMetrics: packMetricsArray,
    topHardPacks
  };
  
  // Ensure exports directory exists
  if (!existsSync(EXPORTS_DIR)) {
    require('fs').mkdirSync(EXPORTS_DIR, { recursive: true });
  }
  
  // Write JSON report
  const jsonPath = join(EXPORTS_DIR, `report.${gitSha}.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`✅ Generated JSON report: ${jsonPath}`);
  
  // Write Markdown report
  const markdown = generateMarkdownReport(report);
  const mdPath = join(EXPORTS_DIR, `report.${gitSha}.md`);
  writeFileSync(mdPath, markdown, 'utf-8');
  console.log(`✅ Generated Markdown report: ${mdPath}`);
  
  console.log(`\n📈 Summary:`);
  console.log(`   Sessions: ${totalSessionsStarted} started, ${totalSessionsCompleted} completed, ${totalSessionsAbandoned} abandoned`);
  console.log(`   Completion Rate: ${(overallCompletionRate * 100).toFixed(1)}%`);
  console.log(`   Avg Attempts per Prompt: ${avgAttemptsPerPrompt.toFixed(2)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

