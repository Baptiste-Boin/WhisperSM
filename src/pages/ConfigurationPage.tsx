import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  commands,
  type OverlayStyle,
  type RecordingRetentionPeriod,
  type ThemePreference,
} from "@/bindings";
import {
  Button,
  Dropdown,
  SettingContainer,
  Switch,
  ToggleSwitch,
} from "@/components/ui";
import {
  ChoiceCards,
  type ChoiceCardOption,
} from "@/components/ui/ChoiceCards";
import { ShortcutInput } from "@/components/settings/ShortcutInput";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { useSettings } from "@/hooks/useSettings";
import { navigateTo } from "@/lib/navigation";

type RecordingWindow = OverlayStyle | "none";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    <h2 className="wsm-section-title">{title}</h2>
    <div className="wsm-card divide-y divide-border">{children}</div>
  </section>
);

/* ------------------------------------------------------------------ */
/* Theme previews: fixed light / dark art, independent of the theme.   */
/* ------------------------------------------------------------------ */

const WINDOW_ART = {
  light: { bg: "#eef0f5", window: "#ffffff", line: "#dfe2ea" },
  dark: { bg: "#1c1c22", window: "#2b2b33", line: "#3d3d47" },
} as const;

const TRAFFIC_LIGHTS = ["#ff5f57", "#febc2e", "#28c840"];

const MiniWindow: React.FC<{
  variant: "light" | "dark";
  style?: React.CSSProperties;
}> = ({ variant, style }) => {
  const art = WINDOW_ART[variant];
  return (
    <span
      className="absolute inset-0 block"
      style={{ background: art.bg, ...style }}
    >
      <span
        className="absolute left-[10px] top-[10px] -right-px -bottom-px block rounded-tl-[6px]"
        style={{
          background: art.window,
          boxShadow: "0 0 0 0.5px rgba(0, 0, 0, 0.14)",
        }}
      >
        <span className="flex gap-[3px] px-[5px] pt-[5px]">
          {TRAFFIC_LIGHTS.map((color) => (
            <span
              key={color}
              className="block h-[4px] w-[4px] rounded-full"
              style={{ background: color }}
            />
          ))}
        </span>
        <span
          className="ms-[5px] mt-[7px] block h-[3px] w-[28px] rounded-full"
          style={{ background: art.line }}
        />
        <span
          className="ms-[5px] mt-[4px] block h-[3px] w-[18px] rounded-full"
          style={{ background: art.line }}
        />
      </span>
    </span>
  );
};

const ThemePreview: React.FC<{ theme: ThemePreference }> = ({ theme }) => {
  if (theme === "auto") {
    return (
      <>
        <MiniWindow variant="light" />
        <MiniWindow
          variant="dark"
          style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
        />
      </>
    );
  }
  return <MiniWindow variant={theme} />;
};

/* ------------------------------------------------------------------ */
/* Recording window previews: the overlay is always dark.              */
/* ------------------------------------------------------------------ */

const OVERLAY_BG = "#141418";
const OVERLAY_STRIP = "#2a2a31";
const CLASSIC_BARS = [3, 5, 8, 4, 10, 6, 12, 7, 4, 9, 13, 8, 5, 10, 6, 3, 7, 4];
const MINI_BARS = [4, 8, 11, 8, 4];

const Bars: React.FC<{ heights: number[]; width: number; gap: number }> = ({
  heights,
  width,
  gap,
}) => (
  <span className="flex items-center" style={{ gap }}>
    {heights.map((height, index) => (
      <span
        key={index}
        className="block rounded-full bg-white"
        style={{ width, height }}
      />
    ))}
  </span>
);

const RecordingWindowPreview: React.FC<{ kind: RecordingWindow }> = ({
  kind,
}) => {
  if (kind === "none") {
    return <EyeOff className="h-5 w-5 text-text-muted" strokeWidth={1.75} />;
  }
  if (kind === "mini") {
    return (
      <span
        className="flex h-[18px] w-[44px] items-center justify-center rounded-full shadow-sm"
        style={{ background: OVERLAY_BG }}
      >
        <Bars heights={MINI_BARS} width={2} gap={2} />
      </span>
    );
  }
  return (
    <span
      className="flex h-[30px] w-[64px] flex-col overflow-hidden rounded-[6px] shadow-sm"
      style={{ background: OVERLAY_BG }}
    >
      <span className="flex flex-1 items-center justify-center">
        <Bars heights={CLASSIC_BARS} width={1.5} gap={1.5} />
      </span>
      <span className="block h-[6px]" style={{ background: OVERLAY_STRIP }} />
    </span>
  );
};

/* ------------------------------------------------------------------ */

const SHORTCUT_ROWS = [
  { id: "transcribe", key: "toggleRecording" },
  { id: "cancel", key: "cancelRecording" },
  { id: "change_mode", key: "changeMode" },
  { id: "push_to_talk", key: "pushToTalk" },
] as const;

const VERBOSE_LOG_LEVELS = ["trace", "debug", "info"];

export const ConfigurationPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting, isUpdating } = useSettings();

  const theme: ThemePreference = settings?.theme ?? "dark";
  const overlayPosition = settings?.overlay_position ?? "bottom";
  const overlayStyle: OverlayStyle = settings?.overlay_style ?? "classic";
  const recordingWindow: RecordingWindow =
    overlayPosition === "none"
      ? "none"
      : overlayStyle === "mini"
        ? "mini"
        : "classic";
  const postProcessEnabled = settings?.post_process_enabled ?? false;
  const errorLogging = VERBOSE_LOG_LEVELS.includes(
    settings?.log_level ?? "debug",
  );
  const retention = settings?.recording_retention_period ?? "never";
  const historyLimit = settings?.history_limit ?? 5;

  const themeOptions: ChoiceCardOption<ThemePreference>[] = (
    ["auto", "light", "dark"] as const
  ).map((value) => ({
    value,
    label: t(`configuration.appearance.theme.${value}`),
    preview: <ThemePreview theme={value} />,
  }));

  const recordingWindowOptions: ChoiceCardOption<RecordingWindow>[] = (
    ["classic", "mini", "none"] as const
  ).map((value) => ({
    value,
    label: t(`configuration.appearance.recordingWindow.${value}`),
    preview: <RecordingWindowPreview kind={value} />,
  }));

  // Runtime values of RecordingRetentionPeriod (serde snake_case keeps
  // digits attached: "days3", not "days_3").
  const retentionOptions = [
    {
      value: "never",
      label: t("configuration.application.keepRecordings.forever"),
    },
    {
      value: "preserve_limit",
      label: t("configuration.application.keepRecordings.latest", {
        count: historyLimit,
      }),
    },
    {
      value: "days3",
      label: t("configuration.application.keepRecordings.days3"),
    },
    {
      value: "weeks2",
      label: t("configuration.application.keepRecordings.weeks2"),
    },
    {
      value: "months3",
      label: t("configuration.application.keepRecordings.months3"),
    },
  ];

  const selectRecordingWindow = async (value: RecordingWindow) => {
    if (value === "none") {
      await updateSetting("overlay_position", "none");
      return;
    }
    if (overlayPosition === "none") {
      await updateSetting("overlay_position", "bottom");
    }
    await updateSetting("overlay_style", value);
  };

  const checkForUpdates = async () => {
    try {
      const result = await commands.triggerUpdateCheck();
      if (result.status === "error") toast.error(result.error);
    } catch (error) {
      console.error("Failed to trigger update check:", error);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("configuration.appearance.title")}>
        <SettingContainer
          title={t("configuration.appearance.theme.title")}
          description=""
          descriptionMode="inline"
          grouped
        >
          <div className="py-1.5">
            <ChoiceCards
              value={theme}
              options={themeOptions}
              onChange={(value) => updateSetting("theme", value)}
              cardClassName="w-[74px] h-[54px]"
              ariaLabel={t("configuration.appearance.theme.title")}
            />
          </div>
        </SettingContainer>
        <SettingContainer
          title={t("configuration.appearance.recordingWindow.title")}
          description=""
          descriptionMode="inline"
          grouped
        >
          <div className="py-1.5">
            <ChoiceCards
              value={recordingWindow}
              options={recordingWindowOptions}
              onChange={selectRecordingWindow}
              cardClassName="w-[96px] h-[48px]"
              ariaLabel={t("configuration.appearance.recordingWindow.title")}
            />
          </div>
        </SettingContainer>
        <ToggleSwitch
          checked={settings?.overlay_always_show ?? false}
          onChange={(value) => updateSetting("overlay_always_show", value)}
          isUpdating={isUpdating("overlay_always_show")}
          disabled={overlayPosition === "none"}
          label={t("configuration.appearance.alwaysShow.title")}
          description={t("configuration.appearance.alwaysShow.description")}
          descriptionMode="tooltip"
          grouped
        />
      </Section>

      <Section title={t("configuration.shortcuts.title")}>
        {SHORTCUT_ROWS.map((row) => (
          <SettingContainer
            key={row.id}
            title={t(`configuration.shortcuts.${row.key}.title`)}
            description={t(`configuration.shortcuts.${row.key}.description`)}
            descriptionMode="inline"
            grouped
          >
            <ShortcutInput shortcutId={row.id} bare />
          </SettingContainer>
        ))}
        <SettingContainer
          title={t("configuration.shortcuts.aiShortcut.title")}
          description={t("configuration.shortcuts.aiShortcut.description")}
          descriptionMode="inline"
          grouped
        >
          <div className="flex items-center gap-3">
            <Switch
              checked={postProcessEnabled}
              onChange={(value) => updateSetting("post_process_enabled", value)}
              disabled={isUpdating("post_process_enabled")}
              ariaLabel={t("configuration.shortcuts.aiShortcut.title")}
            />
            {postProcessEnabled && (
              <ShortcutInput shortcutId="transcribe_with_post_process" bare />
            )}
          </div>
        </SettingContainer>
      </Section>

      <Section title={t("configuration.application.title")}>
        <SettingContainer
          title={t("configuration.application.update.title")}
          description=""
          descriptionMode="inline"
          grouped
        >
          <Button variant="secondary" onClick={checkForUpdates}>
            {t("configuration.application.update.check")}
          </Button>
        </SettingContainer>
        <ToggleSwitch
          checked={settings?.update_checks_enabled ?? true}
          onChange={(value) => updateSetting("update_checks_enabled", value)}
          isUpdating={isUpdating("update_checks_enabled")}
          label={t("configuration.application.autoUpdate.title")}
          description={t("configuration.application.autoUpdate.description")}
          descriptionMode="tooltip"
          grouped
        />
        <ToggleSwitch
          checked={settings?.autostart_enabled ?? false}
          onChange={(value) => updateSetting("autostart_enabled", value)}
          isUpdating={isUpdating("autostart_enabled")}
          label={t("configuration.application.launchOnLogin.title")}
          description={t("configuration.application.launchOnLogin.description")}
          descriptionMode="tooltip"
          grouped
        />
        <ToggleSwitch
          checked={errorLogging}
          onChange={(value) =>
            updateSetting("log_level", value ? "debug" : "warn")
          }
          isUpdating={isUpdating("log_level")}
          label={t("configuration.application.errorLogging.title")}
          description={t("configuration.application.errorLogging.description")}
          descriptionMode="tooltip"
          grouped
        />
        <SettingContainer
          title={t("configuration.application.keepRecordings.title")}
          description={t(
            "configuration.application.keepRecordings.description",
          )}
          descriptionMode="tooltip"
          grouped
        >
          <Dropdown
            options={retentionOptions}
            selectedValue={retention}
            onSelect={(value) =>
              updateSetting(
                "recording_retention_period",
                value as RecordingRetentionPeriod,
              )
            }
            disabled={isUpdating("recording_retention_period")}
            align="end"
            className="w-[190px]"
          />
        </SettingContainer>
        <AppLanguageSelector grouped descriptionMode="tooltip" />
      </Section>

      <button
        type="button"
        onClick={() => navigateTo("advanced")}
        className="wsm-card flex min-h-[56px] w-full items-center justify-between gap-4 px-4 text-start transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="text-sm font-medium text-text">
          {t("configuration.advanced.title")}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted rtl:rotate-180" />
      </button>
    </div>
  );
};
