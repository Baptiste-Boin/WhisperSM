import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cpu, Globe, Plus, Sparkles, Trash2 } from "lucide-react";
import { commands, type PostProcessAction } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { navigateTo } from "@/lib/navigation";
import {
  ACTION_ICON_NAMES,
  DEFAULT_ACTION_ICON,
  getActionIcon,
} from "@/lib/constants/actionIcons";
import {
  Badge,
  Button,
  Dialog,
  Dropdown,
  Input,
  Kbd,
  KeyCombo,
  PageHeader,
  SettingsGroup,
  Textarea,
  ToggleSwitch,
} from "@/components/ui";
import { ShortcutInput } from "@/components/settings/ShortcutInput";

const LOCAL_PROVIDER_ID = "local";

const IconPicker: React.FC<{
  value: string;
  onChange: (icon: string) => void;
}> = ({ value, onChange }) => (
  <div className="grid grid-cols-10 gap-1.5">
    {ACTION_ICON_NAMES.map((name) => {
      const Icon = getActionIcon(name);
      const isActive = name === value;
      return (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          className={`flex items-center justify-center aspect-square rounded-lg border transition-colors ${
            isActive
              ? "border-accent bg-accent-soft text-accent"
              : "border-border hover:border-accent/50 hover:bg-surface-2 text-text-muted"
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      );
    })}
  </div>
);

interface ModeDialogProps {
  open: boolean;
  action: PostProcessAction | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}

const ModeDialog: React.FC<ModeDialogProps> = ({
  open,
  action,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();

  const savedModels = settings?.llm_models || [];
  const providers = settings?.post_process_providers || [];
  const actions = settings?.post_process_actions || [];

  const [name, setName] = useState(action?.name ?? "");
  const [prompt, setPrompt] = useState(action?.prompt ?? "");
  const [icon, setIcon] = useState(action?.icon ?? DEFAULT_ACTION_ICON);
  const [llmModelId, setLlmModelId] = useState<string | null>(
    action?.llm_model_id ?? savedModels[0]?.id ?? null,
  );
  const [triggerKey, setTriggerKey] = useState<number | null>(
    action?.trigger_key ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const providerLabel = useCallback(
    (id: string) => providers.find((p) => p.id === id)?.label ?? id,
    [providers],
  );

  const modelOptions = useMemo(
    () =>
      savedModels.map((m) => ({
        value: m.id,
        label: m.label,
        hint:
          m.provider_id === LOCAL_PROVIDER_ID
            ? t("modes.dialog.onDevice")
            : providerLabel(m.provider_id),
      })),
    [savedModels, providerLabel, t],
  );

  const triggerKeyOptions = useMemo(() => {
    const usedKeys = new Set(
      actions
        .filter((a) => a.id !== action?.id)
        .map((a) => a.trigger_key)
        .filter((k): k is number => k != null),
    );
    const options: { value: string; label: string; disabled?: boolean }[] = [
      { value: "none", label: t("settings.postProcessing.actions.noKey") },
    ];
    for (let k = 1; k <= 9; k++) {
      options.push({
        value: String(k),
        label: usedKeys.has(k)
          ? t("settings.postProcessing.actions.keyTaken", { key: k })
          : String(k),
        disabled: usedKeys.has(k),
      });
    }
    return options;
  }, [actions, action?.id, t]);

  const canSave = name.trim().length > 0 && prompt.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = action
        ? await commands.updatePostProcessAction(
            action.id,
            name.trim(),
            prompt.trim(),
            llmModelId,
            icon,
            triggerKey,
          )
        : await commands.addPostProcessAction(
            name.trim(),
            prompt.trim(),
            llmModelId,
            icon,
            triggerKey,
          );
      if (result.status === "ok") {
        await refreshSettings();
        onSaved(action ? action.id : (result.data?.id ?? ""));
      } else {
        setError(String(result.error));
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    action,
    canSave,
    name,
    prompt,
    llmModelId,
    icon,
    triggerKey,
    refreshSettings,
    onSaved,
  ]);

  const handleDelete = useCallback(async () => {
    if (!action) return;
    const result = await commands.deletePostProcessAction(action.id);
    if (result.status === "ok") {
      await refreshSettings();
      onClose();
    }
  }, [action, refreshSettings, onClose]);

  const footer = (
    <>
      {action && (
        <Button
          variant="danger-ghost"
          size="md"
          onClick={handleDelete}
          className="me-auto"
        >
          <Trash2 className="w-4 h-4" />
          {t("common.delete")}
        </Button>
      )}
      <Button variant="secondary" size="md" onClick={onClose}>
        {t("common.cancel")}
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleSave}
        disabled={!canSave || isSaving}
      >
        {action ? t("common.save") : t("common.create")}
      </Button>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={action ? t("modes.dialog.editTitle") : t("modes.dialog.newTitle")}
      description={t("modes.dialog.subtitle")}
      footer={footer}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("settings.postProcessing.actions.name")}
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.postProcessing.actions.namePlaceholder")}
              variant="compact"
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("settings.postProcessing.actions.triggerKey")}
            </label>
            <Dropdown
              selectedValue={triggerKey != null ? String(triggerKey) : "none"}
              options={triggerKeyOptions}
              onSelect={(value) =>
                setTriggerKey(value === "none" ? null : Number(value))
              }
              placeholder={t("settings.postProcessing.actions.noKey")}
              className="w-[200px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t("settings.postProcessing.actions.icon")}
          </label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("settings.postProcessing.actions.prompt")}
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("settings.postProcessing.actions.promptPlaceholder")}
            className="w-full block min-h-[140px] font-normal"
          />
          <p className="text-xs text-text-muted">
            {t("settings.postProcessing.actions.promptHint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("settings.postProcessing.actions.model")}
          </label>
          {modelOptions.length > 0 ? (
            <Dropdown
              selectedValue={llmModelId}
              options={modelOptions}
              onSelect={(value) => setLlmModelId(value)}
              placeholder={t(
                "settings.postProcessing.actions.modelPlaceholder",
              )}
              className="w-full"
            />
          ) : (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 flex items-center justify-between gap-3">
              <p className="text-xs text-warning">
                {t("modes.dialog.noModels")}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  navigateTo("models");
                }}
              >
                {t("modes.dialog.addModel")}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">
            {t("settings.postProcessing.actions.shortcut")}
          </label>
          {action ? (
            <ShortcutInput shortcutId={`ppa_${action.id}`} bare />
          ) : (
            <p className="text-xs text-text-muted pt-1">
              {t("settings.postProcessing.actions.shortcutAfterSave")}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
            <p className="text-xs text-danger">{error}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
};

interface ModeCardProps {
  action: PostProcessAction;
  isDefault: boolean;
  modelLabel?: string;
  isLocal: boolean;
  shortcut?: string;
  onClick: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({
  action,
  isDefault,
  modelLabel,
  isLocal,
  shortcut,
  onClick,
}) => {
  const { t } = useTranslation();
  const Icon = getActionIcon(action.icon);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group wsm-card w-full flex items-center gap-3.5 px-4 py-3 hover:border-accent/50 transition-colors text-start"
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-xl wsm-gradient text-white shrink-0 shadow-sm">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate">{action.name}</p>
          {isDefault && (
            <Badge variant="primary">{t("modes.card.default")}</Badge>
          )}
        </div>
        <p className="text-xs text-text-muted truncate mt-0.5 flex items-center gap-1.5">
          {modelLabel ? (
            <>
              {isLocal ? (
                <Cpu className="w-3 h-3 text-success" />
              ) : (
                <Globe className="w-3 h-3" />
              )}
              <span className="truncate">{modelLabel}</span>
            </>
          ) : (
            <span className="text-warning">{t("modes.card.noModel")}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {action.trigger_key != null && <Kbd>{action.trigger_key}</Kbd>}
        {shortcut && <KeyCombo combination={shortcut} />}
      </div>
    </button>
  );
};

export const ModesPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting, isUpdating } = useSettings();
  const osType = useOsType();

  const actions = settings?.post_process_actions || [];
  const models = settings?.llm_models || [];
  const bindings = settings?.bindings || {};
  const defaultShortcutEnabled = settings?.post_process_enabled ?? false;

  const [editingId, setEditingId] = useState<string | null>(null);

  const editingAction =
    editingId && editingId !== "new"
      ? (actions.find((a) => a.id === editingId) ?? null)
      : null;
  const dialogOpen = editingId !== null;

  const modelFor = (id: string | null | undefined) =>
    models.find((m) => m.id === id);

  const actionShortcut = (id: string) => {
    const raw = bindings[`ppa_${id}`]?.current_binding;
    return raw && raw.trim() ? formatKeyCombination(raw, osType) : undefined;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("modes.title")}
        description={t("modes.description")}
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={() => setEditingId("new")}
          >
            <Plus className="w-4 h-4" />
            {t("modes.newMode")}
          </Button>
        }
      />

      {actions.length === 0 ? (
        <div className="wsm-card flex flex-col items-center justify-center text-center py-14 px-6 border-dashed">
          <div className="w-12 h-12 rounded-2xl wsm-gradient text-white flex items-center justify-center mb-3 shadow">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium">{t("modes.emptyTitle")}</p>
          <p className="text-xs text-text-muted mt-1 max-w-xs">
            {t("modes.empty")}
          </p>
          <Button
            variant="primary"
            size="md"
            onClick={() => setEditingId("new")}
            className="mt-4"
          >
            <Plus className="w-4 h-4" />
            {t("modes.newMode")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {actions.map((action, index) => {
            const model = modelFor(action.llm_model_id);
            return (
              <ModeCard
                key={action.id}
                action={action}
                isDefault={index === 0}
                modelLabel={model?.label}
                isLocal={model?.provider_id === LOCAL_PROVIDER_ID}
                shortcut={actionShortcut(action.id)}
                onClick={() => setEditingId(action.id)}
              />
            );
          })}
          <p className="text-xs text-text-muted px-1 pt-1">{t("modes.hint")}</p>
        </div>
      )}

      <SettingsGroup
        title={t("modes.aiShortcut.title")}
        description={t("modes.aiShortcut.description")}
      >
        <ToggleSwitch
          checked={defaultShortcutEnabled}
          onChange={(checked) => updateSetting("post_process_enabled", checked)}
          isUpdating={isUpdating("post_process_enabled")}
          label={t("settings.postProcessing.defaultShortcut.toggleLabel")}
          description={t(
            "settings.postProcessing.defaultShortcut.toggleDescription",
          )}
          grouped={true}
        />
        {defaultShortcutEnabled && (
          <ShortcutInput
            shortcutId="transcribe_with_post_process"
            grouped={true}
          />
        )}
      </SettingsGroup>

      {dialogOpen && (
        <ModeDialog
          key={editingId ?? "new"}
          open={dialogOpen}
          action={editingAction}
          onClose={() => setEditingId(null)}
          onSaved={(id) => setEditingId(id)}
        />
      )}
    </div>
  );
};
