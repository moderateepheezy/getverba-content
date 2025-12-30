/**
 * Reporting
 * 
 * Generates JSON and Markdown reports for PDF ingestion runs.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ExtractionResult } from './extract.js';
import type { NormalizationResult } from './normalize.js';
import type { SegmentationResult } from './segment.js';
import type { QualityCheckResult } from './quality.js';

export interface RunReport {
  runId: string;
  timestamp: string;
  input: {
    pdfPath: string;
    pdfFingerprint: string;
    workspace: string;
    section: string;
    scenario: string;
    level: string;
    register: string;
    titlePrefix: string;
    maxPacks: number;
    packSize: number;
    ocr: 'on' | 'off';
    dryRun: boolean;
  };
  extraction: {
    method: 'text' | 'ocr';
    pageCount: number;
    totalChars: number;
    avgCharsPerPage: number;
    warnings: string[];
  };
  normalization: {
    actions: string[];
    headerFooterLinesRemoved: number;
  };
  frontMatter?: {
    skipped: boolean;
    skipUntilPageIndex: number;
    frontMatterPages: number[];
    firstContentPage: number;
    reasons: string[];
  };
  scenarioDiscovery?: {
    scenarios: Array<{
      scenario: string;
      totalTokenHits: number;
      candidatesWithAnyHit: number;
      candidatesWithMinHits: number;
      topMatchedTokens: Array<{ token: string; count: number }>;
      bestWindow?: {
        startPage: number;
        endPage: number;
        qualifiedCandidates: number;
        totalTokenHits: number;
      };
    }>;
    rankedScenarios: string[];
    recommendedScenarios: string[];
  };
  windowSearch?: {
    mode: 'search' | 'range';
    pageRange?: string;
    bestWindow?: {
      startPage: number;
      endPage: number;
      qualifiedCandidates: number;
      totalTokenHits: number;
      anchorHits: number;
      averageScore: number;
    };
    topWindows: Array<{
      startPage: number;
      endPage: number;
      qualifiedCandidates: number;
      totalTokenHits: number;
      anchorHits: number;
    }>;
    selectedCandidatesCount: number;
  };
  segmentation: {
    candidateCount: number;
    byType: Record<string, number>;
    avgLength: number;
    duplicateCount: number;
    duplicateRatio: number;
  };
  quality: {
    valid: boolean;
    errors: string[];
    warnings: string[];
    stats: {
      candidatesWithScenarioTokens: number;
      candidatesWithConcreteness: number;
      candidatesWithBannedPhrases: number;
    };
  };
  generation: {
    packsCreated: number;
    promptsPerPack: number[];
    packIds: string[];
    requiresReview: boolean;
  };
  validation: {
    passed: boolean;
    errors: string[];
  };
  actionableIssues: string[];
  flags: {
    requiresReview: boolean;
    scannedPdfDetected: boolean;
    insufficientText: boolean;
    tooManyDuplicates: boolean;
    scenarioTokensMissing: boolean;
    qualityGatesFailed: boolean;
  };
}

/**
 * Generate run ID from timestamp
 */
export function generateRunId(): string {
  const now = new Date();
  return `run-${now.toISOString().replace(/[:.]/g, '-').slice(0, -5)}`;
}

/**
 * Write report files
 */
export function writeReport(
  reportDir: string,
  report: RunReport
): void {
  mkdirSync(reportDir, { recursive: true });
  
  // Write JSON report
  const jsonPath = join(reportDir, 'report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  
  // Write Markdown report
  const mdPath = join(reportDir, 'report.md');
  const md = generateMarkdownReport(report);
  writeFileSync(mdPath, md, 'utf-8');
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(report: RunReport): string {
  const lines: string[] = [];
  
  lines.push('# PDF Ingestion Report');
  lines.push('');
  lines.push(`**Run ID**: ${report.runId}`);
  lines.push(`**Timestamp**: ${report.timestamp}`);
  lines.push('');
  
  // Input
  lines.push('## Input');
  lines.push('');
  lines.push(`- **PDF**: ${report.input.pdfPath}`);
  lines.push(`- **Fingerprint**: ${report.input.pdfFingerprint.substring(0, 16)}...`);
  lines.push(`- **Workspace**: ${report.input.workspace}`);
  lines.push(`- **Section**: ${report.input.section}`);
  lines.push(`- **Scenario**: ${report.input.scenario}`);
  lines.push(`- **Level**: ${report.input.level}`);
  lines.push(`- **Register**: ${report.input.register}`);
  lines.push(`- **Title Prefix**: ${report.input.titlePrefix}`);
  lines.push(`- **Max Packs**: ${report.input.maxPacks}`);
  lines.push(`- **Pack Size**: ${report.input.packSize}`);
  lines.push(`- **OCR**: ${report.input.ocr}`);
  lines.push(`- **Dry Run**: ${report.input.dryRun ? 'Yes' : 'No'}`);
  lines.push('');
  
  // Extraction
  lines.push('## Extraction');
  lines.push('');
  lines.push(`- **Method**: ${report.extraction.method}`);
  lines.push(`- **Pages**: ${report.extraction.pageCount}`);
  lines.push(`- **Total Characters**: ${report.extraction.totalChars.toLocaleString()}`);
  lines.push(`- **Avg Chars/Page**: ${report.extraction.avgCharsPerPage.toFixed(0)}`);
  if (report.extraction.warnings.length > 0) {
    lines.push('- **Warnings**:');
    report.extraction.warnings.forEach(w => lines.push(`  - ${w}`));
  }
  lines.push('');
  
  // Normalization
  lines.push('## Normalization');
  lines.push('');
  if (report.normalization.actions.length > 0) {
    report.normalization.actions.forEach(action => lines.push(`- ${action}`));
  } else {
    lines.push('- No normalization actions taken');
  }
  lines.push(`- **Header/Footer Lines Removed**: ${report.normalization.headerFooterLinesRemoved}`);
  lines.push('');
  
  // Front Matter
  if (report.frontMatter) {
    lines.push('## Front Matter Detection');
    lines.push('');
    if (report.frontMatter.skipped && report.frontMatter.skipUntilPageIndex > 0) {
      lines.push(`- **Skipped**: ${report.frontMatter.skipUntilPageIndex} page(s)`);
      lines.push(`- **First Content Page**: ${report.frontMatter.firstContentPage + 1}`);
      lines.push(`- **Front Matter Pages Detected**: ${report.frontMatter.frontMatterPages.length}`);
      if (report.frontMatter.reasons.length > 0) {
        lines.push('- **Evidence**:');
        report.frontMatter.reasons.slice(0, 10).forEach(r => lines.push(`  - ${r}`));
      }
    } else {
      lines.push('- **Skipped**: No front matter detected');
    }
    lines.push('');
  }
  
  // Scenario Discovery
  if (report.scenarioDiscovery) {
    lines.push('## Scenario Discovery');
    lines.push('');
    lines.push(`- **Ranked Scenarios**: ${report.scenarioDiscovery.rankedScenarios.slice(0, 10).join(', ')}`);
    if (report.scenarioDiscovery.recommendedScenarios.length > 0) {
      lines.push(`- **Recommended Scenarios**: ${report.scenarioDiscovery.recommendedScenarios.join(', ')}`);
    }
    lines.push('');
    lines.push('### Scenario Statistics');
    lines.push('');
    lines.push('| Scenario | Token Hits | Candidates (Any) | Candidates (Qualified) | Best Window |');
    lines.push('|----------|------------|------------------|------------------------|-------------|');
    for (const scenario of report.scenarioDiscovery.scenarios.slice(0, 10)) {
      const windowStr = scenario.bestWindow 
        ? `Pages ${scenario.bestWindow.startPage}-${scenario.bestWindow.endPage}`
        : 'N/A';
      lines.push(`| ${scenario.scenario} | ${scenario.totalTokenHits} | ${scenario.candidatesWithAnyHit} | ${scenario.candidatesWithMinHits} | ${windowStr} |`);
    }
    lines.push('');
    if (report.scenarioDiscovery.scenarios.length > 0) {
      const topScenario = report.scenarioDiscovery.scenarios[0];
      if (topScenario.topMatchedTokens.length > 0) {
        lines.push(`### Top Matched Tokens (${topScenario.scenario})`);
        lines.push('');
        topScenario.topMatchedTokens.slice(0, 10).forEach(({ token, count }) => {
          lines.push(`- ${token}: ${count} occurrences`);
        });
        lines.push('');
      }
    }
  }
  
  // Window Search
  if (report.windowSearch) {
    lines.push('## Window Search');
    lines.push('');
    lines.push(`- **Mode**: ${report.windowSearch.mode}`);
    if (report.windowSearch.pageRange) {
      lines.push(`- **Page Range**: ${report.windowSearch.pageRange}`);
    }
    if (report.windowSearch.bestWindow) {
      lines.push('- **Best Window**:');
      lines.push(`  - Pages: ${report.windowSearch.bestWindow.startPage}-${report.windowSearch.bestWindow.endPage}`);
      lines.push(`  - Qualified Candidates: ${report.windowSearch.bestWindow.qualifiedCandidates}`);
      lines.push(`  - Total Token Hits: ${report.windowSearch.bestWindow.totalTokenHits}`);
      lines.push(`  - Anchor Hits: ${report.windowSearch.bestWindow.anchorHits}`);
      lines.push(`  - Average Score: ${report.windowSearch.bestWindow.averageScore.toFixed(1)}`);
    }
    if (report.windowSearch.topWindows.length > 0) {
      lines.push('- **Top Windows**:');
      report.windowSearch.topWindows.forEach((w, idx) => {
        lines.push(`  ${idx + 1}. Pages ${w.startPage}-${w.endPage}: ${w.qualifiedCandidates} qualified, ${w.totalTokenHits} token hits, ${w.anchorHits} anchor hits`);
      });
    }
    lines.push(`- **Selected Candidates**: ${report.windowSearch.selectedCandidatesCount}`);
    lines.push('');
  }
  
  // Segmentation
  lines.push('## Segmentation');
  lines.push('');
  lines.push(`- **Candidates**: ${report.segmentation.candidateCount}`);
  lines.push(`- **Avg Length**: ${report.segmentation.avgLength.toFixed(0)} chars`);
  lines.push(`- **Duplicates**: ${report.segmentation.duplicateCount} (${(report.segmentation.duplicateRatio * 100).toFixed(1)}%)`);
  lines.push('- **By Type**:');
  for (const [type, count] of Object.entries(report.segmentation.byType)) {
    lines.push(`  - ${type}: ${count}`);
  }
  lines.push('');
  
  // Quality
  lines.push('## Quality Checks');
  lines.push('');
  lines.push(`- **Status**: ${report.quality.valid ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push(`- **Candidates with Scenario Tokens**: ${report.quality.stats.candidatesWithScenarioTokens}`);
  lines.push(`- **Candidates with Concreteness**: ${report.quality.stats.candidatesWithConcreteness}`);
  lines.push(`- **Candidates with Banned Phrases**: ${report.quality.stats.candidatesWithBannedPhrases}`);
  if (report.quality.errors.length > 0) {
    lines.push('- **Errors**:');
    report.quality.errors.forEach(e => lines.push(`  - ❌ ${e}`));
  }
  if (report.quality.warnings.length > 0) {
    lines.push('- **Warnings**:');
    report.quality.warnings.forEach(w => lines.push(`  - ⚠️  ${w}`));
  }
  lines.push('');
  
  // Generation
  lines.push('## Generation');
  lines.push('');
  lines.push(`- **Packs Created**: ${report.generation.packsCreated}`);
  lines.push(`- **Pack IDs**: ${report.generation.packIds.join(', ')}`);
  lines.push(`- **Prompts per Pack**: ${report.generation.promptsPerPack.join(', ')}`);
  if (report.generation.requiresReview) {
    lines.push('- ⚠️  **Requires Review**: Yes (gloss_en may be incomplete)');
  }
  lines.push('');
  
  // Validation
  lines.push('## Validation');
  lines.push('');
  lines.push(`- **Status**: ${report.validation.passed ? '✅ PASSED' : '❌ FAILED'}`);
  if (report.validation.errors.length > 0) {
    lines.push('- **Errors**:');
    report.validation.errors.forEach(e => lines.push(`  - ❌ ${e}`));
  }
  lines.push('');
  
  // Actionable Issues
  if (report.actionableIssues.length > 0) {
    lines.push('## Actionable Issues');
    lines.push('');
    report.actionableIssues.forEach(issue => lines.push(`- ⚠️  ${issue}`));
    lines.push('');
  }
  
  // Flags
  lines.push('## Flags');
  lines.push('');
  lines.push(`- **Requires Review**: ${report.flags.requiresReview ? 'Yes' : 'No'}`);
  lines.push(`- **Scanned PDF Detected**: ${report.flags.scannedPdfDetected ? 'Yes' : 'No'}`);
  lines.push(`- **Insufficient Text**: ${report.flags.insufficientText ? 'Yes' : 'No'}`);
  lines.push(`- **Too Many Duplicates**: ${report.flags.tooManyDuplicates ? 'Yes' : 'No'}`);
  lines.push(`- **Scenario Tokens Missing**: ${report.flags.scenarioTokensMissing ? 'Yes' : 'No'}`);
  lines.push(`- **Quality Gates Failed**: ${report.flags.qualityGatesFailed ? 'Yes' : 'No'}`);
  lines.push('');
  
  // Summary
  lines.push('## Summary');
  lines.push('');
  const allPassed = report.quality.valid && report.validation.passed && report.actionableIssues.length === 0;
  if (allPassed) {
    lines.push('✅ **All checks passed**. Content is ready for review and promotion.');
  } else {
    lines.push('❌ **Issues detected**. Please review the errors and warnings above.');
    if (report.input.dryRun) {
      lines.push('');
      lines.push('This was a dry run. Fix issues and run again with `--dryRun false` to generate content.');
    }
  }
  lines.push('');
  
  return lines.join('\n');
}

