import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import i18n from "@/i18n";
import {
  commands,
  type LocalLlmModelInfo,
  type LocalLlmStatus,
} from "@/bindings";

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
  percentage: number;
}

interface DownloadStats {
  startTime: number;
  lastUpdate: number;
  lastBytes: number;
  speed: number; // MB/s
}

interface StateEvent {
  event_type: string;
  model_id: string | null;
  model_name: string | null;
  error: string | null;
}

interface LocalLlmStore {
  models: LocalLlmModelInfo[];
  status: LocalLlmStatus | null;
  downloadProgress: Record<string, DownloadProgress>;
  downloadStats: Record<string, DownloadStats>;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  loadModels: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  downloadModel: (modelId: string) => Promise<boolean>;
  cancelDownload: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<boolean>;
  unload: () => Promise<void>;
  testModel: (modelId: string, prompt: string, text: string) => Promise<string>;
}

let initializeStarted = false;

export const useLocalLlmStore = create<LocalLlmStore>()(
  subscribeWithSelector((set, get) => ({
    models: [],
    status: null,
    downloadProgress: {},
    downloadStats: {},
    loading: true,
    initialized: false,

    loadModels: async () => {
      try {
        const result = await commands.getLocalLlmModels();
        if (result.status === "ok") {
          set({ models: result.data, loading: false });
        } else {
          console.error("Failed to load local models:", result.error);
          set({ loading: false });
        }
      } catch (error) {
        console.error("Failed to load local models:", error);
        set({ loading: false });
      }
    },

    refreshStatus: async () => {
      try {
        const result = await commands.getLocalLlmStatus();
        if (result.status === "ok") {
          set({ status: result.data });
        }
      } catch (error) {
        console.error("Failed to load local LLM status:", error);
      }
    },

    initialize: async () => {
      if (initializeStarted) return;
      initializeStarted = true;

      await Promise.all([get().loadModels(), get().refreshStatus()]);

      listen<DownloadProgress>("local-llm-download-progress", (event) => {
        const progress = event.payload;
        set((state) => {
          const now = Date.now();
          const prev = state.downloadStats[progress.model_id];
          let speed = prev?.speed ?? 0;
          if (prev && now - prev.lastUpdate >= 500) {
            const bytes = progress.downloaded - prev.lastBytes;
            const seconds = (now - prev.lastUpdate) / 1000;
            speed = bytes / seconds / (1024 * 1024);
          }
          const stats: DownloadStats = prev
            ? {
                ...prev,
                speed,
                ...(now - prev.lastUpdate >= 500
                  ? { lastUpdate: now, lastBytes: progress.downloaded }
                  : {}),
              }
            : {
                startTime: now,
                lastUpdate: now,
                lastBytes: progress.downloaded,
                speed: 0,
              };
          return {
            downloadProgress: {
              ...state.downloadProgress,
              [progress.model_id]: progress,
            },
            downloadStats: {
              ...state.downloadStats,
              [progress.model_id]: stats,
            },
            models: state.models.map((m) =>
              m.id === progress.model_id ? { ...m, is_downloading: true } : m,
            ),
          };
        });
      });

      listen<string>("local-llm-download-complete", async (event) => {
        const modelId = event.payload;
        set((state) => {
          const { [modelId]: _p, ...downloadProgress } = state.downloadProgress;
          const { [modelId]: _s, ...downloadStats } = state.downloadStats;
          return { downloadProgress, downloadStats };
        });
        await get().loadModels();
        const model = get().models.find((m) => m.id === modelId);
        toast.success(
          i18n.t("models.ai.downloadComplete", {
            model: model?.name ?? modelId,
          }),
        );
      });

      listen<{ model_id: string; error: string }>(
        "local-llm-download-failed",
        async (event) => {
          const { model_id, error } = event.payload;
          set((state) => {
            const { [model_id]: _p, ...downloadProgress } =
              state.downloadProgress;
            const { [model_id]: _s, ...downloadStats } = state.downloadStats;
            return { downloadProgress, downloadStats };
          });
          await get().loadModels();
          toast.error(i18n.t("models.ai.downloadFailed"), {
            description: error,
          });
        },
      );

      listen<StateEvent>("local-llm-state-changed", (event) => {
        const { event_type, error, model_name } = event.payload;
        if (event_type === "loading_failed") {
          toast.error(
            i18n.t("models.ai.loadFailed", { model: model_name ?? "" }),
            { description: error ?? undefined },
          );
        }
        get().refreshStatus();
      });

      set({ initialized: true });
    },

    downloadModel: async (modelId) => {
      set((state) => ({
        models: state.models.map((m) =>
          m.id === modelId ? { ...m, is_downloading: true } : m,
        ),
        downloadProgress: {
          ...state.downloadProgress,
          [modelId]: {
            model_id: modelId,
            downloaded: 0,
            total: 0,
            percentage: 0,
          },
        },
      }));
      try {
        const result = await commands.downloadLocalLlmModel(modelId);
        if (result.status !== "ok") {
          console.error("Local model download failed:", result.error);
          return false;
        }
        return true;
      } catch (error) {
        console.error("Local model download failed:", error);
        return false;
      } finally {
        set((state) => {
          const { [modelId]: _p, ...downloadProgress } = state.downloadProgress;
          return { downloadProgress };
        });
        await get().loadModels();
      }
    },

    cancelDownload: async (modelId) => {
      try {
        await commands.cancelLocalLlmDownload(modelId);
      } catch (error) {
        console.error("Failed to cancel local model download:", error);
      }
    },

    deleteModel: async (modelId) => {
      try {
        const result = await commands.deleteLocalLlmModel(modelId);
        if (result.status !== "ok") {
          toast.error(String(result.error));
          return false;
        }
        await Promise.all([get().loadModels(), get().refreshStatus()]);
        return true;
      } catch (error) {
        console.error("Failed to delete local model:", error);
        return false;
      }
    },

    unload: async () => {
      try {
        await commands.unloadLocalLlm();
        await get().refreshStatus();
      } catch (error) {
        console.error("Failed to unload local model:", error);
      }
    },

    testModel: async (modelId, prompt, text) => {
      const result = await commands.testLocalLlm(modelId, prompt, text);
      if (result.status !== "ok") {
        throw new Error(String(result.error));
      }
      return result.data;
    },
  })),
);
