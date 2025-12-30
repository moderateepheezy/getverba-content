# Rollback Drill

This document provides step-by-step instructions for testing the rollback workflow in production safely.

## Purpose

The rollback drill proves that:
1. Manifest archiving works on promote
2. Archived manifests can be listed via `/manifests` endpoint
3. Rollback script can restore a previous manifest
4. The full publish → promote → rollback cycle works end-to-end

## Preconditions

Before running the drill:

1. **At least one archived manifest exists**
   ```bash
   ./scripts/list-manifests.sh
   ```
   If empty, run a promote first: `./scripts/promote-staging.sh`

2. **Content validation passes**
   ```bash
   npm run content:validate
   ```

3. **You have R2 credentials configured**
   Either in `.env.local` or exported in shell.

## The Drill

### Step 1: Record Current State

```bash
# List current manifests
./scripts/list-manifests.sh

# Save the current SHA for rollback
CURRENT_SHA=$(curl -s https://getverba-content-api.simpumind-apps.workers.dev/release | jq -r '.gitSha')
echo "Current SHA: $CURRENT_SHA"

# Check current content (pick any entry)
curl -s https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/packs/work_1/pack.json | jq -r '.description'
```

### Step 2: Make a Harmless Content Change

Edit a description string in any pack entry. Example:

```bash
# Add a test marker to description
sed -i '' 's/"description": "\([^"]*\)"/"description": "\1 [DRILL TEST]"/' \
  content/v1/workspaces/de/packs/work_1/pack.json
```

Verify the change:
```bash
grep "description" content/v1/workspaces/de/packs/work_1/pack.json
```

### Step 3: Commit and Publish

```bash
git add -A
git commit -m "chore: rollback drill test change"
git push origin main

# Publish to staging (does NOT update production manifest)
./scripts/publish-content.sh
```

### Step 4: Promote to Production

```bash
./scripts/promote-staging.sh
```

This will:
- Run smoke test
- Copy staging manifest → production
- Archive manifest to `meta/manifests/<newSha>.json`
- Upload to R2

### Step 5: Verify Production Changed

```bash
# Check the new content
curl -s https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/packs/work_1/pack.json | jq -r '.description'
# Should show: "... [DRILL TEST]"

# Verify new manifest archived
./scripts/list-manifests.sh
# Should show 2+ manifests now
```

### Step 6: Rollback to Previous Manifest

```bash
# List manifests and pick the PREVIOUS one (not the latest)
./scripts/list-manifests.sh

# Rollback using the SHA from Step 1
./scripts/rollback.sh $CURRENT_SHA
```

### Step 7: Verify Rollback

```bash
# Check manifest was restored
curl -s https://getverba-content-api.simpumind-apps.workers.dev/manifest | jq

# Check release metadata updated
curl -s https://getverba-content-api.simpumind-apps.workers.dev/release | jq
```

### Step 8: Clean Up Content

**Important**: The rollback only affects the manifest, not individual content files.

To fully revert the content change:
```bash
# Revert the file
git checkout HEAD~1 -- content/v1/workspaces/de/packs/work_1/pack.json

# Or manually remove the test marker
sed -i '' 's/ \[DRILL TEST\]//' content/v1/workspaces/de/packs/work_1/pack.json

# Republish
./scripts/publish-content.sh

# Commit
git add -A
git commit -m "chore: revert rollback drill test change"
git push origin main
```

## How to Select Which SHA to Rollback To

1. **List all archived manifests**:
   ```bash
   ./scripts/list-manifests.sh
   ```

2. **Inspect a specific manifest** (to see what workspaces it contains):
   ```bash
   curl -s https://getverba-content-api.simpumind-apps.workers.dev/manifests/<sha> | jq
   ```

3. **Check the release metadata** (to see timestamps):
   ```bash
   curl -s https://getverba-content-api.simpumind-apps.workers.dev/release | jq
   ```

4. **Cross-reference with git history**:
   ```bash
   git log --oneline | head -10
   ```

## Common Failure Modes and Fixes

### 1. "Archive not found in R2"

**Cause**: The SHA you're trying to rollback to doesn't have an archived manifest.

**Fix**:
```bash
# List available archives
./scripts/list-manifests.sh

# Use a SHA from the list
./scripts/rollback.sh <valid-sha>
```

### 2. "Smoke test failed"

**Cause**: Content referenced by the manifest is not accessible.

**Fix**:
- Check if content files exist in R2
- Re-publish content: `./scripts/publish-content.sh`
- Then promote: `./scripts/promote-staging.sh`

### 3. Wrong SHA Format

**Cause**: Invalid git SHA format (must be 7-40 hex characters).

**Fix**: Use the full SHA from `./scripts/list-manifests.sh` output.

### 4. Content Didn't Revert

**Cause**: Manifest rollback only restores workspace mappings, not individual content files.

**Fix**: Re-publish the old content from git:
```bash
git checkout <old-sha> -- content/v1/
./scripts/publish-content.sh
./scripts/promote-staging.sh
```

## Understanding Manifest vs Content Rollback

| Rollback Type | What Changes | Use Case |
|---------------|--------------|----------|
| **Manifest** (`rollback.sh`) | `meta/manifest.json` | Add/remove workspaces, change active workspace |
| **Content** (git + republish) | Individual files in `/v1/` | Revert pack, index, or catalog changes |

The current architecture uses **manifest rollback** for configuration changes and **git + republish** for content changes.

## Verification Commands

```bash
# List archives
./scripts/list-manifests.sh

# Check current manifest
curl -s https://getverba-content-api.simpumind-apps.workers.dev/manifest | jq

# Check release info
curl -s https://getverba-content-api.simpumind-apps.workers.dev/release | jq

# Check specific archive
curl -s https://getverba-content-api.simpumind-apps.workers.dev/manifests/<sha> | jq

# Validate content locally
npm run content:validate
```

## Exit Criteria

The drill is successful when:

- [x] At least 2 archived manifests exist
- [x] Promote creates a new archive automatically
- [x] `./scripts/list-manifests.sh` shows all archives
- [x] Rollback restores the previous manifest
- [x] `/manifest` endpoint reflects the rollback
- [x] Content cleanup is documented and works

