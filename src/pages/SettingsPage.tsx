import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PageHeader, SettingsGroup } from "@/components/ui";
import { ShortcutInput } from "@/components/settings/ShortcutInput";
import { PushToTalk } from "@/components/settings/PushToTalk";
import { MicrophoneSelector } from "@/components/settings/MicrophoneSelector";
import { OutputDeviceSelector } from "@/components/settings/OutputDeviceSelector";
import { AudioFeedback } from "@/components/settings/AudioFeedback";
import { VolumeSlider } from "@/components/settings/VolumeSlider";
import { MuteWhileRecording } from "@/components/settings/MuteWhileRecording";
import { SoundPicker } from "@/components/settings/SoundPicker";
import { ModelSettingsCard } from "@/components/settings/general/ModelSettingsCard";
import { LongAudioModelSettings } from "@/components/settings/general/LongAudioModelSettings";
import { CustomWords } from "@/components/settings/CustomWords";
import { AppendTrailingSpace } from "@/components/settings/AppendTrailingSpace";
import { PasteMethodSetting } from "@/components/settings/PasteMethod";
import { TypingToolSetting } from "@/components/settings/TypingTool";
import { ClipboardHandlingSetting } from "@/components/settings/ClipboardHandling";
import { AutoSubmit } from "@/components/settings/AutoSubmit";
import { StartHidden } from "@/components/settings/StartHidden";
import { AutostartToggle } from "@/components/settings/AutostartToggle";
import { ShowTrayIcon } from "@/components/settings/ShowTrayIcon";
import { ShowOverlay } from "@/components/settings/ShowOverlay";
import { ModelUnloadTimeoutSetting } from "@/components/settings/ModelUnloadTimeout";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { UpdateChecksToggle } from "@/components/settings/UpdateChecksToggle";
import { HistoryLimit } from "@/components/settings/HistoryLimit";
import { RecordingRetentionPeriodSelector } from "@/components/settings/RecordingRetentionPeriod";
import { ExperimentalToggle } from "@/components/settings/ExperimentalToggle";
import { KeyboardImplementationSelector } from "@/components/settings/debug/KeyboardImplementationSelector";
import { AccelerationSelector } from "@/components/settings/AccelerationSelector";
import { LazyStreamClose } from "@/components/settings/LazyStreamClose";
import { AppDataDirectory } from "@/components/settings/AppDataDirectory";
import { ExportImportSettings } from "@/components/settings/ExportImportSettings";
import { LogDirectory } from "@/components/settings/debug";
import { useSettings } from "@/hooks/useSettings";

type SettingsSection =
  | "shortcuts"
  | "audio"
  | "speech"
  | "output"
  | "app"
  | "history"
  | "advanced"
  | "data";

const SECTIONS: SettingsSection[] = [
  "shortcuts",
  "audio",
  "speech",
  "output",
  "app",
  "history",
  "advanced",
  "data",
];

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const [active, setActive] = useState<SettingsSection>("shortcuts");
  const pushToTalk = getSetting("push_to_talk");
  const experimentalEnabled = getSetting("experimental_enabled") || false;
  const isLinux = type() === "linux";

  const jump = (section: SettingsSection) => {
    setActive(section);
    document
      .getElementById(`settings-${section}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("sidebar.settings")}
        description={t("settingsPage.description")}
      >
        <div className="flex flex-wrap gap-1.5">
          {SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => jump(section)}
              className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
                active === section
                  ? "bg-accent text-on-accent border-accent"
                  : "bg-surface border-border text-text-muted hover:text-text hover:border-accent/40"
              }`}
            >
              {t(`settingsPage.sections.${section}`)}
            </button>
          ))}
        </div>
      </PageHeader>

      <SettingsGroup
        id="settings-shortcuts"
        title={t("settingsPage.sections.shortcuts")}
        description={t("settings.general.shortcut.description")}
      >
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        {!isLinux && !pushToTalk && (
          <ShortcutInput shortcutId="cancel" grouped={true} />
        )}
        <ShortcutInput shortcutId="pause" grouped={true} />
        <ShortcutInput shortcutId="show_history" grouped={true} />
        <ShortcutInput shortcutId="copy_latest_history" grouped={true} />
      </SettingsGroup>

      <SettingsGroup
        id="settings-audio"
        title={t("settingsPage.sections.audio")}
      >
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
        <AudioFeedback descriptionMode="tooltip" grouped={true} />
        <SoundPicker
          label={t("settings.debug.soundTheme.label")}
          description={t("settings.debug.soundTheme.description")}
        />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          grouped={true}
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>

      <div id="settings-speech" className="flex flex-col gap-6">
        <ModelSettingsCard />
        <LongAudioModelSettings />
        <SettingsGroup title={t("settingsPage.sections.speech")}>
          <CustomWords descriptionMode="tooltip" grouped />
        </SettingsGroup>
      </div>

      <SettingsGroup
        id="settings-output"
        title={t("settingsPage.sections.output")}
      >
        <PasteMethodSetting descriptionMode="tooltip" grouped={true} />
        <TypingToolSetting descriptionMode="tooltip" grouped={true} />
        <ClipboardHandlingSetting descriptionMode="tooltip" grouped={true} />
        <AutoSubmit descriptionMode="tooltip" grouped={true} />
        <AppendTrailingSpace descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <SettingsGroup id="settings-app" title={t("settingsPage.sections.app")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <StartHidden descriptionMode="tooltip" grouped={true} />
        <AutostartToggle descriptionMode="tooltip" grouped={true} />
        <ShowTrayIcon descriptionMode="tooltip" grouped={true} />
        <ShowOverlay descriptionMode="tooltip" grouped={true} />
        <ModelUnloadTimeoutSetting descriptionMode="tooltip" grouped={true} />
        <UpdateChecksToggle descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <SettingsGroup
        id="settings-history"
        title={t("settingsPage.sections.history")}
      >
        <HistoryLimit descriptionMode="tooltip" grouped={true} />
        <RecordingRetentionPeriodSelector
          descriptionMode="tooltip"
          grouped={true}
        />
      </SettingsGroup>

      <SettingsGroup
        id="settings-advanced"
        title={t("settingsPage.sections.advanced")}
        description={t("settingsPage.advancedDescription")}
      >
        <ExperimentalToggle descriptionMode="tooltip" grouped={true} />
        {experimentalEnabled && (
          <>
            <KeyboardImplementationSelector
              descriptionMode="tooltip"
              grouped={true}
            />
            <AccelerationSelector descriptionMode="tooltip" grouped={true} />
            <LazyStreamClose descriptionMode="tooltip" grouped={true} />
          </>
        )}
      </SettingsGroup>

      <SettingsGroup id="settings-data" title={t("settingsPage.sections.data")}>
        <AppDataDirectory descriptionMode="tooltip" grouped={true} />
        <ExportImportSettings grouped={true} />
        <LogDirectory grouped={true} />
      </SettingsGroup>

      <p className="text-xs text-text-muted px-1">
        {t("settingsPage.debugHint")}{" "}
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() =>
            openUrl("https://github.com/Baptiste-Boin/WhisperSM/issues")
          }
        >
          {t("settingsPage.reportIssue")}
        </button>
      </p>
    </div>
  );
};
