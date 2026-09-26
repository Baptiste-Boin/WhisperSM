import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import {
  BookOpen,
  FlaskConical,
  History,
  House,
  LibraryBig,
  Settings,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppSection } from "@/lib/navigation";
import { useSettings } from "@/hooks/useSettings";
import { IconTile, type TileColor } from "./ui/IconTile";
import UpdateChecker from "./update-checker";

interface SidebarItem {
  id: AppSection;
  labelKey: string;
  icon: LucideIcon;
  color: TileColor;
  /** Only shown when debug mode is on. */
  debugOnly?: boolean;
}

/** Sidebar entries, in display order (mirrors the reference app). */
export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "home", labelKey: "sidebar.home", icon: House, color: "orange" },
  { id: "modes", labelKey: "sidebar.modes", icon: Sparkles, color: "blue" },
  {
    id: "vocabulary",
    labelKey: "sidebar.vocabulary",
    icon: BookOpen,
    color: "blue",
  },
  {
    id: "configuration",
    labelKey: "sidebar.configuration",
    icon: Settings,
    color: "gray",
  },
  { id: "sound", labelKey: "sidebar.sound", icon: Volume2, color: "gray" },
  {
    id: "library",
    labelKey: "sidebar.library",
    icon: LibraryBig,
    color: "gray",
  },
  {
    id: "history",
    labelKey: "sidebar.history",
    icon: History,
    color: "purple",
  },
  {
    id: "debug",
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    color: "green",
    debugOnly: true,
  },
];

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
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  const debugMode = settings?.debug_mode ?? false;
  const highlighted = PARENT_SECTION[activeSection] ?? activeSection;

  return (
    <aside className="flex flex-col w-[236px] shrink-0 h-full bg-sidebar border-e border-border">
      {/* Space for the traffic lights on macOS */}
      <div className="h-[52px] shrink-0" data-tauri-drag-region />

      <nav className="flex flex-col gap-1 px-3 flex-1 overflow-y-auto">
        {SIDEBAR_ITEMS.filter((item) => !item.debugOnly || debugMode).map(
          (item) => {
            const isActive = highlighted === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={`flex items-center gap-3 px-2.5 h-[42px] w-full rounded-xl text-[15px] font-medium transition-colors text-start ${
                  isActive
                    ? "bg-surface text-text shadow-[0_1px_3px_rgba(15,15,30,0.08)]"
                    : "text-text hover:bg-surface/60"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <IconTile icon={item.icon} color={item.color} size={26} />
                <span className="truncate">{t(item.labelKey)}</span>
              </button>
            );
          },
        )}
      </nav>

      <div className="px-4 pb-4 pt-3 flex flex-col items-center gap-2">
        <div className="text-[11px] text-text-muted truncate max-w-full">
          <UpdateChecker />
        </div>
        <button
          type="button"
          onClick={() => onSectionChange("about")}
          className={`w-full h-[52px] rounded-2xl border border-border bg-surface/70 hover:bg-surface transition-colors flex items-center justify-center gap-2 text-[17px] font-medium ${
            activeSection === "about" ? "border-accent/50" : ""
          }`}
          title={t("sidebar.about")}
        >
          <span className="text-text-muted">{t("sidebar.appName")}</span>
          <span className="text-[10px] font-bold tracking-wide px-1.5 h-4 rounded-md bg-surface-3 text-text-muted inline-flex items-center">
            {t("sidebar.footerBadge")}
          </span>
        </button>
        <span className="text-[11px] text-text-muted tabular-nums">
          {t("sidebar.footerTagline")}
          {version ? ` · v${version}` : ""}
        </span>
      </div>
    </aside>
  );
};

export default Sidebar;
