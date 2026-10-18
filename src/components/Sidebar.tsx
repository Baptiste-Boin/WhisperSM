import React from "react";
import { useTranslation } from "react-i18next";
import type { AppSection } from "@/lib/navigation";
import { useSettings } from "@/hooks/useSettings";
import UpdateChecker from "./update-checker";

type SidebarGlyph =
  | "home"
  | "modes"
  | "vocabulary"
  | "configuration"
  | "sound"
  | "library"
  | "history"
  | "debug";

interface SidebarItem {
  id: AppSection;
  labelKey: string;
  glyph: SidebarGlyph;
  /** Only shown when debug mode is on. */
  debugOnly?: boolean;
}

/**
 * Sidebar entries in display order, grouped like the reference app:
 * Home · Modes, Vocabulary · Configuration, Sound, Models library · History.
 */
export const SIDEBAR_GROUPS: SidebarItem[][] = [
  [{ id: "home", labelKey: "sidebar.home", glyph: "home" }],
  [
    { id: "modes", labelKey: "sidebar.modes", glyph: "modes" },
    { id: "vocabulary", labelKey: "sidebar.vocabulary", glyph: "vocabulary" },
  ],
  [
    {
      id: "configuration",
      labelKey: "sidebar.configuration",
      glyph: "configuration",
    },
    { id: "sound", labelKey: "sidebar.sound", glyph: "sound" },
    { id: "library", labelKey: "sidebar.library", glyph: "library" },
  ],
  [{ id: "history", labelKey: "sidebar.history", glyph: "history" }],
  [
    {
      id: "debug",
      labelKey: "sidebar.debug",
      glyph: "debug",
      debugOnly: true,
    },
  ],
];

/** Tile gradients of the macOS-style sidebar icons. */
const TILE: Record<SidebarGlyph, string> = {
  home: "linear-gradient(180deg, #ff9b52 0%, #f4682c 100%)",
  modes: "linear-gradient(180deg, #4ea1ff 0%, #1a73f0 100%)",
  vocabulary: "linear-gradient(180deg, #4ea1ff 0%, #1a73f0 100%)",
  configuration: "linear-gradient(180deg, #8f8f94 0%, #6b6b70 100%)",
  sound: "linear-gradient(180deg, #8f8f94 0%, #6b6b70 100%)",
  library: "linear-gradient(180deg, #8f8f94 0%, #6b6b70 100%)",
  history: "linear-gradient(180deg, #8f86ff 0%, #5e50e6 100%)",
  debug: "linear-gradient(180deg, #4cd964 0%, #28a745 100%)",
};

/** Filled glyphs in the style of SF Symbols. */
const Glyph: React.FC<{ glyph: SidebarGlyph }> = ({ glyph }) => {
  switch (glyph) {
    case "home":
      return (
        <path
          fill="currentColor"
          d="M12 3.6c.3 0 .6.1.8.3l7.6 6.7c.5.4.2 1.2-.4 1.2h-1.3v7.1c0 .8-.6 1.4-1.4 1.4h-3.1v-4.8a1 1 0 0 0-1-1h-2.4a1 1 0 0 0-1 1v4.8H6.7c-.8 0-1.4-.6-1.4-1.4v-7.1H4c-.6 0-.9-.8-.4-1.2l7.6-6.7c.2-.2.5-.3.8-.3Z"
        />
      );
    case "modes":
      return (
        <path
          fill="currentColor"
          d="M12 3.2c.3 0 .5.2.6.5.9 4.4 3.3 6.8 7.7 7.7.3.1.5.3.5.6s-.2.5-.5.6c-4.4.9-6.8 3.3-7.7 7.7-.1.3-.3.5-.6.5s-.5-.2-.6-.5c-.9-4.4-3.3-6.8-7.7-7.7-.3-.1-.5-.3-.5-.6s.2-.5.5-.6c4.4-.9 6.8-3.3 7.7-7.7.1-.3.3-.5.6-.5Z"
        />
      );
    case "vocabulary":
      return (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M7.4 3.5h9.8c.9 0 1.6.7 1.6 1.6v13.8c0 .9-.7 1.6-1.6 1.6H7.4c-1 0-1.9-.8-1.9-1.9V5.4c0-1 .8-1.9 1.9-1.9Zm.6 1.9H7.4v13.2H8V5.4Z"
        />
      );
    case "configuration":
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.7">
          <path
            strokeLinejoin="round"
            d="M10.3 3.8h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.7 1.6v1.8l1.7 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.7-1.6v-1.8L4.3 9.1 6 6.2l2.2.8 1.6-.9.5-2.3Z"
          />
          <circle cx="12" cy="12" r="2.6" />
        </g>
      );
    case "sound":
      return (
        <g fill="currentColor">
          <path d="M4.5 9.2h2.6l4.1-3.6c.5-.4 1.3 0 1.3.6v11.6c0 .7-.8 1-1.3.6l-4.1-3.6H4.5c-.6 0-1-.4-1-1V10.2c0-.6.4-1 1-1Z" />
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            d="M15.3 9.3a4 4 0 0 1 0 5.4M17.9 7a7.3 7.3 0 0 1 0 10"
          />
        </g>
      );
    case "library":
      return (
        <path
          fill="currentColor"
          d="M3.2 6.2c0-.4.2-.7.6-.9 2.5-1 5.1-.9 7.5.5v13.1c-2.4-1.3-5-1.4-7.4-.5-.3.1-.7-.1-.7-.5V6.2Zm17.6 0v11.7c0 .4-.4.6-.7.5-2.4-.9-5-.8-7.4.5V5.8c2.4-1.4 5-1.5 7.5-.5.4.2.6.5.6.9Z"
        />
      );
    case "history":
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.7">
          <path
            strokeLinecap="round"
            d="M12 12.6a.9.9 0 1 1 .9-.9 2.2 2.2 0 0 1-2.2 2.2 3.5 3.5 0 0 1-3.5-3.5 4.8 4.8 0 0 1 4.8-4.8 6.1 6.1 0 0 1 6.1 6.1 7.4 7.4 0 0 1-7.4 7.4"
          />
        </g>
      );
    case "debug":
      return (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 3.5h4M10.5 3.5v5.2L5.6 17.2c-.6 1 .1 2.3 1.3 2.3h10.2c1.2 0 1.9-1.3 1.3-2.3l-4.9-8.5V3.5"
        />
      );
  }
};

const SidebarIcon: React.FC<{ glyph: SidebarGlyph }> = ({ glyph }) => (
  <span
    className="inline-flex items-center justify-center shrink-0 w-[22px] h-[22px] rounded-[6px] text-white"
    style={{
      background: TILE[glyph],
      boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.18)",
    }}
    aria-hidden="true"
  >
    <svg width="15" height="15" viewBox="0 0 24 24">
      <Glyph glyph={glyph} />
    </svg>
  </span>
);

/** Sections that highlight a sidebar entry other than themselves. */
const PARENT_SECTION: Partial<Record<AppSection, AppSection>> = {
  advanced: "configuration",
};

interface SidebarProps {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const debugMode = settings?.debug_mode ?? false;
  const highlighted = PARENT_SECTION[activeSection] ?? activeSection;
  const groups = SIDEBAR_GROUPS.map((group) =>
    group.filter((item) => !item.debugOnly || debugMode),
  ).filter((group) => group.length > 0);

  return (
    <aside className="flex flex-col w-[200px] shrink-0 h-full bg-sidebar border-e border-border">
      {/* Space for the traffic lights on macOS */}
      <div className="h-[52px] shrink-0" data-tauri-drag-region />

      <nav className="flex flex-col gap-3 px-2.5 pt-1 flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group[0].id} className="flex flex-col gap-0.5">
            {group.map((item) => {
              const isActive = highlighted === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSectionChange(item.id)}
                  className={`flex items-center gap-2.5 px-2 h-[34px] w-full rounded-lg text-[14.5px] transition-colors text-start ${
                    isActive
                      ? "bg-surface-2 text-text"
                      : "text-text hover:bg-surface-2/50"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <SidebarIcon glyph={item.glyph} />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-2.5 pb-3 pt-2 flex flex-col items-center gap-2">
        <div className="text-[11px] text-text-muted truncate max-w-full empty:hidden">
          <UpdateChecker hideWhenIdle />
        </div>
        <button
          type="button"
          onClick={() => onSectionChange("about")}
          className={`w-full h-[42px] rounded-full border bg-transparent hover:bg-surface-2/50 transition-colors flex items-center justify-center gap-2 text-[15px] font-medium ${
            activeSection === "about" ? "border-accent/60" : "border-border"
          }`}
          title={t("sidebar.about")}
        >
          <span className="text-text-muted">{t("sidebar.appName")}</span>
          <span className="text-[9.5px] font-bold tracking-wide px-1.5 h-[17px] rounded-[5px] bg-surface-3 text-text-muted inline-flex items-center uppercase">
            {t("sidebar.footerBadge")}
          </span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
