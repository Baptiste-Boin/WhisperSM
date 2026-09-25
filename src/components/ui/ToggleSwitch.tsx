import React from "react";
import { SettingContainer } from "./SettingContainer";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const Switch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}> = ({ checked, onChange, disabled = false, ariaLabel }) => (
  <label
    className={`inline-flex items-center ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
  >
    <input
      type="checkbox"
      className="sr-only peer"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.checked)}
    />
    <div className="relative w-10 h-6 rounded-full bg-surface-3 border border-border-strong transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-checked:bg-accent peer-checked:border-accent peer-disabled:opacity-50 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(0,0,0,0.25)] after:transition-transform after:duration-200 peer-checked:after:translate-x-4 rtl:peer-checked:after:-translate-x-4" />
  </label>
);

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isUpdating = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  tooltipPosition = "top",
}) => {
  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      tooltipPosition={tooltipPosition}
    >
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled || isUpdating}
        ariaLabel={label}
      />
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </SettingContainer>
  );
};
