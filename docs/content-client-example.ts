/**
 * Example ContentClient for GetVerba app
 * 
 * This client fetches content from the Worker API with:
 * - ETag-based caching (304 Not Modified support)
 * - Local storage for offline access
 * - Automatic cache invalidation
 * 
 * Copy this to your app codebase and adapt as needed.
 */

const BASE_URL = process.env.CONTENT_BASE_URL || 
                 'https://getverba-content-api.simpumind-apps.workers.dev';

export interface Catalog {
  workspace: string;
  language: string;
  sections: Array<{
    id: string;
    kind: string;
    title: string;
    itemsUrl?: string;
  }>;
}

export interface PackIndex {
  items: Array<{
    id: string;
    title: string;
    type: string;
    level: string;
    durationMins: number;
    packUrl: string;
  }>;
}

export interface Pack {
  id: string;
  type: string;
  title: string;
  language: string;
  level: string;
  durationMins: number;
  tags: string[];
  items: any[];
}

interface CacheEntry<T> {
  data: T;
  etag: string;
  timestamp: number;
}

export class ContentClient {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get catalog for a workspace
   */
  async getCatalog(workspaceId: string): Promise<Catalog> {
    const url = `${BASE_URL}/v1/workspaces/${workspaceId}/catalog.json`;
    const catalog = await this.fetchWithCache<Catalog>(url);
    
    // Store for offline access
    await this.storeCatalog(workspaceId, catalog);
    
    return catalog;
  }

  /**
   * Get index (list of packs) from itemsUrl
   */
  async getIndex(itemsUrl: string): Promise<PackIndex> {
    // itemsUrl is already a full path like /v1/workspaces/de/context/index.json
    const url = `${BASE_URL}${itemsUrl}`;
    return this.fetchWithCache<PackIndex>(url);
  }

  /**
   * Get pack by packUrl
   */
  async getPack(packUrl: string): Promise<Pack> {
    // packUrl is already a full path like /v1/packs/pack-001.json
    const url = `${BASE_URL}${packUrl}`;
    return this.fetchWithCache<Pack>(url);
  }

  /**
   * Fetch with ETag-based caching and 304 Not Modified support
   */
  private async fetchWithCache<T>(url: string): Promise<T> {
    const cacheKey = url;
    const cached = this.cache.get(cacheKey);
    
    // Check if cache is still valid (within TTL)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const headers: HeadersInit = {};
    
    // Send If-None-Match if we have a cached ETag
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    const response = await fetch(url, { headers });

    // 304 Not Modified - use cached data and update timestamp
    if (response.status === 304) {
      if (cached) {
        this.cache.set(cacheKey, {
          ...cached,
          timestamp: Date.now() // Refresh timestamp
        });
        return cached.data;
      }
      // Fallback: if we get 304 but no cache, something's wrong
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
   * Get last-good catalog from local storage (for offline boot)
   */
  async getLastGoodCatalog(workspaceId: string): Promise<Catalog | null> {
    try {
      if (typeof localStorage === 'undefined') {
        return null; // Not available in this environment
      }
      
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
      if (typeof localStorage === 'undefined') {
        return; // Not available in this environment
      }
      
      localStorage.setItem(`catalog:${workspaceId}`, JSON.stringify(catalog));
    } catch (e) {
      console.warn('Failed to store catalog', e);
    }
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Load catalog with offline fallback
   */
  async loadCatalogWithFallback(workspaceId: string): Promise<Catalog> {
    try {
      // Try to fetch fresh catalog
      const catalog = await this.getCatalog(workspaceId);
      return catalog;
    } catch (e) {
      // If fetch fails, try cached version
      console.warn('Failed to fetch catalog, trying cached version', e);
      const cached = await this.getLastGoodCatalog(workspaceId);
      if (cached) {
        return cached;
      }
      throw new Error(`No catalog available for workspace ${workspaceId} (online or cached)`);
    }
  }
}

// Usage example:
/*
const client = new ContentClient();

// Get catalog (with offline fallback)
const catalog = await client.loadCatalogWithFallback('de');

// Get index
const index = await client.getIndex(catalog.sections[0].itemsUrl!);

// Get a pack
const pack = await client.getPack(index.items[0].packUrl);
*/

