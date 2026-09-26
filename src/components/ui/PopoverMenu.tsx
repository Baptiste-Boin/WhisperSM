import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export interface PopoverMenuItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface PopoverMenuProps {
  /** Element that toggles the menu. Receives the open state. */
  trigger: (open: boolean) => React.ReactNode;
  items: PopoverMenuItem[];
  /** Currently selected value(s); a check mark is shown next to them. */
  selected?: string | string[] | null;
  onSelect: (value: string) => void;
  align?: "start" | "end";
  /** Keep the menu open after a selection (multi-select filters). */
  stayOpen?: boolean;
  className?: string;
  /** Optional header rendered above the items. */
  header?: React.ReactNode;
  /** Width class for the menu (default w-48). */
  menuClassName?: string;
}

/**
 * Lightweight dropdown menu anchored to an arbitrary trigger (the period
 * picker on Home, the filter and provider menus in the models library).
 */
export const PopoverMenu: React.FC<PopoverMenuProps> = ({
  trigger,
  items,
  selected,
  onSelect,
  align = "start",
  stayOpen = false,
  className = "",
  header,
  menuClassName = "w-48",
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isSelected = (value: string) =>
    Array.isArray(selected) ? selected.includes(value) : selected === value;

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <div onClick={() => setOpen((v) => !v)} className="cursor-pointer">
        {trigger(open)}
      </div>
      {open && (
        <div
          className={`absolute top-full mt-1.5 ${menuClassName} bg-surface border border-border rounded-xl shadow-[var(--shadow-card)] z-50 p-1 wsm-fade-in ${
            align === "end" ? "end-0" : "start-0"
          }`}
          role="menu"
        >
          {header}
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                onSelect(item.value);
                if (!stayOpen) setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm rounded-lg text-start transition-colors ${
                item.disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-surface-2"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
              {isSelected(item.value) && (
                <Check className="w-3.5 h-3.5 shrink-0 text-text" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PopoverMenu;
