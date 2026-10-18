import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Open a menu upwards when there is not enough room below its trigger in the
 * window (and more room above).
 */
export const useDropDirection = (
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  menuHeight: number,
): "down" | "up" => {
  const [direction, setDirection] = useState<"down" | "up">("down");
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const above = rect.top;
    setDirection(below < menuHeight && above > below ? "up" : "down");
  }, [open, anchorRef, menuHeight]);
  return direction;
};
