import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  hint?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
  /** Align the menu to the end (right in LTR) edge of the trigger. */
  align?: "start" | "end";
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder = "Select an option...",
  disabled = false,
  onRefresh,
  align = "start",
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && onRefresh) onRefresh();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`h-8 px-2.5 text-sm font-medium bg-surface border border-border-strong rounded-lg min-w-[190px] w-full text-start flex items-center justify-between gap-2 transition-[background-color,border-color] duration-150 ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:border-accent/60 hover:bg-surface-2 cursor-pointer"
        } ${isOpen ? "border-accent ring-2 ring-accent/20" : ""}`}
        onClick={handleToggle}
        disabled={disabled}
      >
        <span className={`truncate ${selectedOption ? "" : "text-text-muted"}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-text-muted transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && !disabled && (
        <div
          className={`absolute top-full mt-1.5 min-w-full bg-surface border border-border rounded-xl shadow-[var(--shadow-card)] z-50 max-h-64 overflow-y-auto p-1 wsm-fade-in ${
            align === "end" ? "end-0" : "start-0"
          }`}
        >
          {options.length === 0 ? (
            <div className="px-2.5 py-1.5 text-sm text-text-muted">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option) => {
              const isSelected = selectedValue === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full px-2.5 py-1.5 text-sm text-start rounded-lg flex items-center justify-between gap-3 transition-colors duration-100 ${
                    isSelected
                      ? "bg-accent-soft text-accent font-medium"
                      : "hover:bg-surface-2"
                  } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-xs text-text-muted font-normal">
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
