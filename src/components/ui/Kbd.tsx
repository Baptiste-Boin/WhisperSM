import React from "react";

interface KbdProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Keycap. Pass a formatted combination ("Ctrl + Space") and each part is
 * rendered as its own key.
 */
export const Kbd: React.FC<KbdProps> = ({
  children,
  size = "sm",
  className = "",
}) => {
  const sizes = {
    sm: "text-[11px] h-5 min-w-5 px-1.5 rounded-md",
    md: "text-xs h-7 min-w-7 px-2 rounded-lg",
    lg: "text-base h-11 min-w-11 px-3.5 rounded-xl",
  };
  return (
    <kbd
      className={`inline-flex items-center justify-center font-semibold leading-none border border-border-strong border-b-2 bg-surface text-text tabular-nums ${sizes[size]} ${className}`}
    >
      {children}
    </kbd>
  );
};

export const KeyCombo: React.FC<{
  combination: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ combination, size = "sm", className = "" }) => {
  const parts = combination
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {parts.map((part, index) => (
        <React.Fragment key={`${part}-${index}`}>
          <Kbd size={size}>{part}</Kbd>
        </React.Fragment>
      ))}
    </span>
  );
};
