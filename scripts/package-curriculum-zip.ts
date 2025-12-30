#!/usr/bin/env tsx

/**
 * Curriculum Export v2 ZIP Packager
 * 
 * Packages curriculum export into a school-friendly ZIP bundle with
 * JSON, CSV, README, and optional IMSCC-like manifest.
 * 
 * Usage:
 *   npm run content:package-curriculum-zip [--workspace <ws>]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXPORTS_DIR = join(__dirname, '..', 'exports');
const META_DIR = join(__dirname, '..', 'content', 'meta');

/**
 * Generate README.txt
 */
function generateReadme(workspace: string, export_: any): string {
  const lines: string[] = [];
  
  lines.push('GetVerba Curriculum Export v2');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Workspace: ${workspace}`);
  lines.push(`Exported: ${export_.exportedAt}`);
  lines.push(`Git SHA: ${export_.gitSha.substring(0, 7)}`);
  lines.push(`Bundles: ${export_.bundles.length}`);
  lines.push('');
  lines.push('Contents:');
  lines.push('  - curriculum.json: Full structured export');
  lines.push('  - curriculum.csv: Flattened spreadsheet view');
  lines.push('  - imsmanifest.xml: Minimal SCORM-like manifest (if present)');
  lines.push('');
  lines.push('Usage:');
  lines.push('  1. Import curriculum.json into your LMS or curriculum system');
  lines.push('  2. Use curriculum.csv for spreadsheet-based planning');
  lines.push('  3. Each bundle is a self-contained learning path');
  lines.push('');
  lines.push('Bundle Structure:');
  lines.push('  - Each bundle contains modules (Context → Practice → Assessment)');
  lines.push('  - Modules contain items (packs, drills, exams)');
  lines.push('  - Items reference entry documents via entryUrl');
  lines.push('');
  lines.push('For more information, see:');
  lines.push('  docs/content-pipeline/CURRICULUM_EXPORTS_V2.md');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generate minimal IMSCC manifest
 */
function generateImsManifest(workspace: string, export_: any): string {
  const lines: string[] = [];
  
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<manifest identifier="getverba-curriculum-v2"');
  lines.push('          xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1"');
  lines.push('          xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource"');
  lines.push('          xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest"');
  lines.push('          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push('          xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imscp_v1p2.xsd">');
  lines.push('  <metadata>');
  lines.push('    <schema>IMS Common Cartridge</schema>');
  lines.push('    <schemaversion>1.1.0</schemaversion>');
  lines.push(`    <lom:lom><lom:general><lom:title><lom:string language="en">GetVerba Curriculum ${workspace}</lom:string></lom:title></lom:general></lom:lom>`);
  lines.push('  </metadata>');
  lines.push('  <organizations>');
  lines.push('    <organization identifier="org1">');
  lines.push('      <item identifier="root">');
  
  // Add bundles as items
  for (let i = 0; i < export_.bundles.length; i++) {
    const bundle = export_.bundles[i];
    lines.push(`        <item identifier="bundle_${i}">`);
    lines.push(`          <title>${escapeXml(bundle.title)}</title>`);
    
    // Add modules
    for (let j = 0; j < bundle.modules.length; j++) {
      const module = bundle.modules[j];
      lines.push(`          <item identifier="module_${i}_${j}">`);
      lines.push(`            <title>${escapeXml(module.title)}</title>`);
      lines.push('          </item>');
    }
    
    lines.push('        </item>');
  }
  
  lines.push('      </item>');
  lines.push('    </organization>');
  lines.push('  </organizations>');
  lines.push('  <resources>');
  lines.push(`    <resource identifier="curriculum_json" type="webcontent" href="curriculum.json">`);
  lines.push('      <file href="curriculum.json"/>');
  lines.push('    </resource>');
  lines.push(`    <resource identifier="curriculum_csv" type="webcontent" href="curriculum.csv">`);
  lines.push('      <file href="curriculum.csv"/>');
  lines.push('    </resource>');
  lines.push('  </resources>');
  lines.push('</manifest>');
  
  return lines.join('\n');
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Package curriculum into ZIP
 */
function packageZip(workspace: string): void {
  console.log(`📦 Packaging curriculum ZIP for workspace: ${workspace}`);
  
  const jsonPath = join(EXPORTS_DIR, `curriculum.v2.${workspace}.json`);
  const csvPath = join(EXPORTS_DIR, `curriculum.v2.${workspace}.csv`);
  
  if (!existsSync(jsonPath)) {
    console.error(`❌ Export file not found: ${jsonPath}`);
    console.error(`   Run: npm run content:export-curriculum -- --workspace ${workspace}`);
    process.exit(1);
  }
  
  if (!existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.error(`   Run: npm run content:export-curriculum -- --workspace ${workspace}`);
    process.exit(1);
  }
  
  // Load export
  const export_ = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  
  // Create temp directory for ZIP contents
  const tempDir = join(EXPORTS_DIR, `curriculum_${workspace}_temp`);
  mkdirSync(tempDir, { recursive: true });
  
  try {
    // Copy JSON and CSV
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    const csvContent = readFileSync(csvPath, 'utf-8');
    
    writeFileSync(join(tempDir, 'curriculum.json'), jsonContent, 'utf-8');
    writeFileSync(join(tempDir, 'curriculum.csv'), csvContent, 'utf-8');
    
    // Generate README
    const readme = generateReadme(workspace, export_);
    writeFileSync(join(tempDir, 'README.txt'), readme, 'utf-8');
    
    // Generate IMS manifest (optional, but included)
    try {
      const manifest = generateImsManifest(workspace, export_);
      writeFileSync(join(tempDir, 'imsmanifest.xml'), manifest, 'utf-8');
      console.log('   Generated imsmanifest.xml');
    } catch (error: any) {
      console.warn(`   ⚠️  Failed to generate manifest: ${error.message}`);
    }
    
    // Create ZIP
    const zipPath = join(EXPORTS_DIR, `curriculum.v2.${workspace}.zip`);
    
    console.log(`   Creating ZIP: ${zipPath}`);
    
    try {
      // Use zip command if available
      execSync(`cd "${tempDir}" && zip -r "${zipPath}" .`, {
        stdio: 'pipe'
      });
      console.log(`✅ ZIP created: ${zipPath}`);
    } catch (error: any) {
      console.error(`❌ Failed to create ZIP: ${error.message}`);
      console.error(`   Note: zip command is required. Install with: brew install zip (macOS) or apt-get install zip (Linux)`);
      console.error(`   Files are available in: ${tempDir}`);
      process.exit(1);
    }
    
    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
  } catch (error: any) {
    console.error(`❌ Failed to package ZIP: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  let workspace: string | null = null;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--workspace' || args[i] === '-w') && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    }
  }
  
  if (!workspace) {
    // Try to get from manifest
    try {
      const manifestPath = join(META_DIR, 'manifest.json');
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        workspace = manifest.activeWorkspace;
      }
    } catch {
      // Fall through
    }
    
    if (!workspace) {
      console.error('Usage: package-curriculum-zip.ts --workspace <ws>');
      console.error('Example: npm run content:package-curriculum-zip -- --workspace de');
      process.exit(1);
    }
  }
  
  packageZip(workspace);
}

main();

