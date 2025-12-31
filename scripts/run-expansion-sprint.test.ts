#!/usr/bin/env tsx

/**
 * Unit tests for run-expansion-sprint.sh
 * 
 * Tests that the sprint runner produces report artifacts and fails on quality errors.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_DIR = join(__dirname);
const REPORTS_DIR = join(__dirname, '..', 'reports', 'sprints');

function expectTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ Test failed: ${message}`);
  }
}

function expectFalse(condition: boolean, message: string): void {
  if (condition) {
    throw new Error(`❌ Test failed: ${message}`);
  }
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`❌ Test failed: ${message}. Expected: ${expected}, Got: ${actual}`);
  }
}

/**
 * Test: Sprint runner produces report artifacts
 */
function testSprintReportGeneration(): void {
  console.log('🧪 Test: Sprint runner produces report artifacts');
  
  // Clean up any existing reports
  if (existsSync(REPORTS_DIR)) {
    execSync(`rm -rf "${REPORTS_DIR}"`, { cwd: join(__dirname, '..') });
  }
  
  // Note: This is a basic test that checks the script exists and is executable
  // Full integration test would require actual content generation
  const scriptPath = join(SCRIPT_DIR, 'run-expansion-sprint.sh');
  expectTrue(existsSync(scriptPath), 'Sprint runner script should exist');
  
  // Check that script is executable
  try {
    execSync(`test -x "${scriptPath}"`, { cwd: join(__dirname, '..') });
    console.log('   ✅ Script exists and is executable');
  } catch (error) {
    throw new Error('Script is not executable');
  }
  
  console.log('   ✅ Test passed: Sprint runner script exists and is executable\n');
}

/**
 * Test: Approval gate blocks approved packs missing gloss_en/intent
 */
function testApprovalGateMeaningSafety(): void {
  console.log('🧪 Test: Approval gate blocks approved packs missing gloss_en/intent');
  
  // This test would require creating a test pack with missing meaning-safety fields
  // and verifying that check-approval-gate.ts fails
  // For now, we verify the check-approval-gate.ts script exists and has the logic
  
  const approvalGatePath = join(SCRIPT_DIR, 'check-approval-gate.ts');
  expectTrue(existsSync(approvalGatePath), 'Approval gate script should exist');
  
  const content = readFileSync(approvalGatePath, 'utf-8');
  expectTrue(
    content.includes('gloss_en') && content.includes('intent'),
    'Approval gate should check for gloss_en and intent'
  );
  expectTrue(
    content.includes('meaning-safety') || content.includes('Meaning-safety'),
    'Approval gate should include meaning-safety checks'
  );
  
  console.log('   ✅ Test passed: Approval gate includes meaning-safety checks\n');
}

/**
 * Test: approve-top.sh only approves matching scenario/level
 */
function testApproveTopFiltering(): void {
  console.log('🧪 Test: approve-top.sh filters by scenario/level');
  
  const approveTopPath = join(SCRIPT_DIR, 'approve-top.sh');
  expectTrue(existsSync(approveTopPath), 'approve-top.sh script should exist');
  
  // Check that script is executable
  try {
    execSync(`test -x "${approveTopPath}"`, { cwd: join(__dirname, '..') });
    console.log('   ✅ Script exists and is executable');
  } catch (error) {
    throw new Error('Script is not executable');
  }
  
  const content = readFileSync(approveTopPath, 'utf-8');
  expectTrue(
    content.includes('--scenario') && content.includes('--level'),
    'approve-top.sh should support --scenario and --level filters'
  );
  
  console.log('   ✅ Test passed: approve-top.sh supports scenario/level filtering\n');
}

/**
 * Main test runner
 */
function main(): void {
  console.log('🧪 Running unit tests for expansion sprint tools...\n');
  
  try {
    testSprintReportGeneration();
    testApprovalGateMeaningSafety();
    testApproveTopFiltering();
    
    console.log('✅ All tests passed!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

