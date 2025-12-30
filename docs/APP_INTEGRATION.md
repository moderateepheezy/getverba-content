# App Integration Guide

This guide explains how to integrate your mobile app with the GetVerba content pipeline using the manifest system.

## Overview

Instead of hardcoding workspace URLs, your app should:
1. Fetch `/manifest` to get the active workspace
2. Load the catalog from the manifest-provided URL
3. Use that catalog to discover content

This enables **instant rollback** and **version switching** without app updates.

## Step 1: Update App to Use Manifest

### Before (Hardcoded)

```typescript
// ❌ Don't do this anymore
const catalogUrl = "https://getverba-content-api.simpumind-apps.workers.dev/v1/workspaces/de/catalog.json";
const catalog = await fetch(catalogUrl).then(r => r.json());
```

### After (Manifest-Based)

```typescript
// ✅ Do this instead
const BASE_URL = "https://getverba-content-api.simpumind-apps.workers.dev";

// Step 1: Fetch manifest
const manifest = await fetch(`${BASE_URL}/manifest`).then(r => r.json());
// Returns: { activeWorkspace: "de", workspaces: { de: "/v1/workspaces/de/catalog.json" } }

// Step 2: Get catalog URL from manifest
const activeWorkspace = manifest.activeWorkspace || "de";
const catalogUrl = `${BASE_URL}${manifest.workspaces[activeWorkspace]}`;

// Step 3: Load catalog
const catalog = await fetch(catalogUrl).then(r => r.json());
```

## Step 2: Implement ContentClient

Update your `ContentClient` to use the manifest:

```typescript
class ContentClient {
  private baseUrl = "https://getverba-content-api.simpumind-apps.workers.dev";
  private manifest: any = null;

  async getManifest() {
    if (this.manifest) return this.manifest;
    
    const response = await fetch(`${this.baseUrl}/manifest`);
    if (!response.ok) throw new Error("Failed to fetch manifest");
    
    this.manifest = await response.json();
    return this.manifest;
  }

  async getCatalog(workspaceId?: string) {
    const manifest = await this.getManifest();
    const targetWorkspace = workspaceId || manifest.activeWorkspace || "de";
    const catalogPath = manifest.workspaces[targetWorkspace];
    
    if (!catalogPath) {
      throw new Error(`Workspace ${targetWorkspace} not found in manifest`);
    }

    const catalogUrl = `${this.baseUrl}${catalogPath}`;
    return this.fetchWithCache(catalogUrl);
  }

  async getIndex(itemsUrl: string) {
    const url = `${this.baseUrl}${itemsUrl}`;
    return this.fetchWithCache(url);
  }

  async getPack(packUrl: string) {
    const url = `${this.baseUrl}${packUrl}`;
    return this.fetchWithCache(url);
  }

  private async fetchWithCache(url: string) {
    // Add ETag support for 304 responses
    const cached = this.getCached(url);
    const headers: HeadersInit = {};
    
    if (cached?.etag) {
      headers["If-None-Match"] = cached.etag;
    }

    const response = await fetch(url, { headers });

    // 304 Not Modified - use cached
    if (response.status === 304) {
      return cached.data;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const data = await response.json();
    const etag = response.headers.get("ETag");

    // Cache with ETag
    if (etag) {
      this.setCached(url, { data, etag });
    }

    return data;
  }

  // Simple cache implementation
  private cache: Map<string, { data: any; etag: string }> = new Map();
  
  private getCached(url: string) {
    return this.cache.get(url);
  }

  private setCached(url: string, entry: { data: any; etag: string }) {
    this.cache.set(url, entry);
  }
}
```

## Step 3: Usage Example

```typescript
const client = new ContentClient();

// Get catalog (automatically uses active workspace from manifest)
const catalog = await client.getCatalog();

// Or specify a workspace
const deCatalog = await client.getCatalog("de");

// Get index
const contextIndex = await client.getIndex(catalog.sections[0].itemsUrl);

// Get pack
const pack = await client.getPack(contextIndex.items[0].packUrl);
```

## Step 4: Offline Support

Store manifest and catalog for offline access:

```typescript
class ContentClient {
  // ... existing code ...

  async getManifest() {
    // Try cache first
    const cached = await this.getCachedManifest();
    if (cached) {
      // Try to refresh in background
      this.refreshManifest();
      return cached;
    }

    // Fetch fresh
    const manifest = await fetch(`${this.baseUrl}/manifest`).then(r => r.json());
    await this.storeManifest(manifest);
    return manifest;
  }

  async getCatalog(workspaceId?: string) {
    try {
      const catalog = await this.getCatalogFromNetwork(workspaceId);
      await this.storeCatalog(workspaceId, catalog);
      return catalog;
    } catch (e) {
      // Fallback to cached
      const cached = await this.getCachedCatalog(workspaceId);
      if (cached) return cached;
      throw e;
    }
  }

  // Storage helpers (use your preferred storage - AsyncStorage, SQLite, etc.)
  private async getCachedManifest() {
    // Load from local storage
  }

  private async storeManifest(manifest: any) {
    // Save to local storage
  }
}
```

## Benefits

### 1. Instant Rollback

To rollback content:
1. Update `meta/manifest.json` in content repo
2. Change `activeWorkspace` or point to different version
3. Publish: `./scripts/publish-content.sh`
4. App automatically uses new content on next manifest fetch

**No app update required!**

### 2. A/B Testing

Test new content versions:
```json
{
  "activeWorkspace": "de",
  "workspaces": {
    "de": "/v1/workspaces/de/catalog.json",
    "de-test": "/v2/workspaces/de/catalog.json"
  }
}
```

Switch `activeWorkspace` to `"de-test"` to test v2 content.

### 3. Multi-Workspace Support

Add new workspaces without app changes:
```json
{
  "activeWorkspace": "de",
  "workspaces": {
    "de": "/v1/workspaces/de/catalog.json",
    "en": "/v1/workspaces/en/catalog.json",
    "fr": "/v1/workspaces/fr/catalog.json"
  }
}
```

App can list all available workspaces from manifest.

## Testing

### Test Manifest Endpoint

```bash
curl https://getverba-content-api.simpumind-apps.workers.dev/manifest
```

Should return:
```json
{
  "activeWorkspace": "de",
  "workspaces": {
    "de": "/v1/workspaces/de/catalog.json"
  }
}
```

### Test Active Endpoint

```bash
curl -I https://getverba-content-api.simpumind-apps.workers.dev/active
```

Should return `302` redirect to catalog.

### Test ETag Support

```bash
# First request
curl -I https://getverba-content-api.simpumind-apps.workers.dev/manifest

# Second request with If-None-Match (should return 304)
curl -I -H "If-None-Match: \"etag-from-first-request\"" \
  https://getverba-content-api.simpumind-apps.workers.dev/manifest
```

## Migration Checklist

- [ ] Update `ContentClient` to fetch `/manifest` first
- [ ] Remove hardcoded workspace URLs
- [ ] Add ETag support for 304 responses
- [ ] Add offline caching for manifest and catalog
- [ ] Test rollback by changing manifest
- [ ] Test multi-workspace support
- [ ] Update error handling for missing workspaces

## Next Steps

Once manifest-based loading is working:
1. Add version switching UI (let users choose workspace)
2. Add content update notifications (check manifest periodically)
3. Add analytics (track which content version users see)
4. Prepare for authentication (manifest URLs stay the same)

