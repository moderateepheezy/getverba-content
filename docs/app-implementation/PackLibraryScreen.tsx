/**
 * Library Screen - Updated to use remote catalog
 * 
 * Copy this to: src/screens/library/PackLibraryScreen.tsx
 * 
 * Replace any local getCatalogForWorkspace() calls with store-driven catalog
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTopicPacksStore } from '../../state/useTopicPacksStore';
import { workspaceStore } from '../../state/workspaceStore';

export function PackLibraryScreen() {
  // Get catalog from store (set by bootstrapContent)
  const catalog = useTopicPacksStore((s) => s.catalog);
  const activeWorkspace = workspaceStore((s) => s.getActiveWorkspace());

  // Show loading state if catalog not loaded (shouldn't happen after bootstrap)
  if (!catalog) {
    return (
      <View style={styles.container}>
        <Text>Loading catalog...</Text>
      </View>
    );
  }

  // Verify workspace matches
  if (catalog.workspace !== activeWorkspace) {
    console.warn(`Workspace mismatch: catalog.workspace=${catalog.workspace}, activeWorkspace=${activeWorkspace}`);
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{catalog.languageName}</Text>
        <Text style={styles.subtitle}>Version {catalog.version}</Text>
      </View>

      {catalog.sections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}
    </ScrollView>
  );
}

function SectionCard({ section }: { section: { id: string; kind: string; title: string; itemsUrl: string } }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionKind}>{section.kind}</Text>
      {/* Render section items here */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  sectionCard: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionKind: {
    fontSize: 14,
    color: '#666',
  },
});

