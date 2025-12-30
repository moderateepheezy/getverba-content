# Content Versioning & Rollback Strategy

This document explains how the GetVerba content pipeline handles versioning, rollback, and integrity.

## Overview

The content pipeline is designed to be **safe to evolve** with:
- **Immutable versioned content** (v1/ files never change once published)
- **Version pointer system** (manifest.json points to active version)
- **ETag-based caching** (304 Not Modified support)
- **Release metadata** (git SHA, content hash, timestamp)

## Architecture

```
R2 Bucket Structure:
├── meta/
│   ├── manifest.json      # Points to active version
│   └── release.json       # Release metadata (git SHA, hash, timestamp)
└── v1/                    # Immutable v1 content
    ├── workspaces/
    │   └── de/
    │       └── catalog.json
    └── packs/
        └── pack-001.json
```

## Manifest System

### `meta/manifest.json`

The manifest is the **single entrypoint** for the app. It points to the active version and workspace catalogs.

```json
{
  "activeVersion": "v1",
  "workspaces": {
    "de": "/v1/workspaces/de/catalog.json"
  }
}
```

**Usage:**
1. App loads `/manifest` first
2. Gets `activeVersion` and workspace URLs
3. Uses those URLs to fetch content

**Benefits:**
- Single stable entrypoint (never changes)
- Can switch versions without app changes
- Can add new workspaces without app changes

### Worker Endpoints

- `GET /manifest` → Returns `meta/manifest.json`
- `GET /release` → Returns `meta/release.json`
- `GET /active` → 302 redirects to current catalog (optional)
- `GET /v1/**` → Passthrough to R2 (existing behavior)

## Versioning Rules

### Immutability

**Rule: Once published, v1/ files are immutable.**

- ✅ Add new files to v1/
- ✅ Create v2/ for schema changes
- ❌ Never modify existing v1/ files
- ❌ Never delete v1/ files

### Version Evolution

When you need to make breaking changes:

1. **Create new version directory**: `content/v2/`
2. **Update manifest**: Point `activeVersion` to `"v2"`
3. **Publish**: New content goes to `s3://bucket/v2/`
4. **Keep v1/**: Old version remains for rollback

Example:
```json
{
  "activeVersion": "v2",
  "workspaces": {
    "de": "/v2/workspaces/de/catalog.json"
  }
}
```

## Release Metadata

### `meta/release.json`

Generated automatically during publish with:

```json
{
  "releasedAt": "2024-12-30T00:00:00Z",
  "gitSha": "abc123...",
  "contentHash": "sha256-hash-of-all-content"
}
```

**Fields:**
- `releasedAt`: ISO 8601 timestamp of release
- `gitSha`: Git commit SHA (or "not-in-git" if not in repo)
- `contentHash`: SHA-256 hash of all JSON files (for integrity)

**Usage:**
- App can log which content release it's using
- Debugging: Know exactly what content version is deployed
- Integrity: Verify content hasn't been tampered with

## ETag & Caching

### If-None-Match Support

The Worker supports conditional requests:

1. **First request**: Client gets content + `ETag` header
2. **Subsequent requests**: Client sends `If-None-Match: "etag"`
3. **If unchanged**: Worker returns `304 Not Modified` (no body)
4. **If changed**: Worker returns `200 OK` with new content

**Benefits:**
- Saves bandwidth (304 responses are tiny)
- Faster responses (no body transfer)
- Better mobile experience

### Cache Headers

All JSON files are published with:
```
Cache-Control: public, max-age=300, stale-while-revalidate=86400
```

- **Fresh for 5 minutes**: Clients cache for 5 min
- **Stale-while-revalidate for 24h**: Serve stale while fetching fresh

## Rollback Strategy

### Quick Rollback

To rollback to a previous version:

1. **Update manifest**: Change `activeVersion` back to `"v1"`
2. **Publish manifest only**: `aws s3 cp meta/manifest.json s3://bucket/meta/manifest.json`
3. **Done**: App immediately uses old version

### Content Rollback

If you need to restore specific files:

1. **Restore from git**: `git checkout <commit> -- content/v1/path/to/file.json`
2. **Publish**: Run `./scripts/publish-content.sh`
3. **Verify**: Check release.json matches expected git SHA

## Integrity & Safety

### Content Hash

The `contentHash` in `release.json` is a SHA-256 hash of all JSON files. This allows:

- **Verification**: Ensure content matches what was published
- **Tamper detection**: Detect if R2 objects were modified
- **Audit trail**: Know exactly what content was deployed

### Git SHA

The `gitSha` links the release to a specific commit:

- **Traceability**: Know which code published which content
- **Reproducibility**: Can recreate exact release from git
- **Debugging**: Link content issues to code changes

## Migration Path

### Adding New Version

1. Create `content/v2/` with new schema
2. Copy/migrate content from v1/ to v2/
3. Update `manifest.json` to point to v2/
4. Publish: `./scripts/publish-content.sh`
5. App automatically uses v2/ (no code changes needed)

### Gradual Migration

You can run both versions in parallel:

```json
{
  "activeVersion": "v2",
  "workspaces": {
    "de": "/v2/workspaces/de/catalog.json",
    "de-legacy": "/v1/workspaces/de/catalog.json"
  }
}
```

## Best Practices

1. **Never modify published v1/ files** - Create v2/ instead
2. **Always validate before publishing** - Run `npm run content:validate`
3. **Check release.json after publish** - Verify git SHA matches
4. **Use manifest for version switching** - Don't hardcode version URLs
5. **Test rollback procedure** - Know how to rollback before you need it

## Future Enhancements

- **A/B testing**: Multiple active versions for gradual rollout
- **Content signing**: Cryptographic signatures for integrity
- **Version history**: Track all published versions
- **Automated rollback**: Auto-rollback on error detection

