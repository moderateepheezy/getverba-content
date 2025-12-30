/**
 * Topic Packs Store - Example implementation for catalog
 * 
 * This is an example of what your catalog store should support.
 * Adjust to match your actual store implementation.
 * 
 * Copy relevant parts to: src/state/useTopicPacksStore.ts
 */

import { create } from 'zustand';
import { Catalog } from '../services/content/ContentClient';

interface TopicPacksState {
  // Remote catalog from API
  catalog: Catalog | null;
  
  // Actions
  setCatalogFromRemote: (catalog: Catalog) => void;
  clearCatalog: () => void;
  
  // Selectors
  getCatalog: () => Catalog | null;
  getSections: () => Catalog['sections'] | [];
}

export const useTopicPacksStore = create<TopicPacksState>((set, get) => ({
  catalog: null,

  setCatalogFromRemote: (catalog: Catalog) => {
    set({ catalog });
  },

  clearCatalog: () => {
    set({ catalog: null });
  },

  getCatalog: () => {
    return get().catalog;
  },

  getSections: () => {
    return get().catalog?.sections || [];
  },
}));

/**
 * Usage in Library screen:
 * 
 * const catalog = useTopicPacksStore((s) => s.catalog);
 * const sections = useTopicPacksStore((s) => s.getSections());
 * 
 * if (!catalog) {
 *   return <LoadingSkeleton />;
 * }
 * 
 * return (
 *   <View>
 *     {sections.map(section => (
 *       <SectionCard key={section.id} section={section} />
 *     ))}
 *   </View>
 * );
 */

