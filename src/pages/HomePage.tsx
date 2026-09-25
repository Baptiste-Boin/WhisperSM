import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Check,
  Copy,
  Cpu,
  Mic,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  commands,
  events,
  type HistoryEntry,
  type HistoryStats,
} from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";
import { getActionIcon } from "@/lib/constants/actionIcons";
import { navigateTo } from "@/lib/navigation";
import { formatDateTime, formatRelativeTime } from "@/utils/dateFormat";
import { Badge, Button, Kbd, KeyCombo } from "@/components/ui";
import { Dropdown } from "@/components/ui";

const StatTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  compact?: boolean;
}> = ({ label, value, hint, compact = false }) => (
  <div className="wsm-card px-4 py-3 flex flex-col gap-0.5 min-w-0">
    <span className="text-[11px] uppercase tracking-wide font-semibold text-text-muted truncate">
      {label}
    </span>
    <span
      className={`font-semibold tabular-nums tracking-tight ${
        compact ? "text-base leading-snug truncate" : "text-2xl"
      }`}
      title={value}
    >
      {value}
    </span>
    {hint && <span className="text-xs text-text-muted truncate">{hint}</span>}
  </div>
);

export const HomePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const { settings, updateSetting, audioDevices, refreshAudioDevices } =
    useSettings();
  const models = useModelStore((state) => state.models);
  const currentModel = useModelStore((state) => state.currentModel);
  const localModels = useLocalLlmStore((state) => state.models);
  const localStatus = useLocalLlmStore((state) => state.status);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const bindings = settings?.bindings ?? {};
  const transcribeBinding = bindings["transcribe"]?.current_binding ?? "";
  const postProcessBinding =
    bindings["transcribe_with_post_process"]?.current_binding ?? "";
  const pushToTalk = settings?.push_to_talk ?? true;
  const actions = settings?.post_process_actions ?? [];
  const savedModels = settings?.llm_models ?? [];

  const speechModel = models.find((m) => m.id === currentModel);
  const selectedMicrophone =
    settings?.selected_microphone === "default"
      ? "Default"
      : (settings?.selected_microphone ?? "Default");
  const microphoneOptions = audioDevices.map((device) => ({
    value: device.name,
    label: device.name,
  }));
  const downloadedLocal = localModels.filter((m) => m.is_downloaded);
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );

  const loadStats = useCallback(async () => {
    try {
      const [statsResult, entriesResult] = await Promise.all([
        commands.getHistoryStats(),
        commands.getHistoryEntries(null, 3),
      ]);
      if (statsResult.status === "ok") setStats(statsResult.data);
      if (entriesResult.status === "ok") setRecent(entriesResult.data.entries);
    } catch (error) {
      console.error("Failed to load home stats:", error);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const unlisten = events.historyUpdatePayload.listen(() => {
      loadStats();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadStats]);

  const copyEntry = async (entry: HistoryEntry) => {
    try {
      await navigator.clipboard.writeText(
        entry.post_processed_text ?? entry.transcription_text,
      );
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const aiStatusLabel = (() => {
    if (localStatus?.is_generating) return t("home.ai.generating");
    if (localStatus?.is_loading) return t("home.ai.loading");
    if (downloadedLocal.length > 0) {
      const loaded = downloadedLocal.find(
        (m) => m.id === localStatus?.loaded_model_id,
      );
      return loaded
        ? t("home.ai.loaded", { model: loaded.name })
        : t("home.ai.ready", { count: downloadedLocal.length });
    }
    if (savedModels.length > 0) return t("home.ai.cloudOnly");
    return t("home.ai.none");
  })();

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section className="wsm-card relative overflow-hidden px-6 py-6">
        <div
          className="absolute -top-24 -end-24 w-72 h-72 rounded-full opacity-30 blur-3xl wsm-gradient pointer-events-none"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                {t("home.hero.eyebrow")}
              </p>
              <h1 className="text-[26px] font-semibold tracking-tight mt-1">
                {t("home.hero.title")}
              </h1>
              <p className="text-sm text-text-muted mt-1.5 max-w-lg leading-relaxed">
                {pushToTalk
                  ? t("home.hero.subtitleHold")
                  : t("home.hero.subtitleToggle")}
              </p>
            </div>
            <div className="hidden sm:flex w-12 h-12 rounded-2xl wsm-gradient items-center justify-center shadow-lg shrink-0">
              <Mic className="w-6 h-6 text-white" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-muted">
                {t("home.hero.dictate")}
              </span>
              {transcribeBinding ? (
                <KeyCombo
                  combination={formatKeyCombination(transcribeBinding, osType)}
                  size="lg"
                />
              ) : (
                <Kbd size="lg">{t("settings.general.shortcut.clickToSet")}</Kbd>
              )}
            </div>
            {settings?.post_process_enabled && postProcessBinding && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-text-muted">
                  {t("home.hero.dictateWithAi")}
                </span>
                <KeyCombo
                  combination={formatKeyCombination(postProcessBinding, osType)}
                  size="lg"
                />
              </div>
            )}
            <div className="ms-auto flex items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => navigateTo("settings")}
              >
                {t("home.hero.changeShortcut")}
              </Button>
            </div>
          </div>

          {actions.length > 0 && (
            <p className="text-xs text-text-muted flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-accent" />
              {t("home.hero.modesHint")}
            </p>
          )}
        </div>
      </section>

      {/* Status */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigateTo("models")}
          className="wsm-card px-4 py-3 flex items-center gap-3 text-start hover:border-accent/50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <Mic className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">
              {t("home.status.speechModel")}
            </p>
            <p className="text-sm font-medium truncate">
              {speechModel
                ? getTranslatedModelName(speechModel, t)
                : t("home.status.noSpeechModel")}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
        </button>
        <button
          type="button"
          onClick={() => navigateTo("models")}
          className="wsm-card px-4 py-3 flex items-center gap-3 text-start hover:border-accent/50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <Cpu className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-text-muted">
              {t("home.status.aiModel")}
            </p>
            <p className="text-sm font-medium truncate">{aiStatusLabel}</p>
          </div>
          {downloadedLocal.length > 0 ? (
            <Badge variant="success">{t("home.status.onDevice")}</Badge>
          ) : (
            <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
          )}
        </button>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label={t("home.stats.today")}
          value={numberFormat.format(stats?.entries_today ?? 0)}
          hint={t("home.stats.words", {
            count: stats?.words_today ?? 0,
            formatted: numberFormat.format(stats?.words_today ?? 0),
          })}
        />
        <StatTile
          label={t("home.stats.total")}
          value={numberFormat.format(stats?.total_entries ?? 0)}
          hint={t("home.stats.words", {
            count: stats?.total_words ?? 0,
            formatted: numberFormat.format(stats?.total_words ?? 0),
          })}
        />
        <StatTile
          label={t("home.stats.enhanced")}
          value={numberFormat.format(stats?.post_processed_entries ?? 0)}
          hint={t("home.stats.enhancedHint")}
        />
        <StatTile
          compact
          label={t("home.stats.lastUsed")}
          value={
            stats?.last_timestamp
              ? formatRelativeTime(String(stats.last_timestamp), i18n.language)
              : "—"
          }
          hint={
            stats?.last_timestamp
              ? formatDateTime(String(stats.last_timestamp), i18n.language)
              : t("home.stats.never")
          }
        />
      </section>

      {/* Modes */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold tracking-tight">
            {t("home.modes.title")}
          </h2>
          <button
            type="button"
            onClick={() => navigateTo("modes")}
            className="text-xs font-medium text-accent hover:underline"
          >
            {t("home.modes.manage")}
          </button>
        </div>
        {actions.length === 0 ? (
          <button
            type="button"
            onClick={() => navigateTo("modes")}
            className="wsm-card px-4 py-4 flex items-center gap-3 text-start hover:border-accent/50 transition-colors"
          >
            <Sparkles className="w-5 h-5 text-accent" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {t("home.modes.emptyTitle")}
              </p>
              <p className="text-xs text-text-muted">{t("home.modes.empty")}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted" />
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {actions.slice(0, 6).map((action) => {
              const Icon = getActionIcon(action.icon);
              const model = savedModels.find(
                (m) => m.id === action.llm_model_id,
              );
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => navigateTo("modes")}
                  className="wsm-card px-3 py-2.5 flex items-center gap-2.5 text-start hover:border-accent/50 transition-colors min-w-0"
                >
                  <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {action.name}
                    </p>
                    <p className="text-[11px] text-text-muted truncate">
                      {model?.label ?? t("home.modes.noModel")}
                    </p>
                  </div>
                  {action.trigger_key != null && (
                    <Kbd size="sm">{action.trigger_key}</Kbd>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent transcriptions */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[13px] font-semibold tracking-tight">
              {t("home.recent.title")}
            </h2>
            <button
              type="button"
              onClick={() => navigateTo("history")}
              className="text-xs font-medium text-accent hover:underline"
            >
              {t("home.recent.viewAll")}
            </button>
          </div>
          <div className="wsm-card divide-y divide-border">
            {recent.length === 0 ? (
              <p className="px-4 py-5 text-sm text-text-muted text-center">
                {t("home.recent.empty")}
              </p>
            ) : (
              recent.map((entry) => {
                const text =
                  entry.post_processed_text ?? entry.transcription_text;
                const formattedDate = formatDateTime(
                  String(entry.timestamp),
                  i18n.language,
                );
                return (
                  <div
                    key={entry.id}
                    className="px-4 py-3 flex items-start gap-3 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed line-clamp-2 select-text">
                        {text || t("settings.history.transcriptionFailed")}
                      </p>
                      <p className="text-[11px] text-text-muted mt-1 flex items-center gap-2">
                        <span>{formattedDate}</span>
                        {entry.post_processed_text && (
                          <Badge variant="primary">
                            <Sparkles className="w-2.5 h-2.5" />
                            {t("settings.history.processed")}
                          </Badge>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyEntry(entry)}
                      className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-accent-soft transition-colors shrink-0"
                      title={t("settings.history.copyToClipboard")}
                    >
                      {copiedId === entry.id ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="wsm-card px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Mic className="w-4 h-4 text-text-muted shrink-0" />
            <span className="text-sm font-medium">
              {t("home.microphone.title")}
            </span>
          </div>
          <Dropdown
            options={microphoneOptions}
            selectedValue={selectedMicrophone}
            onSelect={(value) => updateSetting("selected_microphone", value)}
            onRefresh={refreshAudioDevices}
            className="w-[260px]"
            align="end"
            placeholder={t("settings.sound.microphone.placeholder")}
          />
        </div>
      </section>
    </div>
  );
};
