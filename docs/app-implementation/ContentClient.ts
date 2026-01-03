/**
 * ContentClient - Updated for Manifest-driven content loading
 * 
 * Copy this to: src/services/content/ContentClient.ts
 */

const BASE_URL = process.env.EXPO_PUBLIC_CONTENT_API_URL || 
                 'https://getverba-content-api.simpumind-apps.workers.dev';

export interface Manifest {
  activeVersion: string;
  activeWorkspace: string;
  workspaces: Record<string, string>; // "de" -> "/v1/workspaces/de/catalog.json"
}

export interface Release {
  releasedAt: string;
  gitSha: string;
  contentHash: string;
}

export interface Catalog {
  version: string;
  workspace: string;
  languageCode: string;
  languageName: string;
  sections: Array<{
    id: string;
    kind: string;
    title: string;
    itemsUrl: string;
  }>;
}

interface CacheEntry<T> {
  data: T;
  etag: string;
  timestamp: number;
}

class ContentClient {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch manifest from /manifest endpoint
   */
  async fetchManifest(): Promise<Manifest> {
    const url = `${BASE_URL}/manifest`;
    const manifest = await this.fetchWithCache<Manifest>(url);
    
    // Validate manifest structure
    if (!manifest.workspaces || typeof manifest.workspaces !== 'object') {
      throw new Error('Invalid manifest: workspaces must be an object');
    }
    
    if (!manifest.activeWorkspace) {
      // Fallback to first workspace if activeWorkspace not set
      const firstWorkspace = Object.keys(manifest.workspaces)[0];
      if (!firstWorkspace) {
        throw new Error('Invalid manifest: no workspaces available');
      }
      manifest.activeWorkspace = firstWorkspace;
    }
    
    return manifest;
  }

  /**
   * Fetch release metadata
   */
  async fetchRelease(): Promise<Release> {
    const url = `${BASE_URL}/release`;
    return this.fetchWithCache<Release>(url);
  }

  /**
   * Get available workspaces from manifest
   */
  async getAvailableWorkspaces(): Promise<string[]> {
    const manifest = await this.fetchManifest();
    return Object.keys(manifest.workspaces);
  }

  /**
   * Fetch catalog for a workspace
   * @param workspaceId - Internal workspace ID (e.g., "ws_de")
   * @param workspaceCode - Language code from manifest (e.g., "de")
   */
  async fetchCatalog(workspaceId: string, workspaceCode: string): Promise<Catalog> {
    // Get manifest to find catalog URL
    const manifest = await this.fetchManifest();
    const catalogPath = manifest.workspaces[workspaceCode];
    
    if (!catalogPath) {
      throw new Error(`Workspace ${workspaceCode} not found in manifest`);
    }

    const catalogUrl = `${BASE_URL}${catalogPath}`;
    return this.fetchWithCache<Catalog>(catalogUrl);
  }

  /**
   * Fetch index (list of packs) from itemsUrl
   */
  async fetchIndex(itemsUrl: string): Promise<{ items: any[] }> {
    const url = `${BASE_URL}${itemsUrl}`;
    return this.fetchWithCache(url);
  }

  /**
   * Fetch pack by packUrl
   */
  async fetchPack(packUrl: string): Promise<any> {
    const url = `${BASE_URL}${packUrl}`;
    return this.fetchWithCache(url);
  }

  /**
   * Fetch with ETag-based caching and 304 Not Modified support
   * 
   * Always makes a conditional request to check for updates, even if cache is within TTL.
   * This ensures the app gets fresh content when it's published, without waiting for TTL expiry.
   * 
   * Flow:
   * 1. If we have cached data with ETag, always send If-None-Match header
   * 2. Server returns 304 if content unchanged, 200 if changed
   * 3. If 304, use cached data (even if within TTL, this confirms it's still valid)
   * 4. If 200, update cache with new data and ETag
   */
  private async fetchWithCache<T>(url: string): Promise<T> {
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);
    
    const headers: HeadersInit = {};
    
    // Always send If-None-Match if we have a cached ETag
    // This allows the server to return 304 if content hasn't changed,
    // even if our cache is still within TTL. This is the key fix:
    // we check for updates on every request, not just when TTL expires.
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    // Make the request (conditional if we have ETag)
    const response = await fetch(url, { headers });

    // 304 Not Modified - content hasn't changed, use cached data
    if (response.status === 304) {
      if (cached) {
        // Refresh timestamp to extend cache validity
        this.cache.set(cacheKey, {
          ...cached,
          timestamp: Date.now()
        });
        return cached.data;
      }
      throw new Error('Received 304 but no cached data available');
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const etag = response.headers.get('ETag');

    // Store in cache with ETag
    if (etag) {
      // Remove quotes if present
      const cleanEtag = etag.replace(/^"|"$/g, '');
      this.cache.set(cacheKey, {
        data,
        etag: cleanEtag,
        timestamp: Date.now()
      });
    }

    return data;
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get last-good manifest from local storage (for offline boot)
   */
  async getCachedManifest(): Promise<Manifest | null> {
    try {
      // Use your storage solution (AsyncStorage, SecureStore, etc.)
      // const stored = await AsyncStorage.getItem('manifest');
      // if (stored) return JSON.parse(stored);
      return null;
    } catch (e) {
      console.warn('Failed to load cached manifest', e);
      return null;
    }
  }

  /**
   * Store manifest locally for offline access
   */
  async storeManifest(manifest: Manifest): Promise<void> {
    try {
      // Use your storage solution
      // await AsyncStorage.setItem('manifest', JSON.stringify(manifest));
    } catch (e) {
      console.warn('Failed to store manifest', e);
    }
  }
}

export const contentClient = new ContentClient();

