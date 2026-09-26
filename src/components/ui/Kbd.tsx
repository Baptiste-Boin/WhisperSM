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
      className={`inline-flex items-center justify-center font-medium leading-none bg-surface-3/80 text-text tabular-nums ${sizes[size]} ${className}`}
    >
      {children}
    </kbd>
  );
};

/** Key names shown as macOS symbols, like the system keyboard-shortcut UI. */
const MAC_KEY_SYMBOLS: Record<string, string> = {
  option: "⌥",
  alt: "⌥",
  shift: "⇧",
  command: "⌘",
  cmd: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  control: "⌃",
  enter: "⏎",
  return: "⏎",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  escape: "esc",
  esc: "esc",
  space: "␣",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

const isMacPlatform = () =>
  typeof document !== "undefined" &&
  document.documentElement.dataset.platform === "macos";

/** Display label for one key: symbols on macOS, text elsewhere. */
export const keyLabel = (part: string): string => {
  if (!isMacPlatform()) return part;
  // "Left Option" / "Right Shift" keep their side but use the symbol.
  const match = part.match(/^(Left|Right) (.+)$/);
  const base = (match ? match[2] : part).toLowerCase();
  const symbol = MAC_KEY_SYMBOLS[base];
  if (!symbol) return part;
  return match ? `${match[1][0]}${symbol}` : symbol;
};

export const KeyCombo: React.FC<{
  combination: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}> = ({ combination, size = "sm", className = "" }) => {
  // formatKeyCombination joins parts with " + "; splitting on the spaced
  // separator keeps a literal "+" key intact.
  const parts = combination
    .split(" + ")
    .map((p) => keyLabel(p.trim()))
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
