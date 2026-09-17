/**
 * A deliberately tiny navigator.
 *
 * Three tabs and a modal stack is the whole information architecture
 * (section 3), and the study flow forbids back/forward navigation entirely
 * (section 24A.6), so a full navigation library would be more machinery than
 * the product has states.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type TabName = 'today' | 'library' | 'profile';

export type RouteName =
  | 'addSheet'
  | 'capture'
  | 'analyzing'
  | 'confirm'
  | 'manualAdd'
  | 'study'
  | 'complete'
  | 'detail'
  | 'paywall';

export interface Route {
  name: RouteName;
  params?: Record<string, any>;
}

interface NavState {
  tab: TabName;
  stack: Route[];
  /** Bumped whenever a flow finishes, so tab screens know to refetch. */
  revision: number;
}

interface NavApi extends NavState {
  setTab: (tab: TabName) => void;
  push: (name: RouteName, params?: Record<string, any>) => void;
  replace: (name: RouteName, params?: Record<string, any>) => void;
  pop: () => void;
  dismissAll: (tab?: TabName) => void;
  refresh: () => void;
}

const NavContext = createContext<NavApi | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NavState>({ tab: 'today', stack: [], revision: 0 });

  const setTab = useCallback((tab: TabName) => {
    setState((s) => ({ ...s, tab, stack: [] }));
  }, []);

  const push = useCallback((name: RouteName, params?: Record<string, any>) => {
    setState((s) => ({ ...s, stack: [...s.stack, { name, params }] }));
  }, []);

  const replace = useCallback((name: RouteName, params?: Record<string, any>) => {
    setState((s) => ({ ...s, stack: [...s.stack.slice(0, -1), { name, params }] }));
  }, []);

  const pop = useCallback(() => {
    setState((s) => ({ ...s, stack: s.stack.slice(0, -1) }));
  }, []);

  const dismissAll = useCallback((tab?: TabName) => {
    setState((s) => ({
      tab: tab ?? s.tab,
      stack: [],
      revision: s.revision + 1,
    }));
  }, []);

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, revision: s.revision + 1 }));
  }, []);

  const value = useMemo<NavApi>(
    () => ({ ...state, setTab, push, replace, pop, dismissAll, refresh }),
    [state, setTab, push, replace, pop, dismissAll, refresh],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavApi {
  const value = useContext(NavContext);
  if (!value) throw new Error('useNav must be used inside NavProvider');
  return value;
}
