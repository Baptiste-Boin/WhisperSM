import { useEffect } from "react";
import type { DependencyList, ReactNode } from "react";
import { create } from "zustand";

/**
 * What a page shows in the window's top bar. By default the bar has the
 * sidebar toggle on the left and the microphone picker on the right; pages
 * can replace the whole bar (search fields, editor titles) or only the
 * right-hand side, like the reference app.
 */
interface HeaderContent {
  /** Replaces the whole bar. */
  bar?: ReactNode;
  /** Replaces the microphone picker on the right. */
  trailing?: ReactNode;
}

interface HeaderStore {
  content: HeaderContent | null;
  owner: symbol | null;
  set: (owner: symbol, content: HeaderContent) => void;
  clear: (owner: symbol) => void;
}

export const useHeaderStore = create<HeaderStore>((set, get) => ({
  content: null,
  owner: null,
  set: (owner, content) => set({ owner, content }),
  clear: (owner) => {
    if (get().owner === owner) set({ owner: null, content: null });
  },
}));

/**
 * Show `content` in the top bar while the calling component is mounted.
 * Pass `null` to keep the default bar. `deps` must list every value the
 * content depends on.
 */
export const usePageHeader = (
  content: HeaderContent | null,
  deps: DependencyList,
) => {
  useEffect(() => {
    const owner = Symbol("page-header");
    const store = useHeaderStore.getState();
    if (content) store.set(owner, content);
    return () => useHeaderStore.getState().clear(owner);
    // The caller lists the dependencies of `content`.
  }, deps);
};
