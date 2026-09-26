/**
 * Sections of the main window. Sidebar sections are listed in the sidebar;
 * the others are reached from within a page (Advanced settings, About, Debug).
 */
export type AppSection =
  | "home"
  | "modes"
  | "vocabulary"
  | "configuration"
  | "sound"
  | "library"
  | "history"
  | "advanced"
  | "about"
  | "debug";

/** Map legacy section ids (emitted by the backend or old links) to new ones. */
export const LEGACY_SECTION_ALIASES: Record<string, AppSection> = {
  general: "configuration",
  settings: "configuration",
  models: "library",
  postprocessing: "modes",
};

export const resolveSection = (section: string): AppSection | null => {
  const known: AppSection[] = [
    "home",
    "modes",
    "vocabulary",
    "configuration",
    "sound",
    "library",
    "history",
    "advanced",
    "about",
    "debug",
  ];
  if (known.includes(section as AppSection)) return section as AppSection;
  return LEGACY_SECTION_ALIASES[section] ?? null;
};

/**
 * Navigate to a section from anywhere in the UI without prop drilling.
 * App.tsx listens for this event.
 */
export const navigateTo = (section: AppSection) => {
  window.dispatchEvent(new CustomEvent("wsm:navigate", { detail: section }));
};

let pendingPageAction: string | null = null;

/**
 * Ask a page to open one of its dialogs (e.g. "create-mode"). Pages that are
 * already mounted receive the `wsm:page-action` event; pages that mount later
 * (they are lazy-loaded) pick it up with `consumePendingPageAction`.
 */
export const requestPageAction = (action: string) => {
  pendingPageAction = action;
  window.dispatchEvent(new CustomEvent("wsm:page-action", { detail: action }));
};

/** Return and clear the pending page action, if any. */
export const consumePendingPageAction = (): string | null => {
  const action = pendingPageAction;
  pendingPageAction = null;
  return action;
};
