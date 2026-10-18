import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownCircle,
  CheckCircle2,
  ChevronsUpDown,
  Cloud,
  KeyRound,
  LibraryBig,
  Loader2,
  Search,
  Star,
} from "lucide-react";
import { VendorLogo } from "@/components/ui/VendorLogo";
import { useFavoritesStore } from "@/stores/favoritesStore";
import { navigateTo } from "@/lib/navigation";
import { useDropDirection } from "@/hooks/useDropDirection";
import type { PickerItem } from "./modelOptions";

interface ModelPickerProps {
  items: PickerItem[];
  selectedKey: string | null;
  onSelect: (item: PickerItem) => void;
  placeholder: string;
  ariaLabel: string;
}

/** Trailing status icon of a picker row, as in the reference app. */
const StatusIcon: React.FC<{ item: PickerItem; selected: boolean }> = ({
  item,
  selected,
}) => {
  const { t } = useTranslation();
  const tone = selected ? "text-white" : "text-text-muted";
  switch (item.status) {
    case "needsKey":
      return (
        <span title={t("library.actions.addKey")} className="flex">
          <KeyRound className={`w-[17px] h-[17px] ${tone}`} />
        </span>
      );
    case "downloading":
      return (
        <span
          className={`text-[11px] tabular-nums flex items-center gap-1 ${tone}`}
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {item.progress !== undefined ? `${Math.round(item.progress)}%` : ""}
        </span>
      );
    case "available":
      return (
        <span title={t("library.actions.download")} className="flex">
          <ArrowDownCircle className={`w-[19px] h-[19px] ${tone}`} />
        </span>
      );
    case "ready":
    default:
      return item.isCloud ? (
        <span title={t("library.status.cloud")} className="flex">
          <Cloud className={`w-[19px] h-[19px] ${tone}`} strokeWidth={1.6} />
        </span>
      ) : (
        <span title={t("library.status.onDevice")} className="flex">
          <CheckCircle2
            className={`w-[19px] h-[19px] ${selected ? "text-white" : "text-success"}`}
          />
        </span>
      );
  }
};

/** Speed / accuracy bars of the hover card. */
const ScoreBar: React.FC<{ label: string; value: number }> = ({
  label,
  value,
}) => (
  <div className="flex items-center gap-4">
    <span className="w-[72px] text-[13px] text-text-muted shrink-0">
      {label}
    </span>
    <span className="flex-1 h-[3px] rounded-full bg-text/15 overflow-hidden">
      <span
        className="block h-full rounded-full bg-accent"
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
        }}
      />
    </span>
  </div>
);

/**
 * Searchable model menu of the mode editor: Favourites first, then Popular
 * and the other models, with a status icon per model and a detail card on
 * hover.
 */
export const ModelPicker: React.FC<ModelPickerProps> = ({
  items,
  selectedKey,
  onSelect,
  placeholder,
  ariaLabel,
}) => {
  const { t } = useTranslation();
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleFavorite = useFavoritesStore((s) => s.toggle);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ item: PickerItem; top: number } | null>(
    null,
  );
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const direction = useDropDirection(ref, open, 390);

  useEffect(() => {
    if (!open) return;
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
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHover(null);
    }
  }, [open]);

  const selected = items.find((item) => item.key === selectedKey);

  const sections = useMemo(() => {
    const favoriteSet = new Set(favorites);
    const q = query.trim().toLowerCase();
    const byName = (a: PickerItem, b: PickerItem) =>
      a.name.localeCompare(b.name, undefined, { numeric: true });
    if (q) {
      const found = items
        .filter((item) =>
          `${item.name} ${item.vendor} ${item.model ?? ""}`
            .toLowerCase()
            .includes(q),
        )
        .sort(byName);
      return [{ id: "results", title: null, items: found }];
    }
    const fav = items.filter((item) => favoriteSet.has(item.key));
    const rest = items.filter((item) => !favoriteSet.has(item.key));
    return [
      { id: "favorites", title: t("modes.picker.favorites"), items: fav },
      {
        id: "popular",
        title: t("modes.picker.popular"),
        items: rest.filter((i) => i.popular && !i.legacy).sort(byName),
      },
      {
        id: "all",
        title: t("modes.picker.more"),
        items: rest.filter((i) => !i.popular && !i.legacy).sort(byName),
      },
      {
        id: "older",
        title: t("modes.picker.older"),
        items: rest.filter((i) => i.legacy).sort(byName),
      },
    ].filter((section) => section.items.length > 0);
  }, [items, favorites, query, t]);

  const favoriteSet = new Set(favorites);

  return (
    <div ref={ref} className="relative w-[180px]">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-[34px] ps-1.5 pe-1.5 flex items-center gap-2 rounded-[8px] bg-surface-2 border border-border text-[14px] text-start hover:bg-surface-3 transition-colors cursor-default ${
          open ? "ring-2 ring-accent/50" : ""
        }`}
      >
        {selected && <VendorLogo vendor={selected.vendor} size={22} />}
        <span
          className={`flex-1 min-w-0 truncate ${selected ? "text-text" : "text-text-muted ps-1"}`}
        >
          {selected?.name ?? placeholder}
        </span>
        <ChevronsUpDown className="w-4 h-4 shrink-0 text-text-muted" />
      </button>

      {open && (
        <div
          className={`absolute end-0 z-50 w-[300px] rounded-xl bg-surface border border-border shadow-[var(--shadow-popover)] wsm-fade-in ${
            direction === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <div className="flex items-center gap-2 px-3 h-11 border-b border-border">
            <Search className="w-[17px] h-[17px] text-text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("library.search")}
              aria-label={t("library.search")}
              className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-text placeholder:text-text-faint"
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            className="max-h-[320px] overflow-y-auto p-1.5"
            onMouseLeave={() => setHover(null)}
          >
            {sections.length === 0 && (
              <p className="px-2 py-6 text-center text-[13px] text-text-muted">
                {t("library.empty")}
              </p>
            )}
            {sections.map((section, index) => (
              <div key={section.id} className={index > 0 ? "mt-1.5" : ""}>
                {section.title && (
                  <div className="flex items-center justify-between px-2 h-7 text-[13px] font-medium text-text-muted">
                    <span>{section.title}</span>
                    {section.id === "favorites" && (
                      <button
                        type="button"
                        title={t("sidebar.library")}
                        aria-label={t("sidebar.library")}
                        onClick={() => {
                          setOpen(false);
                          navigateTo("library");
                        }}
                        className="p-0.5 rounded hover:text-text"
                      >
                        <LibraryBig className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                {section.items.map((item) => {
                  const isSelected = item.key === selectedKey;
                  const isFavorite = favoriteSet.has(item.key);
                  const dim =
                    !isSelected &&
                    (item.status === "available" || item.status === "needsKey");
                  return (
                    <div
                      key={item.key}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={-1}
                      onClick={() => {
                        onSelect(item);
                        setOpen(false);
                      }}
                      onMouseEnter={(event) => {
                        const list = listRef.current;
                        const top =
                          (event.currentTarget as HTMLElement).offsetTop -
                          (list?.scrollTop ?? 0) +
                          44;
                        setHover({ item, top });
                      }}
                      className={`group/item flex items-center gap-2.5 h-10 px-2 rounded-lg cursor-default transition-colors ${
                        isSelected
                          ? "bg-accent text-white"
                          : "hover:bg-surface-2 text-text"
                      }`}
                    >
                      <span className={dim ? "opacity-55" : ""}>
                        <VendorLogo vendor={item.vendor} size={26} />
                      </span>
                      <span
                        className={`flex-1 min-w-0 flex items-center gap-1.5 ${dim ? "text-text-muted" : ""}`}
                      >
                        <span className="truncate text-[15px]">
                          {item.name}
                        </span>
                        {item.badge && (
                          <span
                            className={`shrink-0 px-1.5 h-[18px] inline-flex items-center rounded-[5px] text-[10px] font-semibold tracking-wide ${
                              isSelected
                                ? "bg-white/25 text-white"
                                : "bg-surface-3 text-text-muted"
                            }`}
                          >
                            {item.badge === "new"
                              ? t("library.badges.new")
                              : t("library.badges.en")}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(item.key);
                        }}
                        aria-pressed={isFavorite}
                        aria-label={
                          isFavorite
                            ? t("library.actions.unfavorite")
                            : t("library.actions.favorite")
                        }
                        className={`p-0.5 rounded transition-opacity ${
                          isFavorite
                            ? "opacity-100"
                            : "opacity-0 group-hover/item:opacity-100"
                        }`}
                      >
                        <Star
                          className={`w-[17px] h-[17px] ${
                            isFavorite ? "fill-current" : ""
                          } ${isSelected ? "text-white" : "text-text"}`}
                          strokeWidth={1.6}
                        />
                      </button>
                      <StatusIcon item={item} selected={isSelected} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {hover && (
            <div
              className="absolute end-full me-2 w-[260px] p-3.5 rounded-xl bg-surface border border-border shadow-[var(--shadow-popover)] pointer-events-none"
              style={{ top: Math.max(0, Math.min(hover.top, 230)) }}
              role="tooltip"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-semibold text-text truncate">
                  {hover.item.name}
                </span>
                {hover.item.isCloud && (
                  <Cloud
                    className="w-4 h-4 text-text-muted shrink-0"
                    strokeWidth={1.6}
                  />
                )}
              </div>
              {hover.item.description && (
                <p className="mt-1 text-[13px] leading-snug text-text-muted">
                  {hover.item.description}
                </p>
              )}
              {hover.item.speed !== null && hover.item.accuracy !== null && (
                <div className="mt-3 flex flex-col gap-2">
                  <ScoreBar
                    label={t("library.scores.speed")}
                    value={hover.item.speed}
                  />
                  <ScoreBar
                    label={t("library.scores.accuracy")}
                    value={hover.item.accuracy}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelPicker;
