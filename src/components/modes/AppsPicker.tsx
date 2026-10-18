import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppWindow, Plus, X } from "lucide-react";
import { commands } from "@/bindings";
import { useDropDirection } from "@/hooks/useDropDirection";

interface AppsPickerProps {
  apps: string[];
  onChange: (apps: string[]) => void;
}

/**
 * "Activate for apps" of the mode editor: the apps that switch to this mode
 * when a recording starts in them, picked from recent dictations or typed.
 */
export const AppsPicker: React.FC<AppsPickerProps> = ({ apps, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const direction = useDropDirection(ref, open, 320);

  useEffect(() => {
    if (!open) return;
    commands
      .getRecentApps()
      .then((result) => {
        if (result.status === "ok") setRecent(result.data);
      })
      .catch(() => setRecent([]));
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const has = (name: string) =>
    apps.some((app) => app.toLowerCase() === name.toLowerCase());

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || has(trimmed)) return;
    onChange([...apps, trimmed]);
    setDraft("");
  };

  const remove = (name: string) => onChange(apps.filter((app) => app !== name));

  const suggestions = recent.filter((name) => !has(name));

  return (
    <div className="flex items-center justify-end gap-1.5 flex-wrap min-w-0">
      {apps.map((app) => (
        <span
          key={app}
          className="inline-flex items-center gap-1 h-[26px] ps-2 pe-1 rounded-md bg-surface-2 text-[13px] text-text max-w-[160px]"
        >
          <span className="truncate">{app}</span>
          <button
            type="button"
            onClick={() => remove(app)}
            aria-label={t("modes.editor.apps.remove", { app })}
            className="p-0.5 rounded text-text-muted hover:text-text"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-[30px] px-3 rounded-[7px] border border-border-strong text-[14px] text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          {t("modes.editor.apps.add")}
        </button>

        {open && (
          <div
            className={`absolute end-0 z-50 w-[260px] p-1.5 rounded-xl bg-surface border border-border shadow-[var(--shadow-popover)] wsm-fade-in ${direction === "up" ? "bottom-full mb-1" : "top-full mt-1"}`}
          >
            <form
              className="flex items-center gap-1.5 p-1"
              onSubmit={(event) => {
                event.preventDefault();
                add(draft);
              }}
            >
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("modes.editor.apps.placeholder")}
                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-surface-2 outline-none text-[14px] text-text placeholder:text-text-faint"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label={t("modes.editor.apps.add")}
                className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>
            {suggestions.length > 0 && (
              <>
                <p className="px-2 pt-2 pb-1 text-[12px] font-medium text-text-muted">
                  {t("modes.editor.apps.recent")}
                </p>
                <div className="max-h-[200px] overflow-y-auto">
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => add(name)}
                      className="w-full h-8 px-2 flex items-center gap-2 rounded-lg text-start text-[14px] text-text hover:bg-surface-2"
                    >
                      <AppWindow className="w-4 h-4 text-text-muted shrink-0" />
                      <span className="truncate">{name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="px-2 pt-2 pb-1 text-[11.5px] leading-snug text-text-muted">
              {t("modes.editor.apps.hint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppsPicker;
