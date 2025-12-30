# Content Rollout Workflow

This document describes the staging → promote workflow for safely releasing content updates.

## Overview

The content pipeline uses a two-manifest system:
- **Staging manifest** (`manifest.staging.json`): What you test against
- **Production manifest** (`manifest.json`): What the app uses

This allows you to:
1. Publish new content to R2
2. Test it against staging manifest
3. Promote to production with a single command (instant flip)

## Workflow

### Step 1: Publish Content to Staging

Publish all content files and the staging manifest:

```bash
./scripts/publish-content.sh
```

This will:
- Upload all `content/v1/**` files to R2
- Upload `content/meta/manifest.staging.json` to R2
- Upload `content/meta/release.json` to R2
- **Exclude** `content/meta/manifest.json` (production manifest) by default

**Note**: The production manifest (`manifest.json`) is **not** published by default. This prevents accidentally overwriting production.

### Step 2: Verify Staging Content

Test the staging endpoints manually:

```bash
# Check staging manifest (if you have a staging Worker endpoint)
curl https://your-staging-worker.workers.dev/manifest

# Or verify content files directly
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/catalog.json
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/packs/work_1/pack.json
```

**Important**: The Worker serves `/manifest` from `meta/manifest.json` (production). To test staging, you would need a separate staging Worker or test content files directly.

### Step 3: Promote Staging to Production

Once you've verified the content is correct, promote it:

```bash
./scripts/promote-staging.sh
```

This will:
1. **Run smoke test** (validates all referenced content is accessible)
2. Copy `manifest.staging.json` → `manifest.json` (local file)
3. Regenerate `release.json` with new metadata
4. Upload `meta/manifest.json` and `meta/release.json` to R2
5. **Archive manifest** to `meta/manifests/<gitSha>.json` (immutable, for rollback)

**Result**: Production instantly flips to the new content. The Worker's `/manifest` endpoint will now return the promoted manifest.

**Smoke Test**: By default, the promote script runs a smoke test that:
- Fetches the catalog from staging manifest
- Tests all section indexes
- Samples N items (default: 5) and verifies their entry documents are accessible
- Fails if any 404 or invalid JSON is found

**Skip Smoke Test**: Use `--skip-smoke-test` to bypass (not recommended):
```bash
./scripts/promote-staging.sh --skip-smoke-test
```

### Dry-Run Mode

Test the workflow without making changes:

```bash
# Test publish (dry-run)
./scripts/publish-content.sh --dry-run

# Test promote (dry-run)
./scripts/promote-staging.sh --dry-run
```

## Advanced Usage

### Publishing Production Manifest Directly

If you need to publish the production manifest during initial publish (not recommended for normal workflow):

```bash
./scripts/publish-content.sh --publish-prod-manifest
```

**Warning**: This bypasses the staging → promote workflow. Use only for initial setup or emergency fixes.

### Rollback

To rollback to a previous version by git SHA:

```bash
./scripts/rollback.sh <gitSha>
```

Example:
```bash
./scripts/rollback.sh abc123def456
```

This will:
1. Download archived manifest from R2: `meta/manifests/<gitSha>.json`
2. Restore it to `manifest.json` (local)
3. Regenerate `release.json`
4. Upload only `meta/manifest.json` and `meta/release.json` to R2

**List Available Manifests via API**:
```bash
curl https://getverba-content-api.simpumind-apps.workers.dev/manifests
```

**Or via AWS CLI**:
```bash
aws s3 ls s3://getverba-content-prod/meta/manifests/ --endpoint-url "$R2_ENDPOINT"
```

**Dry-Run Rollback**:
```bash
./scripts/rollback.sh <gitSha> --dry-run
```

**Note**: Manifests are archived automatically on every promote. Each archived manifest is immutable (long cache headers) and can be used for instant rollback.

## File Structure

```
content/
├── meta/
│   ├── manifest.json          # Production manifest (what app uses)
│   ├── manifest.staging.json  # Staging manifest (what you test)
│   └── release.json           # Release metadata (auto-generated)
└── v1/
    └── workspaces/
        └── de/
            ├── catalog.json
            ├── context/
            │   └── index.json
            └── packs/
                └── ...
```

## Worker Behavior

The Worker serves:
- `GET /manifest` → Returns `meta/manifest.json` (production)
- `GET /release` → Returns `meta/release.json`
- `GET /active` → Redirects based on production manifest
- `GET /manifests` → Lists archived manifests (for rollback discovery)
- `GET /manifests/:gitSha` → Returns specific archived manifest
- `GET /v1/**` → Passthrough to R2 content

**Note**: The Worker does **not** have a separate staging endpoint. Staging is tested by:
1. Publishing content files to R2
2. Verifying content files directly (bypassing manifest)
3. Promoting when ready

## Release Visibility Endpoints

These endpoints help discover archived manifests for debugging and rollback.

### List Archived Manifests

```bash
curl https://getverba-content-api.simpumind-apps.workers.dev/manifests
```

**Response**:
```json
{
  "items": [
    {
      "gitSha": "abc123def456",
      "key": "meta/manifests/abc123def456.json",
      "lastModified": "2025-12-30T10:00:00.000Z"
    },
    {
      "gitSha": "789def012abc",
      "key": "meta/manifests/789def012abc.json",
      "lastModified": "2025-12-29T15:30:00.000Z"
    }
  ]
}
```

**Query Parameters**:
- `limit` (optional): Number of items to return (default: 50, max: 200)
- `cursor` (optional): Pagination cursor from previous response

**Caching**: `Cache-Control: public, max-age=30, stale-while-revalidate=300`

### Fetch Specific Archived Manifest

```bash
curl https://getverba-content-api.simpumind-apps.workers.dev/manifests/abc123def456
```

**Response**: The archived manifest JSON for that git SHA.

**Caching**: `Cache-Control: public, max-age=31536000, immutable` (cached for 1 year)

**Error Responses**:
- `400` - Invalid git SHA format (must be 7-40 hex characters)
- `404` - Archived manifest not found

### Using Release Visibility for Rollback

1. **List available archives**:
   ```bash
   curl -s https://getverba-content-api.simpumind-apps.workers.dev/manifests | jq '.items[].gitSha'
   ```

2. **Inspect a specific manifest**:
   ```bash
   curl https://getverba-content-api.simpumind-apps.workers.dev/manifests/abc123def456
   ```

3. **Rollback to that version**:
   ```bash
   ./scripts/rollback.sh abc123def456
   ```

## Best Practices

1. **Always validate before publishing**:
   ```bash
   npm run content:validate
   ```

2. **Use dry-run first**:
   ```bash
   ./scripts/publish-content.sh --dry-run
   ./scripts/promote-staging.sh --dry-run
   ```

3. **Test staging content** before promoting:
   - Verify all entry documents are accessible
   - Check section indexes load correctly
   - Test a few pack entries

4. **Promote during low-traffic periods** (if possible):
   - The flip is instant, but cache headers may cause brief inconsistencies

5. **Keep git history clean**:
   - Commit staging changes
   - Commit promotion separately
   - This makes rollback easier

## Troubleshooting

### "manifest.json not found" error

**Cause**: Production manifest doesn't exist locally.

**Fix**: Run `./scripts/promote-staging.sh` to create it from staging.

### "Staging manifest not found" error

**Cause**: `manifest.staging.json` doesn't exist.

**Fix**: Create it by copying `manifest.json`:
```bash
cp content/meta/manifest.json content/meta/manifest.staging.json
```

### Content published but not visible

**Cause**: Production manifest hasn't been promoted.

**Fix**: Run `./scripts/promote-staging.sh` to flip production.

### Need to rollback immediately

**Fix**: Promote previous manifest from git:
```bash
git show HEAD~1:content/meta/manifest.json > content/meta/manifest.staging.json
./scripts/promote-staging.sh
```

## Example Workflow

```bash
# 1. Make content changes
vim content/v1/workspaces/de/packs/new_pack/pack.json
vim content/v1/workspaces/de/context/index.json
vim content/meta/manifest.staging.json

# 2. Validate
npm run content:validate

# 3. Publish to staging
./scripts/publish-content.sh

# 4. Verify (test content files directly)
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/packs/new_pack/pack.json

# 5. Run smoke test manually (optional)
./scripts/smoke-test-content.sh --sample 5

# 6. Promote to production (includes smoke test)
./scripts/promote-staging.sh

# 7. Verify production
curl https://getverba-content-api.simpumind-apps.workers.dev/manifest

# 8. If needed, rollback
./scripts/rollback.sh <previous-git-sha>
```

## Smoke Test

The smoke test script can be run independently:

```bash
# Test with default settings (sample 5 items)
./scripts/smoke-test-content.sh

# Test with custom base URL
./scripts/smoke-test-content.sh --base-url https://staging-worker.workers.dev

# Test with custom sample size
./scripts/smoke-test-content.sh --sample 10
```

The smoke test:
- Reads `manifest.staging.json`
- Fetches catalog and validates JSON
- Tests all section indexes
- **Follows pagination chains** (validates all pages in multi-page indexes)
- Samples N items and verifies entry documents
- Fails on any 404 or invalid JSON
- Validates pagination invariants (version, kind, pageSize, total consistent across pages)

### Smoke Test Pagination Options

```bash
# Default: follows nextPage chains
./scripts/smoke-test-content.sh

# Skip pagination following
./scripts/smoke-test-content.sh --no-follow-next-page

# Limit max pages per section (default: 20)
./scripts/smoke-test-content.sh --max-pages 5
```

## Pagination Acceptance Checks

For sections with pagination (`nextPage` links), verify:

1. **Validator passes locally**:
   ```bash
   npm run content:validate
   ```

2. **Smoke test follows nextPage chain**:
   ```bash
   ./scripts/smoke-test-content.sh --sample 5
   ```
   Look for output like: `📊 Total: 2 pages, 4 items`

3. **Live endpoints accessible**:
   ```bash
   # Page 1
   curl -s https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/mechanics/index.json | jq '{total, pageSize, itemCount: (.items | length), nextPage}'
   
   # Page 2
   curl -s https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/mechanics/index.page2.json | jq '{total, pageSize, itemCount: (.items | length), nextPage}'
   ```

4. **Invariants match across pages**:
   - `version` is the same
   - `kind` is the same
   - `pageSize` is the same
   - `total` is the same
   - No duplicate `items[].id` across pages
   - Sum of items equals `total`

## Manifest Schema

The manifest includes:

- `schemaVersion`: Schema version (currently `1`)
- `activeVersion`: Content version (e.g., `"v1"`)
- `activeWorkspace`: Default workspace ID
- `minClientVersion`: Minimum app version required (semver, e.g., `"1.0.0"`)
- `workspaces`: Mapping of workspace ID → catalog URL
- `workspaceHashes`: Mapping of workspace ID → SHA256 hash

### workspaceHashes

Each workspace has a deterministic hash computed from:
- `catalog.json`
- All section index pages (including pagination chain)
- All entry documents referenced by section index items

The hash changes when any referenced content changes, enabling:
- Change detection per workspace
- Content integrity verification
- Safe rollout (hash mismatch prevents promotion)

### minClientVersion

When you bump `schemaVersion` (breaking change), you must also bump `minClientVersion`:

```json
{
  "schemaVersion": 2,
  "minClientVersion": "2.0.0",
  ...
}
```

This tells older app versions to show "update required" instead of crashing.

## Summary

- **Publish**: Uploads content + staging manifest (safe, doesn't affect production)
- **Promote**: Validates → Verifies hashes → Smoke tests → Flips production manifest (instant, one command)
- **Rollback**: Restore previous manifest by SHA (instant recovery)

This workflow ensures you never have half-published states or production 404s.

## Related Documentation

- [Rollback Drill](./ROLLBACK_DRILL.md) - Step-by-step guide to test rollback in production
- [Entry URL Schema](./ENTRY_URL_SCHEMA.md) - Canonical URL patterns for entry documents
- [Section Index Schema](../SECTION_INDEX_SCHEMA.md) - Pagination schema for indexes

