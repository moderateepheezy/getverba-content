/**
 * Generate ingestion reports
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { IngestReport, QualityGateResult, DraftPack } from './ingestTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXPORTS_DIR = join(__dirname, '..', '..', 'exports');

/**
 * Run quality gates on a draft pack
 */
export function runQualityGates(pack: DraftPack): QualityGateResult {
  const failures: QualityGateResult['failures'] = [];
  const warnings: QualityGateResult['warnings'] = [];
  
  if (!pack.prompts || pack.prompts.length === 0) {
    failures.push({
      packId: pack.id,
      rule: 'prompt_count',
      reason: 'Pack has no prompts'
    });
    return { passed: false, failures, warnings };
  }
  
  // Check each prompt
  for (const prompt of pack.prompts) {
    // Token requirement
    const requiredTokens = pack.scenario ? getScenarioTokens(pack.scenario) : [];
    if (requiredTokens.length > 0) {
      const tokenCount = countScenarioTokens(prompt.text, requiredTokens);
      if (tokenCount < 2) {
        failures.push({
          promptId: prompt.id,
          packId: pack.id,
          rule: 'scenario_tokens',
          reason: `Prompt contains only ${tokenCount} scenario token(s), requires at least 2`
        });
      }
    }
    
    // Banned phrases
    if (containsBannedPhrases(prompt.text)) {
      failures.push({
        promptId: prompt.id,
        packId: pack.id,
        rule: 'banned_phrases',
        reason: 'Prompt contains banned phrase'
      });
    }
    
    // Length check
    if (prompt.text.length < 12 || prompt.text.length > 140) {
      failures.push({
        promptId: prompt.id,
        packId: pack.id,
        rule: 'prompt_length',
        reason: `Prompt length ${prompt.text.length} is outside valid range (12-140)`
      });
    }
    
    // Required fields for government_office or A2+
    const isGovernmentOffice = pack.scenario === 'government_office';
    const isA2OrHigher = ['A2', 'B1', 'B2', 'C1', 'C2'].includes(pack.level.toUpperCase());
    if (isGovernmentOffice || isA2OrHigher) {
      if (!prompt.natural_en) {
        failures.push({
          promptId: prompt.id,
          packId: pack.id,
          rule: 'natural_en_required',
          reason: 'natural_en is required for government_office scenario or A2+ level'
        });
      }
    }
  }
  
  // Multi-slot variation check
  const multiSlotCount = pack.prompts.filter(p => 
    p.slotsChanged && p.slotsChanged.length >= 2
  ).length;
  const multiSlotRate = pack.prompts.length > 0 ? multiSlotCount / pack.prompts.length : 0;
  
  if (multiSlotRate < 0.3) {
    failures.push({
      packId: pack.id,
      rule: 'multi_slot_variation',
      reason: `Only ${(multiSlotRate * 100).toFixed(1)}% of prompts have 2+ slotsChanged, requires at least 30%`
    });
  }
  
  // Register consistency
  if (pack.register === 'formal') {
    const hasFormalMarker = pack.prompts.some(p => 
      /\bSie\b/.test(p.text) || /\bIhnen\b/.test(p.text)
    );
    if (!hasFormalMarker) {
      failures.push({
        packId: pack.id,
        rule: 'register_consistency',
        reason: 'Formal register requires at least one prompt with "Sie" or "Ihnen"'
      });
    }
  }
  
  // Concreteness markers
  const concretenessCount = pack.prompts.filter(p => hasConcretenessMarker(p.text)).length;
  if (concretenessCount < 2) {
    failures.push({
      packId: pack.id,
      rule: 'concreteness_markers',
      reason: `Only ${concretenessCount} prompt(s) have concreteness markers, requires at least 2`
    });
  }
  
  // Distinct verbs check
  const verbs = new Set<string>();
  for (const prompt of pack.prompts) {
    const words = prompt.text.split(/\s+/);
    if (words.length >= 2) {
      // Try to extract verb (second word if starts with pronoun)
      const firstWord = words[0].toLowerCase();
      if (['ich', 'du', 'wir', 'sie', 'er', 'es', 'ihr', 'Sie'].includes(firstWord)) {
        verbs.add(words[1].toLowerCase());
      }
    }
  }
  
  if (verbs.size < 2) {
    warnings.push({
      packId: pack.id,
      rule: 'verb_variation',
      reason: `Only ${verbs.size} distinct verb(s) found, recommend at least 2`
    });
  }
  
  const passed = failures.length === 0;
  return { passed, failures, warnings };
}

/**
 * Count scenario tokens in text
 */
function countScenarioTokens(text: string, requiredTokens: string[]): number {
  const textLower = text.toLowerCase();
  let count = 0;
  for (const token of requiredTokens) {
    if (textLower.includes(token.toLowerCase())) {
      count++;
    }
  }
  return count;
}

/**
 * Check for banned phrases
 */
function containsBannedPhrases(text: string): boolean {
  const denylist = [
    "in today's lesson",
    "let's practice",
    "this sentence",
    "i like to",
    "the quick brown fox",
    "lorem ipsum"
  ];
  const textLower = text.toLowerCase();
  return denylist.some(phrase => textLower.includes(phrase.toLowerCase()));
}

/**
 * Check for concreteness marker
 */
function hasConcretenessMarker(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/[€$]/.test(text)) return true;
  if (/\d{1,2}:\d{2}/.test(text)) return true;
  const weekdays = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
  const textLower = text.toLowerCase();
  return weekdays.some(day => textLower.includes(day));
}

/**
 * Get scenario tokens
 */
function getScenarioTokens(scenario: string): string[] {
  const tokenDicts: Record<string, string[]> = {
    work: ['meeting', 'shift', 'manager', 'schedule', 'invoice', 'deadline', 'office', 'colleague', 'project', 'task', 'besprechung', 'termin', 'büro', 'kollege', 'projekt', 'aufgabe', 'arbeit'],
    restaurant: ['menu', 'order', 'bill', 'reservation', 'waiter', 'table', 'food', 'drink', 'kitchen', 'service', 'speisekarte', 'bestellen', 'kellner', 'tisch', 'essen', 'trinken'],
    shopping: ['price', 'buy', 'cost', 'store', 'cashier', 'payment', 'discount', 'receipt', 'cart', 'checkout', 'kaufen', 'laden', 'kasse', 'zahlung', 'rabatt', 'quittung'],
    doctor: ['appointment', 'symptom', 'prescription', 'medicine', 'treatment', 'diagnosis', 'health', 'patient', 'clinic', 'examination'],
    housing: ['apartment', 'rent', 'lease', 'landlord', 'tenant', 'deposit', 'utilities', 'furniture', 'neighborhood', 'address'],
    government_office: ['termin', 'formular', 'anmeldung', 'bescheinigung', 'unterlagen', 'ausweis', 'amt', 'beamte', 'sachbearbeiter', 'aufenthaltserlaubnis', 'pass', 'bürgeramt', 'ausländeramt', 'jobcenter', 'krankenkasse'],
    casual_greeting: ['greeting', 'hello', 'goodbye', 'morning', 'evening', 'day', 'see', 'meet', 'friend', 'time']
  };
  return tokenDicts[scenario] || [];
}

/**
 * Generate ingestion report
 */
export function generateReport(
  packs: DraftPack[],
  workspace: string,
  scenario: string,
  level: string,
  source: string,
  sourcePath?: string,
  sourceUrl?: string,
  chunkCount: number = 0,
  signalCount: number = 0
): IngestReport {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  
  // Run quality gates on all packs
  const qualityResults = packs.map(pack => runQualityGates(pack));
  const allFailures = qualityResults.flatMap(r => r.failures);
  const allWarnings = qualityResults.flatMap(r => r.warnings);
  
  const totalPrompts = packs.reduce((sum, p) => sum + (p.prompts?.length || 0), 0);
  const failedPrompts = allFailures.filter(f => f.promptId).length;
  const passedPrompts = totalPrompts - failedPrompts;
  const passRate = totalPrompts > 0 ? passedPrompts / totalPrompts : 0;
  
  // Generate recommended edits
  const recommendedEdits: string[] = [];
  
  if (allFailures.length > 0) {
    recommendedEdits.push(`Fix ${allFailures.length} quality gate failure(s)`);
  }
  
  const tokenFailures = allFailures.filter(f => f.rule === 'scenario_tokens');
  if (tokenFailures.length > 0) {
    recommendedEdits.push(`Add scenario tokens to ${tokenFailures.length} prompt(s)`);
  }
  
  const bannedPhraseFailures = allFailures.filter(f => f.rule === 'banned_phrases');
  if (bannedPhraseFailures.length > 0) {
    recommendedEdits.push(`Remove banned phrases from ${bannedPhraseFailures.length} prompt(s)`);
  }
  
  const multiSlotFailures = allFailures.filter(f => f.rule === 'multi_slot_variation');
  if (multiSlotFailures.length > 0) {
    recommendedEdits.push(`Increase multi-slot variation in affected pack(s)`);
  }
  
  const report: IngestReport = {
    timestamp,
    workspace,
    scenario,
    level,
    source: source as any,
    sourcePath,
    sourceUrl,
    generatedPacks: packs.map(pack => ({
      packId: pack.id,
      title: pack.title,
      promptCount: pack.prompts?.length || 0,
      qualityGatePassed: qualityResults.find(r => 
        r.failures.some(f => f.packId === pack.id)
      )?.passed !== false
    })),
    qualityGateSummary: {
      totalPrompts,
      passedPrompts,
      failedPrompts,
      passRate,
      failures: allFailures,
      warnings: allWarnings
    },
    recommendedEdits,
    chunkCount,
    signalCount
  };
  
  return report;
}

/**
 * Write report to files
 */
export function writeReport(report: IngestReport): void {
  if (!existsSync(EXPORTS_DIR)) {
    mkdirSync(EXPORTS_DIR, { recursive: true });
  }
  
  const timestamp = report.timestamp;
  const jsonPath = join(EXPORTS_DIR, `ingest-report.${report.workspace}.${report.scenario}.${timestamp}.json`);
  const mdPath = join(EXPORTS_DIR, `ingest-report.${report.workspace}.${report.scenario}.${timestamp}.md`);
  
  // Write JSON
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  
  // Write Markdown
  const md = generateMarkdownReport(report);
  writeFileSync(mdPath, md, 'utf-8');
  
  console.log(`\n📊 Report written:`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   Markdown: ${mdPath}`);
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(report: IngestReport): string {
  const lines: string[] = [];
  
  lines.push(`# Ingestion Report`);
  lines.push('');
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Workspace:** ${report.workspace}`);
  lines.push(`**Scenario:** ${report.scenario}`);
  lines.push(`**Level:** ${report.level}`);
  lines.push(`**Source:** ${report.source}`);
  if (report.sourcePath) lines.push(`**Source Path:** ${report.sourcePath}`);
  if (report.sourceUrl) lines.push(`**Source URL:** ${report.sourceUrl}`);
  lines.push('');
  
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`- **Generated Packs:** ${report.generatedPacks.length}`);
  lines.push(`- **Total Prompts:** ${report.qualityGateSummary.totalPrompts}`);
  lines.push(`- **Passed Prompts:** ${report.qualityGateSummary.passedPrompts}`);
  lines.push(`- **Failed Prompts:** ${report.qualityGateSummary.failedPrompts}`);
  lines.push(`- **Pass Rate:** ${(report.qualityGateSummary.passRate * 100).toFixed(1)}%`);
  lines.push(`- **Chunks Processed:** ${report.chunkCount}`);
  lines.push(`- **Signals Extracted:** ${report.signalCount}`);
  lines.push('');
  
  lines.push(`## Generated Packs`);
  lines.push('');
  for (const pack of report.generatedPacks) {
    const status = pack.qualityGatePassed ? '✅' : '❌';
    lines.push(`- ${status} **${pack.packId}**: ${pack.title} (${pack.promptCount} prompts)`);
  }
  lines.push('');
  
  if (report.qualityGateSummary.failures.length > 0) {
    lines.push(`## Quality Gate Failures`);
    lines.push('');
    for (const failure of report.qualityGateSummary.failures) {
      const location = failure.promptId 
        ? `Prompt ${failure.promptId} in pack ${failure.packId}`
        : `Pack ${failure.packId}`;
      lines.push(`- **${failure.rule}** (${location}): ${failure.reason}`);
    }
    lines.push('');
  }
  
  if (report.qualityGateSummary.warnings.length > 0) {
    lines.push(`## Warnings`);
    lines.push('');
    for (const warning of report.qualityGateSummary.warnings) {
      const location = warning.promptId 
        ? `Prompt ${warning.promptId} in pack ${warning.packId}`
        : `Pack ${warning.packId}`;
      lines.push(`- **${warning.rule}** (${location}): ${warning.reason}`);
    }
    lines.push('');
  }
  
  if (report.recommendedEdits.length > 0) {
    lines.push(`## Recommended Manual Edits`);
    lines.push('');
    for (const edit of report.recommendedEdits) {
      lines.push(`- ${edit}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

