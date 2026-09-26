import React from "react";
import type { VendorId } from "@/lib/constants/modelCatalog";
import { VENDOR_NAMES } from "@/lib/constants/modelCatalog";

interface VendorLogoProps {
  vendor: VendorId | string;
  size?: number;
  className?: string;
  /** Rounded square background like the reference app (default true). */
  tile?: boolean;
}

interface Style {
  bg: string;
  fg: string;
  glyph: React.ReactNode;
}

const Letter: React.FC<{ children: string }> = ({ children }) => (
  <text
    x="12"
    y="16.5"
    textAnchor="middle"
    fontSize="13"
    fontWeight="700"
    fontFamily="Geist, ui-sans-serif, system-ui, sans-serif"
    fill="currentColor"
  >
    {children}
  </text>
);

/* Simplified, recognisable marks for each organisation. */
const STYLES: Record<string, Style> = {
  openai: {
    bg: "#10a37f",
    fg: "#ffffff",
    glyph: (
      <g fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 4.5a3.4 3.4 0 0 1 3.3 2.5l3 1.7a3.4 3.4 0 0 1 1.2 4.7l-.1 3.4a3.4 3.4 0 0 1-4.6 1.9l-2.8 1.7-2.8-1.7a3.4 3.4 0 0 1-4.6-1.9l-.1-3.4a3.4 3.4 0 0 1 1.2-4.7l3-1.7A3.4 3.4 0 0 1 12 4.5Z" />
        <path d="M12 8.8 15.2 10.6v3.6L12 16l-3.2-1.8v-3.6L12 8.8Z" />
      </g>
    ),
  },
  anthropic: {
    bg: "#d4a27f",
    fg: "#1f1a17",
    glyph: (
      <g fill="currentColor">
        <path d="M13.6 6h2.6l4.3 12h-2.6l-.9-2.6h-4.4l-.9 2.6h-2.5L13.6 6Zm.5 2.9-1.5 4.4h3.1l-1.6-4.4Z" />
        <path
          d="M6.6 6h2.6l3.5 9.4h-2.5L8 9l-2.2 6.4H3.3L6.6 6Z"
          opacity="0.85"
        />
      </g>
    ),
  },
  google: {
    bg: "#ffffff",
    fg: "#4285f4",
    glyph: (
      <g fill="none" strokeWidth="2.6" strokeLinecap="round">
        <path d="M18.5 12h-6" stroke="#4285f4" />
        <path d="M17.6 8.4A6.5 6.5 0 0 0 5.5 12" stroke="#ea4335" />
        <path d="M5.5 12a6.5 6.5 0 0 0 4.2 6.1" stroke="#fbbc05" />
        <path d="M9.7 18.1A6.5 6.5 0 0 0 18.5 12" stroke="#34a853" />
      </g>
    ),
  },
  meta: {
    bg: "#0866ff",
    fg: "#ffffff",
    glyph: (
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        d="M4.5 15.5c0-3.5 1.6-7.5 4-7.5s3.5 8 7 8c2 0 4-2.3 4-5.5s-1.7-4.5-3-4.5c-3 0-4.4 8-8.5 8C6 14 4.5 15.5 4.5 15.5"
      />
    ),
  },
  mistral: {
    bg: "#1a1a1a",
    fg: "#ff7000",
    glyph: (
      <g fill="currentColor">
        <rect x="4" y="5" width="3" height="3" />
        <rect x="17" y="5" width="3" height="3" />
        <rect x="4" y="8.5" width="6" height="3" fill="#ffa300" />
        <rect x="14" y="8.5" width="6" height="3" fill="#ffa300" />
        <rect x="4" y="12" width="16" height="3" fill="#ff8205" />
        <rect x="4" y="15.5" width="3" height="3" />
        <rect x="10.5" y="15.5" width="3" height="3" />
        <rect x="17" y="15.5" width="3" height="3" />
      </g>
    ),
  },
  nvidia: {
    bg: "#76b900",
    fg: "#0d1a00",
    glyph: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4.5 12c3-4 6-5.5 9.5-5.5S20 9 20 12s-2.5 5.5-6 5.5S7.5 16 4.5 12Z" />
        <circle cx="13.5" cy="12" r="2.2" />
      </g>
    ),
  },
  deepgram: {
    bg: "#13ef93",
    fg: "#0b1f17",
    glyph: (
      <path
        fill="currentColor"
        d="M7 5h5.5a7 7 0 0 1 0 14H7v-4h5.5a3 3 0 0 0 0-6H11v3H7V5Z"
      />
    ),
  },
  elevenlabs: {
    bg: "#000000",
    fg: "#ffffff",
    glyph: (
      <g fill="currentColor">
        <rect x="7" y="5" width="3.4" height="14" rx="0.6" />
        <rect x="13.6" y="5" width="3.4" height="14" rx="0.6" />
      </g>
    ),
  },
  cohere: {
    bg: "#ffffff",
    fg: "#39594d",
    glyph: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <path d="M17 8.5A6 6 0 1 0 17 15.5" />
        <path d="M14 12h5" stroke="#d18ee2" />
      </g>
    ),
  },
  groq: {
    bg: "#f55036",
    fg: "#ffffff",
    glyph: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="11" r="5" />
        <path d="M17 11v4.5a3.5 3.5 0 0 1-3.5 3.5H12" />
      </g>
    ),
  },
  zai: {
    bg: "#101010",
    fg: "#ffffff",
    glyph: (
      <path
        fill="currentColor"
        d="M6 6h12v2.6l-7.6 6.9H18V19H6v-2.6l7.6-6.9H6V6Z"
      />
    ),
  },
  alibaba: {
    bg: "#6f5bff",
    fg: "#ffffff",
    glyph: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      >
        <path d="M12 4.5 18.5 8v8L12 19.5 5.5 16V8L12 4.5Z" />
        <path d="M8.5 10.5 12 12.5l3.5-2M12 12.5v4" />
      </g>
    ),
  },
  sber: {
    bg: "#21a038",
    fg: "#ffffff",
    glyph: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M17.5 8.5A6.5 6.5 0 1 0 18.5 12" />
        <path d="M9.5 11.5 12.5 14l5-6" />
      </g>
    ),
  },
  moonshine: {
    bg: "#ffd166",
    fg: "#3a2a00",
    glyph: (
      <path
        fill="currentColor"
        d="M14.5 4.5a7.5 7.5 0 1 0 5 13 6 6 0 0 1-5-13Z"
      />
    ),
  },
  cerebras: {
    bg: "#f37021",
    fg: "#ffffff",
    glyph: (
      <g fill="currentColor">
        {[5, 9, 13, 17].map((x) =>
          [5, 9, 13, 17].map((y) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="2.4"
              height="2.4"
              rx="0.5"
            />
          )),
        )}
      </g>
    ),
  },
  openrouter: {
    bg: "#6467f2",
    fg: "#ffffff",
    glyph: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M4 8h4l3 4 3-4h4M4 16h4l3-4 3 4h4" />
        <path d="m16 6 3 2-3 2M16 14l3 2-3 2" />
      </g>
    ),
  },
  apple: {
    bg: "#1c1c1e",
    fg: "#ffffff",
    glyph: (
      <path
        fill="currentColor"
        d="M15.4 12.6c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.3-.1-2.4.7-3 .7-.7 0-1.6-.7-2.6-.7-1.4 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2 2.5 2s1.4-.6 2.6-.6 1.5.6 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.1-.8-2.1-3.1ZM13.4 6.6c.6-.7.9-1.6.8-2.6-.8 0-1.8.5-2.4 1.2-.5.6-1 1.6-.8 2.5.9.1 1.8-.4 2.4-1.1Z"
      />
    ),
  },
  whispersm: {
    bg: "#0a7aff",
    fg: "#ffffff",
    glyph: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      >
        <path d="M5 12v1M8.5 8.5v7M12 6v12M15.5 8.5v7M19 12v1" />
      </g>
    ),
  },
  custom: {
    bg: "#8e8e93",
    fg: "#ffffff",
    glyph: <Letter>?</Letter>,
  },
};

/**
 * Small logo of the organisation behind a model, drawn as a rounded tile so
 * rows line up like the reference models library.
 */
export const VendorLogo: React.FC<VendorLogoProps> = ({
  vendor,
  size = 26,
  className = "",
  tile = true,
}) => {
  const style = STYLES[vendor] ?? STYLES.custom;
  const label = VENDOR_NAMES[vendor as VendorId] ?? String(vendor);
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: tile ? Math.max(5, size * 0.28) : size,
        background: tile ? style.bg : "transparent",
        color: style.fg,
        boxShadow: tile ? "inset 0 0 0 1px rgba(0,0,0,0.08)" : undefined,
      }}
      title={label}
      aria-label={label}
      role="img"
    >
      <svg
        viewBox="0 0 24 24"
        width={size * 0.78}
        height={size * 0.78}
        aria-hidden="true"
      >
        {style.glyph}
      </svg>
    </span>
  );
};

export default VendorLogo;
