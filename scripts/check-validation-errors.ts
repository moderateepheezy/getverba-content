#!/usr/bin/env tsx

/**
 * Check Validation Errors
 * Runs validation and reports specific errors
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

console.log('🔍 Running content validation...\n');

try {
  const output = execSync('npm run content:validate 2>&1', { 
    encoding: 'utf-8', 
    cwd: ROOT_DIR,
    stdio: 'pipe'
  });
  
  // Check if there are errors
  const errorLines = output.split('\n').filter(line => 
    line.includes('error') || 
    line.includes('Error') || 
    line.includes('missing') || 
    line.includes('invalid') ||
    line.includes('violation')
  );
  
  if (errorLines.length > 0) {
    console.log('❌ Validation errors found:\n');
    errorLines.forEach(line => console.log(line));
    console.log(`\nTotal: ${errorLines.length} error lines`);
    process.exit(1);
  } else {
    console.log('✅ No validation errors found');
    process.exit(0);
  }
} catch (e: any) {
  const output = e.stdout || e.stderr || e.message || '';
  const errorLines = output.split('\n').filter((line: string) => 
    line.includes('error') || 
    line.includes('Error') || 
    line.includes('missing') || 
    line.includes('invalid') ||
    line.includes('violation')
  );
  
  if (errorLines.length > 0) {
    console.log('❌ Validation errors found:\n');
    // Show first 50 error lines
    errorLines.slice(0, 50).forEach((line: string) => console.log(line));
    if (errorLines.length > 50) {
      console.log(`\n... and ${errorLines.length - 50} more errors`);
    }
    console.log(`\nTotal: ${errorLines.length} error lines`);
  } else {
    console.log('⚠️  Validation failed but no specific error messages found');
    console.log('Output:', output.slice(0, 500));
  }
  process.exit(1);
}

