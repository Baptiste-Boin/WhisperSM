import React from "react";
import type { LucideIcon } from "lucide-react";

export type TileColor =
  | "orange"
  | "blue"
  | "purple"
  | "gray"
  | "green"
  | "accent";

interface IconTileProps {
  icon: LucideIcon;
  color?: TileColor;
  size?: number;
  className?: string;
}

const COLORS: Record<TileColor, string> = {
  orange: "var(--color-tile-orange)",
  blue: "var(--color-tile-blue)",
  purple: "var(--color-tile-purple)",
  gray: "var(--color-tile-gray)",
  green: "var(--color-tile-green)",
  accent: "var(--color-accent)",
};

/**
 * Coloured rounded square with a white icon, like the sidebar entries of the
 * reference app.
 */
export const IconTile: React.FC<IconTileProps> = ({
  icon: Icon,
  color = "gray",
  size = 26,
  className = "",
}) => (
  <span
    className={`inline-flex items-center justify-center shrink-0 text-white ${className}`}
    style={{
      width: size,
      height: size,
      borderRadius: Math.max(6, size * 0.28),
      background: COLORS[color],
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
    }}
    aria-hidden="true"
  >
    <Icon width={size * 0.58} height={size * 0.58} strokeWidth={2.2} />
  </span>
);

export default IconTile;
