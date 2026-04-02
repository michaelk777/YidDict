import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { initDatabase } from './src/db/database';
import AppNavigator from './src/navigation/AppNavigator';

function Root() {
  const [dbReady, setDbReady] = useState(false);
  const { colorScheme, theme } = useTheme();

  useEffect(() => {
    console.log('[YidDict] App: Root mounted, starting DB init');
    initDatabase()
      .then(() => {
        console.log('[YidDict] App: DB init succeeded, rendering navigator');
        setDbReady(true);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[YidDict] App: DB init failed — ${message}`);
      });
  }, []);

  if (!dbReady) {
    console.log('[YidDict] App: showing loading spinner (dbReady=false)');
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  console.log('[YidDict] App: rendering NavigationContainer');
  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
