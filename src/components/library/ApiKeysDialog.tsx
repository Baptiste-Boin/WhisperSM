import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { Button, Dialog, Input } from "@/components/ui";
import { VendorLogo } from "@/components/ui/VendorLogo";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";
import { providerVendor } from "@/lib/constants/modelCatalog";

/** Providers that never take an API key in this dialog. */
const EXCLUDED_PROVIDERS = new Set(["local", "apple_intelligence", "custom"]);

interface ApiKeysDialogProps {
  open: boolean;
  onClose: () => void;
  /** Provider to scroll to and highlight when the dialog opens. */
  focusProvider?: string | null;
}

export const ApiKeysDialog: React.FC<ApiKeysDialogProps> = ({
  open,
  onClose,
  focusProvider = null,
}) => {
  const { t } = useTranslation();
  const { settings, updatePostProcessApiKey } = useSettings();
  const savedKeys = settings?.post_process_api_keys;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const providers = useMemo(() => {
    const list = (settings?.post_process_providers ?? []).filter(
      (p) => !EXCLUDED_PROVIDERS.has(p.id),
    );
    // Providers with a free tier first, original order otherwise.
    return list
      .map((p, index) => ({ p, index }))
      .sort(
        (a, b) =>
          Number(Boolean(b.p.free_tier)) - Number(Boolean(a.p.free_tier)) ||
          a.index - b.index,
      )
      .map(({ p }) => p);
  }, [settings?.post_process_providers]);

  // Reset drafts from the saved keys every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const [id, value] of Object.entries(savedKeys ?? {})) {
      next[id] = value ?? "";
    }
    setDrafts(next);
    // Only when the dialog opens: typing must not be reset by a settings refresh.
  }, [open]);

  // Bring the requested provider into view and focus its field.
  useEffect(() => {
    if (!open || !focusProvider) return;
    const timer = window.setTimeout(() => {
      const row = rowRefs.current[focusProvider];
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
      row?.querySelector("input")?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, focusProvider]);

  const save = async (providerId: string) => {
    const value = (drafts[providerId] ?? "").trim();
    const previous = (savedKeys?.[providerId] ?? "").trim();
    if (value === previous) return;
    setSaving(providerId);
    try {
      await updatePostProcessApiKey(providerId, value);
      toast.success(
        value ? t("library.keys.saved") : t("library.keys.removed"),
      );
      await useModelStore.getState().loadModels();
    } catch (error) {
      console.error("Failed to save API key:", error);
      toast.error(t("library.toasts.error"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("library.keys.title")}
      description={t("library.keys.description")}
      maxWidthClassName="max-w-xl"
    >
      <div className="flex flex-col gap-1">
        {providers.map((provider) => {
          const highlighted = provider.id === focusProvider;
          const hasKey = Boolean((savedKeys?.[provider.id] ?? "").trim());
          return (
            <div
              key={provider.id}
              ref={(el) => {
                rowRefs.current[provider.id] = el;
              }}
              className={`flex flex-col gap-2 rounded-xl px-3 py-3 transition-colors ${
                highlighted
                  ? "bg-accent-soft ring-1 ring-accent/40"
                  : "hover:bg-surface-2/60"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <VendorLogo vendor={providerVendor(provider.id)} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-medium text-text">
                      {provider.label}
                    </span>
                    {provider.supports_speech && (
                      <span className="text-[11px] leading-none px-1.5 py-[3px] rounded-md bg-surface-3/70 text-text-muted">
                        {t("library.keys.capabilities.voice")}
                      </span>
                    )}
                    {provider.supports_language && (
                      <span className="text-[11px] leading-none px-1.5 py-[3px] rounded-md bg-surface-3/70 text-text-muted">
                        {t("library.keys.capabilities.language")}
                      </span>
                    )}
                    {hasKey && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-success"
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  {provider.free_tier && (
                    <p className="text-[12px] text-text-muted mt-0.5">
                      {provider.free_tier}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={drafts[provider.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [provider.id]: event.target.value,
                    }))
                  }
                  onBlur={() => void save(provider.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  disabled={saving === provider.id}
                  placeholder={t("library.keys.placeholder")}
                  variant="compact"
                  className="flex-1 min-w-0"
                />
                {provider.api_key_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      if (provider.api_key_url) {
                        void openUrl(provider.api_key_url);
                      }
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t("library.keys.getKey")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
};

export default ApiKeysDialog;
