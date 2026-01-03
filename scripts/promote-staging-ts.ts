#!/usr/bin/env tsx

/**
 * Promote staging to production (TypeScript version)
 * This script performs the same steps as promote-staging.sh but in TypeScript
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_DIR = __dirname;
const META_DIR = join(SCRIPT_DIR, '..', 'content', 'meta');
const STAGING_MANIFEST = join(META_DIR, 'manifest.staging.json');
const PROD_MANIFEST = join(META_DIR, 'manifest.json');

// Load environment variables from .env.local if it exists
const ENV_FILE = join(SCRIPT_DIR, '..', '.env.local');
if (existsSync(ENV_FILE)) {
  const envContent = readFileSync(ENV_FILE, 'utf-8');
  const envLines = envContent.split('\n');
  for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const skipSmokeTest = args.includes('--skip-smoke-test');
  const dryRun = args.includes('--dry-run');

  console.log('🚀 Promoting staging to production...');
  console.log(`   Staging manifest: ${STAGING_MANIFEST}`);
  console.log(`   Production manifest: ${PROD_MANIFEST}`);
  
  // Get git SHA
  let gitSha = 'unknown';
  try {
    gitSha = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: join(SCRIPT_DIR, '..') }).trim();
    console.log(`   Git SHA: ${gitSha}`);
  } catch (e) {
    console.log(`   Git SHA: unknown`);
  }
  console.log('');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified or uploaded');
    console.log('');
  }

  // Step 1: Run validation
  if (!dryRun) {
    console.log('🔍 Running content validation...');
    try {
      execSync('npm run content:validate', { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ Validation passed');
      console.log('');
    } catch (e) {
      console.error('❌ Content validation failed. Promotion aborted.');
      process.exit(1);
    }
  } else {
    console.log('🔍 Content validation will run before promotion (dry-run mode)');
    console.log('');
  }

  // Step 1.5: Run quality report
  if (!dryRun) {
    console.log('🔍 Running quality report...');
    try {
      execSync('npm run content:quality', { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ Quality check passed');
      console.log('');
    } catch (e) {
      console.error('❌ Quality check failed. Promotion aborted.');
      process.exit(1);
    }
  } else {
    console.log('🔍 Quality report will run before promotion (dry-run mode)');
    console.log('');
  }

  // Step 1.6: Run review harness
  if (!dryRun) {
    console.log('🔍 Running review harness...');
    try {
      execSync('npm run content:review', { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ Review harness passed');
      console.log('');
    } catch (e) {
      console.error('❌ Review harness failed. Promotion aborted.');
      process.exit(1);
    }
  } else {
    console.log('🔍 Review harness will run before promotion (dry-run mode)');
    console.log('');
  }

  // Step 1.7: Check approval gate
  if (!dryRun) {
    console.log('🔍 Checking approval gate...');
    try {
      execSync('npx tsx scripts/check-approval-gate.ts', { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ All items are approved');
      console.log('');
    } catch (e) {
      console.error('❌ Approval gate failed. Promotion aborted.');
      console.error('   Some items in staging manifest are not approved.');
      process.exit(1);
    }
  } else {
    console.log('🔍 Approval gate will run before promotion (dry-run mode)');
    console.log('');
  }

  // Step 1.8: Generate coherence report
  if (!dryRun) {
    console.log('📊 Generating coherence report...');
    try {
      const reportsDir = join(META_DIR, 'reports');
      execSync(`npx tsx scripts/catalog-coherence-report.ts --workspace all --manifest staging --outDir "${reportsDir}"`, { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ Coherence report generated');
      console.log('');
    } catch (e) {
      console.log('   ⚠️  Coherence report generation failed (non-fatal)');
      console.log('');
    }
  } else {
    console.log('📊 Coherence report will be generated before promotion (dry-run mode)');
    console.log('');
  }

  // Step 1.9: Generate catalog rollups
  if (!dryRun) {
    console.log('📦 Generating catalog rollups...');
    try {
      execSync('npm run content:generate-catalog-rollups', { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ Catalog rollups generated');
      console.log('');
    } catch (e) {
      console.error('❌ Catalog rollup generation failed. Promotion aborted.');
      process.exit(1);
    }
  } else {
    console.log('📦 Catalog rollup generation will run before promotion (dry-run mode)');
    console.log('');
  }

  // Step 1.10: Generate exports
  if (!dryRun) {
    console.log('📦 Generating curriculum exports...');
    try {
      execSync('npm run content:generate-exports', { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ Exports generated');
      console.log('');
    } catch (e) {
      console.error('❌ Export generation failed. Promotion aborted.');
      process.exit(1);
    }
  } else {
    console.log('📦 Export generation will run before promotion (dry-run mode)');
    console.log('');
  }

  // Step 2: Update workspace hashes
  if (!dryRun) {
    console.log('📝 Updating workspace hashes in staging manifest...');
    try {
      execSync(`bash scripts/update-manifest-hashes.sh "${STAGING_MANIFEST}"`, { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'pipe'
      });
    } catch (e) {
      // Non-fatal
    }
  }

  // Step 3: Copy staging manifest to production
  if (!dryRun) {
    console.log('📋 Copying staging manifest to production...');
    if (!existsSync(STAGING_MANIFEST)) {
      console.error(`❌ Error: Staging manifest not found: ${STAGING_MANIFEST}`);
      process.exit(1);
    }
    copyFileSync(STAGING_MANIFEST, PROD_MANIFEST);
    console.log('   ✅ Copied manifest.staging.json → manifest.json');
  } else {
    console.log('📋 Would copy staging manifest to production (dry-run mode)');
  }

  // Step 4: Regenerate release.json
  if (!dryRun) {
    console.log('📝 Regenerating release metadata...');
    try {
      execSync('bash scripts/generate-release.sh', { 
        cwd: join(SCRIPT_DIR, '..'),
        stdio: 'inherit'
      });
      console.log('   ✅ Generated release.json');
      console.log('');
    } catch (e) {
      console.error('❌ Failed to generate release.json');
      process.exit(1);
    }
  } else {
    console.log('📝 Would regenerate release.json (dry-run mode)');
    console.log('');
  }

  // Step 5: Upload to R2 (requires AWS CLI and env vars)
  console.log('📤 Uploading production manifest and release to R2...');
  
  if (dryRun) {
    console.log('   (dryrun) Would upload: meta/manifest.json');
    console.log('   (dryrun) Would upload: meta/release.json');
    if (gitSha !== 'unknown') {
      console.log(`   (dryrun) Would archive: meta/manifests/${gitSha}.json`);
    }
  } else {
    // Check for required env vars
    const r2Endpoint = process.env.R2_ENDPOINT;
    const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
    const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET || 'getverba-content-prod';

    if (!r2Endpoint || !r2AccessKey || !r2SecretKey) {
      console.error('❌ Error: R2 credentials not found in environment');
      console.error('   Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
      console.error('   Set these in .env.local or export them');
      process.exit(1);
    }

    try {
      // Upload manifest.json
      console.log('   Uploading meta/manifest.json...');
      execSync(`aws s3 cp "${PROD_MANIFEST}" "s3://${bucket}/meta/manifest.json" --endpoint-url "${r2Endpoint}" --content-type "application/json" --cache-control "public, max-age=30, stale-while-revalidate=300" --metadata-directive REPLACE`, {
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: r2AccessKey,
          AWS_SECRET_ACCESS_KEY: r2SecretKey,
          AWS_DEFAULT_REGION: 'auto'
        },
        stdio: 'inherit'
      });

      // Archive manifest
      if (gitSha !== 'unknown') {
        console.log(`   Archiving manifest to meta/manifests/${gitSha}.json...`);
        execSync(`aws s3 cp "${PROD_MANIFEST}" "s3://${bucket}/meta/manifests/${gitSha}.json" --endpoint-url "${r2Endpoint}" --content-type "application/json" --cache-control "public, max-age=31536000, immutable" --metadata-directive REPLACE`, {
          env: {
            ...process.env,
            AWS_ACCESS_KEY_ID: r2AccessKey,
            AWS_SECRET_ACCESS_KEY: r2SecretKey,
            AWS_DEFAULT_REGION: 'auto'
          },
          stdio: 'inherit'
        });
        console.log('   ✅ Manifest archived for rollback');
      }

      // Upload release.json
      const releaseFile = join(META_DIR, 'release.json');
      if (existsSync(releaseFile)) {
        console.log('   Uploading meta/release.json...');
        execSync(`aws s3 cp "${releaseFile}" "s3://${bucket}/meta/release.json" --endpoint-url "${r2Endpoint}" --content-type "application/json" --cache-control "public, max-age=30, stale-while-revalidate=300" --metadata-directive REPLACE`, {
          env: {
            ...process.env,
            AWS_ACCESS_KEY_ID: r2AccessKey,
            AWS_SECRET_ACCESS_KEY: r2SecretKey,
            AWS_DEFAULT_REGION: 'auto'
          },
          stdio: 'inherit'
        });
      }
    } catch (e: any) {
      console.error(`❌ Failed to upload to R2: ${e.message}`);
      process.exit(1);
    }
  }

  console.log('');
  if (dryRun) {
    console.log('✅ Dry run completed. No files were modified or uploaded.');
    console.log('');
    console.log('To promote for real, run: npx tsx scripts/promote-staging-ts.ts');
  } else {
    console.log('✅ Staging promoted to production!');
    console.log('   Production manifest: https://getverba-content-api.simpumind-apps.workers.dev/manifest');
    console.log('   Release info: https://getverba-content-api.simpumind-apps.workers.dev/release');
  }
}

main();

