/**
 * Language Switch UI - Hide when only one workspace
 * 
 * Apply this pattern to all language switching UI components
 */

import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { workspaceStore } from '../../state/workspaceStore';

/**
 * Example: Hide "Add Language" button
 */
export function AddLanguageButton() {
  const canSwitchLanguage = workspaceStore((s) => s.canSwitchLanguage());

  // Hide if only one workspace available
  if (!canSwitchLanguage) {
    return null;
  }

  return (
    <TouchableOpacity style={styles.button}>
      <Text style={styles.buttonText}>Add Language</Text>
    </TouchableOpacity>
  );
}

/**
 * Example: Language picker in settings
 */
export function LanguagePickerRow() {
  const canSwitchLanguage = workspaceStore((s) => s.canSwitchLanguage());
  const availableWorkspaces = workspaceStore((s) => s.availableWorkspaces);

  // Hide if only one workspace
  if (!canSwitchLanguage) {
    return null;
  }

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Language</Text>
      {/* Render language picker */}
    </View>
  );
}

/**
 * Example: Onboarding language selection screen
 */
export function OnboardingLanguageScreen() {
  const availableWorkspaces = workspaceStore((s) => s.availableWorkspaces);

  // If only one workspace, skip language selection
  if (availableWorkspaces.length <= 1) {
    // Auto-select the only workspace and proceed
    return null; // or navigate directly to next screen
  }

  return (
    <View>
      <Text>Select your language:</Text>
      {/* Render language options */}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  label: {
    fontSize: 16,
  },
});

