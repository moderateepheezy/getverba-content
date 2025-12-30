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
1. Copy `manifest.staging.json` → `manifest.json` (local file)
2. Regenerate `release.json` with new metadata
3. Upload only `meta/manifest.json` and `meta/release.json` to R2

**Result**: Production instantly flips to the new content. The Worker's `/manifest` endpoint will now return the promoted manifest.

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

To rollback to a previous version:

1. **Check git history** for the previous manifest:
   ```bash
   git log --oneline content/meta/manifest.json
   git show <commit-hash>:content/meta/manifest.json > content/meta/manifest.staging.json
   ```

2. **Promote the previous manifest**:
   ```bash
   ./scripts/promote-staging.sh
   ```

This instantly rolls back production to the previous content version.

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
- `GET /v1/**` → Passthrough to R2 content

**Note**: The Worker does **not** have a separate staging endpoint. Staging is tested by:
1. Publishing content files to R2
2. Verifying content files directly (bypassing manifest)
3. Promoting when ready

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

# 5. Promote to production
./scripts/promote-staging.sh

# 6. Verify production
curl https://getverba-content-api.simpumind-apps.workers.dev/manifest
```

## Summary

- **Publish**: Uploads content + staging manifest (safe, doesn't affect production)
- **Promote**: Flips production manifest (instant, one command)
- **Rollback**: Promote previous manifest from git (instant recovery)

This workflow ensures you never have half-published states or production 404s.

