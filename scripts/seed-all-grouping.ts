#!/usr/bin/env tsx

/**
 * Seed ALL Scenarios with Grouping Metadata
 * 
 * This script adds groupId, groupTitle, and groupTitle_i18n to ALL packs
 * across ALL scenarios. Every pack MUST belong to a group - NO orphans allowed.
 * 
 * Scenarios and Groups:
 * 
 * 1. Doctor (16 packs):
 *    - booking-appointments: Making/scheduling appointments
 *    - describing-symptoms: Describing health symptoms
 *    - getting-prescriptions: Prescriptions and medication
 * 
 * 2. Friends Small Talk (24 packs):
 *    - making-plans: Opening, suggestions, planning meetups
 *    - preferences-opinions: Movies, recommendations, preferences
 *    - responding-rescheduling: Declining politely, rescheduling
 * 
 * 3. Government Office (6 packs):
 *    - registration-documents: Anmeldung, address registration
 *    - permits-visas: Residence permit, immigration office
 *    - public-services: Health insurance, Jobcenter, passport
 * 
 * 4. Housing (20 packs):
 *    - searching-listings: Searching for housing
 *    - viewing-apartments: Apartment viewings
 *    - rental-agreements: Rental contracts, agreements
 * 
 * 5. Work (23 packs):
 *    - office-greetings: Greetings, introductions
 *    - meetings-scheduling: Meeting phrases, scheduling
 *    - tasks-requests: Work requests, problem solving
 * 
 * Usage:
 *   pnpm seed:all-grouping          # Dry run
 *   pnpm seed:all-grouping --write  # Apply changes
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTENT_DIR = join(__dirname, '..', 'content', 'v1');
const CONTEXT_DIR = join(CONTENT_DIR, 'workspaces', 'de', 'context');

// ============================================================
// GROUP DEFINITIONS FOR ALL SCENARIOS
// ============================================================

interface GroupConfig {
  groupId: string;
  groupTitle: string;
  groupTitle_i18n: { en: string };
}

interface ScenarioConfig {
  groups: Record<string, GroupConfig>;
  // Function to detect which group a pack belongs to based on its data
  detectGroup: (item: any) => string;
}

const SCENARIO_CONFIGS: Record<string, ScenarioConfig> = {
  // ============================================================
  // DOCTOR SCENARIO
  // ============================================================
  doctor: {
    groups: {
      'booking-appointments': {
        groupId: 'booking-appointments',
        groupTitle: 'Booking Appointments',
        groupTitle_i18n: { en: 'Booking Appointments' }
      },
      'describing-symptoms': {
        groupId: 'describing-symptoms',
        groupTitle: 'Describing Symptoms',
        groupTitle_i18n: { en: 'Describing Symptoms' }
      },
      'getting-prescriptions': {
        groupId: 'getting-prescriptions',
        groupTitle: 'Getting Prescriptions',
        groupTitle_i18n: { en: 'Getting Prescriptions' }
      }
    },
    detectGroup: (item: any) => {
      const text = `${item.title || ''} ${item.shortTitle || ''} ${item.topicLabel || ''}`.toLowerCase();
      
      if (text.includes('appointment') || text.includes('booking') || text.includes('termin') || 
          text.includes('phone') || text.includes('scheduling')) {
        return 'booking-appointments';
      }
      if (text.includes('symptom') || text.includes('describing') || text.includes('beschreib') ||
          text.includes('pain') || text.includes('illness')) {
        return 'describing-symptoms';
      }
      if (text.includes('prescription') || text.includes('rezept') || text.includes('medication') ||
          text.includes('medicine') || text.includes('pharmacy')) {
        return 'getting-prescriptions';
      }
      
      // Fallback based on pack number pattern (1,4,7=appointments, 2,5,8=symptoms, 3,6=prescriptions)
      const match = item.id?.match(/doctor_pack_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        const mod = num % 3;
        if (mod === 1) return 'booking-appointments';
        if (mod === 2) return 'describing-symptoms';
        return 'getting-prescriptions';
      }
      
      return 'booking-appointments'; // Ultimate fallback
    }
  },

  // ============================================================
  // FRIENDS SMALL TALK SCENARIO
  // ============================================================
  friends_small_talk: {
    groups: {
      'making-plans': {
        groupId: 'making-plans',
        groupTitle: 'Making Plans',
        groupTitle_i18n: { en: 'Making Plans' }
      },
      'preferences-opinions': {
        groupId: 'preferences-opinions',
        groupTitle: 'Preferences & Opinions',
        groupTitle_i18n: { en: 'Preferences & Opinions' }
      },
      'responding-rescheduling': {
        groupId: 'responding-rescheduling',
        groupTitle: 'Responding & Rescheduling',
        groupTitle_i18n: { en: 'Responding & Rescheduling' }
      }
    },
    detectGroup: (item: any) => {
      const text = `${item.title || ''} ${item.shortTitle || ''} ${item.id || ''}`.toLowerCase();
      
      // Making Plans: Opening, suggestions, meetup, plans, weekend, café
      if (text.includes('opening') || text.includes('suggestion') || text.includes('meetup') ||
          text.includes('café') || text.includes('cafe') || text.includes('plans') || 
          text.includes('weekend') || text.includes('activity')) {
        return 'making-plans';
      }
      
      // Preferences & Opinions: movies, series, recommendations, opinions, preferences
      if (text.includes('movie') || text.includes('series') || text.includes('recommendation') ||
          text.includes('opinion') || text.includes('preference') || text.includes('like') ||
          text.includes('favorite')) {
        return 'preferences-opinions';
      }
      
      // Responding & Rescheduling: decline, reschedule, respond, sorry, cancel
      if (text.includes('declin') || text.includes('reschedul') || text.includes('respond') ||
          text.includes('cancel') || text.includes('sorry') || text.includes('politely')) {
        return 'responding-rescheduling';
      }
      
      // Fallback based on pack number
      const match = item.id?.match(/friends_small_talk_pack_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num <= 4) return 'making-plans';
        if (num <= 7) return 'preferences-opinions';
        return 'responding-rescheduling';
      }
      
      return 'making-plans'; // Ultimate fallback
    }
  },

  // ============================================================
  // GOVERNMENT OFFICE SCENARIO
  // ============================================================
  government_office: {
    groups: {
      'registration-documents': {
        groupId: 'registration-documents',
        groupTitle: 'Registration & Documents',
        groupTitle_i18n: { en: 'Registration & Documents' }
      },
      'permits-visas': {
        groupId: 'permits-visas',
        groupTitle: 'Permits & Visas',
        groupTitle_i18n: { en: 'Permits & Visas' }
      },
      'public-services': {
        groupId: 'public-services',
        groupTitle: 'Public Services',
        groupTitle_i18n: { en: 'Public Services' }
      }
    },
    detectGroup: (item: any) => {
      const text = `${item.title || ''} ${item.shortTitle || ''} ${item.id || ''}`.toLowerCase();
      
      // Registration & Documents: anmeldung, registration, address, passport
      if (text.includes('anmeldung') || text.includes('registration') || text.includes('address') ||
          text.includes('passport') || text.includes('document')) {
        return 'registration-documents';
      }
      
      // Permits & Visas: residence, permit, immigration, visa, aufenthalts
      if (text.includes('residence') || text.includes('permit') || text.includes('immigration') ||
          text.includes('visa') || text.includes('aufenthalts') || text.includes('ausländer')) {
        return 'permits-visas';
      }
      
      // Public Services: health insurance, jobcenter, social, benefits
      if (text.includes('health') || text.includes('insurance') || text.includes('jobcenter') ||
          text.includes('job') || text.includes('social') || text.includes('benefit') ||
          text.includes('krankenkasse')) {
        return 'public-services';
      }
      
      return 'registration-documents'; // Ultimate fallback
    }
  },

  // ============================================================
  // HOUSING SCENARIO
  // ============================================================
  housing: {
    groups: {
      'searching-listings': {
        groupId: 'searching-listings',
        groupTitle: 'Searching & Listings',
        groupTitle_i18n: { en: 'Searching & Listings' }
      },
      'viewing-apartments': {
        groupId: 'viewing-apartments',
        groupTitle: 'Viewing Apartments',
        groupTitle_i18n: { en: 'Viewing Apartments' }
      },
      'rental-agreements': {
        groupId: 'rental-agreements',
        groupTitle: 'Rental Agreements',
        groupTitle_i18n: { en: 'Rental Agreements' }
      }
    },
    detectGroup: (item: any) => {
      const text = `${item.title || ''} ${item.shortTitle || ''} ${item.topicLabel || ''}`.toLowerCase();
      
      // Searching & Listings: searching, listings, looking, find, wohnung
      if (text.includes('searching') || text.includes('listing') || text.includes('looking') ||
          text.includes('find') || text.includes('suche') || text.includes('anzeige')) {
        return 'searching-listings';
      }
      
      // Viewing Apartments: viewing, besichtigung, visit, tour, apartment view
      if (text.includes('viewing') || text.includes('besichtigung') || text.includes('visit') ||
          text.includes('tour') || text.includes('inspect')) {
        return 'viewing-apartments';
      }
      
      // Rental Agreements: rental, agreement, contract, mietvertrag, deposit, kaution
      if (text.includes('rental') || text.includes('agreement') || text.includes('contract') ||
          text.includes('mietvertrag') || text.includes('deposit') || text.includes('kaution') ||
          text.includes('lease') || text.includes('sign')) {
        return 'rental-agreements';
      }
      
      // Fallback based on pack number (1,4,7,10=searching, 2,5,8=viewing, 3,6,9=rental)
      const match = item.id?.match(/housing_pack_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        const mod = num % 3;
        if (mod === 1) return 'searching-listings';
        if (mod === 2) return 'viewing-apartments';
        return 'rental-agreements';
      }
      
      return 'searching-listings'; // Ultimate fallback
    }
  },

  // ============================================================
  // WORK SCENARIO
  // ============================================================
  work: {
    groups: {
      'office-greetings': {
        groupId: 'office-greetings',
        groupTitle: 'Office Greetings',
        groupTitle_i18n: { en: 'Office Greetings' }
      },
      'meetings-scheduling': {
        groupId: 'meetings-scheduling',
        groupTitle: 'Meetings & Scheduling',
        groupTitle_i18n: { en: 'Meetings & Scheduling' }
      },
      'tasks-requests': {
        groupId: 'tasks-requests',
        groupTitle: 'Tasks & Requests',
        groupTitle_i18n: { en: 'Tasks & Requests' }
      }
    },
    detectGroup: (item: any) => {
      const text = `${item.title || ''} ${item.shortTitle || ''} ${item.id || ''}`.toLowerCase();
      
      // Office Greetings: greetings, introduction, hello, welcome, first day
      if (text.includes('greeting') || text.includes('introduction') || text.includes('hello') ||
          text.includes('welcome') || text.includes('first day') || text.includes('sample') ||
          text.includes('begrüß')) {
        return 'office-greetings';
      }
      
      // Meetings & Scheduling: meeting, schedule, calendar, termine, besprechung
      if (text.includes('meeting') || text.includes('schedule') || text.includes('calendar') ||
          text.includes('termine') || text.includes('besprechung') || text.includes('call') ||
          text.includes('agenda')) {
        return 'meetings-scheduling';
      }
      
      // Tasks & Requests: task, request, problem, help, report, project, deadline
      if (text.includes('task') || text.includes('request') || text.includes('problem') ||
          text.includes('help') || text.includes('report') || text.includes('project') ||
          text.includes('deadline') || text.includes('assign') || text.includes('solving')) {
        return 'tasks-requests';
      }
      
      // Fallback based on pack number (1,4,7=greetings, 2,5,8=meetings, 3,6,9,10+=tasks)
      const match = item.id?.match(/work_pack_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        const mod = num % 3;
        if (mod === 1) return 'office-greetings';
        if (mod === 2) return 'meetings-scheduling';
        return 'tasks-requests';
      }
      
      return 'office-greetings'; // Ultimate fallback
    }
  }
};

// ============================================================
// MAIN SCRIPT
// ============================================================

interface GroupingStats {
  scenario: string;
  groups: Record<string, number>;
  total: number;
}

let dryRun = true;
const allStats: GroupingStats[] = [];

/**
 * Add grouping metadata to an item
 */
function addGroupingToItem(item: any, config: ScenarioConfig): boolean {
  // Skip if already has grouping
  if (item.groupId && item.groupTitle) {
    return false;
  }
  
  const groupId = config.detectGroup(item);
  const groupConfig = config.groups[groupId];
  
  if (!groupConfig) {
    console.error(`❌ Unknown group "${groupId}" for item "${item.id}"`);
    return false;
  }
  
  item.groupId = groupConfig.groupId;
  item.groupTitle = groupConfig.groupTitle;
  item.groupTitle_i18n = { ...groupConfig.groupTitle_i18n };
  
  return true;
}

/**
 * Process an index file
 */
function processIndexFile(filePath: string, scenario: string, stats: GroupingStats): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  
  const config = SCENARIO_CONFIGS[scenario];
  if (!config) {
    console.warn(`⚠️  No config for scenario: ${scenario}`);
    return false;
  }
  
  const content = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  if (!Array.isArray(data.items)) {
    return false;
  }
  
  let modified = false;
  
  for (const item of data.items) {
    if (addGroupingToItem(item, config)) {
      modified = true;
      stats.groups[item.groupId] = (stats.groups[item.groupId] || 0) + 1;
      stats.total++;
    }
  }
  
  if (modified) {
    if (dryRun) {
      console.log(`📝 Would modify: ${filePath}`);
    } else {
      const newContent = JSON.stringify(data, null, 2) + '\n';
      writeFileSync(filePath, newContent, 'utf-8');
      console.log(`✅ Modified: ${filePath}`);
    }
  }
  
  return modified;
}

/**
 * Process all index files for a scenario
 */
function processScenario(scenario: string): GroupingStats {
  const scenarioDir = join(CONTEXT_DIR, scenario);
  const stats: GroupingStats = {
    scenario,
    groups: {},
    total: 0
  };
  
  if (!existsSync(scenarioDir)) {
    console.warn(`⚠️  Scenario directory not found: ${scenarioDir}`);
    return stats;
  }
  
  console.log(`\n📂 Processing scenario: ${scenario}`);
  
  // Find all index files
  const files = readdirSync(scenarioDir)
    .filter(f => f.startsWith('index') && f.endsWith('.json'))
    .sort();
  
  for (const file of files) {
    processIndexFile(join(scenarioDir, file), scenario, stats);
  }
  
  return stats;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Seed ALL Scenarios Grouping Script

Usage:
  npm run seed:all-grouping          # Dry run (default)
  npm run seed:all-grouping -- --write  # Apply changes

This script adds grouping metadata to ALL packs in ALL scenarios:
  - groupId: Stable identifier for the group
  - groupTitle: English display label
  - groupTitle_i18n: Localized group titles

NO orphan packs - every pack will be assigned to a group.
`);
    process.exit(0);
  }
  
  dryRun = !args.includes('--write');
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       ALL SCENARIOS Grouping Seed Script                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No files will be modified');
    console.log('   Use --write to apply changes');
  } else {
    console.log('\n✏️  WRITE MODE - Files will be modified');
  }
  
  // Process all scenarios
  const scenarios = Object.keys(SCENARIO_CONFIGS);
  
  for (const scenario of scenarios) {
    const stats = processScenario(scenario);
    allStats.push(stats);
  }
  
  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  
  let grandTotal = 0;
  
  for (const stats of allStats) {
    if (stats.total === 0) continue;
    
    console.log(`\n📁 ${stats.scenario.toUpperCase()}: ${stats.total} packs`);
    for (const [groupId, count] of Object.entries(stats.groups)) {
      console.log(`    └── ${groupId}: ${count}`);
    }
    grandTotal += stats.total;
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  TOTAL PACKS GROUPED: ${grandTotal}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (dryRun && grandTotal > 0) {
    console.log('\n💡 Run with --write to apply these changes');
  }
  
  console.log('\n✅ Grouping seed complete!');
}

main();

