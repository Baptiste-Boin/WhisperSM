import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Settings2 } from "lucide-react";
import { type } from "@tauri-apps/plugin-os";
import {
  commands,
  type AutoSubmitKey,
  type ClipboardHandling,
  type ModelUnloadTimeout,
} from "@/bindings";
import {
  Button,
  Dropdown,
  PageHeader,
  SettingContainer,
  Switch,
  ToggleSwitch,
  Tooltip,
} from "@/components/ui";
import { LanguageSelector } from "@/components/settings/LanguageSelector";
import { TranslateToEnglish } from "@/components/settings/TranslateToEnglish";
import { AppendTrailingSpace } from "@/components/settings/AppendTrailingSpace";
import { TypingToolSetting } from "@/components/settings/TypingTool";
import { PasteMethodSetting } from "@/components/settings/PasteMethod";
import { StartHidden } from "@/components/settings/StartHidden";
import { ShowTrayIcon } from "@/components/settings/ShowTrayIcon";
import { ExperimentalToggle } from "@/components/settings/ExperimentalToggle";
import { AccelerationSelector } from "@/components/settings/AccelerationSelector";
import { LazyStreamClose } from "@/components/settings/LazyStreamClose";
import { ExportImportSettings } from "@/components/settings/ExportImportSettings";
import { HistoryLimit } from "@/components/settings/HistoryLimit";
import { KeyboardImplementationSelector } from "@/components/settings/debug/KeyboardImplementationSelector";
import { LogDirectory } from "@/components/settings/debug";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { useModelStore } from "@/stores/modelStore";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    <h2 className="wsm-section-title">{title}</h2>
    <div className="wsm-card divide-y divide-border">{children}</div>
  </section>
);

/** Hover/click info icon, for rows that are not a SettingContainer. */
const InfoTip: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      className="relative flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Info
        className="h-3.5 w-3.5 cursor-help text-text-muted/70 transition-colors hover:text-accent"
        aria-label={text}
        role="img"
        tabIndex={0}
      />
      {open && (
        <Tooltip targetRef={ref} position="top">
          <p className="text-center text-sm leading-relaxed">{text}</p>
        </Tooltip>
      )}
    </span>
  );
};

const AppFolderRow: React.FC = () => {
  const { t } = useTranslation();
  const [path, setPath] = useState("");

  useEffect(() => {
    commands
      .getAppDirPath()
      .then((result) => {
        if (result.status === "ok") setPath(result.data);
      })
      .catch((error) => console.error("Failed to load app folder:", error));
  }, []);

  const openFolder = async () => {
    try {
      await commands.openAppDataDir();
    } catch (error) {
      console.error("Failed to open app folder:", error);
    }
  };

  return (
    <div className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-2.5">
      {path ? (
        <span
          className="min-w-0 truncate font-mono text-[13px] text-text"
          title={path}
        >
          {path}
        </span>
      ) : (
        <span className="block h-3 w-56 animate-pulse rounded bg-surface-3" />
      )}
      <div className="flex shrink-0 items-center gap-2.5">
        <Button variant="secondary" onClick={openFolder} disabled={!path}>
          {t("advanced.folder.open")}
        </Button>
        <InfoTip text={t("advanced.folder.description")} />
      </div>
    </div>
  );
};

// Runtime values of ModelUnloadTimeout (serde snake_case keeps digits
// attached: "min2", not "min_2").
const UNLOAD_TIMEOUTS = [
  "never",
  "immediately",
  "min2",
  "min5",
  "min10",
  "min15",
  "hour1",
];

export const AdvancedSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { settings, updateSetting, isUpdating } = useSettings();
  const [showSubmitKey, setShowSubmitKey] = useState(false);
  const currentModel = useModelStore((state) =>
    state.models.find((model) => model.id === state.currentModel),
  );
  const isLinux = type() === "linux";

  const unloadTimeout = settings?.model_unload_timeout ?? "never";
  const pasteMethod = settings?.paste_method ?? "ctrl_v";
  const clipboardHandling = settings?.clipboard_handling ?? "dont_modify";
  const autoSubmit = settings?.auto_submit ?? false;
  const autoSubmitKey = settings?.auto_submit_key ?? "enter";
  const experimentalEnabled = settings?.experimental_enabled ?? false;

  const unloadOptions = UNLOAD_TIMEOUTS.map((value) => ({
    value,
    label: t(`settings.advanced.modelUnload.options.${value}`),
  }));

  const clipboardOptions = [
    { value: "dont_modify", label: t("advanced.textInput.clipboard.keep") },
    {
      value: "copy_to_clipboard",
      label: t("advanced.textInput.clipboard.replace"),
    },
  ];

  const submitKeyOptions = [
    { value: "enter", label: t("settings.advanced.autoSubmit.options.enter") },
    {
      value: "ctrl_enter",
      label: t("settings.advanced.autoSubmit.options.ctrlEnter"),
    },
    {
      value: "cmd_enter",
      label:
        osType === "macos"
          ? t("settings.advanced.autoSubmit.options.cmdEnter")
          : t("settings.advanced.autoSubmit.options.superEnter"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("advanced.title")} />

      <Section title={t("advanced.voiceModel.title")}>
        <SettingContainer
          title={t("advanced.voiceModel.activeDuration.title")}
          description={t("advanced.voiceModel.activeDuration.description")}
          descriptionMode="tooltip"
          grouped
        >
          <Dropdown
            options={unloadOptions}
            selectedValue={unloadTimeout}
            onSelect={(value) =>
              updateSetting("model_unload_timeout", value as ModelUnloadTimeout)
            }
            disabled={isUpdating("model_unload_timeout")}
            align="end"
            className="w-[190px]"
          />
        </SettingContainer>
        {currentModel?.supports_language_selection && (
          <LanguageSelector
            grouped
            descriptionMode="tooltip"
            supportedLanguages={currentModel.supported_languages}
          />
        )}
        {currentModel?.supports_translation && (
          <TranslateToEnglish grouped descriptionMode="tooltip" />
        )}
        <ToggleSwitch
          checked={settings?.push_to_talk ?? false}
          onChange={(value) => updateSetting("push_to_talk", value)}
          isUpdating={isUpdating("push_to_talk")}
          label={t("advanced.voiceModel.holdToTalk.title")}
          description={t("advanced.voiceModel.holdToTalk.description")}
          descriptionMode="tooltip"
          grouped
        />
      </Section>

      <Section title={t("advanced.folder.title")}>
        <AppFolderRow />
      </Section>

      <Section title={t("advanced.textInput.title")}>
        <SettingContainer
          title={t("advanced.textInput.clipboard.title")}
          description={t("advanced.textInput.clipboard.description")}
          descriptionMode="tooltip"
          grouped
        >
          <Dropdown
            options={clipboardOptions}
            selectedValue={clipboardHandling}
            onSelect={(value) =>
              updateSetting("clipboard_handling", value as ClipboardHandling)
            }
            disabled={isUpdating("clipboard_handling")}
            align="end"
            className="w-[220px]"
          />
        </SettingContainer>
        <ToggleSwitch
          checked={pasteMethod !== "none"}
          onChange={(value) =>
            updateSetting("paste_method", value ? "ctrl_v" : "none")
          }
          isUpdating={isUpdating("paste_method")}
          label={t("advanced.textInput.paste.title")}
          description={t("advanced.textInput.paste.description")}
          descriptionMode="tooltip"
          grouped
        />
        <SettingContainer
          title={t("advanced.textInput.autoSend.title")}
          description={t("advanced.textInput.autoSend.description")}
          descriptionMode="tooltip"
          grouped
        >
          <div className="flex items-center gap-3">
            {showSubmitKey && (
              <Dropdown
                options={submitKeyOptions}
                selectedValue={autoSubmitKey}
                onSelect={(value) =>
                  updateSetting("auto_submit_key", value as AutoSubmitKey)
                }
                disabled={isUpdating("auto_submit_key")}
                align="end"
                className="w-[190px] wsm-fade-in"
              />
            )}
            <button
              type="button"
              onClick={() => setShowSubmitKey((open) => !open)}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-2 hover:text-text ${
                showSubmitKey ? "bg-surface-2 text-text" : "text-text-muted"
              }`}
              aria-label={t("advanced.textInput.autoSend.key")}
              aria-expanded={showSubmitKey}
              title={t("advanced.textInput.autoSend.key")}
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <Switch
              checked={autoSubmit}
              onChange={(value) => updateSetting("auto_submit", value)}
              disabled={isUpdating("auto_submit")}
              ariaLabel={t("advanced.textInput.autoSend.title")}
            />
          </div>
        </SettingContainer>
        <ToggleSwitch
          checked={pasteMethod === "direct"}
          onChange={(value) =>
            updateSetting("paste_method", value ? "direct" : "ctrl_v")
          }
          isUpdating={isUpdating("paste_method")}
          label={t("advanced.textInput.simulate.title")}
          description={t("advanced.textInput.simulate.description")}
          descriptionMode="tooltip"
          grouped
        />
        <AppendTrailingSpace grouped descriptionMode="tooltip" />
        {isLinux && (
          <>
            <TypingToolSetting grouped descriptionMode="tooltip" />
            <PasteMethodSetting grouped descriptionMode="tooltip" />
          </>
        )}
      </Section>

      <Section title={t("advanced.app.title")}>
        <StartHidden grouped descriptionMode="tooltip" />
        <ShowTrayIcon grouped descriptionMode="tooltip" />
        <ExperimentalToggle grouped descriptionMode="tooltip" />
        {experimentalEnabled && (
          <>
            <KeyboardImplementationSelector grouped descriptionMode="tooltip" />
            <AccelerationSelector grouped descriptionMode="tooltip" />
            <LazyStreamClose grouped descriptionMode="tooltip" />
          </>
        )}
      </Section>

      <Section title={t("advanced.data.title")}>
        <ExportImportSettings grouped />
        <LogDirectory grouped descriptionMode="tooltip" />
        <HistoryLimit grouped descriptionMode="tooltip" />
      </Section>
    </div>
  );
};
