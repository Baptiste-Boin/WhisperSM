import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useDropDirection } from "@/hooks/useDropDirection";

export interface MacSelectOption {
  value: string;
  label: string;
  /** Square icon shown before the label. */
  icon?: React.ReactNode;
  /** Small italic note on the right ("Recommended"). */
  note?: string;
  disabled?: boolean;
}

interface MacSelectProps {
  options: MacSelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Trigger width class (default w-[180px]). */
  widthClassName?: string;
  /** Show option icons in the menu as tiles, like the preset picker. */
  tiledIcons?: boolean;
  ariaLabel?: string;
}

/**
 * Pop-up button in the style of the reference app's settings: a filled
 * rounded field with up/down chevrons that opens a menu under it.
 */
export const MacSelect: React.FC<MacSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "",
  disabled = false,
  widthClassName = "w-[180px]",
  tiledIcons = false,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const direction = useDropDirection(
    ref,
    open,
    Math.min(330, options.length * (tiledIcons ? 40 : 32) + 12),
  );

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
    // Bring the selected option into view in long lists.
    listRef.current
      ?.querySelector<HTMLElement>("[aria-selected='true']")
      ?.scrollIntoView({ block: "nearest" });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);

  return (
    <div ref={ref} className={`relative ${widthClassName}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-[30px] ps-2.5 pe-1.5 flex items-center gap-2 rounded-[7px] bg-surface-2 text-[14px] text-start transition-colors ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-surface-3 cursor-default"
        } ${open ? "ring-2 ring-accent/50" : ""}`}
      >
        {selected?.icon && !tiledIcons && (
          <span className="shrink-0 flex">{selected.icon}</span>
        )}
        <span
          className={`flex-1 min-w-0 truncate ${selected ? "text-text" : "text-text-muted"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown
          className="w-4 h-4 shrink-0 text-text-muted"
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className={`absolute end-0 z-50 min-w-full w-max max-w-[320px] max-h-[320px] overflow-y-auto p-1 rounded-xl bg-surface border border-border shadow-[var(--shadow-popover)] wsm-fade-in ${
            direction === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-2 rounded-lg text-start text-[14px] text-text transition-colors disabled:opacity-40 ${
                  tiledIcons ? "h-10" : "h-8"
                } ${isSelected && !tiledIcons ? "bg-accent text-white" : "hover:bg-surface-2"}`}
              >
                {option.icon &&
                  (tiledIcons ? (
                    <span className="w-7 h-7 rounded-md bg-surface-2 flex items-center justify-center shrink-0 text-text-muted">
                      {option.icon}
                    </span>
                  ) : (
                    <span className="shrink-0 flex">{option.icon}</span>
                  ))}
                <span className="flex-1 min-w-0 truncate">{option.label}</span>
                {option.note && (
                  <span className="ms-4 text-[13px] italic text-text-muted shrink-0">
                    {option.note}
                  </span>
                )}
                {isSelected && tiledIcons && (
                  <Check className="w-4 h-4 shrink-0 text-accent" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MacSelect;
