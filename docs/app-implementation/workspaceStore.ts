/**
 * Workspace Store - Example implementation
 * 
 * This is an example of what your workspaceStore should support.
 * Adjust to match your actual store implementation (Zustand, Redux, etc.)
 * 
 * Copy relevant parts to: src/state/workspaceStore.ts
 */

import { create } from 'zustand';
// or: import { createStore } from 'zustand/vanilla';

interface WorkspaceState {
  // Current active workspace (language code from manifest)
  activeWorkspace: string | null;
  
  // Available workspaces from manifest
  availableWorkspaces: string[];
  
  // Actions
  setActiveWorkspaceByLanguageCode: (code: string) => void;
  setAvailableWorkspaces: (workspaces: string[]) => void;
  
  // Selectors
  canSwitchLanguage: () => boolean;
  getActiveWorkspace: () => string | null;
}

export const workspaceStore = create<WorkspaceState>((set, get) => ({
  activeWorkspace: null,
  availableWorkspaces: [],

  setActiveWorkspaceByLanguageCode: (code: string) => {
    set({ activeWorkspace: code });
  },

  setAvailableWorkspaces: (workspaces: string[]) => {
    set({ availableWorkspaces: workspaces });
  },

  canSwitchLanguage: () => {
    return get().availableWorkspaces.length > 1;
  },

  getActiveWorkspace: () => {
    return get().activeWorkspace;
  },
}));

/**
 * Usage in components:
 * 
 * const canSwitchLanguage = workspaceStore((s) => s.canSwitchLanguage());
 * const activeWorkspace = workspaceStore((s) => s.getActiveWorkspace());
 * 
 * {canSwitchLanguage && <LanguageSwitchButton />}
 */

