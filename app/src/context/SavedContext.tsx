import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { SavedEntry, getSavedEntries } from '../db/savedDb';

interface SavedContextValue {
  savedEntries: SavedEntry[];
  savedKeySet: Set<string>;
  isLoading: boolean;
  refreshSaved: () => Promise<void>;
}

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [savedKeySet, setSavedKeySet] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const refreshSaved = useCallback(async () => {
    setIsLoading(true);
    try {
      const entries = await getSavedEntries();
      setSavedEntries(entries);
      setSavedKeySet(
        new Set(entries.map(e => `${e.yiddishHebrew ?? ''}|${e.english ?? ''}|${e.source}`))
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refreshSaved(); }, [refreshSaved]);

  return (
    <SavedContext.Provider value={{ savedEntries, savedKeySet, isLoading, refreshSaved }}>
      {children}
    </SavedContext.Provider>
  );
}

export function useSaved(): SavedContextValue {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error('useSaved must be used within a SavedProvider');
  return ctx;
}
