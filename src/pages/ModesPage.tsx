import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Info, Plus } from "lucide-react";
import { commands, type PostProcessAction } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useOsType } from "@/hooks/useOsType";
import { useModelStore } from "@/stores/modelStore";
import { useLocalLlmStore } from "@/stores/localLlmStore";
import { formatKeyCombination } from "@/lib/utils/keyboard";
import { getTranslatedModelName } from "@/lib/utils/modelTranslation";
import { consumePendingPageAction, navigateTo } from "@/lib/navigation";
import {
  localLlmVendor,
  providerVendor,
  type VendorId,
} from "@/lib/constants/modelCatalog";
import { KeyCombo, Tooltip } from "@/components/ui";
import { VendorLogo } from "@/components/ui/VendorLogo";
import {
  BUILT_IN_MODE_ID,
  ModeEditor,
  ModeIcon,
} from "@/components/modes/ModeEditor";

const LOCAL_PROVIDER_ID = "local";
const NEW_MODE_ID = "new";
const CREATE_MODE_ACTION = "create-mode";

interface ModelTile {
  vendor: VendorId | string;
  label: string;
}

const isVoiceOnly = (action: PostProcessAction) => action.prompt.trim() === "";

/* ------------------------------------------------------------------------ */
/* Header info tip                                                          */
/* ------------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------------ */
/* Mode row                                                                 */
/* ------------------------------------------------------------------------ */

/** Initial-letter tile for an app the mode activates in. */
const AppTile: React.FC<{ name: string; index: number }> = ({
  name,
  index,
}) => {
  const hues = [210, 140, 20, 280, 340, 50];
  const hue = hues[index % hues.length];
  return (
    <span
      title={name}
      className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-[12px] font-semibold text-white shrink-0 ring-2 ring-surface"
      style={{
        background: `linear-gradient(180deg, hsl(${hue} 70% 58%), hsl(${hue} 70% 46%))`,
        marginInlineStart: index === 0 ? 0 : -8,
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
};

interface ModeRowProps {
  action: PostProcessAction;
  isActive: boolean;
  tiles: ModelTile[];
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

const ModeRow: React.FC<ModeRowProps> = ({
  action,
  isActive,
  tiles,
  onOpen,
  onContextMenu,
}) => {
  const { t } = useTranslation();
  const apps = action.activate_apps ?? [];
  return (
    <button
      type="button"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      className="w-full h-[52px] ps-5 pe-3.5 flex items-center gap-3 rounded-[18px] bg-surface border border-[var(--color-card-border)] text-start hover:bg-surface-2/60 transition-colors cursor-default"
    >
      <span className="text-text shrink-0 flex">
        <ModeIcon name={action.icon} />
      </span>
      <span className="text-[15.5px] text-text truncate">{action.name}</span>
      {isActive && (
        <span
          className="w-2 h-2 rounded-full bg-success shrink-0"
          title={t("modes.active")}
          aria-label={t("modes.active")}
          role="img"
        />
      )}
      <span className="flex-1" />
      {apps.length > 0 && (
        <span className="flex items-center p-[5px] rounded-[10px] bg-surface-2 border border-border shrink-0">
          {apps.slice(0, 4).map((app, index) => (
            <AppTile key={app} name={app} index={index} />
          ))}
        </span>
      )}
      {tiles.length > 0 && (
        <span className="flex items-center gap-1.5 p-[5px] rounded-[10px] bg-surface-2 shrink-0">
          {tiles.map((tile, index) => (
            <span
              key={`${tile.vendor}-${index}`}
              title={tile.label}
              className="inline-flex [&>*]:pointer-events-none"
            >
              <VendorLogo vendor={tile.vendor} size={26} />
            </span>
          ))}
        </span>
      )}
    </button>
  );
};

/* ------------------------------------------------------------------------ */
/* Context menu                                                             */
/* ------------------------------------------------------------------------ */

interface MenuState {
  action: PostProcessAction;
  x: number;
  y: number;
}

const RowMenu: React.FC<{
  menu: MenuState;
  isActive: boolean;
  onClose: () => void;
  onEdit: () => void;
  onActivate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({
  menu,
  isActive,
  onClose,
  onEdit,
  onActivate,
  onDuplicate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item =
    "w-full h-8 px-2.5 rounded-md text-start text-[14px] hover:bg-accent hover:text-white transition-colors";
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 w-[200px] p-1 rounded-xl bg-surface border border-border shadow-[var(--shadow-popover)]"
      style={{ left: menu.x, top: menu.y }}
    >
      <button type="button" role="menuitem" className={item} onClick={onEdit}>
        {t("modes.menu.edit")}
      </button>
      {!isActive && (
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={onActivate}
        >
          {t("modes.menu.activate")}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={onDuplicate}
      >
        {t("modes.menu.duplicate")}
      </button>
      {menu.action.id !== BUILT_IN_MODE_ID && (
        <>
          <div className="my-1 mx-2 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className={`${item} text-danger hover:bg-danger!`}
            onClick={onDelete}
          >
            {t("common.delete")}
          </button>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------------ */
/* Page                                                                     */
/* ------------------------------------------------------------------------ */

export const ModesPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useSettings();
  const osType = useOsType();
  const speechModels = useModelStore((state) => state.models);
  const currentModelId = useModelStore((state) => state.currentModel);
  const localLlms = useLocalLlmStore((state) => state.models);

  const actions = settings?.post_process_actions ?? [];
  const llmModels = settings?.llm_models ?? [];
  const activeModeId = settings?.active_mode_id ?? null;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Home's "Create a mode" (and other pages) ask for a new mode. The page is
  // lazy-loaded, so an action requested before it mounted is picked up from
  // the pending slot; later ones arrive as events.
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

  // Leave the editor if its mode disappears (deleted elsewhere).
  useEffect(() => {
    if (
      editingId &&
      editingId !== NEW_MODE_ID &&
      settings &&
      !actions.some((a) => a.id === editingId)
    ) {
      setEditingId(null);
    }
  }, [editingId, actions, settings]);

  if (editingId) {
    return (
      <ModeEditor
        key={editingId}
        modeId={editingId === NEW_MODE_ID ? null : editingId}
        onBack={() => setEditingId(null)}
        onCreated={(id) => setEditingId(id)}
      />
    );
  }

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
    if (!isVoiceOnly(action) && action.llm_model_id) {
      const llm = llmModels.find((m) => m.id === action.llm_model_id);
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

  const activate = async (id: string) => {
    const result = await commands.setActiveMode(id);
    if (result.status === "error") toast.error(String(result.error));
    await refreshSettings();
  };

  const duplicate = async (action: PostProcessAction) => {
    const result = await commands.addPostProcessAction(
      t("modes.menu.copyName", { name: action.name }),
      action.prompt,
      action.llm_model_id ?? null,
      action.icon ?? "sparkles",
      null,
      action.speech_model_id ?? null,
    );
    if (result.status === "error") {
      toast.error(String(result.error));
      return;
    }
    await commands.updateModeOptions(result.data.id, {
      preset: action.preset ?? null,
      tone: action.tone ?? null,
      language: action.language ?? null,
      activate_apps: [],
      context_application: action.context_application ?? false,
      context_clipboard: action.context_clipboard ?? false,
    });
    await refreshSettings();
  };

  const remove = async (action: PostProcessAction) => {
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
    if (result.status === "error") toast.error(String(result.error));
    await refreshSettings();
  };

  const changeModeRaw = settings?.bindings?.change_mode?.current_binding ?? "";
  const changeModeCombo = changeModeRaw.trim()
    ? formatKeyCombination(changeModeRaw, osType)
    : "";

  return (
    <div className="flex flex-col min-h-[calc(100vh-52px-48px)]">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <h1 className="text-[16px] font-semibold leading-tight truncate">
            {t("modes.title")}
          </h1>
          <InfoTip text={t("modes.info")} />
        </div>
        <button
          type="button"
          onClick={() => setEditingId(NEW_MODE_ID)}
          className="shrink-0 h-[30px] px-3 inline-flex items-center gap-1.5 rounded-[8px] bg-surface-2 text-[14.5px] text-text hover:bg-surface-3 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.8} />
          {t("modes.create")}
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {actions.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-border-strong px-6 py-10 text-center">
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
              onOpen={() => setEditingId(action.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({ action, x: event.clientX, y: event.clientY });
              }}
            />
          ))
        )}
      </div>

      <div className="mt-auto pt-8 flex justify-center">
        <button
          type="button"
          onClick={() => navigateTo("configuration")}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-surface-2/60 transition-colors cursor-default"
        >
          {changeModeCombo && (
            <KeyCombo combination={changeModeCombo} size="md" />
          )}
          <span className="text-[15px] text-text-muted">
            {t("modes.changeActive")}
          </span>
        </button>
      </div>

      {menu && (
        <RowMenu
          menu={menu}
          isActive={menu.action.id === activeModeId}
          onClose={() => setMenu(null)}
          onEdit={() => {
            setEditingId(menu.action.id);
            setMenu(null);
          }}
          onActivate={() => {
            void activate(menu.action.id);
            setMenu(null);
          }}
          onDuplicate={() => {
            void duplicate(menu.action);
            setMenu(null);
          }}
          onDelete={() => {
            void remove(menu.action);
            setMenu(null);
          }}
        />
      )}
    </div>
  );
};
