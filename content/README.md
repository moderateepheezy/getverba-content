# GetVerba Content Pipeline

This directory contains versioned JSON content for the GetVerba platform. Content is organized by version (currently `v1/`) and published to Cloudflare R2 for serving via the Worker API.

## Directory Structure

```
content/
└── v1/
    ├── workspaces/
    │   └── de/
    │       ├── catalog.json          # Workspace catalog with sections
    │       ├── context/
    │       │   └── index.json        # Context pack index
    │       └── exams/
    │           └── index.json        # Exam pack index
    └── packs/
        ├── pack-001.json             # Individual pack files
        ├── pack-002.json
        └── pack-003.json
```

## Content Schema

### Catalog (`workspaces/{workspace}/catalog.json`)

The catalog defines the workspace structure and available sections.

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

**Required fields:**
- `workspace`: Workspace identifier (e.g., "de", "fr")
- `language`: Display name for the language
- `sections`: Array of section objects

**Section fields:**
- `id`: Unique section identifier
- `kind`: Type of section ("context", "exams", "mechanics")
- `title`: Display title
- `itemsUrl`: Path to index file (must start with `/v1/`)

### Index Files (`workspaces/{workspace}/{section}/index.json`)

Index files list available packs for a section.

```json
{
  "items": [
    {
      "id": "pack-001",
      "title": "Basic German Greetings",
      "type": "context",
      "level": "A1",
      "durationMins": 15,
      "packUrl": "/v1/packs/pack-001.json"
    }
  ]
}
```

**Required fields:**
- `items`: Array of pack references

**Pack reference fields:**
- `id`: Pack identifier
- `title`: Display title
- `type`: Pack type ("context", "exam", "mechanics")
- `level`: Language level ("A1", "A2", "B1", etc.)
- `durationMins`: Estimated duration in minutes
- `packUrl`: Path to pack file (must start with `/v1/`)

### Pack Files (`packs/{pack-id}.json`)

Pack files contain the actual content items.

```json
{
  "id": "pack-001",
  "type": "context",
  "title": "Basic German Greetings",
  "language": "de",
  "level": "A1",
  "durationMins": 15,
  "tags": ["greetings", "basics"],
  "items": [
    {
      "id": "item-001",
      "text": "Guten Morgen",
      "translation": "Good morning",
      "audioUrl": "/v1/audio/pack-001/item-001.mp3"
    }
  ]
}
```

**Required fields:**
- `id`: Pack identifier (must match filename)
- `type`: Pack type ("context", "exam", "mechanics")
- `title`: Display title
- `language`: Language code (e.g., "de", "fr")
- `level`: Language level ("A1", "A2", "B1", etc.)
- `durationMins`: Estimated duration in minutes (number)
- `tags`: Array of taxonomy tags (for filtering)
- `items`: Array of content items

**Item structure:**
- For `context` packs: `id`, `text`, `translation`, `audioUrl`
- For `exam` packs: `id`, `question`, `type`, `options`, `correctAnswer`
- Item structure may vary by pack type

## Adding New Workspaces

1. Create workspace directory: `content/v1/workspaces/{workspace-code}/`
2. Create `catalog.json` with workspace metadata and sections
3. Create section directories (e.g., `context/`, `exams/`)
4. Create `index.json` files in each section directory
5. Create pack files in `content/v1/packs/` and reference them in indexes
6. Run validation: `npm run content:validate`
7. Publish: `./scripts/publish-content.sh`

Example for French workspace:
```
content/v1/workspaces/fr/
├── catalog.json
├── context/
│   └── index.json
└── exams/
    └── index.json
```

## A1 Filtering (Taxonomy Tags)

Packs include a `tags` array for filtering. To filter by level (A1, A2, etc.), use the `level` field directly. For more granular filtering, add tags like:

- `["basics", "greetings"]` - Topic-based tags
- `["beginner", "intermediate"]` - Difficulty tags
- `["grammar", "vocabulary"]` - Content type tags

Future filtering can be implemented by:
1. Adding tags to pack files
2. Implementing filter logic in the Worker or client
3. Using query parameters like `?tags=basics,greetings&level=A1`

## Pagination for Large Lists

For large index files, pagination will be implemented using:

1. **Index files with pagination metadata:**
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

2. **Multiple index files:**
   - `index.json` (page 1)
   - `index-2.json` (page 2)
   - `index-3.json` (page 3)
   - etc.

3. **Client-side pagination:**
   - Load initial page from `index.json`
   - Load additional pages as needed via `nextPageUrl`

## Running Scripts

### Validate Content

Validates all JSON files, checks required fields, and verifies path references:

```bash
npm run content:validate
```

This checks:
- Required fields exist in all files
- `itemsUrl` paths are valid and start with `/v1/`
- `packUrl` references point to existing pack files
- Pack files have valid structure

### Publish Content

Uploads content to Cloudflare R2:

```bash
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com" \
R2_ACCESS_KEY_ID="your-access-key" \
R2_SECRET_ACCESS_KEY="your-secret-key" \
./scripts/publish-content.sh
```

**Dry run mode:**
```bash
./scripts/publish-content.sh --dry-run
```

**Environment variables:**
- `R2_ENDPOINT`: Your R2 S3 API endpoint
- `R2_ACCESS_KEY_ID`: R2 access key ID
- `R2_SECRET_ACCESS_KEY`: R2 secret access key
- `R2_BUCKET`: Bucket name (defaults to `getverba-content-prod`)

The script:
1. Syncs all files from `content/v1/` to `s3://{bucket}/v1/`
2. Sets `content-type: application/json` for all JSON files
3. Preserves directory structure

### Verify Content

Tests all endpoints against the deployed Worker:

```bash
npm run content:verify
```

Or with custom base URL:
```bash
BASE_URL="https://your-worker.workers.dev" npm run content:verify
```

This verifies:
- `/health` endpoint
- Catalog endpoint (`/v1/workspaces/de/catalog.json`)
- All `itemsUrl` endpoints from catalog
- At least one pack file from each index

## URL Structure

All URLs in JSON files should be relative paths starting with `/v1/`:

- ✅ `/v1/workspaces/de/catalog.json`
- ✅ `/v1/packs/pack-001.json`
- ❌ `https://example.com/v1/packs/pack-001.json` (no full URLs)
- ❌ `/packs/pack-001.json` (must start with `/v1/`)

The Worker serves content from the R2 bucket and maps paths accordingly.

## Versioning

Content is versioned under `/v1/`. Future versions will be added as:
- `content/v2/` for version 2
- Worker will serve from appropriate version based on URL path

## Notes

- All content is public (no authentication required)
- Content is served via Cloudflare Worker from R2
- JSON files must be valid JSON (no comments, trailing commas)
- File paths in JSON must match actual file structure
- Pack IDs must match filenames (e.g., `pack-001.json` has `id: "pack-001"`)

