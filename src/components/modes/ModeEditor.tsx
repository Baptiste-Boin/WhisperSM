import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Check, ChevronRight, Info, Trash2 } from "lucide-react";
import { commands, type ModeOptions, type PostProcessAction } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import { usePageHeader } from "@/stores/headerStore";
import { Button, TitleBar, Tooltip } from "@/components/ui";
import { MacSelect, type MacSelectOption } from "@/components/ui/MacSelect";
import { ShortcutInput } from "@/components/settings/ShortcutInput";
import { LANGUAGES } from "@/lib/constants/languages";
import {
  ACTION_ICON_NAMES,
  FILLED_ACTION_ICONS,
  getActionIcon,
} from "@/lib/constants/actionIcons";
import {
  DEFAULT_CUSTOM_INSTRUCTIONS,
  DEFAULT_TONE,
  MODE_PRESETS,
  buildPresetPrompt,
  customInstructionsFromPrompt,
  getPreset,
  inferPreset,
  type ModePresetId,
} from "@/lib/constants/modePresets";
import { ModelPicker } from "./ModelPicker";
import { AppsPicker } from "./AppsPicker";
import {
  ensureSavedLanguageModel,
  languageKeyForModel,
  useLanguagePickerItems,
  useVoicePickerItems,
  type PickerItem,
} from "./modelOptions";

/** Built-in "Voice to text" mode: cannot be deleted. */
export const BUILT_IN_MODE_ID = "act_voice_to_text";

export const ModeIcon: React.FC<{
  name?: string | null;
  className?: string;
}> = ({ name, className = "w-[18px] h-[18px]" }) => {
  const Icon = getActionIcon(name);
  const filled = name ? FILLED_ACTION_ICONS.has(name) : false;
  return (
    <Icon
      className={className}
      fill={filled ? "currentColor" : "none"}
      strokeWidth={filled ? 1.4 : 1.9}
    />
  );
};

/** Hover/click "ⓘ" next to a row label. */
const InfoTip: React.FC<{ text: string }> = ({ text }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
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
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-text-muted hover:text-text transition-colors cursor-help"
      >
        <Info className="w-[15px] h-[15px]" />
      </button>
      {open && (
        <Tooltip targetRef={ref} position="bottom">
          <p className="text-xs leading-relaxed text-text max-w-[260px]">
            {text}
          </p>
        </Tooltip>
      )}
    </>
  );
};

const Group: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-[18px] bg-surface border border-[var(--color-card-border)] px-5 py-2">
    {children}
  </div>
);

const Row: React.FC<{
  label: string;
  info?: string;
  description?: string;
  children?: React.ReactNode;
}> = ({ label, info, description, children }) => (
  <div className="flex items-center justify-between gap-4 min-h-[52px] py-2">
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[15px] font-medium text-text">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      {description && (
        <p className="text-[13px] text-text-muted mt-0.5">{description}</p>
      )}
    </div>
    <div className="shrink-0 flex items-center min-w-0">{children}</div>
  </div>
);

/** Casual ↔ Formal slider with five notches. */
const ToneSlider: React.FC<{
  value: number;
  onChange: (value: number) => void;
}> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3">
      <span className="text-[14px] font-medium text-text">
        {t("modes.editor.tone.casual")}
      </span>
      <div className="relative w-[110px] h-5 flex items-center">
        <div className="absolute inset-x-0 h-[4px] rounded-full bg-surface-3" />
        {[1, 2, 3].map((notch) => (
          <span
            key={notch}
            className="absolute w-[2px] h-[8px] rounded-full bg-text-muted/70"
            style={{ left: `calc(${notch * 25}% - 1px)` }}
          />
        ))}
        <input
          type="range"
          min={0}
          max={4}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={t("modes.editor.tone.label")}
          className="wsm-tone-range relative w-full"
        />
      </div>
      <span className="text-[14px] font-medium text-text">
        {t("modes.editor.tone.formal")}
      </span>
    </div>
  );
};

const Checkbox: React.FC<{
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled, label, onChange }) => (
  <label
    className={`inline-flex items-center gap-2 text-[15px] text-text ${disabled ? "opacity-60" : "cursor-pointer"}`}
  >
    <span
      className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center border transition-colors ${
        checked
          ? "bg-accent border-accent text-white"
          : "bg-surface-2 border-border-strong"
      }`}
    >
      {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
    </span>
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    {label}
  </label>
);

interface ModeEditorProps {
  /** `null` while choosing the preset of a new mode. */
  modeId: string | null;
  onBack: () => void;
  onCreated: (id: string) => void;
}

/**
 * Full-page mode editor, like the reference app: preset and tone, language
 * and models, auto-activation and shortcut, then advanced settings. Every
 * change is saved right away.
 */
export const ModeEditor: React.FC<ModeEditorProps> = ({
  modeId,
  onBack,
  onCreated,
}) => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const speechModels = useModelStore((s) => s.models);
  const currentModelId = useModelStore((s) => s.currentModel);
  const downloadVoiceModel = useModelStore((s) => s.downloadModel);
  const downloadLocalLlm = useLocalLlmStore((s) => s.downloadModel);
  const voiceItems = useVoicePickerItems();
  const languageItems = useLanguagePickerItems();

  const mode = useMemo(
    () =>
      modeId
        ? (settings?.post_process_actions ?? []).find((a) => a.id === modeId)
        : undefined,
    [settings?.post_process_actions, modeId],
  );
  const llmModels = useMemo(
    () => settings?.llm_models ?? [],
    [settings?.llm_models],
  );

  const presetId: ModePresetId | null = mode ? inferPreset(mode) : null;
  const preset = presetId ? getPreset(presetId) : null;
  const tone = mode?.tone ?? DEFAULT_TONE;
  const isBuiltIn = mode?.id === BUILT_IN_MODE_ID;
  const isActive = mode != null && settings?.active_mode_id === mode.id;

  const [instructions, setInstructions] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    if (mode && presetId === "custom") {
      setInstructions(customInstructionsFromPrompt(mode.prompt));
    }
    // Reset the draft only when another mode (or preset) is opened.
  }, [mode?.id, presetId]);

  /* ------------------------------------------------------------------ */
  /* Saving                                                              */
  /* ------------------------------------------------------------------ */

  const saveCore = useCallback(
    async (patch: Partial<PostProcessAction>) => {
      if (!mode) return false;
      const next = { ...mode, ...patch };
      const result = await commands.updatePostProcessAction(
        next.id,
        next.name,
        next.prompt,
        next.prompt.trim() ? (next.llm_model_id ?? null) : null,
        next.icon ?? "sparkles",
        next.trigger_key ?? null,
        next.speech_model_id ?? null,
      );
      if (result.status === "error") {
        toast.error(String(result.error));
        return false;
      }
      return true;
    },
    [mode],
  );

  const saveAndRefresh = async (patch: Partial<PostProcessAction>) => {
    if (await saveCore(patch)) await refreshSettings();
  };

  const saveOptions = useCallback(
    async (patch: Partial<ModeOptions>) => {
      if (!mode) return false;
      const options: ModeOptions = {
        preset: mode.preset ?? presetId,
        tone: mode.tone ?? null,
        language: mode.language ?? null,
        activate_apps: mode.activate_apps ?? [],
        context_application: mode.context_application ?? false,
        context_clipboard: mode.context_clipboard ?? false,
        ...patch,
      };
      const result = await commands.updateModeOptions(mode.id, options);
      if (result.status === "error") {
        toast.error(String(result.error));
        return false;
      }
      return true;
    },
    [mode, presetId],
  );

  const firstLanguageModelId = useCallback(
    () =>
      mode?.llm_model_id && llmModels.some((m) => m.id === mode.llm_model_id)
        ? mode.llm_model_id
        : (llmModels[0]?.id ?? null),
    [mode?.llm_model_id, llmModels],
  );

  const applyPreset = useCallback(
    async (next: ModePresetId) => {
      const target = getPreset(next);
      if (!mode) {
        // New mode: create it from the preset, named after it.
        const prompt = buildPresetPrompt(
          next,
          DEFAULT_TONE,
          DEFAULT_CUSTOM_INSTRUCTIONS,
        );
        const result = await commands.addPostProcessAction(
          t(`modes.presets.${next}.name`),
          prompt,
          target.usesAi ? (llmModels[0]?.id ?? null) : null,
          target.icon,
          null,
          null,
        );
        if (result.status === "error") {
          toast.error(String(result.error));
          return;
        }
        await commands.updateModeOptions(result.data.id, {
          preset: next,
          tone: target.hasTone ? DEFAULT_TONE : null,
          language: null,
          activate_apps: [],
          context_application: target.autoContext,
          context_clipboard: target.autoContext,
        });
        await refreshSettings();
        onCreated(result.data.id);
        return;
      }
      if (next === presetId) return;
      const custom =
        next === "custom"
          ? presetId === "custom"
            ? instructions
            : DEFAULT_CUSTOM_INSTRUCTIONS
          : "";
      if (next === "custom") setInstructions(custom);
      const prompt = buildPresetPrompt(next, tone, custom);
      // Keep a custom icon; swap preset icons.
      const presetIcons = new Set(MODE_PRESETS.map((p) => p.icon));
      const icon =
        !mode.icon || presetIcons.has(mode.icon) ? target.icon : mode.icon;
      await saveCore({
        prompt,
        icon,
        llm_model_id: target.usesAi ? firstLanguageModelId() : null,
      });
      await saveOptions({
        preset: next,
        tone: target.hasTone ? tone : null,
        context_application: target.autoContext
          ? true
          : (mode.context_application ?? false),
        context_clipboard: target.autoContext
          ? true
          : (mode.context_clipboard ?? false),
      });
      await refreshSettings();
    },
    [
      mode,
      presetId,
      instructions,
      tone,
      llmModels,
      firstLanguageModelId,
      saveCore,
      saveOptions,
      refreshSettings,
      onCreated,
      t,
    ],
  );

  const changeTone = async (value: number) => {
    if (!mode || !presetId) return;
    await saveCore({ prompt: buildPresetPrompt(presetId, value) });
    await saveOptions({ tone: value });
    await refreshSettings();
  };

  const saveInstructions = async () => {
    if (!mode || presetId !== "custom") return;
    const prompt = buildPresetPrompt("custom", tone, instructions);
    if (prompt === mode.prompt) return;
    if (!prompt) {
      toast.error(t("modes.editor.instructions.required"));
      return;
    }
    if (await saveCore({ prompt })) await refreshSettings();
  };

  const changeContext = async (
    key: "context_application" | "context_clipboard",
    value: boolean,
  ) => {
    if (await saveOptions({ [key]: value })) await refreshSettings();
  };

  const changeLanguage = async (value: string) => {
    if (await saveOptions({ language: value === "global" ? null : value }))
      await refreshSettings();
  };

  const changeVoiceModel = async (item: PickerItem) => {
    if (item.status === "needsKey") {
      toast(t("modes.editor.needsKey", { model: item.name }));
    }
    if (item.status === "available") void downloadVoiceModel(item.id);
    if (await saveCore({ speech_model_id: item.id })) await refreshSettings();
  };

  const changeLanguageModel = async (item: PickerItem) => {
    if (item.status === "needsKey") {
      toast(t("modes.editor.needsKey", { model: item.name }));
    }
    if (item.source === "local-llm" && item.status === "available") {
      void downloadLocalLlm(item.id);
    }
    const id = await ensureSavedLanguageModel(item);
    if (!id) {
      toast.error(t("library.toasts.error"));
      return;
    }
    if (await saveCore({ llm_model_id: id })) await refreshSettings();
  };

  const changeApps = async (apps: string[]) => {
    if (await saveOptions({ activate_apps: apps })) await refreshSettings();
  };

  const rename = async () => {
    setEditingName(false);
    const name = nameDraft.trim();
    if (!mode || !name || name === mode.name) return;
    if (await saveCore({ name })) await refreshSettings();
  };

  // The title bar is rendered by the header store; always call the latest
  // rename (it saves the current mode).
  const renameRef = useRef(rename);
  renameRef.current = rename;

  const remove = async () => {
    if (!mode || isBuiltIn) return;
    const confirmed = await ask(
      t("modes.dialog.deleteConfirm", { name: mode.name }),
      {
        title: t("modes.dialog.deleteTitle"),
        kind: "warning",
        okLabel: t("common.delete"),
        cancelLabel: t("common.cancel"),
      },
    );
    if (!confirmed) return;
    const result = await commands.deletePostProcessAction(mode.id);
    if (result.status === "error") {
      toast.error(String(result.error));
      return;
    }
    await refreshSettings();
    onBack();
  };

  const makeActive = async () => {
    if (!mode) return;
    const result = await commands.setActiveMode(mode.id);
    if (result.status === "error") toast.error(String(result.error));
    await refreshSettings();
  };

  /* ------------------------------------------------------------------ */
  /* Header                                                              */
  /* ------------------------------------------------------------------ */

  usePageHeader(
    {
      bar: (
        <TitleBar
          onBack={onBack}
          icon={mode ? <ModeIcon name={mode.icon} /> : undefined}
          title={
            mode ? (
              editingName ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => void renameRef.current()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renameRef.current();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  className="pointer-events-auto w-[220px] h-7 px-2 rounded-md bg-surface-2 outline-none text-[15px] font-semibold text-center"
                  aria-label={t("modes.dialog.name")}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(mode.name);
                    setEditingName(true);
                  }}
                  className="pointer-events-auto hover:opacity-80"
                  title={t("modes.editor.rename")}
                >
                  {mode.name}
                </button>
              )
            ) : (
              t("modes.editor.newTitle")
            )
          }
        />
      ),
    },
    [mode?.id, mode?.name, mode?.icon, editingName, nameDraft, onBack, t],
  );

  /* ------------------------------------------------------------------ */
  /* Options                                                             */
  /* ------------------------------------------------------------------ */

  const presetOptions: MacSelectOption[] = MODE_PRESETS.map((p) => ({
    value: p.id,
    label: t(`modes.presets.${p.id}.name`),
    icon: <ModeIcon name={p.icon} className="w-4 h-4" />,
    note: p.id === "super" ? t("modes.presets.recommended") : undefined,
  }));

  const voiceModelId = mode?.speech_model_id || currentModelId;
  const voiceModel = speechModels.find((m) => m.id === voiceModelId);
  const languageOptions: MacSelectOption[] = useMemo(() => {
    const supported = voiceModel?.supported_languages ?? [];
    const fits = (code: string) =>
      supported.length === 0 || supported.includes(code);
    return [
      { value: "global", label: t("modes.editor.language.appDefault") },
      { value: "auto", label: t("modes.editor.language.automatic") },
      ...LANGUAGES.filter((l) => l.value !== "auto" && fits(l.value)).map(
        (l) => ({ value: l.value, label: l.label }),
      ),
    ];
  }, [voiceModel, t]);

  const quickKeyOptions: MacSelectOption[] = useMemo(() => {
    const used = new Set(
      (settings?.post_process_actions ?? [])
        .filter((a) => a.id !== mode?.id)
        .map((a) => a.trigger_key)
        .filter((k): k is number => k != null),
    );
    return [
      { value: "none", label: t("modes.dialog.noKey") },
      ...Array.from({ length: 9 }, (_, i) => i + 1).map((k) => ({
        value: String(k),
        label: used.has(k) ? t("modes.dialog.keyTaken", { key: k }) : String(k),
        disabled: used.has(k),
      })),
    ];
  }, [settings?.post_process_actions, mode?.id, t]);

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  if (!mode) {
    return (
      <div className="flex flex-col gap-4">
        <Group>
          <Row label={t("modes.editor.preset.label")}>
            <MacSelect
              options={presetOptions}
              value={null}
              placeholder={t("modes.editor.preset.placeholder")}
              onChange={(value) => void applyPreset(value as ModePresetId)}
              tiledIcons
              widthClassName="w-[200px]"
              ariaLabel={t("modes.editor.preset.label")}
            />
          </Row>
        </Group>
      </div>
    );
  }

  const usesAi = Boolean(preset?.usesAi);

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* Preset, tone or custom instructions */}
      <Group>
        <Row
          label={t("modes.editor.preset.label")}
          info={t("modes.editor.preset.info")}
        >
          <MacSelect
            options={presetOptions}
            value={presetId}
            onChange={(value) => void applyPreset(value as ModePresetId)}
            tiledIcons
            widthClassName="w-[180px]"
            ariaLabel={t("modes.editor.preset.label")}
            disabled={isBuiltIn}
          />
        </Row>
        {preset?.hasTone && (
          <Row
            label={t("modes.editor.tone.label")}
            info={t("modes.editor.tone.info")}
          >
            <ToneSlider value={tone} onChange={(v) => void changeTone(v)} />
          </Row>
        )}
        {presetId === "custom" && (
          <>
            <div className="pt-2">
              <p className="text-[15px] font-medium text-text">
                {t("modes.editor.instructions.title")}
              </p>
              <p className="text-[14px] text-text-muted mt-1">
                {t("modes.editor.instructions.description")}
              </p>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onBlur={() => void saveInstructions()}
                rows={4}
                aria-label={t("modes.editor.instructions.title")}
                className="mt-3 w-full rounded-xl bg-background/60 border border-border px-3 py-2.5 text-[14.5px] leading-relaxed text-text outline-none focus:border-accent/60 resize-y min-h-[96px]"
              />
            </div>
            <Row
              label={t("modes.editor.context.label")}
              info={t("modes.editor.context.info")}
            >
              <div className="flex items-center gap-5">
                <Checkbox
                  label={t("modes.editor.context.application")}
                  checked={mode.context_application ?? false}
                  onChange={(v) => void changeContext("context_application", v)}
                />
                <Checkbox
                  label={t("modes.editor.context.clipboard")}
                  checked={mode.context_clipboard ?? false}
                  onChange={(v) => void changeContext("context_clipboard", v)}
                />
              </div>
            </Row>
          </>
        )}
      </Group>

      {/* Language and models */}
      <Group>
        <Row label={t("modes.editor.language.label")}>
          <MacSelect
            options={languageOptions}
            value={mode.language ?? "global"}
            onChange={(value) => void changeLanguage(value)}
            ariaLabel={t("modes.editor.language.label")}
          />
        </Row>
        <Row
          label={t("modes.editor.voiceModel.label")}
          info={t("modes.editor.voiceModel.info")}
        >
          <ModelPicker
            items={voiceItems}
            selectedKey={voiceModelId ? `voice:${voiceModelId}` : null}
            onSelect={(item) => void changeVoiceModel(item)}
            placeholder={t("modes.editor.voiceModel.placeholder")}
            ariaLabel={t("modes.editor.voiceModel.label")}
          />
        </Row>
        {usesAi && (
          <Row
            label={t("modes.editor.languageModel.label")}
            info={t("modes.editor.languageModel.info")}
          >
            <ModelPicker
              items={languageItems}
              selectedKey={languageKeyForModel(
                llmModels.find((m) => m.id === mode.llm_model_id),
              )}
              onSelect={(item) => void changeLanguageModel(item)}
              placeholder={t("modes.editor.languageModel.placeholder")}
              ariaLabel={t("modes.editor.languageModel.label")}
            />
          </Row>
        )}
      </Group>

      {/* Auto-activation and shortcut */}
      <Group>
        <Row
          label={t("modes.editor.apps.label")}
          info={t("modes.editor.apps.info")}
        >
          <AppsPicker
            apps={mode.activate_apps ?? []}
            onChange={(apps) => void changeApps(apps)}
          />
        </Row>
        <Row
          label={t("modes.editor.shortcut.label")}
          description={t("modes.editor.shortcut.description")}
        >
          <ShortcutInput shortcutId={`ppa_${mode.id}`} bare />
        </Row>
      </Group>

      {/* Advanced settings */}
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
        className="self-start mt-2 ms-2 inline-flex items-center gap-2 text-[16px] font-medium text-text hover:opacity-80"
      >
        <ChevronRight
          className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
        />
        {t("modes.editor.advanced")}
      </button>

      {advancedOpen && (
        <Group>
          <Row
            label={t("modes.dialog.quickKey")}
            info={t("modes.editor.quickKeyInfo")}
          >
            <MacSelect
              options={quickKeyOptions}
              value={
                mode.trigger_key != null ? String(mode.trigger_key) : "none"
              }
              onChange={(value) =>
                void saveAndRefresh({
                  trigger_key: value === "none" ? null : Number(value),
                })
              }
              widthClassName="w-[140px]"
              ariaLabel={t("modes.dialog.quickKey")}
            />
          </Row>
          <Row label={t("modes.dialog.icon")}>
            <div className="flex flex-wrap justify-end gap-1 max-w-[300px]">
              {ACTION_ICON_NAMES.map((name) => {
                const selected = (mode.icon ?? "") === name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected}
                    aria-label={name}
                    onClick={() => void saveAndRefresh({ icon: name })}
                    className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                      selected
                        ? "bg-accent text-white"
                        : "text-text-muted hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    <ModeIcon name={name} className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </Row>
          <Row
            label={t("modes.dialog.activeToggle")}
            description={t("modes.dialog.activeToggleHint")}
          >
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 text-[14px] text-success">
                <span className="w-2 h-2 rounded-full bg-success" />
                {t("modes.active")}
              </span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void makeActive()}
              >
                {t("modes.editor.makeActive")}
              </Button>
            )}
          </Row>
          {!isBuiltIn && (
            <Row label={t("modes.editor.delete")}>
              <Button
                variant="danger-ghost"
                size="sm"
                onClick={() => void remove()}
              >
                <Trash2 className="w-4 h-4" />
                {t("common.delete")}
              </Button>
            </Row>
          )}
        </Group>
      )}
    </div>
  );
};

export default ModeEditor;
