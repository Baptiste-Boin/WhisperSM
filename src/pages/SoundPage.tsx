import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Volume1, Volume2 } from "lucide-react";
import {
  Button,
  Dropdown,
  SegmentedControl,
  SettingContainer,
  ToggleSwitch,
} from "@/components/ui";
import { MicrophoneSelector } from "@/components/settings/MicrophoneSelector";
import { AlwaysOnMicrophone } from "@/components/settings/AlwaysOnMicrophone";
import { ClamshellMicrophoneSelector } from "@/components/settings/ClamshellMicrophoneSelector";
import { OutputDeviceSelector } from "@/components/settings/OutputDeviceSelector";
import { useSettings } from "@/hooks/useSettings";
import { useSettingsStore } from "@/stores/settingsStore";

type EffectsChoice = "simple" | "classic" | "off";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    <h2 className="wsm-section-title">{title}</h2>
    <div className="wsm-card divide-y divide-border">{children}</div>
  </section>
);

const VOLUME_TICKS = 9;

const VolumeControl: React.FC<{
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  label: string;
}> = ({ value, onChange, disabled, label }) => {
  const percent = Math.min(100, Math.max(0, value * 100));
  return (
    <div className={`flex items-center gap-3 ${disabled ? "opacity-50" : ""}`}>
      <Volume1 className="h-4 w-4 shrink-0 text-text-muted" />
      <div className="relative w-[220px] pt-1.5 pb-2.5">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          aria-label={label}
          className="block h-1.5 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border-strong [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.25)] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border-strong [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
          style={{
            background: `linear-gradient(to right, var(--color-accent) ${percent}%, var(--color-surface-3) ${percent}%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-x-2.5 bottom-0 flex justify-between">
          {Array.from({ length: VOLUME_TICKS }, (_, index) => (
            <span
              key={index}
              className="block h-[3px] w-[3px] rounded-full bg-text-muted/40"
            />
          ))}
        </div>
      </div>
      <Volume2 className="h-4 w-4 shrink-0 text-text-muted" />
    </div>
  );
};

export const SoundPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting, isUpdating } = useSettings();
  const [previewing, setPreviewing] = useState(false);

  const effectsEnabled = settings?.audio_feedback ?? false;
  const soundTheme = settings?.sound_theme ?? "marimba";
  const effects: EffectsChoice = !effectsEnabled
    ? "off"
    : soundTheme === "pop"
      ? "simple"
      : "classic";
  const volume = settings?.audio_feedback_volume ?? 0.5;

  const effectsOptions: { value: EffectsChoice; label: string }[] = [
    { value: "simple", label: t("sound.effects.simple") },
    { value: "classic", label: t("sound.effects.classic") },
    { value: "off", label: t("sound.effects.off") },
  ];

  const playbackOptions = [
    { value: "mute", label: t("sound.recording.playback.mute") },
    { value: "nothing", label: t("sound.recording.playback.nothing") },
  ];

  const selectEffects = async (value: EffectsChoice) => {
    if (value === effects) return;
    if (value === "off") {
      await updateSetting("audio_feedback", false);
      return;
    }
    await updateSetting("sound_theme", value === "simple" ? "pop" : "marimba");
    if (!effectsEnabled) await updateSetting("audio_feedback", true);
  };

  const previewSounds = async () => {
    const { playTestSound } = useSettingsStore.getState();
    setPreviewing(true);
    try {
      await playTestSound("start");
      await new Promise((resolve) => setTimeout(resolve, 250));
      await playTestSound("stop");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("sound.recording.title")}>
        <MicrophoneSelector grouped descriptionMode="tooltip" />
        <ToggleSwitch
          checked={settings?.silence_removal ?? true}
          onChange={(value) => updateSetting("silence_removal", value)}
          isUpdating={isUpdating("silence_removal")}
          label={t("sound.recording.silenceRemoval.title")}
          description={t("sound.recording.silenceRemoval.description")}
          descriptionMode="tooltip"
          grouped
        />
        <SettingContainer
          title={t("sound.recording.playback.title")}
          description={t("sound.recording.playback.description")}
          descriptionMode="tooltip"
          grouped
        >
          <Dropdown
            options={playbackOptions}
            selectedValue={settings?.mute_while_recording ? "mute" : "nothing"}
            onSelect={(value) =>
              updateSetting("mute_while_recording", value === "mute")
            }
            disabled={isUpdating("mute_while_recording")}
            align="end"
            className="w-[190px]"
          />
        </SettingContainer>
        <AlwaysOnMicrophone grouped descriptionMode="tooltip" />
        <ClamshellMicrophoneSelector grouped descriptionMode="tooltip" />
      </Section>

      <Section title={t("sound.effects.title")}>
        <SettingContainer
          title={t("sound.effects.label")}
          description=""
          descriptionMode="inline"
          grouped
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={previewSounds}
              disabled={!effectsEnabled || previewing}
              title={t("sound.effects.preview")}
              aria-label={t("sound.effects.preview")}
              className="w-7 px-0"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
            </Button>
            <SegmentedControl
              value={effects}
              options={effectsOptions}
              onChange={selectEffects}
            />
          </div>
        </SettingContainer>
        <SettingContainer
          title={t("sound.effects.volume")}
          description=""
          descriptionMode="inline"
          grouped
          disabled={!effectsEnabled}
        >
          <VolumeControl
            value={volume}
            onChange={(value) => updateSetting("audio_feedback_volume", value)}
            disabled={!effectsEnabled}
            label={t("sound.effects.volume")}
          />
        </SettingContainer>
        <OutputDeviceSelector
          grouped
          descriptionMode="tooltip"
          disabled={!effectsEnabled}
        />
      </Section>
    </div>
  );
};
