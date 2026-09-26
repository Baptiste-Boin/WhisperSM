import React from "react";
import { useTranslation } from "react-i18next";
import {
  AlignLeft,
  ArrowDownToLine,
  AudioLines,
  Cloud,
  Loader2,
  Play,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import { VendorLogo } from "@/components/ui/VendorLogo";
import { SpeedAccuracy } from "@/components/ui/ScoreDashes";
import { formatModelSize } from "@/lib/utils/format";

export type RowKind = "voice" | "language";

/** Where a row comes from; decides which store/command handles it. */
export type RowSource = "voice" | "local-llm" | "cloud-llm" | "custom-llm";

export type RowStatus =
  /** Cloud model whose provider has no API key yet. */
  | "needsKey"
  /** Cloud model ready to use. */
  | "cloud"
  /** On-device model that can be downloaded. */
  | "available"
  | "downloading"
  | "verifying"
  | "extracting"
  /** On-device model present on disk. */
  | "downloaded";

export interface LibraryRow {
  key: string;
  id: string;
  source: RowSource;
  kind: RowKind;
  name: string;
  vendor: string;
  badge: "new" | "en" | null;
  /** 0..1, null when unknown (custom models). */
  speed: number | null;
  accuracy: number | null;
  isCloud: boolean;
  providerId?: string;
  providerLabel?: string;
  /** Model identifier sent to a cloud provider. */
  model?: string;
  sizeMb?: number;
  status: RowStatus;
  progress?: number;
  /** A partial download exists on disk (resume). */
  partial: boolean;
  /** Active voice model. */
  isActive: boolean;
  /** Language model registered in `llm_models` (usable in modes). */
  inUse: boolean;
  llmModelId?: string;
  /** Hidden behind "Older models". */
  older: boolean;
  searchText: string;
}

/** Column template shared by the header row and the model rows. */
export const LIBRARY_GRID =
  "grid grid-cols-[32px_minmax(0,1fr)_56px_120px_172px] items-center gap-x-3";

const RoundButton: React.FC<{
  onClick: () => void;
  title: string;
  tone?: "outline" | "filled";
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, tone = "outline", disabled, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    disabled={disabled}
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
    className={`w-[30px] h-[30px] shrink-0 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      tone === "outline"
        ? "border border-border-strong text-text-muted hover:text-text hover:bg-surface-3"
        : "bg-surface-3/70 text-text-muted hover:text-danger hover:bg-danger/15"
    }`}
  >
    {children}
  </button>
);

/** Voice / language icon with the hover card of the reference app. */
const TypeCell: React.FC<{ kind: RowKind }> = ({ kind }) => {
  const { t } = useTranslation();
  const Icon = kind === "voice" ? AudioLines : AlignLeft;
  const title =
    kind === "voice"
      ? t("library.type.voice.title")
      : t("library.type.language.title");
  const description =
    kind === "voice"
      ? t("library.type.voice.description")
      : t("library.type.language.description");
  return (
    <div className="relative flex justify-center group/type">
      <span className="w-7 h-7 rounded-md bg-surface-2 group-hover:bg-surface-3 flex items-center justify-center text-text-muted transition-colors">
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </span>
      <div
        role="tooltip"
        className="pointer-events-none absolute start-full top-1/2 -translate-y-1/2 ms-2 z-30 w-[240px] rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 shadow-[var(--shadow-card)] invisible opacity-0 transition-opacity duration-150 group-hover/type:visible group-hover/type:opacity-100 group-hover/type:delay-300"
      >
        <p className="text-[14px] font-semibold text-text">{title}</p>
        <p className="text-[13px] leading-snug text-text-muted mt-0.5">
          {description}
        </p>
      </div>
    </div>
  );
};

interface ModelRowProps {
  row: LibraryRow;
  isFavorite: boolean;
  isTryOpen: boolean;
  /** Native tooltip describing what a click on the row does. */
  rowTitle?: string;
  onToggleFavorite: () => void;
  onClick: () => void;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onTry?: () => void;
}

export const ModelRow: React.FC<ModelRowProps> = ({
  row,
  isFavorite,
  isTryOpen,
  rowTitle,
  onToggleFavorite,
  onClick,
  onDownload,
  onCancel,
  onDelete,
  onTry,
}) => {
  const { t } = useTranslation();
  const percentage = Math.round(row.progress ?? 0);
  const size =
    row.sizeMb !== undefined && row.sizeMb > 0
      ? formatModelSize(row.sizeMb)
      : null;

  const renderRightColumn = () => {
    if (row.source === "custom-llm") {
      return (
        <RoundButton
          tone="filled"
          title={t("library.actions.disable")}
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </RoundButton>
      );
    }
    switch (row.status) {
      case "needsKey":
      case "cloud":
        return (
          <span
            className="w-[30px] h-[30px] flex items-center justify-center text-text-muted/70"
            title={
              row.status === "needsKey"
                ? t("library.status.needsKey", {
                    provider: row.providerLabel ?? row.providerId ?? "",
                  })
                : t("library.status.cloud")
            }
          >
            <Cloud className="w-[21px] h-[21px]" strokeWidth={1.5} />
          </span>
        );
      case "verifying":
      case "extracting":
        return (
          <span className="min-w-0 inline-flex items-center gap-1.5 text-[13px] text-text-muted">
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            {row.status === "verifying"
              ? t("modelSelector.verifyingGeneric")
              : t("modelSelector.extractingGeneric")}
          </span>
        );
      case "downloading":
        return (
          <>
            <span className="min-w-0 truncate text-[13px] text-text-muted tabular-nums">
              {t("library.local.downloading", { percentage })}
            </span>
            <RoundButton title={t("library.actions.cancel")} onClick={onCancel}>
              <X className="w-3.5 h-3.5" />
            </RoundButton>
          </>
        );
      case "downloaded":
        return (
          <>
            {size && (
              <span className="text-[15px] text-text tabular-nums whitespace-nowrap">
                {size}
              </span>
            )}
            <RoundButton
              tone="filled"
              title={t("library.actions.delete")}
              onClick={onDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </RoundButton>
          </>
        );
      case "available":
      default:
        return (
          <>
            {size && (
              <span className="text-[15px] text-text tabular-nums whitespace-nowrap">
                {size}
              </span>
            )}
            <RoundButton
              title={
                row.partial
                  ? t("library.local.resume")
                  : t("library.actions.download")
              }
              onClick={onDownload}
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </RoundButton>
          </>
        );
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={rowTitle ? `${row.name} – ${rowTitle}` : row.name}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`${LIBRARY_GRID} group relative h-[60px] px-2 rounded-xl cursor-default outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/40 ${
        isTryOpen ? "bg-surface-2" : ""
      }`}
    >
      {/* Favourite */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        title={
          isFavorite
            ? t("library.actions.unfavorite")
            : t("library.actions.favorite")
        }
        aria-label={
          isFavorite
            ? t("library.actions.unfavorite")
            : t("library.actions.favorite")
        }
        aria-pressed={isFavorite}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-3/70 transition-colors"
      >
        <Star
          className={`w-[18px] h-[18px] ${
            isFavorite
              ? "fill-warning text-warning"
              : "text-text-muted/50 group-hover:text-text-muted"
          }`}
          strokeWidth={1.6}
        />
      </button>

      {/* Logo + name + badges */}
      <div className="flex items-center gap-3 min-w-0">
        <VendorLogo vendor={row.vendor} size={30} />
        <span className="text-[16px] text-text truncate" title={rowTitle}>
          {row.name}
        </span>
        {row.badge && (
          <Badge
            variant="secondary"
            className="rounded-[5px]! px-1.5! h-[19px]! text-[10.5px] tracking-wide text-text-muted! shrink-0"
          >
            {row.badge === "new"
              ? t("library.badges.new")
              : t("library.badges.en")}
          </Badge>
        )}
        {row.isActive && (
          <Badge variant="success" className="shrink-0">
            {t("library.status.active")}
          </Badge>
        )}
        {row.inUse && (
          <Badge variant="primary" className="shrink-0">
            {t("library.status.inUse")}
          </Badge>
        )}
        {onTry && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTry();
            }}
            className={`shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-medium text-text-muted hover:text-text hover:bg-surface-3 transition-opacity ${
              isTryOpen
                ? "opacity-100 text-text"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
          >
            <Play className="w-3 h-3" />
            {t("library.actions.try")}
          </button>
        )}
      </div>

      {/* Type */}
      <TypeCell kind={row.kind} />

      {/* Speed / accuracy */}
      <div className="flex items-center">
        {row.speed !== null && row.accuracy !== null && (
          <SpeedAccuracy
            speed={row.speed}
            accuracy={row.accuracy}
            speedLabel={t("library.scores.speed")}
            accuracyLabel={t("library.scores.accuracy")}
          />
        )}
      </div>

      {/* Cloud / offline */}
      <div className="min-w-0 flex items-center justify-end gap-3 pe-1.5">
        {renderRightColumn()}
      </div>

      {row.status === "downloading" && (
        <div className="absolute start-[52px] end-3 bottom-1 h-[2px] rounded-full bg-surface-3 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-[width] duration-300"
            style={{ width: `${Math.max(2, percentage)}%` }}
          />
        </div>
      )}
    </div>
  );
};

export default ModelRow;
