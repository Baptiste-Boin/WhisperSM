import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronLeft, Headphones, PanelLeft } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { PopoverMenu } from "./ui/PopoverMenu";

interface HeaderBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** When set, a back chevron replaces the sidebar toggle. */
  onBack?: () => void;
  /** Optional element rendered in the middle (page search bars). */
  children?: React.ReactNode;
}

/**
 * Top bar of the main window: sidebar toggle, current microphone and output
 * device, like the reference app.
 */
export const HeaderBar: React.FC<HeaderBarProps> = ({
  sidebarOpen,
  onToggleSidebar,
  onBack,
  children,
}) => {
  const { t } = useTranslation();
  const {
    settings,
    updateSetting,
    audioDevices,
    outputDevices,
    refreshAudioDevices,
    refreshOutputDevices,
  } = useSettings();

  const selectedMicrophone = settings?.selected_microphone ?? "Default";
  const selectedOutput = settings?.selected_output_device ?? "Default";
  const isDefaultMic =
    selectedMicrophone === "Default" || selectedMicrophone === "default";
  const defaultDeviceName =
    audioDevices.find((d) => d.is_default && d.name !== "Default")?.name ??
    audioDevices.find((d) => d.name !== "Default")?.name ??
    t("shell.microphone.systemDefault");
  const microphoneLabel = isDefaultMic
    ? t("shell.microphone.default", { name: defaultDeviceName })
    : selectedMicrophone;

  const microphoneItems = audioDevices.map((device) => ({
    value: device.name,
    label:
      device.name === "Default"
        ? t("shell.microphone.default", { name: defaultDeviceName })
        : device.name,
  }));
  const outputItems = outputDevices.map((device) => ({
    value: device.name,
    label:
      device.name === "Default" ? t("shell.output.systemDefault") : device.name,
  }));

  return (
    <header
      className="h-[52px] shrink-0 flex items-center gap-3 px-4 border-b border-border bg-background"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-1">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            aria-label={t("common.back")}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
            aria-label={
              sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")
            }
            aria-pressed={sidebarOpen}
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-center">
        {children}
      </div>

      <div className="flex items-center gap-2">
        <PopoverMenu
          align="end"
          menuClassName="w-72"
          items={microphoneItems}
          selected={isDefaultMic ? "Default" : selectedMicrophone}
          onSelect={(value) => updateSetting("selected_microphone", value)}
          trigger={(open) => (
            <span
              className={`inline-flex items-center gap-1 text-[15px] px-2 h-8 rounded-lg transition-colors ${
                open ? "bg-surface-2" : "hover:bg-surface-2"
              }`}
              onMouseEnter={() => refreshAudioDevices()}
              title={t("shell.microphone.title")}
            >
              <span className="truncate max-w-[260px]">{microphoneLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
            </span>
          )}
        />
        <PopoverMenu
          align="end"
          menuClassName="w-72"
          items={outputItems}
          selected={selectedOutput === "default" ? "Default" : selectedOutput}
          onSelect={(value) => updateSetting("selected_output_device", value)}
          trigger={(open) => (
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-muted transition-colors ${
                open
                  ? "bg-surface-2 text-text"
                  : "hover:bg-surface-2 hover:text-text"
              }`}
              onMouseEnter={() => refreshOutputDevices()}
              title={t("shell.output.title")}
            >
              <Headphones className="w-[18px] h-[18px]" />
            </span>
          )}
        />
      </div>
    </header>
  );
};

export default HeaderBar;
