/**
 * Navigate to a sidebar section from anywhere in the UI without prop
 * drilling. App.tsx listens for this event.
 */
export const navigateTo = (section: string) => {
  window.dispatchEvent(new CustomEvent("wsm:navigate", { detail: section }));
};
