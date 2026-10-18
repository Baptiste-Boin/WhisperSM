import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { commands, type LLMModel } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import {
  CLOUD_LLM_CATALOG,
  OLDER_SPEECH_MODEL_IDS,
  localLlmVendor,
  providerVendor,
} from "@/lib/constants/modelCatalog";
import {
  getTranslatedModelDescription,
  getTranslatedModelName,
} from "@/lib/utils/modelTranslation";

export const LOCAL_PROVIDER_ID = "local";
/** Providers usable without an API key. */
const KEYLESS_PROVIDERS = new Set(["custom", "apple_intelligence", "local"]);

/** Voice models listed under "Popular" in the picker. */
const POPULAR_VOICE_IDS = new Set([
  "parakeet-tdt-0.6b-v3",
  "parakeet-tdt-0.6b-v2",
  "cohere-transcribe",
  "turbo",
  "large",
  "deepgram-nova-3",
  "elevenlabs-scribe",
]);

export type PickerStatus = "ready" | "available" | "downloading" | "needsKey";

export interface PickerItem {
  /** Same key as the models library rows (favourites are shared). */
  key: string;
  source: "voice" | "local-llm" | "cloud-llm" | "custom-llm";
  /** Voice model id, local model id, catalog id or saved model id. */
  id: string;
  name: string;
  vendor: string;
  badge: "new" | "en" | null;
  description: string;
  speed: number | null;
  accuracy: number | null;
  isCloud: boolean;
  status: PickerStatus;
  progress?: number;
  popular: boolean;
  legacy: boolean;
  providerId?: string;
  /** Identifier sent to the provider (language models). */
  model?: string;
  /** Saved language model (`llm_models`) backing this item. */
  llmModelId?: string;
}

const normalizeBadge = (badge: string | null | undefined) =>
  badge === "new" || badge === "en" ? badge : null;

/** Every voice model, as listed in the mode editor's Voice Model picker. */
export const useVoicePickerItems = (): PickerItem[] => {
  const { t } = useTranslation();
  const models = useModelStore((s) => s.models);
  const progress = useModelStore((s) => s.downloadProgress);
  const downloading = useModelStore((s) => s.downloadingModels);

  return useMemo(
    () =>
      models.map((m) => {
        const isCloud = Boolean(m.is_cloud);
        const status: PickerStatus = isCloud
          ? m.is_downloaded
            ? "ready"
            : "needsKey"
          : m.id in downloading || m.is_downloading
            ? "downloading"
            : m.is_downloaded
              ? "ready"
              : "available";
        const hasScores = m.speed_score > 0 || m.accuracy_score > 0;
        return {
          key: `voice:${m.id}`,
          source: "voice" as const,
          id: m.id,
          name: getTranslatedModelName(m, t),
          vendor: m.vendor || (m.is_custom ? "custom" : "whispersm"),
          badge: normalizeBadge(m.badge),
          description: getTranslatedModelDescription(m, t),
          speed: hasScores ? m.speed_score : null,
          accuracy: hasScores ? m.accuracy_score : null,
          isCloud,
          status,
          progress: progress[m.id]?.percentage,
          popular: POPULAR_VOICE_IDS.has(m.id),
          legacy: OLDER_SPEECH_MODEL_IDS.has(m.id),
          providerId: m.provider_id ?? undefined,
        };
      }),
    [models, progress, downloading, t],
  );
};

/** On-device, catalogue and saved custom language models. */
export const useLanguagePickerItems = (): PickerItem[] => {
  const { settings } = useSettings();
  const localLlms = useLocalLlmStore((s) => s.models);
  const llmProgress = useLocalLlmStore((s) => s.downloadProgress);

  return useMemo(() => {
    const apiKeys = settings?.post_process_api_keys ?? {};
    const entries = settings?.llm_models ?? [];
    const hasKey = (id: string) =>
      KEYLESS_PROVIDERS.has(id) || Boolean((apiKeys[id] ?? "").trim());
    const findEntry = (providerId: string, model: string) =>
      entries.find((e) => e.provider_id === providerId && e.model === model);

    const items: PickerItem[] = [];

    for (const m of localLlms) {
      const downloadingNow =
        llmProgress[m.id] !== undefined || m.is_downloading;
      items.push({
        key: `llm-local:${m.id}`,
        source: "local-llm",
        id: m.id,
        name: m.name,
        vendor: localLlmVendor(m.family),
        badge: m.multilingual ? null : "en",
        description: m.description,
        speed: m.speed_score,
        accuracy: m.quality_score,
        isCloud: false,
        status: downloadingNow
          ? "downloading"
          : m.is_downloaded
            ? "ready"
            : "available",
        progress: llmProgress[m.id]?.percentage,
        popular: m.is_recommended,
        legacy: false,
        providerId: LOCAL_PROVIDER_ID,
        model: m.id,
        llmModelId: findEntry(LOCAL_PROVIDER_ID, m.id)?.id,
      });
    }

    for (const c of CLOUD_LLM_CATALOG) {
      items.push({
        key: `llm-cloud:${c.id}`,
        source: "cloud-llm",
        id: c.id,
        name: c.name,
        vendor: c.vendor,
        badge: c.badge ?? null,
        description: c.description,
        speed: c.speed,
        accuracy: c.accuracy,
        isCloud: true,
        status: hasKey(c.providerId) ? "ready" : "needsKey",
        popular: Boolean(c.popular),
        legacy: Boolean(c.legacy),
        providerId: c.providerId,
        model: c.model,
        llmModelId: findEntry(c.providerId, c.model)?.id,
      });
    }

    for (const e of entries) {
      if (e.provider_id === LOCAL_PROVIDER_ID) continue;
      const inCatalog = CLOUD_LLM_CATALOG.some(
        (c) => c.providerId === e.provider_id && c.model === e.model,
      );
      if (inCatalog) continue;
      items.push({
        key: `llm-custom:${e.id}`,
        source: "custom-llm",
        id: e.id,
        name: e.label || e.model,
        vendor:
          e.provider_id === "custom" ? "custom" : providerVendor(e.provider_id),
        badge: null,
        description: e.model,
        speed: null,
        accuracy: null,
        isCloud: !KEYLESS_PROVIDERS.has(e.provider_id),
        status: hasKey(e.provider_id) ? "ready" : "needsKey",
        popular: false,
        legacy: false,
        providerId: e.provider_id,
        model: e.model,
        llmModelId: e.id,
      });
    }

    return items;
  }, [
    settings?.post_process_api_keys,
    settings?.llm_models,
    localLlms,
    llmProgress,
  ]);
};

/** Picker key of the saved language model a mode uses. */
export const languageKeyForModel = (
  entry: LLMModel | undefined,
): string | null => {
  if (!entry) return null;
  if (entry.provider_id === LOCAL_PROVIDER_ID)
    return `llm-local:${entry.model}`;
  const catalog = CLOUD_LLM_CATALOG.find(
    (c) => c.providerId === entry.provider_id && c.model === entry.model,
  );
  return catalog ? `llm-cloud:${catalog.id}` : `llm-custom:${entry.id}`;
};

/**
 * Make sure a language model picked in the editor is saved in `llm_models`
 * (modes reference saved models) and return its id.
 */
export const ensureSavedLanguageModel = async (
  item: PickerItem,
): Promise<string | null> => {
  if (item.llmModelId) return item.llmModelId;
  if (!item.providerId || !item.model) return null;
  const result = await commands.addLlmModel(
    item.providerId,
    item.model,
    item.name,
  );
  return result.status === "ok" ? result.data.id : null;
};
