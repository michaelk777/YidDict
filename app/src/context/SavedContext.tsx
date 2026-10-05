import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  // Only the very first load should show the loading state — refreshSaved()
  // also gets called after every save/unsave anywhere in the app (Search tab
  // included), and since React Navigation keeps this tab mounted in the
  // background, flipping isLoading on every one of those would blow away the
  // Saved tab's list/scroll position even when nobody's looking at it.
  const hasLoadedOnce = useRef(false);

  const refreshSaved = useCallback(async () => {
    if (!hasLoadedOnce.current) setIsLoading(true);
    try {
      const entries = await getSavedEntries();
      setSavedEntries(entries);
      setSavedKeySet(
        new Set(entries.map(e => `${e.yiddishHebrew ?? ''}|${e.english ?? ''}|${e.source}`))
      );
    } finally {
      setIsLoading(false);
      hasLoadedOnce.current = true;
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
