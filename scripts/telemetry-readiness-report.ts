#!/usr/bin/env tsx

/**
 * Telemetry Readiness Report
 * 
 * Analyzes all packs for telemetry readiness:
 * - Missing packVersion or analytics fields
 * - Distribution of targetLatencyMs
 * - Percentage of prompts with intent/gloss_en
 * - Unstable ID patterns (e.g., "prompt-1" vs "prompt-001" mixed)
 * 
 * Usage:
 *   npm run content:telemetry-ready
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = process.env.CONTENT_DIR || join(__dirname, '..', 'content', 'v1');

interface PackEntry {
  id: string;
  packVersion?: string;
  analytics?: {
    targetLatencyMs?: number;
    successDefinition?: string;
    keyFailureModes?: string[];
    primaryStructure?: string;
    variationSlots?: string[];
  };
  prompts?: Array<{
    id: string;
    intent?: string;
    gloss_en?: string;
  }>;
  sessionPlan?: {
    version: number;
    steps: Array<{
      id: string;
      promptIds: string[];
    }>;
  };
}

interface ReadinessReport {
  timestamp: string;
  summary: {
    totalPacks: number;
    packsWithPackVersion: number;
    packsWithAnalytics: number;
    packsWithTargetLatencyMs: number;
    packsWithSuccessDefinition: number;
    packsWithKeyFailureModes: number;
    packsFullyReady: number;
  };
  missingFields: {
    missingPackVersion: string[];
    missingAnalytics: string[];
    missingTargetLatencyMs: string[];
    missingSuccessDefinition: string[];
    missingKeyFailureModes: string[];
  };
  targetLatencyDistribution: {
    min: number;
    max: number;
    mean: number;
    median: number;
    values: number[];
  };
  promptMetadata: {
    totalPrompts: number;
    promptsWithIntent: number;
    promptsWithGlossEn: number;
    percentageWithIntent: number;
    percentageWithGlossEn: number;
  };
  idStability: {
    unstablePatterns: Array<{
      packId: string;
      issue: string;
      examples: string[];
    }>;
  };
  isReady: boolean;
}

/**
 * Check if a pack has stable ID patterns
 */
function checkIdStability(pack: PackEntry): Array<{ issue: string; examples: string[] }> {
  const issues: Array<{ issue: string; examples: string[] }> = [];
  
  if (!pack.prompts || pack.prompts.length === 0) {
    return issues;
  }
  
  const promptIds = pack.prompts.map(p => p.id);
  
  // Check for mixed numbering patterns (e.g., "prompt-1" vs "prompt-001")
  const hasZeroPadded = promptIds.some(id => /\d{3,}/.test(id));
  const hasUnpadded = promptIds.some(id => {
    const match = id.match(/(\d+)$/);
    return match && match[1].length < 3;
  });
  
  if (hasZeroPadded && hasUnpadded) {
    const zeroPaddedExamples = promptIds.filter(id => /\d{3,}/.test(id)).slice(0, 3);
    const unpaddedExamples = promptIds.filter(id => {
      const match = id.match(/(\d+)$/);
      return match && match[1].length < 3;
    }).slice(0, 3);
    issues.push({
      issue: 'Mixed zero-padding patterns (e.g., "prompt-1" vs "prompt-001")',
      examples: [...zeroPaddedExamples, ...unpaddedExamples]
    });
  }
  
  // Check for inconsistent prefixes
  const prefixes = new Set(promptIds.map(id => {
    const match = id.match(/^([a-z-]+)\d+/i);
    return match ? match[1] : '';
  }).filter(Boolean));
  
  if (prefixes.size > 1) {
    issues.push({
      issue: `Inconsistent prompt ID prefixes: ${Array.from(prefixes).join(', ')}`,
      examples: promptIds.slice(0, 5)
    });
  }
  
  // Check step IDs for consistency
  if (pack.sessionPlan?.steps) {
    const stepIds = pack.sessionPlan.steps.map(s => s.id);
    const stepPrefixes = new Set(stepIds.map(id => {
      const match = id.match(/^([a-z-]+)/i);
      return match ? match[1] : '';
    }).filter(Boolean));
    
    if (stepPrefixes.size > 2) {
      issues.push({
        issue: `Inconsistent step ID patterns: ${Array.from(stepPrefixes).join(', ')}`,
        examples: stepIds.slice(0, 5)
      });
    }
  }
  
  return issues;
}

/**
 * Calculate median of array
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Find all pack files in workspaces
 */
function findAllPacks(): PackEntry[] {
  const packs: PackEntry[] = [];
  const workspacesDir = join(CONTENT_DIR, 'workspaces');
  
  if (!existsSync(workspacesDir)) {
    return packs;
  }
  
  const workspaces = readdirSync(workspacesDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  for (const workspace of workspaces) {
    const workspaceDir = join(workspacesDir, workspace);
    const catalogPath = join(workspaceDir, 'catalog.json');
    
    if (!existsSync(catalogPath)) {
      continue;
    }
    
    try {
      const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
      
      for (const section of catalog.sections || []) {
        if (section.kind !== 'pack' && section.kind !== 'context') {
          continue;
        }
        
        const indexPath = join(workspaceDir, section.id, 'index.json');
        if (!existsSync(indexPath)) {
          continue;
        }
        
        try {
          const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
          
          // Handle paginated indexes
          let pages = [index];
          if (index.nextPage) {
            let currentPage = index;
            while (currentPage.nextPage) {
              const nextPagePath = join(workspaceDir, section.id, currentPage.nextPage);
              if (existsSync(nextPagePath)) {
                currentPage = JSON.parse(readFileSync(nextPagePath, 'utf-8'));
                pages.push(currentPage);
              } else {
                break;
              }
            }
          }
          
          for (const page of pages) {
            for (const item of page.items || []) {
              if (!item.entryUrl) {
                continue;
              }
              
              // Extract pack path from entryUrl
              // entryUrl format: /v1/workspaces/{workspace}/packs/{packId}/pack.json
              const urlMatch = item.entryUrl.match(/\/v1\/workspaces\/([^/]+)\/packs\/([^/]+)\/pack\.json$/);
              if (!urlMatch) {
                continue;
              }
              
              const [, urlWorkspace, packId] = urlMatch;
              const packPath = join(CONTENT_DIR, 'workspaces', urlWorkspace, 'packs', packId, 'pack.json');
              
              if (existsSync(packPath)) {
                try {
                  const pack = JSON.parse(readFileSync(packPath, 'utf-8'));
                  packs.push(pack);
                } catch (err) {
                  console.error(`Error reading pack ${packPath}: ${err}`);
                }
              }
            }
          }
        } catch (err) {
          console.error(`Error reading index ${indexPath}: ${err}`);
        }
      }
    } catch (err) {
      console.error(`Error reading catalog ${catalogPath}: ${err}`);
    }
  }
  
  return packs;
}

/**
 * Generate readiness report
 */
function generateReport(): ReadinessReport {
  const packs = findAllPacks();
  const timestamp = new Date().toISOString();
  
  const missingPackVersion: string[] = [];
  const missingAnalytics: string[] = [];
  const missingTargetLatencyMs: string[] = [];
  const missingSuccessDefinition: string[] = [];
  const missingKeyFailureModes: string[] = [];
  const targetLatencyValues: number[] = [];
  const unstablePatterns: Array<{ packId: string; issue: string; examples: string[] }> = [];
  
  let totalPrompts = 0;
  let promptsWithIntent = 0;
  let promptsWithGlossEn = 0;
  
  let packsWithPackVersion = 0;
  let packsWithAnalytics = 0;
  let packsWithTargetLatencyMs = 0;
  let packsWithSuccessDefinition = 0;
  let packsWithKeyFailureModes = 0;
  let packsFullyReady = 0;
  
  for (const pack of packs) {
    // Check packVersion
    if (pack.packVersion) {
      packsWithPackVersion++;
    } else {
      missingPackVersion.push(pack.id);
    }
    
    // Check analytics
    if (pack.analytics) {
      packsWithAnalytics++;
      
      if (typeof pack.analytics.targetLatencyMs === 'number') {
        packsWithTargetLatencyMs++;
        targetLatencyValues.push(pack.analytics.targetLatencyMs);
      } else {
        missingTargetLatencyMs.push(pack.id);
      }
      
      if (pack.analytics.successDefinition) {
        packsWithSuccessDefinition++;
      } else {
        missingSuccessDefinition.push(pack.id);
      }
      
      if (Array.isArray(pack.analytics.keyFailureModes) && pack.analytics.keyFailureModes.length > 0) {
        packsWithKeyFailureModes++;
      } else {
        missingKeyFailureModes.push(pack.id);
      }
    } else {
      missingAnalytics.push(pack.id);
      missingTargetLatencyMs.push(pack.id);
      missingSuccessDefinition.push(pack.id);
      missingKeyFailureModes.push(pack.id);
    }
    
    // Check if fully ready
    if (pack.packVersion && 
        pack.analytics &&
        typeof pack.analytics.targetLatencyMs === 'number' &&
        pack.analytics.successDefinition &&
        Array.isArray(pack.analytics.keyFailureModes) &&
        pack.analytics.keyFailureModes.length > 0) {
      packsFullyReady++;
    }
    
    // Check prompt metadata
    if (pack.prompts) {
      for (const prompt of pack.prompts) {
        totalPrompts++;
        if (prompt.intent) {
          promptsWithIntent++;
        }
        if (prompt.gloss_en) {
          promptsWithGlossEn++;
        }
      }
    }
    
    // Check ID stability
    const idIssues = checkIdStability(pack);
    for (const issue of idIssues) {
      unstablePatterns.push({
        packId: pack.id,
        issue: issue.issue,
        examples: issue.examples
      });
    }
  }
  
  const targetLatencyDistribution = targetLatencyValues.length > 0 ? {
    min: Math.min(...targetLatencyValues),
    max: Math.max(...targetLatencyValues),
    mean: targetLatencyValues.reduce((a, b) => a + b, 0) / targetLatencyValues.length,
    median: median(targetLatencyValues),
    values: targetLatencyValues
  } : {
    min: 0,
    max: 0,
    mean: 0,
    median: 0,
    values: []
  };
  
  const percentageWithIntent = totalPrompts > 0 ? (promptsWithIntent / totalPrompts) * 100 : 0;
  const percentageWithGlossEn = totalPrompts > 0 ? (promptsWithGlossEn / totalPrompts) * 100 : 0;
  
  const isReady = missingPackVersion.length === 0 &&
                  missingAnalytics.length === 0 &&
                  missingTargetLatencyMs.length === 0 &&
                  missingSuccessDefinition.length === 0 &&
                  missingKeyFailureModes.length === 0 &&
                  unstablePatterns.length === 0;
  
  return {
    timestamp,
    summary: {
      totalPacks: packs.length,
      packsWithPackVersion,
      packsWithAnalytics,
      packsWithTargetLatencyMs,
      packsWithSuccessDefinition,
      packsWithKeyFailureModes,
      packsFullyReady
    },
    missingFields: {
      missingPackVersion,
      missingAnalytics,
      missingTargetLatencyMs,
      missingSuccessDefinition,
      missingKeyFailureModes
    },
    targetLatencyDistribution,
    promptMetadata: {
      totalPrompts,
      promptsWithIntent,
      promptsWithGlossEn,
      percentageWithIntent,
      percentageWithGlossEn
    },
    idStability: {
      unstablePatterns
    },
    isReady
  };
}

/**
 * Print report to console
 */
function printReport(report: ReadinessReport): void {
  console.log('\n📊 Telemetry Readiness Report');
  console.log('='.repeat(60));
  console.log(`Generated: ${report.timestamp}\n`);
  
  console.log('Summary:');
  console.log(`  Total Packs: ${report.summary.totalPacks}`);
  console.log(`  Packs with packVersion: ${report.summary.packsWithPackVersion} (${((report.summary.packsWithPackVersion / report.summary.totalPacks) * 100).toFixed(1)}%)`);
  console.log(`  Packs with analytics: ${report.summary.packsWithAnalytics} (${((report.summary.packsWithAnalytics / report.summary.totalPacks) * 100).toFixed(1)}%)`);
  console.log(`  Packs with targetLatencyMs: ${report.summary.packsWithTargetLatencyMs} (${((report.summary.packsWithTargetLatencyMs / report.summary.totalPacks) * 100).toFixed(1)}%)`);
  console.log(`  Packs with successDefinition: ${report.summary.packsWithSuccessDefinition} (${((report.summary.packsWithSuccessDefinition / report.summary.totalPacks) * 100).toFixed(1)}%)`);
  console.log(`  Packs with keyFailureModes: ${report.summary.packsWithKeyFailureModes} (${((report.summary.packsWithKeyFailureModes / report.summary.totalPacks) * 100).toFixed(1)}%)`);
  console.log(`  Fully Ready Packs: ${report.summary.packsFullyReady} (${((report.summary.packsFullyReady / report.summary.totalPacks) * 100).toFixed(1)}%)\n`);
  
  if (report.missingFields.missingPackVersion.length > 0) {
    console.log(`❌ Missing packVersion (${report.missingFields.missingPackVersion.length} packs):`);
    console.log(`   ${report.missingFields.missingPackVersion.slice(0, 10).join(', ')}${report.missingFields.missingPackVersion.length > 10 ? '...' : ''}\n`);
  }
  
  if (report.missingFields.missingAnalytics.length > 0) {
    console.log(`❌ Missing analytics block (${report.missingFields.missingAnalytics.length} packs):`);
    console.log(`   ${report.missingFields.missingAnalytics.slice(0, 10).join(', ')}${report.missingFields.missingAnalytics.length > 10 ? '...' : ''}\n`);
  }
  
  if (report.missingFields.missingTargetLatencyMs.length > 0) {
    console.log(`❌ Missing targetLatencyMs (${report.missingFields.missingTargetLatencyMs.length} packs):`);
    console.log(`   ${report.missingFields.missingTargetLatencyMs.slice(0, 10).join(', ')}${report.missingFields.missingTargetLatencyMs.length > 10 ? '...' : ''}\n`);
  }
  
  if (report.missingFields.missingSuccessDefinition.length > 0) {
    console.log(`❌ Missing successDefinition (${report.missingFields.missingSuccessDefinition.length} packs):`);
    console.log(`   ${report.missingFields.missingSuccessDefinition.slice(0, 10).join(', ')}${report.missingFields.missingSuccessDefinition.length > 10 ? '...' : ''}\n`);
  }
  
  if (report.missingFields.missingKeyFailureModes.length > 0) {
    console.log(`❌ Missing keyFailureModes (${report.missingFields.missingKeyFailureModes.length} packs):`);
    console.log(`   ${report.missingFields.missingKeyFailureModes.slice(0, 10).join(', ')}${report.missingFields.missingKeyFailureModes.length > 10 ? '...' : ''}\n`);
  }
  
  if (report.targetLatencyDistribution.values.length > 0) {
    console.log('Target Latency Distribution:');
    console.log(`  Min: ${report.targetLatencyDistribution.min}ms`);
    console.log(`  Max: ${report.targetLatencyDistribution.max}ms`);
    console.log(`  Mean: ${report.targetLatencyDistribution.mean.toFixed(0)}ms`);
    console.log(`  Median: ${report.targetLatencyDistribution.median.toFixed(0)}ms\n`);
  }
  
  console.log('Prompt Metadata:');
  console.log(`  Total Prompts: ${report.promptMetadata.totalPrompts}`);
  console.log(`  Prompts with intent: ${report.promptMetadata.promptsWithIntent} (${report.promptMetadata.percentageWithIntent.toFixed(1)}%)`);
  console.log(`  Prompts with gloss_en: ${report.promptMetadata.promptsWithGlossEn} (${report.promptMetadata.percentageWithGlossEn.toFixed(1)}%)\n`);
  
  if (report.idStability.unstablePatterns.length > 0) {
    console.log(`⚠️  Unstable ID Patterns (${report.idStability.unstablePatterns.length} issues):`);
    for (const pattern of report.idStability.unstablePatterns.slice(0, 5)) {
      console.log(`   ${pattern.packId}: ${pattern.issue}`);
      console.log(`      Examples: ${pattern.examples.slice(0, 3).join(', ')}`);
    }
    if (report.idStability.unstablePatterns.length > 5) {
      console.log(`   ... and ${report.idStability.unstablePatterns.length - 5} more\n`);
    } else {
      console.log();
    }
  }
  
  if (report.isReady) {
    console.log('✅ All packs are telemetry-ready!\n');
  } else {
    console.log('❌ Some packs are not telemetry-ready. See issues above.\n');
  }
}

// Main execution
const report = generateReport();
printReport(report);

// Exit with error code if not ready
process.exit(report.isReady ? 0 : 1);

