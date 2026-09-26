import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  ChevronUp,
  Copy,
  FolderOpen,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  commands,
  events,
  type HistoryEntry,
  type PostProcessAction,
} from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { getActionIcon } from "@/lib/constants/actionIcons";
import { formatDateTime } from "@/utils/dateFormat";
import { Button, Input } from "@/components/ui";
import { AudioPlayer } from "@/components/ui/AudioPlayer";
import { PopoverMenu } from "@/components/ui/PopoverMenu";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

const hasText = (text: string | null | undefined): text is string =>
  !!text && text.trim().length > 0;

/** Text shown for an entry: the AI rewrite when present, else the transcription. */
const shownText = (entry: HistoryEntry): string =>
  hasText(entry.post_processed_text)
    ? entry.post_processed_text
    : entry.transcription_text;

const countWords = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Calendar days between the entry and today, in local time. */
const daysAgo = (timestamp: number, now: Date): number =>
  Math.max(
    0,
    Math.round(
      (startOfDay(now) - startOfDay(new Date(timestamp * 1000))) / DAY_MS,
    ),
  );

interface EntryGroup {
  days: number;
  entries: HistoryEntry[];
}

const groupByDay = (entries: HistoryEntry[]): EntryGroup[] => {
  const now = new Date();
  const groups = new Map<number, EntryGroup>();
  for (const entry of entries) {
    const days = daysAgo(entry.timestamp, now);
    const group = groups.get(days);
    if (group) {
      group.entries.push(entry);
    } else {
      groups.set(days, { days, entries: [entry] });
    }
  }
  return [...groups.values()];
};

const matchesQuery = (entry: HistoryEntry, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [entry.transcription_text, entry.post_processed_text ?? ""].some(
    (text) => text.toLowerCase().includes(needle),
  );
};

const IconButton: React.FC<{
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, disabled, active, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
      active
        ? "text-text bg-surface-2"
        : "text-text-muted hover:text-text hover:bg-surface-2"
    }`}
  >
    {children}
  </button>
);

const MetaDot: React.FC = () => (
  <span
    aria-hidden="true"
    className="w-1 h-1 rounded-full bg-text-muted/60 shrink-0"
  />
);

interface HistoryCardProps {
  entry: HistoryEntry;
  expanded: boolean;
  modes: PostProcessAction[];
  onExpand: () => void;
  onCollapse: () => void;
  onToggleSaved: () => void;
  onDelete: () => void;
  onEntryUpdated: (entry: HistoryEntry) => void;
  loadAudio: (fileName: string) => Promise<string | null>;
}

const HistoryCard: React.FC<HistoryCardProps> = ({
  entry,
  expanded,
  modes,
  onExpand,
  onCollapse,
  onToggleSaved,
  onDelete,
  onEntryUpdated,
  loadAudio,
}) => {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const copiedTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const text = shownText(entry);
  const failed = !hasText(text);
  const hasProcessed = hasText(entry.post_processed_text);
  const hasBoth =
    hasProcessed &&
    hasText(entry.transcription_text) &&
    entry.post_processed_text?.trim() !== entry.transcription_text.trim();

  const handleCardClick = () => {
    if (expanded) return;
    // Let people select text in a collapsed card without expanding it.
    if (window.getSelection()?.toString()) return;
    onExpand();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (expanded || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onExpand();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const handleRetranscribe = async () => {
    setRetrying(true);
    try {
      const result = await commands.retryHistoryEntryTranscription(entry.id);
      if (result.status !== "ok") throw new Error(String(result.error));
      // The backend emits an "updated" event with the new text.
    } catch (error) {
      console.error("Failed to re-transcribe:", error);
      toast.error(t("settings.history.retranscribeError"));
    } finally {
      setRetrying(false);
    }
  };

  const handleProcess = async (actionId: string) => {
    setProcessing(true);
    try {
      const result = await commands.applyActionToHistoryEntry(
        entry.id,
        actionId,
      );
      if (result.status !== "ok") throw new Error(String(result.error));
      onEntryUpdated(result.data);
    } catch (error) {
      console.error("Failed to process entry:", error);
      toast.error(t("settings.history.processError"));
    } finally {
      setProcessing(false);
    }
  };

  const handleLoadAudio = useCallback(
    () => loadAudio(entry.file_name),
    [loadAudio, entry.file_name],
  );

  const numberFormat = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const textClasses = "text-[15px] leading-relaxed text-text break-words";
  const failedText = (
    <p className="text-[15px] leading-relaxed italic text-text-muted">
      {retrying
        ? t("settings.history.transcribing")
        : t("settings.history.transcriptionFailed")}
    </p>
  );

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-expanded={false}
        onClick={handleCardClick}
        onKeyDown={handleKeyDown}
        className="wsm-card px-5 py-4 cursor-pointer transition-colors hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        {failed ? (
          failedText
        ) : (
          <p className={`${textClasses} line-clamp-2 select-text`}>{text}</p>
        )}
      </div>
    );
  }

  const eligibleModes = modes.filter((mode) => hasText(mode.prompt));
  const metaItems: string[] = [
    formatDateTime(String(entry.timestamp), i18n.language),
  ];
  if (entry.app_name) {
    metaItems.push(t("historyPage.details.app", { app: entry.app_name }));
  }
  if (!failed) {
    const words = countWords(text);
    metaItems.push(
      t("historyPage.details.words", {
        count: words,
        replace: { count: new Intl.NumberFormat(i18n.language).format(words) },
      }),
    );
  }
  if (entry.duration_ms != null) {
    metaItems.push(
      t("historyPage.details.duration", {
        seconds: numberFormat.format(entry.duration_ms / 1000),
      }),
    );
  }

  const sparklesButton = (open: boolean) => (
    <IconButton
      title={t("historyPage.actions.processWith")}
      disabled={failed || retrying || processing}
      active={open || processing}
    >
      <Sparkles
        className={`w-4 h-4 ${processing ? "animate-pulse" : ""}`}
        strokeWidth={1.75}
      />
    </IconButton>
  );

  return (
    <div className="wsm-card px-5 py-4 flex flex-col gap-3 wsm-fade-in">
      {hasBoth && (
        <span className="text-[12px] font-medium uppercase tracking-wide text-text-muted">
          {t("historyPage.details.processed")}
        </span>
      )}
      {failed || retrying ? (
        failedText
      ) : (
        <p className={`${textClasses} select-text whitespace-pre-wrap`}>
          {text}
        </p>
      )}

      {hasBoth && !retrying && (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-[12px] font-medium uppercase tracking-wide text-text-muted">
            {t("historyPage.details.raw")}
          </span>
          <p className="text-[14px] leading-relaxed text-text-muted select-text whitespace-pre-wrap break-words">
            {entry.transcription_text}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-muted">
        {metaItems.map((item, index) => (
          <React.Fragment key={`${index}-${item}`}>
            {index > 0 && <MetaDot />}
            <span>{item}</span>
          </React.Fragment>
        ))}
      </div>

      <AudioPlayer onLoadRequest={handleLoadAudio} className="w-full" />

      <div className="flex items-center gap-1 -ms-1.5">
        <IconButton
          onClick={handleCopy}
          disabled={failed || retrying}
          title={
            copied
              ? t("historyPage.actions.copied")
              : t("historyPage.actions.copy")
          }
        >
          {copied ? (
            <Check className="w-4 h-4 text-success" strokeWidth={2} />
          ) : (
            <Copy className="w-4 h-4" strokeWidth={1.75} />
          )}
        </IconButton>
        <IconButton
          onClick={onToggleSaved}
          title={
            entry.saved
              ? t("historyPage.actions.unsave")
              : t("historyPage.actions.save")
          }
        >
          <Star
            className={`w-4 h-4 ${entry.saved ? "text-warning" : ""}`}
            strokeWidth={1.75}
            fill={entry.saved ? "currentColor" : "none"}
          />
        </IconButton>
        <IconButton
          onClick={handleRetranscribe}
          disabled={retrying || processing}
          title={t("historyPage.actions.retranscribe")}
        >
          <RotateCcw
            className={`w-4 h-4 ${retrying ? "animate-spin [animation-direction:reverse]" : ""}`}
            strokeWidth={1.75}
          />
        </IconButton>
        {eligibleModes.length > 0 &&
          (failed || retrying || processing ? (
            sparklesButton(false)
          ) : (
            <PopoverMenu
              items={eligibleModes.map((mode) => {
                const Icon = getActionIcon(mode.icon);
                return {
                  value: mode.id,
                  label: mode.name,
                  icon: <Icon className="w-3.5 h-3.5 text-text-muted" />,
                };
              })}
              onSelect={handleProcess}
              menuClassName="w-56"
              trigger={sparklesButton}
            />
          ))}
        <IconButton
          onClick={onDelete}
          disabled={retrying}
          title={t("historyPage.actions.delete")}
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
        </IconButton>
        <span className="flex-1" />
        <IconButton
          onClick={onCollapse}
          title={t("historyPage.actions.collapse")}
        >
          <ChevronUp className="w-4 h-4" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
};

export const HistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const osType = useOsType();
  const { settings } = useSettings();
  const modes = settings?.post_process_actions ?? [];

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const queryRef = useRef("");
  const requestIdRef = useRef(0);
  const pagingRef = useRef(false);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    queryRef.current = debouncedQuery;
  }, [debouncedQuery]);

  // Debounce the search field.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadFirstPage = useCallback(async (search: string) => {
    const requestId = ++requestIdRef.current;
    pagingRef.current = false;
    setLoading(true);
    try {
      const result = await commands.getHistoryEntries(
        null,
        PAGE_SIZE,
        search || null,
      );
      if (requestId !== requestIdRef.current) return;
      if (result.status === "ok") {
        setEntries(result.data.entries);
        setHasMore(result.data.has_more);
      } else {
        console.error("Failed to load history entries:", result.error);
      }
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const loadNextPage = useCallback(async () => {
    if (pagingRef.current) return;
    const last = entriesRef.current[entriesRef.current.length - 1];
    if (!last) return;
    const requestId = requestIdRef.current;
    pagingRef.current = true;
    try {
      const search = queryRef.current;
      const result = await commands.getHistoryEntries(
        last.id,
        PAGE_SIZE,
        search || null,
      );
      if (requestId !== requestIdRef.current) return;
      if (result.status === "ok") {
        setEntries((prev) => {
          const known = new Set(prev.map((e) => e.id));
          return [
            ...prev,
            ...result.data.entries.filter((e) => !known.has(e.id)),
          ];
        });
        setHasMore(result.data.has_more);
      }
    } catch (error) {
      console.error("Failed to load more history entries:", error);
    } finally {
      if (requestId === requestIdRef.current) pagingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadFirstPage(debouncedQuery);
  }, [debouncedQuery, loadFirstPage]);

  // Infinite scroll.
  useEffect(() => {
    if (loading || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed[0]?.isIntersecting) loadNextPage();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, entries.length, loadNextPage]);

  // New and updated entries from the transcription pipeline. Deletions and
  // star toggles are applied optimistically, so those events are ignored.
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload = event.payload;
      if (payload.action === "added") {
        if (!matchesQuery(payload.entry, queryRef.current)) return;
        setEntries((prev) =>
          prev.some((e) => e.id === payload.entry.id)
            ? prev
            : [payload.entry, ...prev],
        );
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((e) => (e.id === payload.entry.id ? payload.entry : e)),
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const updateEntry = useCallback((updated: HistoryEntry) => {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }, []);

  const toggleSaved = async (id: number) => {
    const flip = () =>
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
      );
    flip();
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") flip();
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
      flip();
    }
  };

  const deleteEntry = async (id: number) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setExpandedId((current) => (current === id ? null : current));
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") throw new Error(String(result.error));
    } catch (error) {
      console.error("Failed to delete entry:", error);
      toast.error(t("settings.history.deleteError"));
      loadFirstPage(queryRef.current);
    }
  };

  const loadAudio = useCallback(
    async (fileName: string): Promise<string | null> => {
      try {
        const result = await commands.getAudioFilePath(fileName);
        if (result.status !== "ok") return null;
        if (osType === "linux") {
          const fileData = await readFile(result.data);
          const blob = new Blob([fileData], { type: "audio/wav" });
          return URL.createObjectURL(blob);
        }
        return convertFileSrc(result.data, "asset");
      } catch (error) {
        console.error("Failed to get audio file path:", error);
        return null;
      }
    },
    [osType],
  );

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") throw new Error(String(result.error));
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  const groups = useMemo(() => groupByDay(entries), [entries]);

  const groupLabel = (days: number) => {
    if (days === 0) return t("historyPage.groups.today");
    if (days === 1) return t("historyPage.groups.yesterday");
    return t("historyPage.groups.daysAgo", { count: days });
  };

  let content: React.ReactNode;
  if (entries.length === 0) {
    const message = loading
      ? t("historyPage.loading")
      : debouncedQuery
        ? t("historyPage.noResults", { query: debouncedQuery })
        : t("historyPage.empty");
    content = (
      <p className="py-16 text-center text-[15px] text-text-muted">{message}</p>
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.days} className="flex flex-col gap-3">
            <h2 className="px-1 text-[15px] font-semibold text-text/80">
              {groupLabel(group.days)}
            </h2>
            {group.entries.map((entry) => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                modes={modes}
                onExpand={() => setExpandedId(entry.id)}
                onCollapse={() => setExpandedId(null)}
                onToggleSaved={() => toggleSaved(entry.id)}
                onDelete={() => deleteEntry(entry.id)}
                onEntryUpdated={updateEntry}
                loadAudio={loadAudio}
              />
            ))}
          </section>
        ))}
        {hasMore && <div ref={sentinelRef} className="h-1" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
        />
        <Input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("historyPage.search")}
          aria-label={t("historyPage.search")}
          className="w-full h-10 ps-9 text-[15px] font-normal"
        />
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={openRecordingsFolder}>
          <FolderOpen className="w-3.5 h-3.5" />
          {t("historyPage.actions.openFolder")}
        </Button>
      </div>

      {content}
    </div>
  );
};
