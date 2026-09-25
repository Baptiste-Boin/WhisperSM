import React from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-2 border border-border ${className}`}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 px-3 h-7 text-xs font-medium rounded-md transition-colors ${
              active
                ? "bg-surface text-text shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                : "text-text-muted hover:text-text"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
