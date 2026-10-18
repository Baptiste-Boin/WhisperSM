import React from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";

interface TitleBarProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  onBack?: () => void;
  /** Rendered at the far right (e.g. a delete button). */
  trailing?: React.ReactNode;
}

/**
 * Top bar of a detail screen: back chevron on the left and the title (with
 * its icon) centred, like the mode editor of the reference app.
 */
export const TitleBar: React.FC<TitleBarProps> = ({
  title,
  icon,
  onBack,
  trailing,
}) => {
  const { t } = useTranslation();
  return (
    <div
      className="relative flex-1 h-full flex items-center"
      data-tauri-drag-region
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="relative z-10 p-1 -ms-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          aria-label={t("common.back")}
        >
          <ChevronLeft className="w-[22px] h-[22px]" strokeWidth={1.8} />
        </button>
      )}
      <div
        className="absolute inset-0 flex items-center justify-center gap-2.5 pointer-events-none px-24"
        data-tauri-drag-region
      >
        {icon && <span className="text-text shrink-0">{icon}</span>}
        <span className="text-[15px] font-semibold truncate">{title}</span>
      </div>
      {trailing && (
        <div className="relative z-10 ms-auto flex items-center gap-1">
          {trailing}
        </div>
      )}
    </div>
  );
};

export default TitleBar;
