import React from "react";

export interface ChoiceCardOption<T extends string> {
  value: T;
  label: string;
  /** Artwork drawn inside the card. */
  preview: React.ReactNode;
}

interface ChoiceCardsProps<T extends string> {
  value: T;
  options: ChoiceCardOption<T>[];
  onChange: (value: T) => void;
  /** Size of each card, e.g. "w-[74px] h-[54px]". */
  cardClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Row of selectable preview cards with a caption under each one
 * (theme picker, recording window picker).
 */
export function ChoiceCards<T extends string>({
  value,
  options,
  onChange,
  cardClassName = "w-[74px] h-[54px]",
  ariaLabel,
  disabled = false,
}: ChoiceCardsProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex items-start gap-3"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => {
              if (!selected) onChange(option.value);
            }}
            className="group flex flex-col items-center gap-1.5 cursor-pointer focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className={`relative flex items-center justify-center overflow-hidden rounded-lg border-2 transition-[border-color,background-color,box-shadow] duration-150 group-focus-visible:ring-2 group-focus-visible:ring-accent/40 ${
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface group-hover:border-border-strong"
              } ${cardClassName}`}
            >
              {option.preview}
            </span>
            <span
              className={`text-[13px] leading-tight transition-colors ${
                selected
                  ? "font-medium text-text"
                  : "text-text-muted group-hover:text-text"
              }`}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
