import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  KeyRound,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { commands } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import {
  CLOUD_LLM_CATALOG,
  OLDER_SPEECH_MODEL_IDS,
  VENDOR_NAMES,
  localLlmVendor,
  providerVendor,
  type VendorId,
} from "@/lib/constants/modelCatalog";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";
import { Button } from "@/components/ui";
import { PopoverMenu } from "@/components/ui/PopoverMenu";
import {
  LIBRARY_GRID,
  ModelRow,
  type LibraryRow,
  type RowStatus,
} from "@/components/library/ModelRow";
import { TryPanel } from "@/components/library/TryPanel";
import { ApiKeysDialog } from "@/components/library/ApiKeysDialog";
import { CustomModelDialog } from "@/components/library/CustomModelDialog";

const FAVORITES_KEY = "wsm.favoriteModels";
const LOCAL_PROVIDER_ID = "local";
/** Providers usable without an API key. */
const KEYLESS_PROVIDERS = new Set(["custom", "apple_intelligence", "local"]);

type TypeFilter = "all" | "voice" | "language";
type FlagFilter = "cloud" | "offline" | "favorites" | "ready";
const TYPE_FILTERS: TypeFilter[] = ["all", "voice", "language"];
const ALL_PROVIDERS = "all";

const readFavorites = (): string[] => {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
};

const writeFavorites = (keys: string[]) => {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(keys));
  } catch {
    // Storage unavailable: favourites only last for this session.
  }
};

const normalizeBadge = (badge: string | null | undefined) =>
  badge === "new" || badge === "en" ? badge : null;

const vendorName = (vendor: string) =>
  VENDOR_NAMES[vendor as VendorId] ?? vendor;

/** Rows that stay in the main list even when marked as older. */
const isPinnedStatus = (status: RowStatus) =>
  status === "downloaded" ||
  status === "downloading" ||
  status === "verifying" ||
  status === "extracting";

export const ModelsLibraryPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();

  const voiceModels = useModelStore((s) => s.models);
  const voiceLoading = useModelStore((s) => s.loading);
  const currentModel = useModelStore((s) => s.currentModel);
  const voiceProgress = useModelStore((s) => s.downloadProgress);
  const downloadingVoice = useModelStore((s) => s.downloadingModels);
  const verifyingModels = useModelStore((s) => s.verifyingModels);
  const extractingModels = useModelStore((s) => s.extractingModels);
  const selectVoiceModel = useModelStore((s) => s.selectModel);
  const downloadVoiceModel = useModelStore((s) => s.downloadModel);
  const cancelVoiceDownload = useModelStore((s) => s.cancelDownload);
  const deleteVoiceModel = useModelStore((s) => s.deleteModel);

  const localLlms = useLocalLlmStore((s) => s.models);
  const llmProgress = useLocalLlmStore((s) => s.downloadProgress);
  const downloadLocalLlm = useLocalLlmStore((s) => s.downloadModel);
  const cancelLocalLlm = useLocalLlmStore((s) => s.cancelDownload);
  const deleteLocalLlm = useLocalLlmStore((s) => s.deleteModel);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [flags, setFlags] = useState<FlagFilter[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string>(ALL_PROVIDERS);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showOlder, setShowOlder] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(readFavorites);
  const [tryingKey, setTryingKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [keysDialog, setKeysDialog] = useState<{
    open: boolean;
    focus: string | null;
  }>({ open: false, focus: null });
  const [customOpen, setCustomOpen] = useState(false);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  useEffect(() => {
    writeFavorites(favorites);
  }, [favorites]);

  const toggleFavorite = useCallback((key: string) => {
    setFavorites((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);

  const openKeys = useCallback((providerId?: string) => {
    setKeysDialog({ open: true, focus: providerId ?? null });
  }, []);

  /* ---------------------------------------------------------------- */
  /* Rows                                                              */
  /* ---------------------------------------------------------------- */

  const rows = useMemo<LibraryRow[]>(() => {
    const providers = settings?.post_process_providers ?? [];
    const apiKeys = settings?.post_process_api_keys ?? {};
    const llmEntries = settings?.llm_models ?? [];
    const providerLabel = (id: string) =>
      providers.find((p) => p.id === id)?.label ??
      vendorName(providerVendor(id));
    const hasKey = (id: string) =>
      KEYLESS_PROVIDERS.has(id) || Boolean((apiKeys[id] ?? "").trim());
    const findEntry = (providerId: string, model: string) =>
      llmEntries.find((m) => m.provider_id === providerId && m.model === model);
    const searchText = (...parts: (string | undefined | null)[]) =>
      parts.filter(Boolean).join(" ").toLowerCase();

    const result: LibraryRow[] = [];

    for (const m of voiceModels) {
      const isCloud = Boolean(m.is_cloud);
      let status: RowStatus;
      if (isCloud) status = m.is_downloaded ? "cloud" : "needsKey";
      else if (m.id in extractingModels) status = "extracting";
      else if (m.id in verifyingModels) status = "verifying";
      else if (m.id in downloadingVoice || m.is_downloading)
        status = "downloading";
      else if (m.is_downloaded) status = "downloaded";
      else status = "available";
      const hasScores = m.speed_score > 0 || m.accuracy_score > 0;
      const name = getTranslatedModelName(m, t);
      const vendor = m.vendor || (m.is_custom ? "custom" : "whispersm");
      const providerId = m.provider_id ?? undefined;
      result.push({
        key: `voice:${m.id}`,
        id: m.id,
        source: "voice",
        kind: "voice",
        name,
        vendor,
        badge: normalizeBadge(m.badge),
        speed: hasScores ? m.speed_score : null,
        accuracy: hasScores ? m.accuracy_score : null,
        isCloud,
        providerId,
        providerLabel: providerId ? providerLabel(providerId) : undefined,
        sizeMb: isCloud ? undefined : m.size_mb,
        status,
        progress: voiceProgress[m.id]?.percentage,
        partial: m.partial_size > 0,
        isActive: m.id === currentModel,
        inUse: false,
        older: OLDER_SPEECH_MODEL_IDS.has(m.id),
        searchText: searchText(
          name,
          m.id,
          vendorName(vendor),
          providerId ? providerLabel(providerId) : null,
        ),
      });
    }

    for (const m of localLlms) {
      const progress = llmProgress[m.id]?.percentage;
      const status: RowStatus =
        progress !== undefined || m.is_downloading
          ? "downloading"
          : m.is_downloaded
            ? "downloaded"
            : "available";
      const entry = findEntry(LOCAL_PROVIDER_ID, m.id);
      const vendor = localLlmVendor(m.family);
      result.push({
        key: `llm-local:${m.id}`,
        id: m.id,
        source: "local-llm",
        kind: "language",
        name: m.name,
        vendor,
        badge: m.multilingual ? null : "en",
        speed: m.speed_score,
        accuracy: m.quality_score,
        isCloud: false,
        providerId: LOCAL_PROVIDER_ID,
        sizeMb: m.size_mb,
        status,
        progress,
        partial: m.partial_size > 0,
        isActive: false,
        inUse: m.is_downloaded && Boolean(entry),
        llmModelId: entry?.id,
        older: false,
        searchText: searchText(m.name, m.id, m.family, vendorName(vendor)),
      });
    }

    for (const c of CLOUD_LLM_CATALOG) {
      const entry = findEntry(c.providerId, c.model);
      const label = providerLabel(c.providerId);
      result.push({
        key: `llm-cloud:${c.id}`,
        id: c.id,
        source: "cloud-llm",
        kind: "language",
        name: c.name,
        vendor: c.vendor,
        badge: c.badge ?? null,
        speed: c.speed,
        accuracy: c.accuracy,
        isCloud: true,
        providerId: c.providerId,
        providerLabel: label,
        model: c.model,
        status: hasKey(c.providerId) ? "cloud" : "needsKey",
        partial: false,
        isActive: false,
        inUse: Boolean(entry),
        llmModelId: entry?.id,
        older: false,
        searchText: searchText(c.name, c.model, vendorName(c.vendor), label),
      });
    }

    // Enabled language models that are not in the catalogue (custom
    // endpoints, models added with an older version of the app).
    for (const e of llmEntries) {
      if (e.provider_id === LOCAL_PROVIDER_ID) continue;
      const inCatalog = CLOUD_LLM_CATALOG.some(
        (c) => c.providerId === e.provider_id && c.model === e.model,
      );
      if (inCatalog) continue;
      const vendor =
        e.provider_id === "custom" ? "custom" : providerVendor(e.provider_id);
      const label = providerLabel(e.provider_id);
      const name = e.label || e.model;
      result.push({
        key: `llm-custom:${e.id}`,
        id: e.id,
        source: "custom-llm",
        kind: "language",
        name,
        vendor,
        badge: null,
        speed: null,
        accuracy: null,
        isCloud: !KEYLESS_PROVIDERS.has(e.provider_id),
        providerId: e.provider_id,
        providerLabel: label,
        model: e.model,
        status: hasKey(e.provider_id) ? "cloud" : "needsKey",
        partial: false,
        isActive: false,
        inUse: true,
        llmModelId: e.id,
        older: false,
        searchText: searchText(name, e.model, vendorName(vendor), label),
      });
    }

    return result;
  }, [
    settings?.post_process_providers,
    settings?.post_process_api_keys,
    settings?.llm_models,
    voiceModels,
    currentModel,
    voiceProgress,
    downloadingVoice,
    verifyingModels,
    extractingModels,
    localLlms,
    llmProgress,
    t,
  ]);

  const vendorOptions = useMemo(() => {
    const vendors = Array.from(new Set(rows.map((r) => r.vendor)));
    vendors.sort((a, b) => vendorName(a).localeCompare(vendorName(b)));
    return [
      { value: ALL_PROVIDERS, label: t("library.allProviders") },
      ...vendors.map((v) => ({ value: v, label: vendorName(v) })),
    ];
  }, [rows, t]);

  // Reset the provider filter if its vendor disappears from the list.
  useEffect(() => {
    if (
      vendorFilter !== ALL_PROVIDERS &&
      !vendorOptions.some((o) => o.value === vendorFilter)
    ) {
      setVendorFilter(ALL_PROVIDERS);
    }
  }, [vendorFilter, vendorOptions]);

  const { mainRows, olderRows } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cloudOnly = flags.includes("cloud") && !flags.includes("offline");
    const offlineOnly = flags.includes("offline") && !flags.includes("cloud");
    const favoritesOnly = flags.includes("favorites");
    const readyOnly = flags.includes("ready");

    const visible = rows.filter((row) => {
      if (q && !row.searchText.includes(q)) return false;
      if (typeFilter !== "all" && row.kind !== typeFilter) return false;
      if (vendorFilter !== ALL_PROVIDERS && row.vendor !== vendorFilter)
        return false;
      if (cloudOnly && !row.isCloud) return false;
      if (offlineOnly && row.isCloud) return false;
      if (favoritesOnly && !favoriteSet.has(row.key)) return false;
      if (readyOnly && row.status !== "cloud" && row.status !== "downloaded")
        return false;
      return true;
    });

    const rank = (row: LibraryRow) =>
      favoriteSet.has(row.key) ? 0 : row.isActive || row.inUse ? 1 : 2;
    const dir = sortDir === "asc" ? 1 : -1;
    visible.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        dir *
          a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
          }),
    );

    const main: LibraryRow[] = [];
    const older: LibraryRow[] = [];
    for (const row of visible) {
      const hidden =
        row.older &&
        !favoriteSet.has(row.key) &&
        !row.isActive &&
        !isPinnedStatus(row.status);
      (hidden ? older : main).push(row);
    }
    return { mainRows: main, olderRows: older };
  }, [rows, query, typeFilter, vendorFilter, flags, favoriteSet, sortDir]);

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  const activateVoice = useCallback(
    async (row: LibraryRow) => {
      if (row.isActive) return;
      setBusyKey(row.key);
      try {
        const ok = await selectVoiceModel(row.id);
        if (ok) {
          toast.success(t("library.toasts.activated", { model: row.name }));
        } else {
          toast.error(t("library.toasts.error"));
        }
      } finally {
        setBusyKey(null);
      }
    },
    [selectVoiceModel, t],
  );

  const toggleLanguageModel = useCallback(
    async (row: LibraryRow) => {
      if (!row.providerId || !row.model) return;
      setBusyKey(row.key);
      try {
        if (row.llmModelId) {
          const result = await commands.deleteLlmModel(row.llmModelId);
          if (result.status === "error") throw new Error(result.error);
        } else {
          const result = await commands.addLlmModel(
            row.providerId,
            row.model,
            row.name,
          );
          if (result.status === "error") throw new Error(result.error);
          toast.success(t("library.toasts.enabled", { model: row.name }));
        }
        await refreshSettings();
      } catch (error) {
        console.error("Failed to update language model:", error);
        toast.error(t("library.toasts.error"));
      } finally {
        setBusyKey(null);
      }
    },
    [refreshSettings, t],
  );

  const handleDownload = useCallback(
    (row: LibraryRow) => {
      if (row.source === "voice") void downloadVoiceModel(row.id);
      else if (row.source === "local-llm") void downloadLocalLlm(row.id);
    },
    [downloadVoiceModel, downloadLocalLlm],
  );

  const handleCancel = useCallback(
    (row: LibraryRow) => {
      if (row.source === "voice") void cancelVoiceDownload(row.id);
      else if (row.source === "local-llm") void cancelLocalLlm(row.id);
    },
    [cancelVoiceDownload, cancelLocalLlm],
  );

  const handleDelete = useCallback(
    async (row: LibraryRow) => {
      if (row.source === "custom-llm") {
        await toggleLanguageModel(row);
        return;
      }
      const confirmed = await ask(
        row.isActive
          ? t("library.confirm.deleteActive", { model: row.name })
          : t("library.confirm.delete", { model: row.name }),
        { title: t("library.confirm.deleteTitle"), kind: "warning" },
      );
      if (!confirmed) return;
      let ok = false;
      if (row.source === "voice") {
        ok = await deleteVoiceModel(row.id);
      } else if (row.source === "local-llm") {
        if (tryingKey === row.key) setTryingKey(null);
        ok = await deleteLocalLlm(row.id);
      }
      if (!ok) toast.error(t("library.toasts.error"));
    },
    [deleteVoiceModel, deleteLocalLlm, toggleLanguageModel, tryingKey, t],
  );

  const toggleTry = useCallback((row: LibraryRow) => {
    setTryingKey((prev) => (prev === row.key ? null : row.key));
  }, []);

  const handleRowClick = useCallback(
    (row: LibraryRow) => {
      if (busyKey === row.key) return;
      switch (row.source) {
        case "voice":
          if (row.status === "needsKey") openKeys(row.providerId);
          else if (row.status === "cloud" || row.status === "downloaded")
            void activateVoice(row);
          else if (row.status === "available") handleDownload(row);
          break;
        case "local-llm":
          if (row.status === "downloaded") toggleTry(row);
          else if (row.status === "available") handleDownload(row);
          break;
        case "cloud-llm":
          if (row.status === "needsKey") openKeys(row.providerId);
          else void toggleLanguageModel(row);
          break;
        case "custom-llm":
          if (row.status === "needsKey") openKeys(row.providerId);
          break;
      }
    },
    [
      busyKey,
      openKeys,
      activateVoice,
      handleDownload,
      toggleTry,
      toggleLanguageModel,
    ],
  );

  const rowTitle = (row: LibraryRow): string | undefined => {
    if (row.status === "needsKey") return t("library.actions.addKey");
    switch (row.source) {
      case "voice":
        if (row.status === "available") return t("library.actions.download");
        if (
          !row.isActive &&
          (row.status === "cloud" || row.status === "downloaded")
        )
          return t("library.actions.use");
        return undefined;
      case "local-llm":
        if (row.status === "available") return t("library.actions.download");
        if (row.status === "downloaded") return t("library.actions.try");
        return undefined;
      case "cloud-llm":
        return row.inUse
          ? t("library.actions.disable")
          : t("library.actions.enable");
      default:
        return undefined;
    }
  };

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  const filterItems = [
    { value: "all", label: t("library.filters.all") },
    { value: "voice", label: t("library.filters.voice") },
    { value: "language", label: t("library.filters.language") },
    { value: "cloud", label: t("library.filters.cloud") },
    { value: "offline", label: t("library.filters.offline") },
    { value: "favorites", label: t("library.filters.favorites") },
    { value: "ready", label: t("library.filters.ready") },
  ];
  const filtersActive = typeFilter !== "all" || flags.length > 0;

  const onFilterSelect = (value: string) => {
    if ((TYPE_FILTERS as string[]).includes(value)) {
      setTypeFilter(value as TypeFilter);
      return;
    }
    const flag = value as FlagFilter;
    setFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
  };

  const renderRow = (row: LibraryRow) => {
    const tryModel =
      row.source === "local-llm" && row.status === "downloaded"
        ? localLlms.find((m) => m.id === row.id)
        : undefined;
    const isTryOpen = Boolean(tryModel) && tryingKey === row.key;
    return (
      <React.Fragment key={row.key}>
        <ModelRow
          row={row}
          isFavorite={favoriteSet.has(row.key)}
          isTryOpen={isTryOpen}
          rowTitle={rowTitle(row)}
          onToggleFavorite={() => toggleFavorite(row.key)}
          onClick={() => handleRowClick(row)}
          onDownload={() => handleDownload(row)}
          onCancel={() => handleCancel(row)}
          onDelete={() => void handleDelete(row)}
          onTry={tryModel ? () => toggleTry(row) : undefined}
        />
        {isTryOpen && tryModel && (
          <TryPanel model={tryModel} onClose={() => setTryingKey(null)} />
        )}
      </React.Fragment>
    );
  };

  const selectedVendorLabel =
    vendorOptions.find((o) => o.value === vendorFilter)?.label ??
    t("library.allProviders");
  const isEmpty =
    mainRows.length === 0 && (olderRows.length === 0 || !showOlder);

  return (
    <div className="flex flex-col gap-6">
      {/* Search + filters */}
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <Search
            className="w-5 h-5 text-text-muted shrink-0"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("library.search")}
            aria-label={t("library.search")}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[17px] text-text placeholder:text-text-muted/70"
          />
          <PopoverMenu
            align="end"
            stayOpen
            menuClassName="w-56"
            items={filterItems}
            selected={[typeFilter, ...flags]}
            onSelect={onFilterSelect}
            header={
              <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-medium text-text-muted">
                {t("library.filters.title")}
              </p>
            }
            trigger={(open) => (
              <span
                role="button"
                aria-label={t("library.filters.title")}
                title={t("library.filters.title")}
                className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  open || filtersActive
                    ? "bg-surface-2 text-text"
                    : "text-text-muted hover:text-text hover:bg-surface-2"
                }`}
              >
                <SlidersHorizontal className="w-[18px] h-[18px]" />
                {filtersActive && (
                  <span className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </span>
            )}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <PopoverMenu
            items={vendorOptions}
            selected={vendorFilter}
            onSelect={setVendorFilter}
            menuClassName="w-60 max-h-80 overflow-y-auto"
            trigger={(open) => (
              <span
                role="button"
                className={`h-10 min-w-[240px] px-3.5 inline-flex items-center justify-between gap-3 rounded-xl border bg-surface text-[16px] text-text transition-colors ${
                  open
                    ? "border-accent ring-2 ring-accent/20"
                    : "border-border-strong hover:bg-surface-2"
                }`}
              >
                <span className="truncate">{selectedVendorLabel}</span>
                <ChevronsUpDown className="w-4 h-4 text-text-muted shrink-0" />
              </span>
            )}
          />
          <button
            type="button"
            onClick={() => openKeys()}
            title={t("library.apiKeys")}
            aria-label={t("library.apiKeys")}
            className="h-10 w-14 rounded-xl bg-surface-2 border border-border text-text hover:bg-surface-3 flex items-center justify-center transition-colors"
          >
            <KeyRound className="w-5 h-5" strokeWidth={1.9} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="wsm-card p-2">
        <div
          className={`${LIBRARY_GRID} h-10 px-2 text-[13px] text-text-muted select-none`}
        >
          <span />
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1 justify-self-start ps-[42px] hover:text-text transition-colors"
          >
            {t("library.columns.name")}
            {sortDir === "asc" ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          <span className="text-center">{t("library.columns.type")}</span>
          <span className="whitespace-nowrap">
            {t("library.columns.speedAccuracy")}
          </span>
          <span className="text-end pe-1.5 whitespace-nowrap">
            {t("library.columns.cloudOffline")}
          </span>
        </div>

        {isEmpty &&
          (voiceLoading && rows.length === 0 ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </div>
          ) : (
            <p className="py-10 text-center text-[15px] text-text-muted">
              {t("library.empty")}
            </p>
          ))}

        {mainRows.map(renderRow)}

        {olderRows.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOlder((v) => !v)}
              aria-expanded={showOlder}
              className="mt-1 h-11 px-2 inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-muted hover:text-text transition-colors"
            >
              {showOlder ? t("library.older.hide") : t("library.older.show")}
              <ChevronRight
                className={`w-4 h-4 transition-transform ${showOlder ? "rotate-90" : ""}`}
              />
            </button>
            {showOlder && olderRows.map(renderRow)}
          </>
        )}
      </div>

      <div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => setCustomOpen(true)}
        >
          <Plus className="w-4 h-4" />
          {t("library.custom.add")}
        </Button>
      </div>

      <ApiKeysDialog
        open={keysDialog.open}
        focusProvider={keysDialog.focus}
        onClose={() => setKeysDialog({ open: false, focus: null })}
      />
      <CustomModelDialog
        open={customOpen}
        onClose={() => setCustomOpen(false)}
      />
    </div>
  );
};

export default ModelsLibraryPage;
