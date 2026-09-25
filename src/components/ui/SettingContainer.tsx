import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";

interface SettingContainerProps {
  title: string;
  description: string;
  children: React.ReactNode;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  tooltipPosition?: "top" | "bottom";
}

const InfoTip: React.FC<{
  description: string;
  position: "top" | "bottom";
}> = ({ description, position }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    if (showTooltip) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTooltip]);

  return (
    <div
      ref={tooltipRef}
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((v) => !v)}
    >
      <Info
        className="w-3.5 h-3.5 text-text-muted/70 cursor-help hover:text-accent transition-colors duration-150 select-none"
        aria-label="More information"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowTooltip((v) => !v);
          }
        }}
      />
      {showTooltip && (
        <Tooltip targetRef={tooltipRef} position={position}>
          <p className="text-sm text-center leading-relaxed">{description}</p>
        </Tooltip>
      )}
    </div>
  );
};

export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  descriptionMode = "tooltip",
  grouped = false,
  layout = "horizontal",
  disabled = false,
  tooltipPosition = "top",
}) => {
  const frame = grouped ? "" : "wsm-card";
  const titleClasses = `text-sm font-medium text-text ${disabled ? "opacity-50" : ""}`;
  const descClasses = `text-xs text-text-muted mt-0.5 leading-relaxed ${disabled ? "opacity-50" : ""}`;

  if (layout === "stacked") {
    return (
      <div className={`px-4 py-3 ${frame}`}>
        <div className="mb-2.5">
          <div className="flex items-center gap-1.5">
            <h3 className={titleClasses}>{title}</h3>
            {descriptionMode === "tooltip" && (
              <InfoTip description={description} position={tooltipPosition} />
            )}
          </div>
          {descriptionMode === "inline" && (
            <p className={descClasses}>{description}</p>
          )}
        </div>
        <div className="w-full">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-2.5 min-h-[52px] ${frame}`}
    >
      <div className="min-w-0 max-w-[62%]">
        <div className="flex items-center gap-1.5">
          <h3 className={titleClasses}>{title}</h3>
          {descriptionMode === "tooltip" && (
            <InfoTip description={description} position={tooltipPosition} />
          )}
        </div>
        {descriptionMode === "inline" && (
          <p className={descClasses}>{description}</p>
        )}
      </div>
      <div className="relative shrink-0 flex items-center">{children}</div>
    </div>
  );
};
