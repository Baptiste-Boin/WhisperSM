import React, { lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import {
  Boxes,
  FlaskConical,
  History,
  House,
  Info,
  Settings2,
  Sparkles,
} from "lucide-react";
import WhisperSMLogo from "./icons/WhisperSMLogo";
import { useSettings } from "../hooks/useSettings";
import { HomePage } from "../pages/HomePage";
import ModelSelector from "./model-selector";
import UpdateChecker from "./update-checker";

// The Home page is eager since it is shown on launch; the rest load on
// demand so their code is not parsed at startup.
const ModesPage = lazy(() =>
  import("../pages/ModesPage").then((m) => ({ default: m.ModesPage })),
);
const ModelsPage = lazy(() =>
  import("../pages/ModelsPage").then((m) => ({ default: m.ModelsPage })),
);
const HistoryPage = lazy(() =>
  import("../pages/HistoryPage").then((m) => ({ default: m.HistoryPage })),
);
const SettingsPage = lazy(() =>
  import("../pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const AboutPage = lazy(() =>
  import("../pages/AboutPage").then((m) => ({ default: m.AboutPage })),
);
const DebugSettings = lazy(() =>
  import("./settings/debug/DebugSettings").then((m) => ({
    default: m.DebugSettings,
  })),
);

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  home: {
    labelKey: "sidebar.home",
    icon: House,
    component: HomePage,
    enabled: () => true,
  },
  modes: {
    labelKey: "sidebar.modes",
    icon: Sparkles,
    component: ModesPage,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Boxes,
    component: ModelsPage,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistoryPage,
    enabled: () => true,
  },
  settings: {
    labelKey: "sidebar.settings",
    icon: Settings2,
    component: SettingsPage,
    enabled: () => true,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutPage,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

/** Map legacy section ids (emitted by the backend or old links) to new ones. */
export const LEGACY_SECTION_ALIASES: Record<string, SidebarSection> = {
  general: "settings",
  advanced: "settings",
  postprocessing: "modes",
};

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [version, setVersion] = useState("");
  const versionLabel = version ? `v${version}` : "";

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  return (
    <aside className="flex flex-col w-[212px] shrink-0 h-full bg-sidebar border-e border-border">
      <div className="px-4 pt-5 pb-4">
        <WhisperSMLogo size={28} />
      </div>

      <nav className="flex flex-col gap-0.5 px-2.5 flex-1 overflow-y-auto">
        {availableSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              className={`group flex items-center gap-2.5 px-2.5 h-9 w-full rounded-lg text-sm font-medium transition-colors text-start ${
                isActive
                  ? "bg-surface text-text shadow-[0_1px_2px_rgba(15,15,30,0.06)] border border-border"
                  : "text-text-muted hover:text-text hover:bg-surface/60 border border-transparent"
              }`}
              title={t(section.labelKey)}
            >
              <Icon
                width={17}
                height={17}
                className={`shrink-0 ${isActive ? "text-accent" : "text-text-muted group-hover:text-text"}`}
              />
              <span className="truncate">{t(section.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3 pt-2 space-y-2 border-t border-border">
        <div className="wsm-card px-3 py-2 text-xs">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-text-muted mb-1">
            {t("sidebar.speechModel")}
          </p>
          <div className="text-text">
            <ModelSelector />
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-1 text-[11px] text-text-muted">
          <div className="truncate">
            <UpdateChecker />
          </div>
          {versionLabel && (
            <span className="tabular-nums font-mono">{versionLabel}</span>
          )}
        </div>
      </div>
    </aside>
  );
};
