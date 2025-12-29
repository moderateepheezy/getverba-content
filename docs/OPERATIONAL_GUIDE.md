# Operational Guide: Publishing and Integration

This guide walks through the operational steps to publish content and integrate with the app.

## Step 1: First Publish

### Prerequisites
- AWS CLI installed (`brew install awscli` on macOS)
- R2 credentials (endpoint, bucket, access key, secret key)

### Validate Content

```bash
npm run content:validate
```

This should pass with no errors.

### Set Environment Variables

**Option A: Export in terminal (one-time)**
```bash
export R2_ENDPOINT="https://97dc30e52aaefc6c6d1ddd700aef7e27.r2.cloudflarestorage.com"
export R2_BUCKET="getverba-content-prod"
export R2_ACCESS_KEY_ID="your-actual-key"
export R2_SECRET_ACCESS_KEY="your-actual-secret"
```

**Option B: Use .env.local (recommended for local dev)**
```bash
# Copy the example file
cp env.example .env.local

# Edit .env.local with your actual credentials
# Then source it before running scripts:
export $(cat .env.local | grep -v '^#' | xargs)
```

### Test Publish (Dry Run)

```bash
./scripts/publish-content.sh --dry-run
```

This shows what would be uploaded without actually uploading.

### Publish to R2

```bash
./scripts/publish-content.sh
```

### Smoke Test

After publishing, verify content is accessible via the Worker:

```bash
# Test catalog endpoint
curl https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/catalog.json

# Should return JSON with workspace, language, and sections
```

If you get a 200 response with JSON content, the publish was successful!

## Step 2: Store Credentials Safely

### For Local Development

1. **Create `.env.local`** (already in `.gitignore`):
   ```bash
   cp env.example .env.local
   # Edit with your credentials
   ```

2. **Source before publishing**:
   ```bash
   source .env.local
   ./scripts/publish-content.sh
   ```

### For CI/CD (GitHub Actions)

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add these repository secrets:
   - `R2_ENDPOINT`
   - `R2_BUCKET`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`

3. Later, you can add a workflow to publish on tag or manual dispatch.

## Step 3: Verify Worker Configuration

Your Worker (`getverba-content-api`) must:

1. **Return actual R2 object content**, not placeholder JSON
2. **Set Content-Type** from `object.httpMetadata?.contentType` (or `application/json` for `.json` files)
3. **Preserve ETag** and cache headers from R2

### Worker Code Checklist

Your Worker should look something like this:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get object from R2
    const key = url.pathname.slice(1); // Remove leading /
    const object = await env.BUCKET.get(key);
    
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }
    
    // Return object body with proper headers
    const headers = new Headers();
    
    // Set Content-Type from object metadata or default to application/json
    const contentType = object.httpMetadata?.contentType || 
                       (key.endsWith('.json') ? 'application/json' : 'application/octet-stream');
    headers.set('Content-Type', contentType);
    
    // Preserve cache headers from object metadata
    if (object.httpMetadata?.cacheControl) {
      headers.set('Cache-Control', object.httpMetadata.cacheControl);
    }
    
    // Preserve ETag
    if (object.etag) {
      headers.set('ETag', object.etag);
    }
    
    // Handle If-None-Match for 304 responses
    const ifNoneMatch = request.headers.get('If-None-Match');
    if (ifNoneMatch && object.etag && ifNoneMatch === object.etag) {
      return new Response(null, { status: 304, headers });
    }
    
    return new Response(object.body, { headers });
  }
}
```

**Key points:**
- ✅ Returns `object.body` (the actual content stream)
- ✅ Sets `Content-Type` from metadata
- ✅ Preserves `Cache-Control` and `ETag`
- ✅ Handles `If-None-Match` for 304 responses

## Step 4: App Integration (ContentClient)

Create a `ContentClient` in your app to fetch content from the Worker.

### Example ContentClient

```typescript
// ContentClient.ts
const BASE_URL = 'https://getverba-content-api.simpumind-apps.workers.dev';

interface Catalog {
  workspace: string;
  language: string;
  sections: Array<{
    id: string;
    kind: string;
    title: string;
    itemsUrl: string;
  }>;
}

interface CacheEntry {
  data: any;
  etag: string;
  timestamp: number;
}

export class ContentClient {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get catalog for a workspace
   */
  async getCatalog(workspaceId: string): Promise<Catalog> {
    const url = `${BASE_URL}/v1/workspaces/${workspaceId}/catalog.json`;
    return this.fetchWithCache<Catalog>(url);
  }

  /**
   * Fetch with ETag-based caching
   */
  private async fetchWithCache<T>(url: string): Promise<T> {
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);
    
    // Check if cache is still valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const headers: HeadersInit = {};
    
    // Send If-None-Match if we have a cached ETag
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    const response = await fetch(url, { headers });

    // 304 Not Modified - use cached data
    if (response.status === 304) {
      this.cache.set(cacheKey, {
        ...cached!,
        timestamp: Date.now() // Update timestamp
      });
      return cached!.data;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const data = await response.json();
    const etag = response.headers.get('ETag');

    // Store in cache
    if (etag) {
      this.cache.set(cacheKey, {
        data,
        etag,
        timestamp: Date.now()
      });
    }

    return data;
  }

  /**
   * Get pack by URL
   */
  async getPack(packUrl: string): Promise<any> {
    // packUrl is already a full path like /v1/packs/pack-001.json
    const url = `${BASE_URL}${packUrl}`;
    return this.fetchWithCache(url);
  }

  /**
   * Get index (list of packs)
   */
  async getIndex(itemsUrl: string): Promise<{ items: any[] }> {
    // itemsUrl is already a full path like /v1/workspaces/de/context/index.json
    const url = `${BASE_URL}${itemsUrl}`;
    return this.fetchWithCache(url);
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get last-good catalog from local storage (for offline boot)
   */
  async getLastGoodCatalog(workspaceId: string): Promise<Catalog | null> {
    try {
      const stored = localStorage.getItem(`catalog:${workspaceId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load cached catalog', e);
    }
    return null;
  }

  /**
   * Store catalog locally for offline access
   */
  async storeCatalog(workspaceId: string, catalog: Catalog): Promise<void> {
    try {
      localStorage.setItem(`catalog:${workspaceId}`, JSON.stringify(catalog));
    } catch (e) {
      console.warn('Failed to store catalog', e);
    }
  }
}
```

### Usage in App

```typescript
const client = new ContentClient();

// Get catalog
const catalog = await client.getCatalog('de');

// Store for offline access
await client.storeCatalog('de', catalog);

// Get index
const index = await client.getIndex(catalog.sections[0].itemsUrl);

// Get a pack
const pack = await client.getPack(index.items[0].packUrl);
```

### Offline Support

```typescript
// On app boot
async function loadCatalog(workspaceId: string) {
  try {
    // Try to fetch fresh catalog
    const catalog = await client.getCatalog(workspaceId);
    await client.storeCatalog(workspaceId, catalog);
    return catalog;
  } catch (e) {
    // If fetch fails, use cached version
    console.warn('Failed to fetch catalog, using cached version', e);
    const cached = await client.getLastGoodCatalog(workspaceId);
    if (cached) {
      return cached;
    }
    throw new Error('No catalog available (online or cached)');
  }
}
```

## Step 5: Future Authentication

When you add authentication later:

1. **No content layout changes needed** - URLs stay the same
2. **Add auth headers to Worker**:
   ```typescript
   // In Worker
   const authHeader = request.headers.get('Authorization');
   if (!authHeader || !isValidToken(authHeader)) {
     return new Response('Unauthorized', { status: 401 });
   }
   ```

3. **Add auth headers to ContentClient**:
   ```typescript
   // In ContentClient
   const headers: HeadersInit = {
     'Authorization': `Bearer ${token}`
   };
   ```

The content structure and URLs remain unchanged.

## Troubleshooting

### Worker returns `{ ok: true }` for all requests

Your Worker is returning placeholder JSON instead of R2 object content. Check that:
- Worker is fetching from R2: `await env.BUCKET.get(key)`
- Worker returns `object.body`, not `JSON.stringify({ ok: true })`
- Worker sets proper headers from `object.httpMetadata`

### 404 errors after publishing

- Verify files exist in R2: `aws s3 ls s3://getverba-content-prod/v1/ --endpoint-url $R2_ENDPOINT`
- Check Worker R2 binding name matches your `wrangler.toml`
- Verify Worker has access to the bucket

### Cache not working

- Check Worker preserves `ETag` header
- Verify `If-None-Match` header is sent by client
- Check Worker returns 304 for matching ETags

## Next Steps

1. ✅ Publish content to R2
2. ✅ Verify Worker serves real content
3. ✅ Implement ContentClient in app
4. ✅ Test offline caching
5. 🔄 Add CI/CD publish workflow (optional)
6. 🔄 Add authentication (when needed)

