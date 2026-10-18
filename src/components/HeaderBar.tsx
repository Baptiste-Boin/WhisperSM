import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Headphones, Laptop, Mic, Volume1 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useHeaderStore } from "@/stores/headerStore";

interface HeaderBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const SYSTEM_DEFAULT = "Default";

const isDefaultDevice = (name: string | null | undefined) =>
  !name || name === "Default" || name === "default";

/** Icon for an input device, guessed from its name like the reference app. */
const deviceIcon = (name: string): LucideIcon => {
  const n = name.toLowerCase();
  if (/macbook|built-?in|intern|laptop/.test(n)) return Laptop;
  if (/airpods|headphone|headset|casque|buds|wh-|bluetooth|beats/.test(n))
    return Headphones;
  return Mic;
};

/** macOS "sidebar.left" symbol. */
export const SidebarToggleIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <rect x="2.75" y="4.75" width="18.5" height="14.5" rx="3" />
    <path d="M9.25 4.75v14.5" />
    <path d="M5 8.5h2M5 11h2M5 13.5h2" strokeLinecap="round" />
  </svg>
);

/** Microphone picker shown at the top right of every page. */
const MicrophoneMenu: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting, audioDevices, refreshAudioDevices } =
    useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = settings?.selected_microphone ?? SYSTEM_DEFAULT;
  const usesDefault = isDefaultDevice(selected);
  const devices = audioDevices.filter((d) => !isDefaultDevice(d.name));
  const systemDevice =
    devices.find((d) => d.is_default)?.name ?? devices[0]?.name ?? null;
  const currentName = usesDefault
    ? (systemDevice ?? t("shell.microphone.systemDefault"))
    : selected;
  const CurrentIcon = deviceIcon(currentName);

  const choose = (name: string) => {
    updateSetting("selected_microphone", name);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) refreshAudioDevices();
          setOpen((v) => !v);
        }}
        title={t("shell.microphone.title")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-[30px] px-2 inline-flex items-center gap-2.5 rounded-lg text-[14px] text-text transition-colors ${
          open ? "bg-surface-2" : "hover:bg-surface-2/70"
        }`}
      >
        <span className="truncate max-w-[260px]">{currentName}</span>
        <CurrentIcon className="w-[18px] h-[18px] text-text-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full mt-1.5 z-50 w-[260px] p-1 rounded-xl bg-surface border border-border shadow-[var(--shadow-popover)] wsm-fade-in"
        >
          <MenuRow
            icon={Volume1}
            label={t("shell.microphone.useSystemDefault")}
            active={usesDefault}
            onClick={() => choose(SYSTEM_DEFAULT)}
          />
          {devices.length > 0 && (
            <div className="my-1 mx-2 h-px bg-border" role="separator" />
          )}
          {devices.map((device) => (
            <MenuRow
              key={device.index}
              icon={deviceIcon(device.name)}
              label={device.name}
              active={!usesDefault && device.name === selected}
              onClick={() => choose(device.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MenuRow: React.FC<{
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={active}
    onClick={onClick}
    className="w-full h-9 px-1.5 flex items-center gap-2.5 rounded-lg text-start text-[14px] text-text hover:bg-surface-2 transition-colors"
  >
    <span
      className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 ${
        active ? "bg-accent text-white" : "bg-surface-2 text-text-muted"
      }`}
    >
      <Icon className="w-[15px] h-[15px]" />
    </span>
    <span className="truncate">{label}</span>
  </button>
);

/**
 * Top bar of the main window. By default: sidebar toggle on the left and the
 * microphone on the right, like the reference app. Pages can replace it
 * (search fields, editor titles) through `usePageHeader`.
 */
export const HeaderBar: React.FC<HeaderBarProps> = ({
  sidebarOpen,
  onToggleSidebar,
}) => {
  const { t } = useTranslation();
  const content = useHeaderStore((state) => state.content);

  return (
    <header
      className="h-[52px] shrink-0 flex items-center gap-3 px-4 border-b border-border bg-background"
      data-tauri-drag-region
    >
      {content?.bar ?? (
        <>
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            aria-label={
              sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")
            }
            aria-pressed={sidebarOpen}
          >
            <SidebarToggleIcon />
          </button>
          <div className="flex-1 min-w-0 h-full" data-tauri-drag-region />
          {content?.trailing ?? <MicrophoneMenu />}
        </>
      )}
    </header>
  );
};

export default HeaderBar;
