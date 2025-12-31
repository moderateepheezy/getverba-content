#!/usr/bin/env tsx

/**
 * Create Token Proposal
 * 
 * Creates a human-approved token proposal from a token mining report.
 * 
 * Usage:
 *   tsx scripts/pdf-ingestion/create-token-proposal.ts \
 *     --fromReport ./reports/token-mining/deutschimblick.school.2025-01-01/report.json \
 *     --scenario school \
 *     --pdfId deutschimblick
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const PROPOSALS_DIR = join(PROJECT_ROOT, 'content', 'meta', 'token-proposals');

interface TokenMiningReport {
  pdfId: string;
  scenario: string;
  tokens: Array<{
    token: string;
    count: number;
    examples: string[];
  }>;
  suggestedStrongTokens: string[];
}

interface TokenProposal {
  pdfId: string;
  scenario: string;
  createdAt: string;
  add: {
    tokens: string[];
    strongTokens: string[];
    phrases: string[];
  };
  notes: string;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): { fromReport: string; scenario: string; pdfId: string; notes?: string } {
  let fromReport = '';
  let scenario = '';
  let pdfId = '';
  let notes = '';
  
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const next = process.argv[i + 1];
    
    if (arg === '--fromReport' && next) {
      fromReport = next;
      i++;
    } else if (arg === '--scenario' && next) {
      scenario = next;
      i++;
    } else if (arg === '--pdfId' && next) {
      pdfId = next;
      i++;
    } else if (arg === '--notes' && next) {
      notes = next;
      i++;
    }
  }
  
  if (!fromReport) throw new Error('Missing required: --fromReport');
  if (!scenario) throw new Error('Missing required: --scenario');
  if (!pdfId) throw new Error('Missing required: --pdfId');
  
  return { fromReport, scenario, pdfId, notes };
}

/**
 * Main execution
 */
function main() {
  try {
    const args = parseArgs();
    
    if (!existsSync(args.fromReport)) {
      throw new Error(`Report file not found: ${args.fromReport}`);
    }
    
    // Load mining report
    const reportContent = readFileSync(args.fromReport, 'utf-8');
    const report: TokenMiningReport = JSON.parse(reportContent);
    
    // Validate report matches args
    if (report.scenario !== args.scenario) {
      throw new Error(`Report scenario "${report.scenario}" does not match --scenario "${args.scenario}"`);
    }
    if (report.pdfId !== args.pdfId) {
      throw new Error(`Report pdfId "${report.pdfId}" does not match --pdfId "${args.pdfId}"`);
    }
    
    // Extract tokens (top 50 by default, or all if fewer)
    const topTokens = report.tokens.slice(0, 50);
    const singleWordTokens = topTokens
      .filter(t => t.token.split(/\s+/).length === 1)
      .map(t => t.token);
    
    const multiWordPhrases = topTokens
      .filter(t => t.token.split(/\s+/).length >= 2)
      .map(t => t.token);
    
    // Create proposal
    const proposal: TokenProposal = {
      pdfId: args.pdfId,
      scenario: args.scenario,
      createdAt: new Date().toISOString(),
      add: {
        tokens: singleWordTokens,
        strongTokens: report.suggestedStrongTokens.slice(0, 20),
        phrases: multiWordPhrases.slice(0, 30)
      },
      notes: args.notes || `Proposed tokens from ${args.pdfId} for ${args.scenario} scenario`
    };
    
    // Create proposals directory
    mkdirSync(PROPOSALS_DIR, { recursive: true });
    
    // Write proposal
    const proposalPath = join(PROPOSALS_DIR, `${args.pdfId}.${args.scenario}.json`);
    writeFileSync(proposalPath, JSON.stringify(proposal, null, 2));
    
    console.log('✅ Token proposal created');
    console.log(`   Path: ${proposalPath}`);
    console.log(`   Tokens: ${proposal.add.tokens.length}`);
    console.log(`   Strong tokens: ${proposal.add.strongTokens.length}`);
    console.log(`   Phrases: ${proposal.add.phrases.length}`);
    console.log('');
    console.log('💡 Next steps:');
    console.log(`   1. Review proposal: ${proposalPath}`);
    console.log(`   2. Edit if needed (remove unwanted tokens)`);
    console.log(`   3. Apply proposal: ./scripts/apply-token-proposal.sh ${proposalPath}`);
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

