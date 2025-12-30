/**
 * App Bootstrap Component - Handles content loading at app start
 * 
 * Copy this to your App.tsx or root component
 * 
 * Usage:
 * ```tsx
 * export default function App() {
 *   return <AppBootstrap>
 *     {/* Your app content */}
 *   </AppBootstrap>;
 * }
 * ```
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { bootstrapContent, BootstrapError } from '../services/content/bootstrapContent';

type BootstrapState = 'loading' | 'ready' | 'error';

interface AppBootstrapProps {
  children: React.ReactNode;
}

export function AppBootstrap({ children }: AppBootstrapProps) {
  const [state, setState] = useState<BootstrapState>('loading');
  const [error, setError] = useState<BootstrapError | null>(null);

  const handleBootstrap = async () => {
    setState('loading');
    setError(null);

    try {
      await bootstrapContent();
      setState('ready');
    } catch (err: any) {
      setError(err as BootstrapError);
      setState('error');
    }
  };

  useEffect(() => {
    handleBootstrap();
  }, []);

  if (state === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading content...</Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Content unavailable</Text>
        <Text style={styles.errorBody}>
          {error?.message || "We couldn't load the content catalog. Check your connection and try again."}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleBootstrap}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Content loaded, render app
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  errorBody: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

