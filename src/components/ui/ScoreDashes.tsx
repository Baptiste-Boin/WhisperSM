import React from "react";

interface ScoreDashesProps {
  /** 0..1 */
  value: number;
  /** Number of dashes (default 5). */
  segments?: number;
  className?: string;
  title?: string;
}

/**
 * The "Speed / Accuracy" indicator of the models library: a row of short
 * dashes, filled proportionally to the score.
 */
export const ScoreDashes: React.FC<ScoreDashesProps> = ({
  value,
  segments = 5,
  className = "",
  title,
}) => {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * segments);
  return (
    <span
      className={`inline-flex items-center gap-[3px] ${className}`}
      title={title}
      aria-label={title}
      role="img"
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] w-[13px] rounded-full ${
            i < filled ? "bg-text/55" : "bg-text/15"
          }`}
        />
      ))}
    </span>
  );
};

/** Two stacked dash rows: speed on top, accuracy below. */
export const SpeedAccuracy: React.FC<{
  speed: number;
  accuracy: number;
  speedLabel: string;
  accuracyLabel: string;
  className?: string;
}> = ({ speed, accuracy, speedLabel, accuracyLabel, className = "" }) => (
  <span className={`inline-flex flex-col gap-[5px] ${className}`}>
    <ScoreDashes
      value={speed}
      title={`${speedLabel}: ${Math.round(speed * 100)}%`}
    />
    <ScoreDashes
      value={accuracy}
      title={`${accuracyLabel}: ${Math.round(accuracy * 100)}%`}
    />
  </span>
);

export default ScoreDashes;
