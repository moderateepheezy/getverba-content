#!/usr/bin/env ts-node

/**
 * Add missing telemetry readiness fields to existing packs
 * Usage: ts-node scripts/add-telemetry-fields.ts [--workspace <ws>] [--pack-id <id>]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');

interface PackEntry {
  id: string;
  level: string;
  estimatedMinutes: number;
  analytics: {
    responseSpeedTargetMs?: number;
    goal?: string;
    commonMistakes?: string[];
    cognitiveLoad?: 'low' | 'medium' | 'high';
    [key: string]: any;
  };
  [key: string]: any;
}

function addTelemetryFields(pack: PackEntry): PackEntry {
  const analytics = pack.analytics || {};
  
  // targetLatencyMs: use responseSpeedTargetMs if available, otherwise derive from level
  if (!analytics.targetLatencyMs) {
    if (analytics.responseSpeedTargetMs) {
      analytics.targetLatencyMs = analytics.responseSpeedTargetMs;
    } else {
      // Derive from level
      const levelTargets: Record<string, number> = {
        'A1': 1500,
        'A2': 1200,
        'B1': 1000,
        'B2': 900,
        'C1': 800,
        'C2': 700
      };
      const baseTarget = levelTargets[pack.level.toUpperCase()] || 1200;
      const cognitiveLoad = analytics.cognitiveLoad || 'medium';
      const loadAdjustments: Record<string, number> = {
        'low': -200,
        'medium': 0,
        'high': 300
      };
      analytics.targetLatencyMs = baseTarget + (loadAdjustments[cognitiveLoad] || 0);
    }
  }
  
  // successDefinition: use goal if available and <= 140 chars, otherwise generate
  if (!analytics.successDefinition) {
    if (analytics.goal && analytics.goal.length <= 140) {
      analytics.successDefinition = analytics.goal;
    } else {
      const scenario = pack.scenario || 'scenarios';
      const level = pack.level || 'A1';
      const primaryStructure = pack.primaryStructure || 'grammar';
      analytics.successDefinition = `Successfully complete ${scenario} scenarios at ${level} level using ${primaryStructure}`.substring(0, 140);
    }
  }
  
  // keyFailureModes: truncate commonMistakes to 40 chars each, limit to 6 items
  if (!analytics.keyFailureModes) {
    const commonMistakes = analytics.commonMistakes || [];
    analytics.keyFailureModes = commonMistakes.slice(0, 6).map((mistake: string) => 
      mistake.length > 40 ? mistake.substring(0, 37) + '...' : mistake
    );
    // Ensure at least one failure mode
    if (analytics.keyFailureModes.length === 0) {
      analytics.keyFailureModes.push('Incorrect grammar or vocabulary usage');
    }
  }
  
  // exitConditions: determine based on level and cognitive load
  if (!analytics.exitConditions) {
    const targetMinutes = pack.estimatedMinutes || 15;
    const level = pack.level || 'A1';
    const cognitiveLoad = analytics.cognitiveLoad || 'medium';
    const completeWhen = level === 'A1' || cognitiveLoad === 'low' 
      ? 'sessionPlan_completed_once' 
      : 'sessionPlan_completed_twice';
    
    analytics.exitConditions = {
      targetMinutes: Math.max(1, Math.min(20, targetMinutes)),
      completeWhen
    };
  }
  
  return {
    ...pack,
    analytics
  };
}

function main() {
  const args = process.argv.slice(2);
  let workspace = 'de';
  let packId: string | null = null;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && i + 1 < args.length) {
      workspace = args[i + 1];
      i++;
    } else if (args[i] === '--pack-id' && i + 1 < args.length) {
      packId = args[i + 1];
      i++;
    }
  }
  
  const packsDir = join(CONTENT_DIR, 'workspaces', workspace, 'packs');
  if (!existsSync(packsDir)) {
    console.error(`❌ Error: Packs directory not found: ${packsDir}`);
    process.exit(1);
  }
  
  // Find packs to update
  function findPackFiles(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...findPackFiles(fullPath));
        } else if (entry === 'pack.json') {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore errors
    }
    return files;
  }
  
  let packPaths: string[] = [];
  if (packId) {
    const packPath = join(packsDir, packId, 'pack.json');
    if (existsSync(packPath)) {
      packPaths = [packPath];
    } else {
      console.error(`❌ Error: Pack not found: ${packId}`);
      process.exit(1);
    }
  } else {
    packPaths = findPackFiles(packsDir);
  }
  
  console.log(`📦 Updating ${packPaths.length} pack(s) with telemetry fields...`);
  
  let updated = 0;
  for (const packPath of packPaths) {
    try {
      const content = readFileSync(packPath, 'utf-8');
      const pack: PackEntry = JSON.parse(content);
      
      // Check if already has all telemetry fields
      if (pack.analytics?.targetLatencyMs && 
          pack.analytics?.successDefinition && 
          pack.analytics?.keyFailureModes && 
          pack.analytics?.exitConditions) {
        continue; // Skip if already has all fields
      }
      
      const updatedPack = addTelemetryFields(pack);
      writeFileSync(packPath, JSON.stringify(updatedPack, null, 2) + '\n', 'utf-8');
      updated++;
      console.log(`   ✅ Updated: ${pack.id}`);
    } catch (err: any) {
      console.error(`   ❌ Error updating ${packPath}: ${err.message}`);
    }
  }
  
  console.log(`\n✅ Updated ${updated} pack(s)`);
}

main();

