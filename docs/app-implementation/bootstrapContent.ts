/**
 * Content Bootstrap - Single entrypoint for content loading
 * 
 * Copy this to: src/services/content/bootstrapContent.ts
 */

import { contentClient, Manifest } from './ContentClient';
// Adjust these imports to match your actual store paths
// import { workspaceStore } from '../../state/workspaceStore';
// import { useTopicPacksStore } from '../../state/useTopicPacksStore';

export type ContentBootstrapResult = {
  manifest: Manifest;
  activeWorkspace: string;
  availableWorkspaces: string[];
};

export type BootstrapError = {
  type: 'network' | 'manifest' | 'catalog' | 'unknown';
  message: string;
};

/**
 * Bootstrap content at app start
 * 
 * Flow:
 * 1. Fetch manifest
 * 2. Determine active workspace
 * 3. Set workspace in store (workspace-scoped)
 * 4. Fetch catalog for active workspace
 * 5. Update catalog store
 */
export async function bootstrapContent(): Promise<ContentBootstrapResult> {
  try {
    // Step 1: Fetch manifest
    const manifest = await contentClient.fetchManifest();
    
    // Store manifest for offline access
    await contentClient.storeManifest(manifest);

    // Step 2: Get available workspaces
    const availableWorkspaces = Object.keys(manifest.workspaces || {});
    if (availableWorkspaces.length === 0) {
      throw new Error('No workspaces available in manifest');
    }

    // Step 3: Determine active workspace
    const activeWorkspace =
      (manifest.activeWorkspace && availableWorkspaces.includes(manifest.activeWorkspace))
        ? manifest.activeWorkspace
        : availableWorkspaces[0];

    // Step 4: Persist workspace-scoped selection
    // IMPORTANT: This should be workspace-scoped, not global
    // Example (adjust to your store API):
    // workspaceStore.getState().setActiveWorkspaceByLanguageCode(activeWorkspace);
    // workspaceStore.getState().setAvailableWorkspaces(availableWorkspaces);
    
    // If your store doesn't have these methods, add them:
    // - setActiveWorkspaceByLanguageCode(code: string)
    // - setAvailableWorkspaces(workspaces: string[])

    // Step 5: Fetch catalog for the active workspace
    const workspaceId = `ws_${activeWorkspace}`;
    const catalog = await contentClient.fetchCatalog(workspaceId, activeWorkspace);

    // Step 6: Push catalog into store that drives Library rendering
    // Example (adjust to your store API):
    // useTopicPacksStore.getState().setCatalogFromRemote(catalog);
    
    // If your store doesn't have setCatalogFromRemote, add it:
    // - setCatalogFromRemote(catalog: Catalog)

    return { manifest, activeWorkspace, availableWorkspaces };
  } catch (error: any) {
    // Determine error type for better error handling
    let errorType: BootstrapError['type'] = 'unknown';
    if (error.message?.includes('network') || error.message?.includes('fetch')) {
      errorType = 'network';
    } else if (error.message?.includes('manifest')) {
      errorType = 'manifest';
    } else if (error.message?.includes('catalog')) {
      errorType = 'catalog';
    }

    throw {
      type: errorType,
      message: error.message || 'Failed to bootstrap content'
    } as BootstrapError;
  }
}

/**
 * Bootstrap with offline fallback
 * Tries to load from network, falls back to cache if available
 */
export async function bootstrapContentWithFallback(): Promise<ContentBootstrapResult> {
  try {
    // Try network first
    return await bootstrapContent();
  } catch (error) {
    // Try cached manifest
    const cachedManifest = await contentClient.getCachedManifest();
    if (cachedManifest) {
      // Use cached manifest but still throw error so UI can show "offline" state
      throw {
        type: 'network' as const,
        message: 'Using cached content. Check your connection.',
        cachedManifest
      };
    }
    // No cache available, rethrow original error
    throw error;
  }
}

