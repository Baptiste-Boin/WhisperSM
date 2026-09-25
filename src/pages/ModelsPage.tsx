import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  Check,
  Cpu,
  Download,
  Globe,
  Loader2,
  Mic,
  Play,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import type { ModelCardStatus } from "@/components/onboarding/ModelCard";
import ModelCard from "@/components/onboarding/ModelCard";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import { useSettings } from "@/hooks/useSettings";
import { LANGUAGES } from "@/lib/constants/languages";
import type { LocalLlmModelInfo, ModelInfo } from "@/bindings";
import { commands } from "@/bindings";
import { formatModelSize } from "@/lib/utils/format";
import {
  Badge,
  Button,
  Dropdown,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
} from "@/components/ui";

const LOCAL_PROVIDER_ID = "local";

/* ------------------------------------------------------------------ */
/* On-device language models                                           */
/* ------------------------------------------------------------------ */

const ScoreBar: React.FC<{ label: string; value: number }> = ({
  label,
  value,
}) => (
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-text-muted w-14 text-end">{label}</span>
    <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
      <div
        className="h-full wsm-gradient rounded-full"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  </div>
);

interface LocalModelCardProps {
  model: LocalLlmModelInfo;
  progress?: number;
  speed?: number;
  isLoaded: boolean;
  isBusy: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onTry: () => void;
}

const LocalModelCard: React.FC<LocalModelCardProps> = ({
  model,
  progress,
  speed,
  isLoaded,
  isBusy,
  onDownload,
  onCancel,
  onDelete,
  onTry,
}) => {
  const { t } = useTranslation();
  const downloading = model.is_downloading || progress !== undefined;

  return (
    <div
      className={`wsm-card px-4 py-3.5 flex flex-col gap-3 ${
        model.is_downloaded ? "border-accent/30" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            model.is_downloaded
              ? "wsm-gradient text-white shadow-sm"
              : "bg-surface-2 text-text-muted"
          }`}
        >
          <Cpu className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{model.name}</h3>
            <Badge variant="secondary">{model.parameters}</Badge>
            {model.is_recommended && (
              <Badge variant="primary">{t("onboarding.recommended")}</Badge>
            )}
            {isLoaded && (
              <Badge variant="success">
                <Check className="w-2.5 h-2.5" />
                {t("models.ai.loaded")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            {model.description}
          </p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Globe className="w-3 h-3" />
              {model.multilingual
                ? t("models.ai.multilingual")
                : t("models.ai.englishFirst")}
            </span>
            <span>{t("models.ai.ram", { gb: model.min_ram_gb })}</span>
            <span>{model.family}</span>
            <span className="font-mono">{model.quantization}</span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col gap-1 shrink-0">
          <ScoreBar
            label={t("models.ai.quality")}
            value={model.quality_score}
          />
          <ScoreBar
            label={t("onboarding.modelCard.speed")}
            value={model.speed_score}
          />
        </div>
      </div>

      {downloading ? (
        <div className="space-y-1.5">
          <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full wsm-gradient rounded-full transition-[width] duration-300"
              style={{ width: `${Math.max(2, progress ?? 0)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              {t("modelSelector.downloading", {
                percentage: Math.round(progress ?? 0),
              })}
            </span>
            <div className="flex items-center gap-2">
              {speed !== undefined && speed > 0 && (
                <span className="tabular-nums">
                  {t("modelSelector.downloadSpeed", {
                    speed: speed.toFixed(1),
                  })}
                </span>
              )}
              <Button variant="danger-ghost" size="sm" onClick={onCancel}>
                {t("modelSelector.cancel")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
          <span className="text-xs text-text-muted inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            {formatModelSize(Number(model.size_mb))}
            {model.partial_size > 0 && !model.is_downloaded && (
              <span className="text-accent">{t("models.ai.resumable")}</span>
            )}
          </span>
          <div className="flex items-center gap-1.5">
            {model.is_downloaded ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDelete}
                  disabled={isBusy}
                  title={t("common.delete")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("common.delete")}
                </Button>
                <Button variant="primary-soft" size="sm" onClick={onTry}>
                  <Play className="w-3.5 h-3.5" />
                  {t("models.ai.try")}
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={onDownload}>
                <Download className="w-3.5 h-3.5" />
                {model.partial_size > 0
                  ? t("models.ai.resume")
                  : t("onboarding.download")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TryPanel: React.FC<{
  model: LocalLlmModelInfo;
  onClose: () => void;
}> = ({ model, onClose }) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const testModel = useLocalLlmStore((state) => state.testModel);
  const actions = settings?.post_process_actions ?? [];
  const [actionId, setActionId] = useState<string>(actions[0]?.id ?? "");
  const [text, setText] = useState(t("models.ai.trySample"));
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const prompt =
    actions.find((a) => a.id === actionId)?.prompt ??
    "Fix punctuation and capitalization. Keep the original language.\n\n${output}";

  const run = async () => {
    setRunning(true);
    setError(null);
    setOutput(null);
    const start = performance.now();
    try {
      const result = await testModel(model.id, prompt, text);
      setOutput(result);
      setElapsed((performance.now() - start) / 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="wsm-card px-4 py-4 space-y-3 border-accent/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            {t("models.ai.tryTitle", { model: model.name })}
          </h3>
          <p className="text-xs text-text-muted">{t("models.ai.tryHint")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-2"
          aria-label={t("common.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {actions.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            {t("models.ai.tryMode")}
          </span>
          <Dropdown
            selectedValue={actionId}
            options={actions.map((a) => ({ value: a.id, label: a.name }))}
            onSelect={setActionId}
            className="w-[220px]"
          />
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full block min-h-[80px]"
        variant="compact"
      />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="md"
          onClick={run}
          disabled={running || !text.trim()}
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {running ? t("models.ai.running") : t("models.ai.run")}
        </Button>
        {elapsed !== null && output !== null && (
          <span className="text-xs text-text-muted tabular-nums">
            {t("models.ai.elapsed", { seconds: elapsed.toFixed(1) })}
          </span>
        )}
      </div>
      {output !== null && (
        <div className="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm leading-relaxed select-text whitespace-pre-wrap">
          {output}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
    </div>
  );
};

const LocalModelsSection: React.FC = () => {
  const { t } = useTranslation();
  const models = useLocalLlmStore((state) => state.models);
  const status = useLocalLlmStore((state) => state.status);
  const downloadProgress = useLocalLlmStore((state) => state.downloadProgress);
  const downloadStats = useLocalLlmStore((state) => state.downloadStats);
  const downloadModel = useLocalLlmStore((state) => state.downloadModel);
  const cancelDownload = useLocalLlmStore((state) => state.cancelDownload);
  const deleteModel = useLocalLlmStore((state) => state.deleteModel);
  const unload = useLocalLlmStore((state) => state.unload);
  const [tryingId, setTryingId] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (model: LocalLlmModelInfo) => {
      const confirmed = await ask(
        t("models.ai.deleteConfirm", { model: model.name }),
        { title: t("settings.models.deleteTitle"), kind: "warning" },
      );
      if (confirmed) {
        if (tryingId === model.id) setTryingId(null);
        await deleteModel(model.id);
      }
    },
    [deleteModel, t, tryingId],
  );

  const trying = models.find((m) => m.id === tryingId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight">
            {t("models.ai.localTitle")}
          </h2>
          <p className="text-xs text-text-muted">
            {t("models.ai.localDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status && (
            <Badge variant="outline">
              <Cpu className="w-3 h-3" />
              {status.device}
            </Badge>
          )}
          {status?.loaded_model_id && (
            <Button variant="ghost" size="sm" onClick={unload}>
              {t("models.ai.unload")}
            </Button>
          )}
        </div>
      </div>

      {trying && <TryPanel model={trying} onClose={() => setTryingId(null)} />}

      <div className="space-y-2">
        {models.map((model) => (
          <LocalModelCard
            key={model.id}
            model={model}
            progress={downloadProgress[model.id]?.percentage}
            speed={downloadStats[model.id]?.speed}
            isLoaded={status?.loaded_model_id === model.id}
            isBusy={Boolean(status?.is_generating || status?.is_loading)}
            onDownload={() => downloadModel(model.id)}
            onCancel={() => cancelDownload(model.id)}
            onDelete={() => handleDelete(model)}
            onTry={() => setTryingId(model.id)}
          />
        ))}
      </div>
      <p className="text-xs text-text-muted px-1">
        {t("models.ai.privacyNote")}
      </p>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Cloud language models (API providers)                               */
/* ------------------------------------------------------------------ */

const CloudModelsSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    settings,
    refreshSettings,
    fetchPostProcessModels,
    updatePostProcessApiKey,
    postProcessModelOptions,
  } = useSettings();

  const providers = (settings?.post_process_providers || []).filter(
    (p) => p.id !== LOCAL_PROVIDER_ID,
  );
  const savedModels = (settings?.llm_models || []).filter(
    (m) => m.provider_id !== LOCAL_PROVIDER_ID,
  );
  const apiKeys = settings?.post_process_api_keys || {};

  const providerOptions = useMemo(
    () => providers.map((p) => ({ value: p.id, label: p.label })),
    [providers],
  );

  const [isAdding, setIsAdding] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [model, setModel] = useState("");
  const [label, setLabel] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAppleIntelligence = providerId === "apple_intelligence";
  const currentApiKey = apiKeys[providerId] || "";
  const fetchedModels = postProcessModelOptions[providerId] || [];
  const modelSelectOptions = useMemo(
    () => fetchedModels.map((m) => ({ value: m, label: m })),
    [fetchedModels],
  );

  const providerLabel = useCallback(
    (id: string) => providers.find((p) => p.id === id)?.label || id,
    [providers],
  );

  const resetForm = useCallback(() => {
    setIsAdding(false);
    setProviderId("");
    setApiKeyInput("");
    setModel("");
    setLabel("");
    setError(null);
  }, []);

  const startAdding = useCallback(() => {
    const first =
      providerOptions.find((p) => p.value !== "apple_intelligence")?.value ||
      providerOptions[0]?.value ||
      "";
    setProviderId(first);
    setApiKeyInput(apiKeys[first] || "");
    setModel("");
    setLabel("");
    setError(null);
    setIsAdding(true);
  }, [providerOptions, apiKeys]);

  const handleProviderChange = useCallback(
    (id: string) => {
      setProviderId(id);
      setApiKeyInput(apiKeys[id] || "");
      setModel("");
    },
    [apiKeys],
  );

  const handleApiKeyBlur = useCallback(async () => {
    if (!providerId || apiKeyInput === currentApiKey) return;
    await updatePostProcessApiKey(providerId, apiKeyInput.trim());
  }, [apiKeyInput, currentApiKey, providerId, updatePostProcessApiKey]);

  const handleFetchModels = useCallback(async () => {
    if (!providerId) return;
    if (apiKeyInput.trim() && apiKeyInput !== currentApiKey) {
      await updatePostProcessApiKey(providerId, apiKeyInput.trim());
    }
    setIsFetching(true);
    setError(null);
    try {
      await fetchPostProcessModels(providerId);
    } finally {
      setIsFetching(false);
    }
  }, [
    providerId,
    apiKeyInput,
    currentApiKey,
    fetchPostProcessModels,
    updatePostProcessApiKey,
  ]);

  const handleSave = useCallback(async () => {
    if (!providerId || !model.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      if (apiKeyInput.trim() && apiKeyInput !== currentApiKey) {
        await updatePostProcessApiKey(providerId, apiKeyInput.trim());
      }
      const result = await commands.addLlmModel(
        providerId,
        model.trim(),
        label.trim(),
      );
      if (result.status === "ok") {
        await refreshSettings();
        resetForm();
      } else {
        setError(String(result.error));
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    providerId,
    model,
    label,
    apiKeyInput,
    currentApiKey,
    updatePostProcessApiKey,
    refreshSettings,
    resetForm,
  ]);

  const handleDelete = useCallback(
    async (id: string) => {
      const result = await commands.deleteLlmModel(id);
      if (result.status === "ok") {
        await refreshSettings();
      }
    },
    [refreshSettings],
  );

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-[13px] font-semibold tracking-tight">
          {t("models.ai.cloudTitle")}
        </h2>
        <p className="text-xs text-text-muted">
          {t("models.ai.cloudDescription")}
        </p>
      </div>

      {savedModels.length > 0 && (
        <div className="wsm-card divide-y divide-border">
          {savedModels.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div className="min-w-0 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-2 text-text-muted flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.label}</p>
                  <p className="text-xs text-text-muted truncate">
                    {providerLabel(m.provider_id)} · {m.model}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                title={t("common.delete")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!isAdding ? (
        <Button onClick={startAdding} variant="secondary" size="md">
          <Plus className="w-4 h-4" />
          {t("settings.models.languageModels.addModel")}
        </Button>
      ) : (
        <div className="wsm-card space-y-3 px-4 py-4 border-accent/40">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {t("settings.models.languageModels.addModel")}
            </h3>
            <button
              onClick={resetForm}
              className="p-1 rounded-md text-text-muted hover:text-text"
              aria-label={t("common.close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted">
              {t("settings.models.languageModels.provider")}
            </label>
            <Dropdown
              selectedValue={providerId || null}
              options={providerOptions}
              onSelect={handleProviderChange}
              placeholder={t("settings.models.languageModels.provider")}
              className="w-full"
            />
          </div>

          {!isAppleIntelligence && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-text-muted">
                {t("settings.models.languageModels.apiKey")}
              </label>
              <Input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onBlur={handleApiKeyBlur}
                placeholder={t(
                  "settings.models.languageModels.apiKeyPlaceholder",
                )}
                variant="compact"
                className="w-full"
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted">
              {t("settings.models.languageModels.model")}
            </label>
            <div className="flex items-center gap-2">
              <Select
                className="flex-1"
                value={model || null}
                options={modelSelectOptions}
                isCreatable
                isLoading={isFetching}
                onChange={(value) => setModel(value ?? "")}
                onCreateOption={(value) => setModel(value)}
                placeholder={t(
                  "settings.models.languageModels.modelPlaceholder",
                )}
                formatCreateLabel={(input) =>
                  t("settings.models.languageModels.useModel", { model: input })
                }
              />
              {!isAppleIntelligence && (
                <button
                  onClick={handleFetchModels}
                  disabled={isFetching || !providerId}
                  className="flex items-center justify-center h-8 w-8 rounded-lg bg-surface-2 hover:bg-surface-3 transition-colors disabled:opacity-40 shrink-0"
                  title={t("settings.models.languageModels.fetchModels")}
                >
                  <RefreshCcw
                    className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-text-muted">
              {t("settings.models.languageModels.label")}
            </label>
            <Input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("settings.models.languageModels.labelPlaceholder")}
              variant="compact"
              className="w-full"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              variant="primary"
              size="md"
              disabled={!model.trim() || isSaving}
            >
              {t("common.save")}
            </Button>
            <Button onClick={resetForm} variant="secondary" size="md">
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Speech models                                                       */
/* ------------------------------------------------------------------ */

const modelSupportsLanguage = (model: ModelInfo, langCode: string): boolean =>
  model.supported_languages.includes(langCode);

const SpeechModelsSection: React.FC = () => {
  const { t } = useTranslation();
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState("all");
  const models = useModelStore((state) => state.models);
  const currentModel = useModelStore((state) => state.currentModel);
  const downloadingModels = useModelStore((state) => state.downloadingModels);
  const downloadProgress = useModelStore((state) => state.downloadProgress);
  const downloadStats = useModelStore((state) => state.downloadStats);
  const verifyingModels = useModelStore((state) => state.verifyingModels);
  const extractingModels = useModelStore((state) => state.extractingModels);
  const loading = useModelStore((state) => state.loading);
  const downloadModel = useModelStore((state) => state.downloadModel);
  const cancelDownload = useModelStore((state) => state.cancelDownload);
  const selectModel = useModelStore((state) => state.selectModel);
  const deleteModel = useModelStore((state) => state.deleteModel);

  const languageOptions = useMemo(
    () => [
      { value: "all", label: t("settings.models.filters.allLanguages") },
      ...LANGUAGES.filter((l) => l.value !== "auto").map((l) => ({
        value: l.value,
        label: l.label,
      })),
    ],
    [t],
  );

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    if (switchingModelId === modelId) return "switching";
    if (modelId === currentModel) return "active";
    const model = models.find((m: ModelInfo) => m.id === modelId);
    if (model?.is_downloaded) return "available";
    return "downloadable";
  };

  const handleModelSelect = async (modelId: string) => {
    setSwitchingModelId(modelId);
    try {
      await selectModel(modelId);
    } finally {
      setSwitchingModelId(null);
    }
  };

  const handleModelDelete = async (modelId: string) => {
    const model = models.find((m: ModelInfo) => m.id === modelId);
    const modelName = model?.name || modelId;
    const isActive = modelId === currentModel;
    const confirmed = await ask(
      isActive
        ? t("settings.models.deleteActiveConfirm", { modelName })
        : t("settings.models.deleteConfirm", { modelName }),
      { title: t("settings.models.deleteTitle"), kind: "warning" },
    );
    if (confirmed) {
      try {
        await deleteModel(modelId);
      } catch (err) {
        console.error(`Failed to delete model ${modelId}:`, err);
      }
    }
  };

  const filteredModels = useMemo(
    () =>
      models.filter(
        (model: ModelInfo) =>
          languageFilter === "all" ||
          modelSupportsLanguage(model, languageFilter),
      ),
    [models, languageFilter],
  );

  const { downloadedModels, availableModels } = useMemo(() => {
    const downloaded: ModelInfo[] = [];
    const available: ModelInfo[] = [];
    for (const model of filteredModels) {
      if (
        model.is_custom ||
        model.is_downloaded ||
        model.id in downloadingModels ||
        model.id in extractingModels
      ) {
        downloaded.push(model);
      } else {
        available.push(model);
      }
    }
    downloaded.sort((a, b) => {
      if (a.id === currentModel) return -1;
      if (b.id === currentModel) return 1;
      if (a.is_custom !== b.is_custom) return a.is_custom ? 1 : -1;
      return 0;
    });
    return { downloadedModels: downloaded, availableModels: available };
  }, [filteredModels, downloadingModels, extractingModels, currentModel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  const renderCard = (model: ModelInfo) => (
    <ModelCard
      key={model.id}
      model={model}
      status={getModelStatus(model.id)}
      onSelect={handleModelSelect}
      onDownload={(id) => downloadModel(id)}
      onDelete={handleModelDelete}
      onCancel={(id) => cancelDownload(id)}
      downloadProgress={downloadProgress[model.id]?.percentage}
      downloadSpeed={downloadStats[model.id]?.speed}
      showRecommended={true}
    />
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold tracking-tight">
            {t("settings.models.yourModels")}
          </h2>
          <Dropdown
            options={languageOptions}
            selectedValue={languageFilter}
            onSelect={setLanguageFilter}
            className="w-[200px]"
            align="end"
          />
        </div>
        {downloadedModels.length === 0 ? (
          <p className="text-sm text-text-muted px-1">
            {t("models.speech.noneDownloaded")}
          </p>
        ) : (
          <div className="space-y-2">{downloadedModels.map(renderCard)}</div>
        )}
      </div>

      {availableModels.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[13px] font-semibold tracking-tight px-1">
            {t("settings.models.availableModels")}
          </h2>
          <div className="space-y-2">{availableModels.map(renderCard)}</div>
        </div>
      )}

      {filteredModels.length === 0 && (
        <p className="text-center py-8 text-text-muted text-sm">
          {t("settings.models.noModelsMatch")}
        </p>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type ModelsTab = "speech" | "ai";

export const ModelsPage: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ModelsTab>("speech");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("models.title")}
        description={
          tab === "speech"
            ? t("models.speech.description")
            : t("models.ai.description")
        }
        actions={
          <SegmentedControl<ModelsTab>
            value={tab}
            onChange={setTab}
            options={[
              {
                value: "speech",
                label: t("models.tabs.speech"),
                icon: <Mic className="w-3.5 h-3.5" />,
              },
              {
                value: "ai",
                label: t("models.tabs.ai"),
                icon: <Sparkles className="w-3.5 h-3.5" />,
              },
            ]}
          />
        }
      />
      {tab === "speech" ? (
        <SpeechModelsSection />
      ) : (
        <div className="flex flex-col gap-8">
          <LocalModelsSection />
          <CloudModelsSection />
        </div>
      )}
    </div>
  );
};
