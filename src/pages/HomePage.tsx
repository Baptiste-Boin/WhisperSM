import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronsUpDown,
  CircleDot,
  Pointer,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commands, events, type HistoryStats } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { navigateTo, requestPageAction } from "@/lib/navigation";
import { CHANGELOG, RELEASES_URL } from "@/lib/changelog";
import { KeyCombo } from "@/components/ui";
import { PopoverMenu } from "@/components/ui/PopoverMenu";

type Period = "thisWeek" | "allTime";

const PERIOD_STORAGE_KEY = "wsm.homePeriod";
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const readStoredPeriod = (): Period => {
  try {
    const stored = window.localStorage.getItem(PERIOD_STORAGE_KEY);
    return stored === "thisWeek" ? "thisWeek" : "allTime";
  } catch {
    return "allTime";
  }
};

const storePeriod = (period: Period) => {
  try {
    window.localStorage.setItem(PERIOD_STORAGE_KEY, period);
  } catch {
    // localStorage may be unavailable; the preference is not essential
  }
};

/** `since` argument of getHistoryStats for a period (unix seconds or null). */
const periodSince = (period: Period): number | null =>
  period === "thisWeek" ? Math.floor(Date.now() / 1000) - WEEK_SECONDS : null;

/** Parse an ISO "YYYY-MM-DD" date as a local calendar day. */
const parseLocalDate = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  if (!year || !month || !day) return new Date(iso);
  return new Date(year, month - 1, day);
};

const Stat: React.FC<{ value: string; label: React.ReactNode }> = ({
  value,
  label,
}) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-[22px] font-semibold leading-tight tracking-tight tabular-nums text-text truncate">
      {value}
    </span>
    <span className="text-[15px] text-text-muted leading-snug flex items-center gap-1.5 min-w-0">
      {label}
    </span>
  </div>
);

const GetStartedRow: React.FC<{
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  trailing?: React.ReactNode;
}> = ({ icon: Icon, title, description, onClick, trailing }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-[64px] flex items-center justify-between gap-4 px-6 py-3 text-start cursor-pointer transition-colors hover:bg-surface-2 focus:outline-none focus-visible:bg-surface-2"
  >
    <span className="flex items-center gap-5 min-w-0">
      <span className="w-8 shrink-0 flex items-center justify-center">
        <Icon className="w-5 h-5 text-text-muted" strokeWidth={1.75} />
      </span>
      <span className="flex flex-col min-w-0">
        <span className="text-[15px] font-medium text-text leading-snug">
          {title}
        </span>
        <span className="text-[13px] text-text-muted leading-snug">
          {description}
        </span>
      </span>
    </span>
    {trailing && <span className="shrink-0">{trailing}</span>}
  </button>
);

export const HomePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const { settings } = useSettings();
  const [period, setPeriod] = useState<Period>(readStoredPeriod);
  const [stats, setStats] = useState<HistoryStats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const result = await commands.getHistoryStats(periodSince(period));
      if (result.status === "ok") setStats(result.data);
    } catch (error) {
      console.error("Failed to load history stats:", error);
    }
  }, [period]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen(() => {
      loadStats();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadStats]);

  const selectPeriod = (value: string) => {
    const next: Period = value === "thisWeek" ? "thisWeek" : "allTime";
    setPeriod(next);
    storePeriod(next);
  };

  const numberFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "short",
        day: "numeric",
      }),
    [i18n.language],
  );

  const averageWpm = Math.round(stats?.average_wpm ?? 0);
  const timeSavedMs = stats?.time_saved_ms ?? 0;
  // `count` drives pluralisation; `replace` shows the locale-formatted number.
  const savedCount =
    timeSavedMs >= HOUR_MS
      ? Math.round(timeSavedMs / HOUR_MS)
      : Math.round(timeSavedMs / MINUTE_MS);
  const timeSaved = t(
    timeSavedMs >= HOUR_MS ? "home.stats.hours" : "home.stats.minutes",
    {
      count: savedCount,
      replace: { count: numberFormat.format(savedCount) },
    },
  );

  const transcribeBinding =
    settings?.bindings?.["transcribe"]?.current_binding ?? "";
  const transcribeCombo = transcribeBinding
    ? formatKeyCombination(transcribeBinding, osType)
    : "";

  const periodLabel =
    period === "thisWeek"
      ? t("home.period.thisWeek")
      : t("home.period.allTime");

  // Modes is lazy-loaded: the pending page action is consumed by the Modes
  // page when it mounts (or received as an event if it is already mounted).
  const openCreateMode = () => {
    requestPageAction("create-mode");
    navigateTo("modes");
  };

  const openReleases = () => {
    openUrl(RELEASES_URL).catch((error) =>
      console.error("Failed to open releases page:", error),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Period picker + stats */}
      <div className="flex flex-col gap-3">
        <div>
          <PopoverMenu
            items={[
              { value: "thisWeek", label: t("home.period.thisWeek") },
              { value: "allTime", label: t("home.period.allTime") },
            ]}
            selected={period}
            onSelect={selectPeriod}
            menuClassName="w-44"
            trigger={() => (
              <button
                type="button"
                className="flex items-center gap-1 text-[17px] font-medium text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                <span>{periodLabel}</span>
                <ChevronsUpDown className="w-4 h-4 text-text-muted" />
              </button>
            )}
          />
        </div>

        <div className="wsm-card px-8 py-6 grid grid-cols-4 gap-6">
          <Stat
            value={t("home.stats.wpm", { value: averageWpm })}
            label={t("home.stats.averageSpeed")}
          />
          <Stat
            value={numberFormat.format(stats?.total_words ?? 0)}
            label={t("home.stats.words")}
          />
          <Stat
            value={numberFormat.format(stats?.apps_used ?? 0)}
            label={t("home.stats.appsUsed")}
          />
          <Stat
            value={timeSaved}
            label={
              <>
                <span className="truncate">
                  {period === "thisWeek"
                    ? t("home.stats.savedThisWeek")
                    : t("home.stats.savedAllTime")}
                </span>
                <PopoverMenu
                  items={[]}
                  onSelect={() => undefined}
                  align="end"
                  menuClassName="w-64"
                  header={
                    <p className="px-2.5 py-1.5 text-[13px] leading-snug text-text-muted">
                      {t("home.stats.savedHint")}
                    </p>
                  }
                  trigger={() => (
                    <button
                      type="button"
                      aria-label={t("home.stats.savedHint")}
                      className="flex items-center text-text-muted hover:text-text transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  )}
                />
              </>
            }
          />
        </div>
      </div>

      {/* Get started */}
      <section className="flex flex-col gap-3">
        <h2 className="text-[17px] font-semibold text-text px-0.5">
          {t("home.getStarted.title")}
        </h2>
        <div className="wsm-card overflow-hidden divide-y divide-border">
          <GetStartedRow
            icon={CircleDot}
            title={t("home.getStarted.startRecording.title")}
            description={t("home.getStarted.startRecording.description")}
            onClick={() => navigateTo("configuration")}
            trailing={
              transcribeCombo ? (
                <KeyCombo combination={transcribeCombo} size="md" />
              ) : (
                <span className="text-[13px] text-text-muted">
                  {t("home.getStarted.setShortcut")}
                </span>
              )
            }
          />
          <GetStartedRow
            icon={Pointer}
            title={t("home.getStarted.shortcuts.title")}
            description={t("home.getStarted.shortcuts.description")}
            onClick={() => navigateTo("configuration")}
          />
          <GetStartedRow
            icon={Sparkles}
            title={t("home.getStarted.createMode.title")}
            description={t("home.getStarted.createMode.description")}
            onClick={openCreateMode}
          />
          <GetStartedRow
            icon={BookOpen}
            title={t("home.getStarted.vocabulary.title")}
            description={t("home.getStarted.vocabulary.description")}
            onClick={() => navigateTo("vocabulary")}
          />
        </div>
      </section>

      {/* What's new */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 px-0.5">
          <h2 className="text-[17px] font-semibold text-text">
            {t("home.whatsNew.title")}
          </h2>
          <button
            type="button"
            onClick={openReleases}
            className="text-[15px] text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            {t("home.whatsNew.viewAll")}
          </button>
        </div>
        <div className="wsm-card divide-y divide-border">
          {CHANGELOG.map((entry) => (
            <div key={entry.id} className="flex items-start gap-6 px-8 py-4">
              <span className="w-[80px] shrink-0 text-[15px] text-text-muted leading-snug tabular-nums">
                {dayFormat.format(parseLocalDate(entry.date))}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[15px] font-semibold text-text leading-snug">
                  {t(`home.changelog.${entry.id}.title`)}
                </span>
                <span className="text-[13px] text-text-muted leading-snug line-clamp-2">
                  {t(`home.changelog.${entry.id}.description`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
