#!/usr/bin/env tsx

/**
 * Catalog Coherence Gate
 * 
 * Enforces coherence rules and fails build if violations detected.
 * 
 * Usage:
 *   tsx scripts/check-coherence-gate.ts --workspace de --manifest staging --failOnRisk true
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

interface CliArgs {
  workspace: string;
  manifest: 'staging' | 'prod';
  failOnRisk: boolean;
  minPacksPerSection?: number;
  maxLowTokenDensityPercent?: number;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args: Partial<CliArgs> = {};
  
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    
    if (arg === '--workspace' && next) {
      args.workspace = next;
      i++;
    } else if (arg === '--manifest' && next) {
      args.manifest = next === 'prod' ? 'prod' : 'staging';
      i++;
    } else if (arg === '--failOnRisk' && next) {
      args.failOnRisk = next === 'true';
      i++;
    } else if (arg === '--minPacksPerSection' && next) {
      args.minPacksPerSection = parseInt(next, 10);
      i++;
    } else if (arg === '--maxLowTokenDensityPercent' && next) {
      args.maxLowTokenDensityPercent = parseFloat(next);
      i++;
    }
  }
  
  return {
    workspace: args.workspace || 'all',
    manifest: args.manifest || 'staging',
    failOnRisk: args.failOnRisk || false,
    minPacksPerSection: args.minPacksPerSection || 1,
    maxLowTokenDensityPercent: args.maxLowTokenDensityPercent || 30
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    const args = parseArgs();
    
    console.log('🔍 Checking coherence gate...');
    console.log(`   Workspace: ${args.workspace}`);
    console.log(`   Manifest: ${args.manifest}`);
    console.log('');
    
    // Generate coherence report
    const reportCmd = `tsx scripts/catalog-coherence-report.ts --workspace ${args.workspace} --manifest ${args.manifest} --outDir .tmp-coherence-check`;
    execSync(reportCmd, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    
    // Load report
    const reportPath = join(PROJECT_ROOT, '.tmp-coherence-check', 'coherence.json');
    if (!existsSync(reportPath)) {
      throw new Error('Coherence report not generated');
    }
    
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    
    // Check rules
    const failures: string[] = [];
    const warnings: string[] = [];
    
    // Rule 1: No duplicates
    if (report.metrics.violations.duplicates.length > 0) {
      failures.push(`Found ${report.metrics.violations.duplicates.length} duplicate(s)`);
    }
    
    // Rule 2: No banned phrases
    if (report.metrics.violations.bannedPhrases.length > 0) {
      failures.push(`Found ${report.metrics.violations.bannedPhrases.length} banned phrase(s)`);
    }
    
    // Rule 3: All staging content must be approved
    if (args.manifest === 'staging') {
      if (report.metrics.reviewMetrics.needsReview > 0) {
        failures.push(`Found ${report.metrics.reviewMetrics.needsReview} pack(s) with status "needs_review" in staging`);
      }
    }
    
    // Rule 4: Risk checks (if enabled)
    if (args.failOnRisk) {
      const lowTokenDensityCount = Object.values(report.perPackFlags)
        .filter((f: any) => f.lowTokenDensity).length;
      const totalPacks = report.metrics.totals.packs;
      const lowTokenDensityPercent = totalPacks > 0 
        ? (lowTokenDensityCount / totalPacks) * 100 
        : 0;
      
      if (lowTokenDensityPercent > args.maxLowTokenDensityPercent!) {
        failures.push(`Low token density: ${lowTokenDensityPercent.toFixed(1)}% of packs (max: ${args.maxLowTokenDensityPercent}%)`);
      }
      
      // Check section counts (would need section-level data)
      // For now, just check total
      if (totalPacks < args.minPacksPerSection!) {
        warnings.push(`Total packs (${totalPacks}) is below minimum (${args.minPacksPerSection})`);
      }
    }
    
    // Report results
    if (failures.length > 0) {
      console.error('❌ Coherence gate failed:');
      for (const failure of failures) {
        console.error(`   - ${failure}`);
      }
      console.error('');
      process.exit(1);
    }
    
    if (warnings.length > 0) {
      console.warn('⚠️  Warnings:');
      for (const warning of warnings) {
        console.warn(`   - ${warning}`);
      }
      console.warn('');
    }
    
    console.log('✅ Coherence gate passed');
    console.log('');
    console.log('Summary:');
    console.log(`   Total entries: ${report.metrics.totals.total}`);
    console.log(`   Violations: ${report.metrics.violations.bannedPhrases.length} banned phrases, ${report.metrics.violations.duplicates.length} duplicates`);
    console.log(`   Risks: ${report.metrics.risks.length} packs flagged`);
    console.log('');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

