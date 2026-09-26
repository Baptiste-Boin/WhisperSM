import React from "react";
import type { VendorId } from "@/lib/constants/modelCatalog";
import { VENDOR_NAMES } from "@/lib/constants/modelCatalog";
import openai from "@/assets/logos/openai.svg?raw";
import anthropic from "@/assets/logos/anthropic.svg?raw";
import gemini from "@/assets/logos/gemini-color.svg?raw";
import meta from "@/assets/logos/meta.svg?raw";
import mistral from "@/assets/logos/mistral-color.svg?raw";
import nvidia from "@/assets/logos/nvidia-color.svg?raw";
import deepgram from "@/assets/logos/deepgram.svg?raw";
import elevenlabs from "@/assets/logos/elevenlabs.svg?raw";
import cohere from "@/assets/logos/cohere-color.svg?raw";
import groq from "@/assets/logos/groq.svg?raw";
import zai from "@/assets/logos/zai.svg?raw";
import qwen from "@/assets/logos/qwen-color.svg?raw";
import cerebras from "@/assets/logos/cerebras-color.svg?raw";
import openrouter from "@/assets/logos/openrouter.svg?raw";
import apple from "@/assets/logos/apple.svg?raw";

interface VendorLogoProps {
  vendor: VendorId | string;
  size?: number;
  className?: string;
  /** Rounded square background like the reference app (default true). */
  tile?: boolean;
}

interface LogoStyle {
  /** Official SVG mark (monochrome marks use currentColor). */
  svg?: string;
  /** Hand-drawn fallback for organisations without a published mark. */
  glyph?: React.ReactNode;
  /** Tile background. */
  bg: string;
  /** Colour of monochrome marks. */
  fg: string;
  /** Mark size relative to the tile (default 0.62). */
  scale?: number;
}

/**
 * Tile colours follow Superwhisper's models library: dark tile for Whisper,
 * tan for Anthropic, white for Gemini, green for NVIDIA, and so on.
 */
const LOGOS: Record<string, LogoStyle> = {
  openai: { svg: openai, bg: "#3a3a3c", fg: "#ffffff" },
  anthropic: { svg: anthropic, bg: "#d4a27f", fg: "#141413" },
  google: { svg: gemini, bg: "#ffffff", fg: "#000000" },
  meta: { svg: meta, bg: "#0866ff", fg: "#ffffff" },
  mistral: { svg: mistral, bg: "#fff4e6", fg: "#000000", scale: 0.66 },
  nvidia: { svg: nvidia, bg: "#76b900", fg: "#ffffff", scale: 0.66 },
  deepgram: { svg: deepgram, bg: "#e3453b", fg: "#ffffff", scale: 0.58 },
  elevenlabs: { svg: elevenlabs, bg: "#ffffff", fg: "#000000" },
  cohere: { svg: cohere, bg: "#ffffff", fg: "#000000" },
  groq: { svg: groq, bg: "#f55036", fg: "#ffffff" },
  zai: { svg: zai, bg: "#000000", fg: "#ffffff" },
  alibaba: { svg: qwen, bg: "#ffffff", fg: "#000000" },
  cerebras: { svg: cerebras, bg: "#ffffff", fg: "#000000" },
  openrouter: { svg: openrouter, bg: "#1f1f2e", fg: "#ffffff" },
  apple: { svg: apple, bg: "#000000", fg: "#ffffff" },
  moonshine: {
    bg: "#111111",
    fg: "#ffd166",
    glyph: (
      <path
        fill="currentColor"
        d="M14.5 4.5a7.5 7.5 0 1 0 5 13 6 6 0 0 1-5-13Z"
      />
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
  whispersm: {
    bg: "#0a84ff",
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
    glyph: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m8 9-3 3 3 3M16 9l3 3-3 3M13.5 7l-3 10" />
      </g>
    ),
  },
};

/**
 * Normalise an official SVG for inline use: drop fixed sizes and inline
 * styles, and make marks without an explicit fill follow `currentColor`.
 */
const prepareSvg = (raw: string): string => {
  let svg = raw
    .replace(/<title>.*?<\/title>/s, "")
    .replace(/\s(width|height|style)="[^"]*"/g, "");
  const openTag = svg.match(/<svg[^>]*>/)?.[0] ?? "";
  if (!/\sfill="/.test(openTag)) {
    svg = svg.replace("<svg", '<svg fill="currentColor"');
  }
  return svg.replace(
    "<svg",
    '<svg width="100%" height="100%" aria-hidden="true"',
  );
};

const PREPARED = new Map<string, string>();
const preparedSvg = (key: string, raw: string) => {
  let value = PREPARED.get(key);
  if (!value) {
    value = prepareSvg(raw);
    PREPARED.set(key, value);
  }
  return value;
};

/**
 * Official logo of the organisation behind a model, on a rounded tile so
 * rows line up like Superwhisper's models library.
 */
export const VendorLogo: React.FC<VendorLogoProps> = ({
  vendor,
  size = 26,
  className = "",
  tile = true,
}) => {
  const key = LOGOS[vendor] ? vendor : "custom";
  const style = LOGOS[key];
  const label = VENDOR_NAMES[vendor as VendorId] ?? String(vendor);
  const markSize = size * (style.scale ?? 0.62);
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: tile ? Math.max(6, size * 0.26) : size,
        background: tile ? style.bg : "transparent",
        color: style.fg,
        boxShadow: tile ? "inset 0 0 0 0.5px rgba(0,0,0,0.12)" : undefined,
      }}
      title={label}
      aria-label={label}
      role="img"
    >
      {style.svg ? (
        <span
          className="block"
          style={{ width: markSize, height: markSize }}
          // Trusted, bundled brand assets (src/assets/logos).
          dangerouslySetInnerHTML={{ __html: preparedSvg(key, style.svg) }}
        />
      ) : (
        <svg
          viewBox="0 0 24 24"
          width={size * 0.72}
          height={size * 0.72}
          aria-hidden="true"
        >
          {style.glyph}
        </svg>
      )}
    </span>
  );
};

export default VendorLogo;
