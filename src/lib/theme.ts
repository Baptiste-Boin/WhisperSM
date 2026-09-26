import type { ThemePreference } from "@/bindings";

/**
 * Apply the theme preference to the document. "auto" removes the attribute so
 * the `prefers-color-scheme` media query decides; "light"/"dark" force the
 * matching token set (see App.css).
 */
export const applyTheme = (theme: ThemePreference | undefined | null) => {
  const root = document.documentElement;
  // Dark is the default until settings are loaded (like Superwhisper).
  if (!theme) {
    root.dataset.theme = "dark";
    return;
  }
  if (theme === "auto") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
};

/** Whether the effective theme (preference + system) is dark. */
export const isDarkTheme = (theme: ThemePreference | undefined | null) => {
  if (!theme || theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
};
