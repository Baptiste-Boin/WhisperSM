import React from "react";

interface MarkProps {
  size?: number;
  className?: string;
  rounded?: boolean;
}

/**
 * The WhisperSM app mark: a gradient tile with a waveform.
 */
export const WhisperSMMark: React.FC<MarkProps> = ({
  size = 32,
  className = "",
  rounded = true,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="wsm-mark-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#7C6BFF" />
        <stop offset="55%" stopColor="#5B5BF3" />
        <stop offset="100%" stopColor="#2E8BFF" />
      </linearGradient>
    </defs>
    <rect
      width="64"
      height="64"
      rx={rounded ? 14.5 : 0}
      fill="url(#wsm-mark-bg)"
    />
    <g fill="#ffffff">
      <rect x="12.3" y="28.3" width="4.5" height="7.5" rx="2.25" />
      <rect x="19.8" y="22.3" width="4.5" height="19.5" rx="2.25" />
      <rect x="27.3" y="15.5" width="4.5" height="33" rx="2.25" />
      <rect x="34.8" y="19.8" width="4.5" height="24.5" rx="2.25" />
      <rect x="42.3" y="25.3" width="4.5" height="13.5" rx="2.25" />
      <rect x="49.8" y="29.4" width="4.5" height="5.3" rx="2.25" />
    </g>
  </svg>
);

const WORDMARK_PREFIX = "Whisper";
const WORDMARK_SUFFIX = "SM";

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

/**
 * Mark + wordmark lockup used in the sidebar and onboarding.
 */
const WhisperSMLogo: React.FC<LogoProps> = ({
  size = 28,
  className = "",
  showWordmark = true,
}) => (
  <div className={`inline-flex items-center gap-2.5 ${className}`}>
    <WhisperSMMark size={size} />
    {showWordmark && (
      <span
        className="font-semibold tracking-tight text-text"
        style={{ fontSize: size * 0.62 }}
      >
        {WORDMARK_PREFIX}
        <span className="wsm-gradient-text">{WORDMARK_SUFFIX}</span>
      </span>
    )}
  </div>
);

export default WhisperSMLogo;
