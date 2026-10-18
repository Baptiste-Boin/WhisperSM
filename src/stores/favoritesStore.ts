import { create } from "zustand";

const FAVORITES_KEY = "wsm.favoriteModels";

const readFavorites = (): string[] => {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
};

const writeFavorites = (keys: string[]) => {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(keys));
  } catch {
    // Storage unavailable: favourites only last for this session.
  }
};

interface FavoritesStore {
  /** Row keys such as `voice:turbo` or `llm-cloud:gpt-5`. */
  favorites: string[];
  toggle: (key: string) => void;
}

/**
 * Favourite models, shared by the models library and the model pickers of
 * the mode editor (starred rows are listed first in both).
 */
export const useFavoritesStore = create<FavoritesStore>((set, get) => ({
  favorites: readFavorites(),
  toggle: (key) => {
    const current = get().favorites;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    writeFavorites(next);
    set({ favorites: next });
  },
}));
