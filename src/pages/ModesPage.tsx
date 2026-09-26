import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import { Info, Mic, Plus, Sparkles, Trash2 } from "lucide-react";
import { commands, type LLMModel, type PostProcessAction } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";
import { consumePendingPageAction, navigateTo } from "@/lib/navigation";
import {
  ACTION_ICON_NAMES,
  DEFAULT_ACTION_ICON,
  getActionIcon,
} from "@/lib/constants/actionIcons";
import {
  localLlmVendor,
  providerVendor,
  type VendorId,
} from "@/lib/constants/modelCatalog";
import {
  Button,
  Dialog,
  Dropdown,
  Input,
  KeyCombo,
  SegmentedControl,
  Switch,
  Textarea,
  Tooltip,
} from "@/components/ui";
import { VendorLogo } from "@/components/ui/VendorLogo";
import { ShortcutInput } from "@/components/settings/ShortcutInput";

/** Built-in "Voice to text" mode: always voice-only, cannot be deleted. */
const BUILT_IN_MODE_ID = "act_voice_to_text";
const LOCAL_PROVIDER_ID = "local";
const VOICE_ICON = "mic";
const NEW_MODE_ID = "new";
const CREATE_MODE_ACTION = "create-mode";
const SEPARATOR = " · ";

type ModeType = "voice" | "ai";

interface ModelTile {
  vendor: VendorId | string;
  label: string;
}

const isVoiceOnly = (action: PostProcessAction) => action.prompt.trim() === "";

/** Icon shown for a mode: its own icon, else Mic (voice) or Sparkles (AI). */
const modeIconName = (action: PostProcessAction) =>
  action.icon || (isVoiceOnly(action) ? VOICE_ICON : DEFAULT_ACTION_ICON);

/* ------------------------------------------------------------------------ */
/* Header info tip                                                          */
/* ------------------------------------------------------------------------ */

const InfoTip: React.FC<{ text: string }> = ({ text }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-text-muted hover:text-text transition-colors cursor-help"
      >
        <Info className="w-4 h-4" />
      </button>
      {open && (
        <Tooltip targetRef={ref} position="bottom">
          <p className="text-xs leading-relaxed text-text">{text}</p>
        </Tooltip>
      )}
    </>
  );
};

/* ------------------------------------------------------------------------ */
/* Mode row                                                                 */
/* ------------------------------------------------------------------------ */

interface ModeRowProps {
  action: PostProcessAction;
  isActive: boolean;
  tiles: ModelTile[];
  llmLabel: string | null;
  onClick: () => void;
}

const ModeRow: React.FC<ModeRowProps> = ({
  action,
  isActive,
  tiles,
  llmLabel,
  onClick,
}) => {
  const { t } = useTranslation();
  const voiceOnly = isVoiceOnly(action);
  const Icon = getActionIcon(modeIconName(action));

  return (
    <button
      type="button"
      onClick={onClick}
      className="wsm-card w-full h-[68px] px-5 mb-3 flex items-center gap-4 text-start hover:border-accent/40 transition-colors cursor-pointer"
    >
      <Icon className="w-[18px] h-[18px] shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[17px] font-medium leading-tight truncate">
            {action.name}
          </span>
          {isActive && (
            <span
              className="w-2 h-2 rounded-full bg-success shrink-0"
              title={t("modes.active")}
              aria-label={t("modes.active")}
              role="img"
            />
          )}
        </div>
        <p className="text-[13px] text-text-muted truncate mt-0.5">
          {voiceOnly ? (
            t("modes.voiceOnly")
          ) : llmLabel ? (
            llmLabel
          ) : (
            <span className="text-warning">{t("modes.row.noAiModel")}</span>
          )}
          {action.trigger_key != null &&
            `${SEPARATOR}${t("modes.row.quickKey", { key: action.trigger_key })}`}
        </p>
      </div>
      {tiles.length > 0 && (
        <span className="flex items-center gap-1 p-1 rounded-xl bg-surface-2 shrink-0">
          {tiles.map((tile, index) => (
            <span
              key={`${tile.vendor}-${index}`}
              title={tile.label}
              className="inline-flex [&>*]:pointer-events-none"
            >
              <VendorLogo vendor={tile.vendor} size={30} />
            </span>
          ))}
        </span>
      )}
    </button>
  );
};

/* ------------------------------------------------------------------------ */
/* Create / edit dialog                                                     */
/* ------------------------------------------------------------------------ */

const IconPicker: React.FC<{
  value: string;
  onChange: (icon: string) => void;
}> = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {ACTION_ICON_NAMES.map((name) => {
      const Icon = getActionIcon(name);
      const isActive = name === value;
      return (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          aria-pressed={isActive}
          className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
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

const Field: React.FC<{
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, children }) => (
  <div className="space-y-1.5 min-w-0">
    <label htmlFor={htmlFor} className="block text-[13px] font-medium">
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-text-muted leading-relaxed">{hint}</p>}
  </div>
);

interface ModeDialogProps {
  action: PostProcessAction | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const ModeDialog: React.FC<ModeDialogProps> = ({
  action,
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const speechModels = useModelStore((state) => state.models);
  const currentModelId = useModelStore((state) => state.currentModel);

  const llmModels = useMemo(() => settings?.llm_models ?? [], [settings]);
  const providers = useMemo(
    () => settings?.post_process_providers ?? [],
    [settings],
  );
  const actions = useMemo(
    () => settings?.post_process_actions ?? [],
    [settings],
  );

  const isBuiltIn = action?.id === BUILT_IN_MODE_ID;
  const wasActive = action != null && settings?.active_mode_id === action.id;

  const initialType: ModeType = action
    ? isBuiltIn || isVoiceOnly(action)
      ? "voice"
      : "ai"
    : llmModels.length > 0
      ? "ai"
      : "voice";

  const [name, setName] = useState(action?.name ?? "");
  const [type, setType] = useState<ModeType>(initialType);
  const [icon, setIcon] = useState(
    action
      ? modeIconName(action)
      : initialType === "voice"
        ? VOICE_ICON
        : DEFAULT_ACTION_ICON,
  );
  const [prompt, setPrompt] = useState(action?.prompt ?? "");
  const [llmModelId, setLlmModelId] = useState<string | null>(() => {
    const saved = action?.llm_model_id;
    if (saved && llmModels.some((m) => m.id === saved)) return saved;
    return llmModels[0]?.id ?? null;
  });
  const [speechModelId, setSpeechModelId] = useState(
    action?.speech_model_id ?? "",
  );
  const [triggerKey, setTriggerKey] = useState<number | null>(
    action?.trigger_key ?? null,
  );
  const [makeActive, setMakeActive] = useState(wasActive);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const changeType = (next: ModeType) => {
    if (isBuiltIn) return;
    setType(next);
    // Swap the default icons so the row icon matches the mode type.
    setIcon((current) => {
      if (next === "voice" && current === DEFAULT_ACTION_ICON) {
        return VOICE_ICON;
      }
      if (next === "ai" && current === VOICE_ICON) return DEFAULT_ACTION_ICON;
      return current;
    });
  };

  const languageModelOptions = useMemo(
    () =>
      llmModels.map((model: LLMModel) => ({
        value: model.id,
        label: model.label,
        hint:
          model.provider_id === LOCAL_PROVIDER_ID
            ? t("library.status.onDevice")
            : (providers.find((p) => p.id === model.provider_id)?.label ??
              model.provider_id),
      })),
    [llmModels, providers, t],
  );

  const voiceModelOptions = useMemo(() => {
    const current = speechModels.find((m) => m.id === currentModelId);
    const defaultLabel = current
      ? t("modes.dialog.voiceModelDefault", {
          model: getTranslatedModelName(current, t),
        })
      : t("modes.dialog.voiceModelDefaultShort");
    return [
      { value: "", label: defaultLabel },
      ...speechModels
        .filter((m) => m.is_downloaded || m.id === speechModelId)
        .map((m) => ({
          value: m.id,
          label: getTranslatedModelName(m, t),
          hint: m.is_cloud ? t("library.status.cloud") : undefined,
        })),
    ];
  }, [speechModels, currentModelId, speechModelId, t]);

  const triggerKeyOptions = useMemo(() => {
    const usedKeys = new Set(
      actions
        .filter((a) => a.id !== action?.id)
        .map((a) => a.trigger_key)
        .filter((k): k is number => k != null),
    );
    const options: { value: string; label: string; disabled?: boolean }[] = [
      { value: "none", label: t("modes.dialog.noKey") },
    ];
    for (let k = 1; k <= 9; k++) {
      options.push({
        value: String(k),
        label: usedKeys.has(k)
          ? t("modes.dialog.keyTaken", { key: k })
          : String(k),
        disabled: usedKeys.has(k),
      });
    }
    return options;
  }, [actions, action?.id, t]);

  const canSave = !isSaving && (type === "voice" || prompt.trim() !== "");

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t("modes.dialog.errors.nameRequired"));
      return;
    }
    const voiceOnly = type === "voice";
    const finalPrompt = voiceOnly ? "" : prompt.trim();
    const finalLlmModelId = voiceOnly ? null : llmModelId;
    const finalSpeechModelId = speechModelId === "" ? null : speechModelId;

    setIsSaving(true);
    setError(null);
    try {
      let id: string;
      if (action) {
        const result = await commands.updatePostProcessAction(
          action.id,
          trimmedName,
          finalPrompt,
          finalLlmModelId,
          icon,
          triggerKey,
          finalSpeechModelId,
        );
        if (result.status === "error") {
          setError(String(result.error));
          return;
        }
        id = action.id;
      } else {
        const result = await commands.addPostProcessAction(
          trimmedName,
          finalPrompt,
          finalLlmModelId,
          icon,
          triggerKey,
          finalSpeechModelId,
        );
        if (result.status === "error") {
          setError(String(result.error));
          return;
        }
        id = result.data.id;
      }

      if (makeActive && !wasActive) {
        const result = await commands.setActiveMode(id);
        if (result.status === "error") {
          await refreshSettings();
          setError(String(result.error));
          return;
        }
      }

      await refreshSettings();
      if (action) {
        onClose();
      } else {
        // Reopen as "edit" so the global shortcut can be assigned right away.
        onCreated(id);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSaving(false);
    }
  }, [
    action,
    name,
    type,
    prompt,
    llmModelId,
    speechModelId,
    icon,
    triggerKey,
    makeActive,
    wasActive,
    refreshSettings,
    onClose,
    onCreated,
    t,
  ]);

  const handleDelete = useCallback(async () => {
    if (!action || isBuiltIn) return;
    const confirmed = await ask(
      t("modes.dialog.deleteConfirm", { name: action.name }),
      {
        title: t("modes.dialog.deleteTitle"),
        kind: "warning",
        okLabel: t("common.delete"),
        cancelLabel: t("common.cancel"),
      },
    );
    if (!confirmed) return;
    const result = await commands.deletePostProcessAction(action.id);
    if (result.status === "ok") {
      await refreshSettings();
      onClose();
    } else {
      setError(String(result.error));
    }
  }, [action, isBuiltIn, refreshSettings, onClose, t]);

  const footer = (
    <>
      {action &&
        (isBuiltIn ? (
          <p className="me-auto text-xs text-text-muted">
            {t("modes.dialog.cannotDeleteBuiltIn")}
          </p>
        ) : (
          <Button
            variant="danger-ghost"
            size="md"
            onClick={handleDelete}
            className="me-auto"
          >
            <Trash2 className="w-4 h-4" />
            {t("common.delete")}
          </Button>
        ))}
      <Button variant="secondary" size="md" onClick={onClose}>
        {t("common.cancel")}
      </Button>
      <Button
        variant="primary"
        size="md"
        onClick={handleSave}
        disabled={!canSave}
      >
        {action ? t("common.save") : t("common.create")}
      </Button>
    </>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={action ? t("modes.dialog.editTitle") : t("modes.dialog.newTitle")}
      footer={footer}
      maxWidthClassName="max-w-xl"
    >
      <div className="space-y-5">
        <Field
          label={t("modes.dialog.name")}
          htmlFor="mode-name"
          hint={
            nameError ? (
              <span className="text-danger">{nameError}</span>
            ) : undefined
          }
        >
          <Input
            id="mode-name"
            type="text"
            value={name}
            autoFocus={!action}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            placeholder={t("modes.dialog.namePlaceholder")}
            className="w-full"
          />
        </Field>

        <Field label={t("modes.dialog.icon")}>
          <IconPicker value={icon} onChange={setIcon} />
        </Field>

        <Field
          label={t("modes.dialog.type")}
          hint={
            type === "voice"
              ? t("modes.dialog.typeVoiceHint")
              : t("modes.dialog.typeAiHint")
          }
        >
          <div
            className={isBuiltIn ? "opacity-60 pointer-events-none" : ""}
            aria-disabled={isBuiltIn}
          >
            <SegmentedControl<ModeType>
              value={type}
              onChange={changeType}
              options={[
                {
                  value: "voice",
                  label: t("modes.dialog.typeVoice"),
                  icon: <Mic className="w-3.5 h-3.5" />,
                },
                {
                  value: "ai",
                  label: t("modes.dialog.typeAi"),
                  icon: <Sparkles className="w-3.5 h-3.5" />,
                },
              ]}
            />
          </div>
        </Field>

        {type === "ai" && (
          <>
            <Field
              label={t("modes.dialog.prompt")}
              htmlFor="mode-prompt"
              hint={t("modes.dialog.promptHint")}
            >
              <Textarea
                id="mode-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t("modes.dialog.promptPlaceholder")}
                className="w-full block min-h-[140px]"
              />
            </Field>

            <Field label={t("modes.dialog.languageModel")}>
              {languageModelOptions.length > 0 ? (
                <Dropdown
                  selectedValue={llmModelId}
                  options={languageModelOptions}
                  onSelect={(value) => setLlmModelId(value)}
                  placeholder={t("modes.dialog.languageModelPlaceholder")}
                  className="w-full"
                />
              ) : (
                <div className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-warning leading-relaxed">
                    {t("modes.dialog.noLanguageModels")}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      onClose();
                      navigateTo("library");
                    }}
                  >
                    {t("modes.dialog.openLibrary")}
                  </Button>
                </div>
              )}
            </Field>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={t("modes.dialog.voiceModel")}>
            <Dropdown
              selectedValue={speechModelId}
              options={voiceModelOptions}
              onSelect={(value) => setSpeechModelId(value)}
              placeholder={t("modes.dialog.voiceModelDefaultShort")}
              className="w-full"
            />
          </Field>
          <Field label={t("modes.dialog.quickKey")}>
            <Dropdown
              selectedValue={triggerKey != null ? String(triggerKey) : "none"}
              options={triggerKeyOptions}
              onSelect={(value) =>
                setTriggerKey(value === "none" ? null : Number(value))
              }
              placeholder={t("modes.dialog.noKey")}
              className="w-full"
            />
          </Field>
        </div>

        <Field label={t("modes.dialog.shortcut")}>
          {action ? (
            <ShortcutInput shortcutId={`ppa_${action.id}`} bare />
          ) : (
            <p className="text-xs text-text-muted">
              {t("modes.dialog.shortcutAfterSave")}
            </p>
          )}
        </Field>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {t("modes.dialog.activeToggle")}
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {t("modes.dialog.activeToggleHint")}
            </p>
          </div>
          <Switch
            checked={makeActive}
            onChange={setMakeActive}
            disabled={wasActive}
            ariaLabel={t("modes.dialog.activeToggle")}
          />
        </div>

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5">
            <p className="text-xs text-danger break-words">{error}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
};

/* ------------------------------------------------------------------------ */
/* Page                                                                     */
/* ------------------------------------------------------------------------ */

export const ModesPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const osType = useOsType();
  const speechModels = useModelStore((state) => state.models);
  const currentModelId = useModelStore((state) => state.currentModel);
  const localLlms = useLocalLlmStore((state) => state.models);

  const actions = settings?.post_process_actions ?? [];
  const llmModels = settings?.llm_models ?? [];
  const activeModeId = settings?.active_mode_id ?? null;

  const [editingId, setEditingId] = useState<string | null>(null);

  // Home's "Create a mode" (and other pages) ask for the create dialog. The
  // page is lazy-loaded, so an action requested before it mounted is picked
  // up from the pending slot; later ones arrive as events.
  useEffect(() => {
    if (consumePendingPageAction() === CREATE_MODE_ACTION) {
      setEditingId(NEW_MODE_ID);
    }
    const onPageAction = (event: Event) => {
      if ((event as CustomEvent<string>).detail === CREATE_MODE_ACTION) {
        consumePendingPageAction();
        setEditingId(NEW_MODE_ID);
      }
    };
    window.addEventListener("wsm:page-action", onPageAction);
    return () => window.removeEventListener("wsm:page-action", onPageAction);
  }, []);

  const editingAction =
    editingId && editingId !== NEW_MODE_ID
      ? (actions.find((a) => a.id === editingId) ?? null)
      : null;
  const dialogOpen = editingId === NEW_MODE_ID || editingAction !== null;

  const llmFor = (action: PostProcessAction) =>
    action.llm_model_id
      ? llmModels.find((m) => m.id === action.llm_model_id)
      : undefined;

  const tilesFor = (action: PostProcessAction): ModelTile[] => {
    const tiles: ModelTile[] = [];
    const speechId = action.speech_model_id || currentModelId;
    const speechModel = speechModels.find((m) => m.id === speechId);
    if (speechModel) {
      tiles.push({
        vendor: speechModel.vendor || "whispersm",
        label: getTranslatedModelName(speechModel, t),
      });
    }
    if (!isVoiceOnly(action)) {
      const llm = llmFor(action);
      if (llm) {
        const vendor =
          llm.provider_id === LOCAL_PROVIDER_ID
            ? localLlmVendor(
                localLlms.find((m) => m.id === llm.model)?.family ?? "",
              )
            : providerVendor(llm.provider_id);
        tiles.push({ vendor, label: llm.label });
      }
    }
    return tiles;
  };

  const changeModeRaw = settings?.bindings?.change_mode?.current_binding ?? "";
  const changeModeCombo = changeModeRaw.trim()
    ? formatKeyCombination(changeModeRaw, osType)
    : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight leading-tight truncate">
            {t("modes.title")}
          </h1>
          <InfoTip text={t("modes.info")} />
        </div>
        <Button
          variant="secondary"
          size="md"
          onClick={() => setEditingId(NEW_MODE_ID)}
          className="shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t("modes.create")}
        </Button>
      </div>

      <div>
        {actions.length === 0 ? (
          <div className="wsm-card border-dashed px-6 py-10 text-center">
            <p className="text-[15px] font-medium">{t("modes.emptyTitle")}</p>
            <p className="text-[13px] text-text-muted mt-1">
              {t("modes.empty")}
            </p>
          </div>
        ) : (
          actions.map((action) => (
            <ModeRow
              key={action.id}
              action={action}
              isActive={action.id === activeModeId}
              tiles={tilesFor(action)}
              llmLabel={llmFor(action)?.label ?? null}
              onClick={() => setEditingId(action.id)}
            />
          ))
        )}

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => navigateTo("configuration")}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-surface-2 transition-colors cursor-pointer"
          >
            {changeModeCombo && (
              <KeyCombo combination={changeModeCombo} size="md" />
            )}
            <span className="text-[15px] text-text-muted">
              {t("modes.changeActive")}
            </span>
          </button>
        </div>
      </div>

      {dialogOpen && (
        <ModeDialog
          key={editingId ?? NEW_MODE_ID}
          action={editingAction}
          onClose={() => setEditingId(null)}
          onCreated={(id) => setEditingId(id)}
        />
      )}
    </div>
  );
};
