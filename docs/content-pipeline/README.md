# GetVerba Content Pipeline

A zero-cost, engine-ready content pipeline for GetVerba using Cloudflare R2 + Worker API. This pipeline stores versioned JSON content in-repo and publishes it to R2 for serving via a Worker API endpoint.

## What This Is

- **R2 + Worker Content Pipeline**: Content is stored as versioned JSON files in the repository and published to Cloudflare R2
- **No Login Required**: All content is public and accessible via the Worker API
- **Workspace-Scoped Language**: Content is organized by workspace (e.g., `de` for German), allowing workspace-scoped language switching
- **Versioned Structure**: Content is versioned under `/v1/` with support for future versions

## Architecture

```
Local Repository          R2 Bucket              Worker API
─────────────────        ──────────             ───────────
content/v1/       →      s3://bucket/v1/   →    /v1/...
  workspaces/              workspaces/             workspaces/
    de/                      de/                     de/
      catalog.json            catalog.json            catalog.json
```

## Environment Variables

### Required Variables

```bash
# R2 Account Endpoint (host-only, S3-compatible API endpoint)
# Do NOT include bucket name in this URL
export R2_ENDPOINT="https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"

# R2 Bucket Name
export R2_BUCKET="getverba-content-prod"

# R2 Access Credentials
export R2_ACCESS_KEY_ID="your-access-key-id"
export R2_SECRET_ACCESS_KEY="your-secret-access-key"
```

### Important Notes

- **R2_ENDPOINT**: Must be the account-level endpoint (host-only URL), not a bucket URL
  - ✅ Correct: `https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com`
  - ❌ Wrong: `https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com/getverba-content-prod`
- The publish script will detect and error if you accidentally use a bucket path URL

## URL Mapping

Content files follow this mapping pattern:

| Local Path | R2 Path | Worker API Path |
|------------|---------|-----------------|
| `content/v1/workspaces/de/catalog.json` | `s3://bucket/v1/workspaces/de/catalog.json` | `/v1/workspaces/de/catalog.json` |
| `content/v1/packs/pack-001.json` | `s3://bucket/v1/packs/pack-001.json` | `/v1/packs/pack-001.json` |

All URLs in JSON files should be relative paths starting with `/v1/` (not full domain URLs).

## Running the Pipeline

### 1. Validate Content Locally

Validates all JSON files, checks required fields, and verifies path references:

```bash
npm run content:validate
```

This checks:
- All JSON files parse correctly
- **All documents have `schemaVersion` field** (required)
- At least one workspace catalog exists
- Catalog files have required fields (`schemaVersion`, `workspace`, `languageCode`, `languageName`, `sections`)
- Sections have required fields (`id`, `kind`, `title`)
- Referenced JSON paths (ending with `.json` and starting with `/v1/`) exist
- No duplicate IDs
- **Schema compatibility** (no breaking changes for schemaVersion 1)
- **Workspace hashes** match computed values (in manifest)

### 2. Dry Run Publish

Test the publish process without uploading:

```bash
./scripts/publish-content.sh --dry-run
```

### 3. Publish to R2

Upload content to Cloudflare R2:

```bash
# Set environment variables first
export R2_ENDPOINT="https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"
export R2_BUCKET="getverba-content-prod"
export R2_ACCESS_KEY_ID="your-access-key-id"
export R2_SECRET_ACCESS_KEY="your-secret-access-key"

# Publish
./scripts/publish-content.sh
```

The script will:
1. Sync all files from `content/v1/` to `s3://bucket/v1/`
2. Re-upload all JSON files with:
   - `Content-Type: application/json`
   - `Cache-Control: public, max-age=300, stale-while-revalidate=86400`

### 4. Sanity Check (Test Bucket Access)

Test that your credentials work:

```bash
./scripts/publish-content.sh --sanity-check
```

### 5. Verify Published Content

Test that published content is accessible via the Worker API:

```bash
npm run content:verify
```

Or with a custom base URL:

```bash
BASE_URL="https://your-worker.workers.dev" npm run content:verify
```

## Caching Policy

JSON objects in R2 are published with the following cache headers:

```
Cache-Control: public, max-age=300, stale-while-revalidate=86400
```

This means:
- **Fresh for 5 minutes** (`max-age=300`): Clients can use cached content for 5 minutes
- **Stale-while-revalidate for 24 hours** (`stale-while-revalidate=86400`): After 5 minutes, clients can serve stale content while fetching fresh content in the background

The Worker may override these headers if needed, but the object metadata provides a baseline caching strategy. If you ever serve directly from R2 or via CDN rules, these headers will be respected.

## Content Structure

```
content/v1/
├── workspaces/
│   └── {workspace-id}/
│       ├── catalog.json          # Workspace catalog
│       ├── context/
│       │   └── index.json         # Context pack index
│       └── exams/
│           └── index.json          # Exam pack index
└── packs/
    ├── pack-001.json               # Individual pack files
    └── pack-002.json
```

### Catalog Schema

```json
{
  "workspace": "de",
  "language": "German",
  "sections": [
    {
      "id": "context",
      "kind": "context",
      "title": "Context Library",
      "itemsUrl": "/v1/workspaces/de/context/index.json"
    }
  ]
}
```

Required fields:
- `workspace`: Workspace identifier
- `language`: Display name
- `sections`: Array of section objects
  - `id`: Section identifier (string)
  - `kind`: Section type (string)
  - `title`: Display title (string)
  - `itemsUrl`: Path to index file (optional, but validated if present)

## Future-Proofing

### Authentication

The current pipeline serves all content publicly. To add authentication later:

- **No content layout changes needed**: The content structure remains the same
- **Client fetch stays the same**: URLs remain `/v1/workspaces/de/catalog.json`
- **Auth headers can be added**: The Worker can check authentication headers and return 401/403 as needed
- **Content files don't need modification**: All changes happen at the Worker layer

### Pagination Strategy

For large content lists, pagination can be implemented using:

1. **Page files**: Catalog can reference page files like `packs.page1.json`, `packs.page2.json`
2. **Index pagination**: Index files can include pagination metadata:
   ```json
   {
     "items": [...],
     "pagination": {
       "page": 1,
       "pageSize": 50,
       "total": 150,
       "nextPageUrl": "/v1/workspaces/de/context/index-2.json"
     }
   }
   ```
3. **Worker-side pagination**: The Worker can implement query parameters like `?page=2&pageSize=50`

### A1-Only Filtering

Level-based filtering (e.g., A1-only content) can be implemented via:

1. **Workspace catalog variants**: Create `catalog.a1.json` alongside `catalog.json`
2. **Query parameter mapping**: Worker can filter based on query params like `?level=A1`
3. **Separate workspace**: Create `workspaces/de-a1/` for A1-only content
4. **Tag-based filtering**: Use the `tags` array in pack files with Worker-side filtering

The content structure supports all these approaches without requiring layout changes.

## CI/CD Integration

The pipeline includes GitHub Actions CI that:

- Runs on pull requests and pushes to `main`
- Validates all content files
- Ensures content structure is correct before merging

See `.github/workflows/content-validate.yml` for details.

## Troubleshooting

### "R2_ENDPOINT appears to be a bucket path URL"

You've set `R2_ENDPOINT` to include the bucket name. Use only the account endpoint:

```bash
# Wrong
export R2_ENDPOINT="https://...r2.cloudflarestorage.com/getverba-content-prod"

# Correct
export R2_ENDPOINT="https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"
export R2_BUCKET="getverba-content-prod"
```

### "Referenced path does not exist"

A JSON file references a path that doesn't exist. Check:
- The path starts with `/v1/`
- The path ends with `.json`
- The file exists at `content/v1/{path without /v1/ prefix}`

### Validation fails in CI

Ensure:
- All JSON files are valid JSON
- At least one workspace catalog exists
- All referenced paths exist
- Required fields are present in catalogs and sections

## Worker API Endpoint

Content is served via:

```
https://getverba-content-api.simpumind-apps.workers.dev
```

Example endpoints:
- Health: `/health`
- Catalog: `/v1/workspaces/de/catalog.json`
- Index: `/v1/workspaces/de/context/index.json`
- Pack: `/v1/packs/pack-001.json`

All endpoints return JSON with appropriate `Content-Type` and cache headers.

