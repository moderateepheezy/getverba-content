/**
 * Integrity Report Generator
 * 
 * Computes coherence metrics and validates bundle integrity.
 */

import type { CurriculumBundle, IntegrityReport, BundleItem } from './exportTypes.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Generate integrity report for a bundle
 */
export function generateIntegrityReport(
  bundle: CurriculumBundle,
  contentDir: string
): IntegrityReport {
  const errors: IntegrityReport['errors'] = [];
  const warnings: IntegrityReport['warnings'] = [];
  
  // Collect all items
  const allItems: BundleItem[] = [];
  const itemIds = new Set<string>();
  
  for (const module of bundle.modules) {
    for (const item of module.items) {
      // Check for duplicate IDs
      if (itemIds.has(item.id)) {
        errors.push({
          type: 'duplicate_id',
          message: `Duplicate item ID: ${item.id}`,
          itemId: item.id
        });
      }
      itemIds.add(item.id);
      
      // Check if entry document exists
      const relativePath = item.entryUrl.replace(/^\/v1\//, '');
      const entryPath = join(contentDir, relativePath);
      
      if (!existsSync(entryPath)) {
        errors.push({
          type: 'missing_entry',
          message: `Entry document not found: ${item.entryUrl}`,
          itemId: item.id
        });
      } else {
        // Load entry document to validate
        try {
          const entryContent = readFileSync(entryPath, 'utf-8');
          const entry = JSON.parse(entryContent);
          
          if (entry.id !== item.id) {
            errors.push({
              type: 'invalid_entry',
              message: `Entry document ID mismatch: expected ${item.id}, got ${entry.id}`,
              itemId: item.id
            });
          }
        } catch (err: any) {
          errors.push({
            type: 'invalid_entry',
            message: `Failed to parse entry document: ${err.message}`,
            itemId: item.id
          });
        }
      }
      
      allItems.push(item);
    }
  }
  
  // Compute distributions
  const levelDistribution: Record<string, number> = {};
  const scenarioDistribution: Record<string, number> = {};
  const primaryStructureDistribution: Record<string, number> = {};
  const registerDistribution: Record<string, number> = {};
  
  for (const item of allItems) {
    levelDistribution[item.level] = (levelDistribution[item.level] || 0) + 1;
    
    if (item.scenario) {
      scenarioDistribution[item.scenario] = (scenarioDistribution[item.scenario] || 0) + 1;
    }
    
    if (item.primaryStructure) {
      primaryStructureDistribution[item.primaryStructure] = 
        (primaryStructureDistribution[item.primaryStructure] || 0) + 1;
    }
    
    if (item.register) {
      registerDistribution[item.register] = (registerDistribution[item.register] || 0) + 1;
    }
  }
  
  // Compute coherence metrics
  let itemsWithScenario = 0;
  let itemsWithRegister = 0;
  let itemsWithPrimaryStructure = 0;
  let packsWithSessionPlan = 0;
  let promptsWithSlotsChanged = 0;
  let packsPassingWhyThisWorks = 0;
  let totalPacks = 0;
  let totalPrompts = 0;
  
  for (const item of allItems) {
    if (item.scenario) itemsWithScenario++;
    if (item.register) itemsWithRegister++;
    if (item.primaryStructure) itemsWithPrimaryStructure++;
    
    if (item.kind === 'pack') {
      totalPacks++;
      
      // Check if entry document has sessionPlan
      const relativePath = item.entryUrl.replace(/^\/v1\//, '');
      const entryPath = join(contentDir, relativePath);
      
      if (existsSync(entryPath)) {
        try {
          const entryContent = readFileSync(entryPath, 'utf-8');
          const entry = JSON.parse(entryContent);
          
          if (entry.sessionPlan && entry.sessionPlan.steps && entry.sessionPlan.steps.length > 0) {
            packsWithSessionPlan++;
          }
          
          // Count prompts with slotsChanged
          if (entry.prompts) {
            totalPrompts += entry.prompts.length;
            for (const prompt of entry.prompts) {
              if (prompt.slotsChanged && prompt.slotsChanged.length > 0) {
                promptsWithSlotsChanged++;
              }
            }
          }
          
          // Check whyThisWorks requirements
          if (item.whyThisWorks) {
            const hasPrimaryStructure = !!item.whyThisWorks.primaryStructure;
            const hasVariationSlots = item.whyThisWorks.variationSlots && 
              item.whyThisWorks.variationSlots.length > 0;
            const hasQualitySignals = item.whyThisWorks.qualitySignals && 
              item.whyThisWorks.qualitySignals.length > 0;
            
            if (hasPrimaryStructure && hasVariationSlots && hasQualitySignals) {
              packsPassingWhyThisWorks++;
            }
          }
        } catch {
          // Skip if can't read
        }
      }
    }
  }
  
  const totalItems = allItems.length;
  
  // Compute coverage percentages
  const scenarioCoverage = totalItems > 0 ? (itemsWithScenario / totalItems) * 100 : 0;
  const registerCoverage = totalItems > 0 ? (itemsWithRegister / totalItems) * 100 : 0;
  const primaryStructureCoverage = totalItems > 0 ? (itemsWithPrimaryStructure / totalItems) * 100 : 0;
  const sessionPlanCoverage = totalPacks > 0 ? (packsWithSessionPlan / totalPacks) * 100 : 0;
  const slotsChangedCoverage = totalPrompts > 0 ? (promptsWithSlotsChanged / totalPrompts) * 100 : 0;
  const whyThisWorksPassRate = totalPacks > 0 ? (packsPassingWhyThisWorks / totalPacks) * 100 : 0;
  
  // Generate warnings for low coverage
  if (scenarioCoverage < 80) {
    warnings.push({
      type: 'low_coverage',
      message: `Low scenario coverage: ${scenarioCoverage.toFixed(1)}% (target: 80%+)`
    });
  }
  
  if (primaryStructureCoverage < 80) {
    warnings.push({
      type: 'low_coverage',
      message: `Low primaryStructure coverage: ${primaryStructureCoverage.toFixed(1)}% (target: 80%+)`
    });
  }
  
  if (sessionPlanCoverage < 90) {
    warnings.push({
      type: 'low_coverage',
      message: `Low sessionPlan coverage: ${sessionPlanCoverage.toFixed(1)}% (target: 90%+)`
    });
  }
  
  return {
    errors,
    warnings,
    stats: {
      levelDistribution,
      scenarioDistribution,
      primaryStructureDistribution,
      registerDistribution
    },
    coherence: {
      itemsWithScenario,
      itemsWithRegister,
      itemsWithPrimaryStructure,
      packsWithSessionPlan,
      promptsWithSlotsChanged,
      packsPassingWhyThisWorks,
      totalItems,
      totalPacks,
      totalPrompts
    },
    coherenceScorecard: {
      scenarioCoverage,
      registerCoverage,
      primaryStructureCoverage,
      sessionPlanCoverage,
      slotsChangedCoverage,
      whyThisWorksPassRate
    }
  };
}

/**
 * Print integrity report summary to console
 */
export function printIntegritySummary(report: IntegrityReport): void {
  console.log('\n📊 Integrity Report Summary');
  console.log('─'.repeat(50));
  
  if (report.errors.length > 0) {
    console.log(`\n❌ Errors (${report.errors.length}):`);
    for (const error of report.errors) {
      console.log(`   • ${error.message}`);
    }
  } else {
    console.log('\n✅ No errors found');
  }
  
  if (report.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${report.warnings.length}):`);
    for (const warning of report.warnings) {
      console.log(`   • ${warning.message}`);
    }
  }
  
  console.log('\n📈 Distribution Stats:');
  console.log(`   Levels: ${Object.keys(report.stats.levelDistribution).join(', ')}`);
  console.log(`   Scenarios: ${Object.keys(report.stats.scenarioDistribution).join(', ')}`);
  console.log(`   Primary Structures: ${Object.keys(report.stats.primaryStructureDistribution).join(', ')}`);
  
  console.log('\n🎯 Coherence Scorecard:');
  console.log(`   Scenario Coverage: ${report.coherenceScorecard.scenarioCoverage.toFixed(1)}%`);
  console.log(`   Register Coverage: ${report.coherenceScorecard.registerCoverage.toFixed(1)}%`);
  console.log(`   Primary Structure Coverage: ${report.coherenceScorecard.primaryStructureCoverage.toFixed(1)}%`);
  console.log(`   Session Plan Coverage: ${report.coherenceScorecard.sessionPlanCoverage.toFixed(1)}%`);
  console.log(`   Slots Changed Coverage: ${report.coherenceScorecard.slotsChangedCoverage.toFixed(1)}%`);
  console.log(`   Why This Works Pass Rate: ${report.coherenceScorecard.whyThisWorksPassRate.toFixed(1)}%`);
}

