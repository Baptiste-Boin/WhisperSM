import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { Button, Dialog, Input } from "@/components/ui";
import { useSettings } from "@/hooks/useSettings";

const CUSTOM_PROVIDER_ID = "custom";

/** Adds a model served by any OpenAI-compatible endpoint (Ollama, LM Studio…). */
export const CustomModelDialog: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { settings, refreshSettings, updatePostProcessBaseUrl } = useSettings();
  const savedBaseUrl =
    settings?.post_process_providers?.find((p) => p.id === CUSTOM_PROVIDER_ID)
      ?.base_url ?? "";
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBaseUrl(savedBaseUrl);
    setModel("");
    setLabel("");
    setError(null);
  }, [open]); // Reset only when the dialog opens.

  const canSave = baseUrl.trim() !== "" && model.trim() !== "" && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const url = baseUrl.trim();
      if (url !== savedBaseUrl) {
        await updatePostProcessBaseUrl(CUSTOM_PROVIDER_ID, url);
      }
      const modelId = model.trim();
      const name = label.trim() || modelId;
      const result = await commands.addLlmModel(
        CUSTOM_PROVIDER_ID,
        modelId,
        name,
      );
      if (result.status === "error") {
        setError(String(result.error));
        return;
      }
      await refreshSettings();
      toast.success(t("library.toasts.enabled", { model: name }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("library.custom.title")}
      description={t("library.custom.description")}
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {t("library.custom.save")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-text-muted">
            {t("library.custom.baseUrl")}
          </span>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="w-full font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-text-muted">
            {t("library.custom.model")}
          </span>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoFocus
            className="w-full font-mono"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-text-muted">
            {t("library.custom.label")}
          </span>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoComplete="off"
            className="w-full"
          />
        </label>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <button type="submit" className="hidden" aria-hidden="true" />
      </form>
    </Dialog>
  );
};

export default CustomModelDialog;
