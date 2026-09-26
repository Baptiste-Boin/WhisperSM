/**
 * Entries of the "What's new?" panel on Home. Titles and descriptions are
 * translated under `home.changelog.<id>`.
 */
export interface ChangelogEntry {
  id: string;
  /** ISO date, formatted per locale on display. */
  date: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  { id: "modelsLibrary", date: "2026-09-26" },
  { id: "cloudVoice", date: "2026-09-26" },
  { id: "modes", date: "2026-09-26" },
  { id: "vocabulary", date: "2026-09-26" },
];

export const RELEASES_URL =
  "https://github.com/Baptiste-Boin/WhisperSM/releases";
