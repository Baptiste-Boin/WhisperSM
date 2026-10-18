/**
 * Catalog of cloud language models shown in the Models library.
 *
 * Mirrors the reference app's language models (Anthropic, OpenAI, Google,
 * Groq and its legacy list), plus providers with a free tier. The user brings
 * their own API key. Voice models and on-device language models come from the backend
 * (`get_available_models` / `get_local_llm_models`); this file only describes
 * the cloud language models that can be attached to a mode.
 */

export type VendorId =
  | "openai"
  | "anthropic"
  | "google"
  | "meta"
  | "mistral"
  | "nvidia"
  | "deepgram"
  | "elevenlabs"
  | "cohere"
  | "groq"
  | "zai"
  | "alibaba"
  | "sber"
  | "moonshine"
  | "cerebras"
  | "xai"
  | "openrouter"
  | "apple"
  | "whispersm"
  | "custom";

export interface CloudLlmCatalogEntry {
  /** Stable catalog id (used for favourites and row keys). */
  id: string;
  /** Provider id from `post_process_providers`. */
  providerId: string;
  /** Model identifier sent to the provider. */
  model: string;
  /** Display name. */
  name: string;
  vendor: VendorId;
  /** 0..1, higher is faster. */
  speed: number;
  /** 0..1, higher is better output quality. */
  accuracy: number;
  badge?: "new" | "en";
  /** Short description shown in the details tooltip. */
  description: string;
  /** Listed under "Popular" in the mode editor's model picker. */
  popular?: boolean;
  /** Superseded model, listed under "Older models". */
  legacy?: boolean;
}

const llm = (
  id: string,
  providerId: string,
  model: string,
  name: string,
  vendor: VendorId,
  speed: number,
  accuracy: number,
  description: string,
  extra: Pick<CloudLlmCatalogEntry, "badge" | "popular" | "legacy"> = {},
): CloudLlmCatalogEntry => ({
  id,
  providerId,
  model,
  name,
  vendor,
  speed,
  accuracy,
  description,
  ...extra,
});

export const CLOUD_LLM_CATALOG: CloudLlmCatalogEntry[] = [
  // Anthropic
  llm(
    "claude-sonnet-5",
    "anthropic",
    "claude-sonnet-5",
    "Sonnet 5",
    "anthropic",
    0.9,
    1,
    "Anthropic's latest Sonnet. Best for heavy rewriting.",
    { popular: true },
  ),
  llm(
    "claude-sonnet-4.6",
    "anthropic",
    "claude-sonnet-4-6",
    "Sonnet 4.6",
    "anthropic",
    0.9,
    0.95,
    "Fast, high-quality Claude model.",
  ),
  llm(
    "claude-sonnet-4.5",
    "anthropic",
    "claude-sonnet-4-5",
    "Sonnet 4.5",
    "anthropic",
    0.8,
    0.95,
    "Reliable Claude model for formatting and rewriting.",
    { popular: true },
  ),
  llm(
    "claude-haiku-4.5",
    "anthropic",
    "claude-haiku-4-5",
    "Haiku 4.5",
    "anthropic",
    0.9,
    0.85,
    "Anthropic's fastest model. Great for quick cleanups.",
    { popular: true },
  ),
  // OpenAI
  llm(
    "gpt-5.6-luna",
    "openai",
    "gpt-5.6-luna",
    "GPT-5.6 Luna",
    "openai",
    1,
    0.9,
    "OpenAI's fastest GPT-5.6 tier.",
    { badge: "new" },
  ),
  llm(
    "gpt-5.4-mini",
    "openai",
    "gpt-5.4-mini",
    "GPT-5.4 mini",
    "openai",
    1,
    0.85,
    "Small, fast GPT-5.4.",
  ),
  llm(
    "gpt-5.4-nano",
    "openai",
    "gpt-5.4-nano",
    "GPT-5.4 nano",
    "openai",
    1,
    0.8,
    "Smallest GPT-5.4. Very low latency.",
  ),
  llm(
    "gpt-5.2",
    "openai",
    "gpt-5.2",
    "GPT-5.2",
    "openai",
    0.9,
    0.95,
    "Capable GPT-5 model for heavy rewriting.",
  ),
  llm(
    "gpt-5.1",
    "openai",
    "gpt-5.1",
    "GPT-5.1",
    "openai",
    0.7,
    0.95,
    "Strong general GPT-5 model.",
    { popular: true },
  ),
  llm(
    "gpt-5",
    "openai",
    "gpt-5",
    "GPT-5",
    "openai",
    0.7,
    0.95,
    "OpenAI's GPT-5.",
    { popular: true },
  ),
  llm(
    "gpt-5-mini",
    "openai",
    "gpt-5-mini",
    "GPT-5 mini",
    "openai",
    0.8,
    0.85,
    "Faster, cheaper GPT-5.",
    { popular: true },
  ),
  llm(
    "gpt-5-nano",
    "openai",
    "gpt-5-nano",
    "GPT-5 nano",
    "openai",
    0.9,
    0.75,
    "Smallest GPT-5. Quick cleanups.",
    { popular: true },
  ),
  // Google AI Studio — Flash models are free (rate limited)
  llm(
    "gemini-3.7-flash",
    "gemini",
    "gemini-3.7-flash",
    "Gemini 3.7 Flash",
    "google",
    0.9,
    0.9,
    "Latest Gemini Flash. Free tier on AI Studio.",
    { badge: "new", popular: true },
  ),
  llm(
    "gemini-3.5-flash-lite",
    "gemini",
    "gemini-3.5-flash-lite",
    "Gemini 3.5 Flash Lite",
    "google",
    1,
    0.8,
    "Lightest and fastest Gemini. Free tier on AI Studio.",
  ),
  llm(
    "gemini-3-flash",
    "gemini",
    "gemini-3-flash-preview",
    "Gemini 3.0 Flash",
    "google",
    0.9,
    0.85,
    "Google's fast general model. Free tier on AI Studio.",
  ),
  // Groq — free tier
  llm(
    "groq-llama-3.1-8b",
    "groq",
    "llama-3.1-8b-instant",
    "Llama 3.1 8B",
    "meta",
    1,
    0.7,
    "Meta's Llama 3.1 on Groq's LPU hardware. Free tier.",
    { popular: true },
  ),
  llm(
    "groq-gpt-oss-20b",
    "groq",
    "openai/gpt-oss-20b",
    "GPT-OSS 20B",
    "openai",
    0.95,
    0.85,
    "OpenAI's open-weight model served by Groq. Free tier.",
  ),
  llm(
    "groq-gpt-oss-120b",
    "groq",
    "openai/gpt-oss-120b",
    "GPT-OSS 120B",
    "openai",
    0.9,
    0.92,
    "OpenAI's large open-weight model served by Groq. Free tier.",
  ),
  llm(
    "groq-qwen3.6-27b",
    "groq",
    "qwen/qwen3.6-27b",
    "Qwen 3.6 27B",
    "alibaba",
    0.9,
    0.88,
    "Alibaba's multilingual model served by Groq. Free tier.",
  ),
  // Mistral — free Experiment plan
  llm(
    "mistral-small",
    "mistral",
    "mistral-small-latest",
    "Mistral Small",
    "mistral",
    0.9,
    0.82,
    "Fast and multilingual, excellent in French. Free Experiment plan.",
  ),
  llm(
    "mistral-medium",
    "mistral",
    "mistral-medium-latest",
    "Mistral Medium",
    "mistral",
    0.8,
    0.88,
    "Balanced Mistral model. Free Experiment plan.",
  ),
  llm(
    "mistral-large",
    "mistral",
    "mistral-large-latest",
    "Mistral Large",
    "mistral",
    0.7,
    0.93,
    "Mistral's most capable model. Free Experiment plan.",
  ),
  llm(
    "ministral-8b",
    "mistral",
    "ministral-8b-latest",
    "Ministral 8B",
    "mistral",
    0.95,
    0.78,
    "Small, very fast Mistral model. Free Experiment plan.",
  ),
  // Z.AI — GLM Flash models are free
  llm(
    "zai-glm-4.7-flash",
    "zai",
    "glm-4.7-flash",
    "GLM-4.7 Flash",
    "zai",
    0.9,
    0.85,
    "Z.AI's free Flash model.",
  ),
  llm(
    "zai-glm-4.5-flash",
    "zai",
    "glm-4.5-flash",
    "GLM-4.5 Flash",
    "zai",
    0.9,
    0.8,
    "Z.AI's free Flash model, previous generation.",
  ),
  // Cerebras — free trial credits
  llm(
    "cerebras-llama-3.3-70b",
    "cerebras",
    "llama-3.3-70b",
    "Llama 3.3 70B",
    "meta",
    0.95,
    0.9,
    "Meta's Llama 3.3 at Cerebras speed. Free trial credits.",
  ),
  // Legacy models: still callable, marked as deprecated like the reference app
  llm(
    "gpt-4.1",
    "openai",
    "gpt-4.1",
    "GPT-4.1",
    "openai",
    0.8,
    0.85,
    "Deprecated. Use a current GPT model instead.",
    { legacy: true },
  ),
  llm(
    "gpt-4.1-mini",
    "openai",
    "gpt-4.1-mini",
    "GPT-4.1 mini",
    "openai",
    0.9,
    0.75,
    "Deprecated. Use a current GPT model instead.",
    { legacy: true },
  ),
  llm(
    "gpt-4.1-nano",
    "openai",
    "gpt-4.1-nano",
    "GPT-4.1 nano",
    "openai",
    1,
    0.65,
    "Deprecated. Use a current GPT model instead.",
    { legacy: true },
  ),
  llm(
    "gpt-4o",
    "openai",
    "gpt-4o",
    "GPT-4o",
    "openai",
    0.8,
    0.8,
    "Deprecated. Use a current GPT model instead.",
    { legacy: true },
  ),
  llm(
    "gpt-4o-mini",
    "openai",
    "gpt-4o-mini",
    "GPT-4o mini",
    "openai",
    0.9,
    0.7,
    "Deprecated. Use a current GPT model instead.",
    { legacy: true },
  ),
  llm(
    "gpt-3.5-turbo",
    "openai",
    "gpt-3.5-turbo",
    "GPT-3.5 Turbo",
    "openai",
    0.9,
    0.5,
    "Deprecated. Use a current GPT model instead.",
    { legacy: true },
  ),
  llm(
    "gpt-5.3-instant",
    "openai",
    "gpt-5.3-chat-latest",
    "GPT-5.3 Instant",
    "openai",
    0.9,
    0.85,
    "Deprecated. Use a current GPT model instead.",
    { legacy: true },
  ),
  llm(
    "claude-sonnet-4",
    "anthropic",
    "claude-sonnet-4-0",
    "Sonnet 4",
    "anthropic",
    0.8,
    0.9,
    "Deprecated. Use a current Claude model instead.",
    { legacy: true },
  ),
  llm(
    "gemini-3.1-flash-lite",
    "gemini",
    "gemini-3.1-flash-lite",
    "Gemini 3.1 Flash Lite",
    "google",
    1,
    0.7,
    "Deprecated. Use a current Gemini model instead.",
    { legacy: true },
  ),
  llm(
    "grok-4.1-fast",
    "xai",
    "grok-4-1-fast-non-reasoning",
    "Grok 4.1 Fast",
    "xai",
    0.9,
    0.8,
    "Deprecated. xAI's fast Grok model.",
    { legacy: true },
  ),
];

/** Rough capability metadata per vendor, for logos and grouping. */
export const VENDOR_NAMES: Record<VendorId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral AI",
  nvidia: "NVIDIA",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  cohere: "Cohere",
  groq: "Groq",
  zai: "Z.AI",
  alibaba: "Alibaba (Qwen)",
  sber: "Sber",
  moonshine: "Moonshine AI",
  cerebras: "Cerebras",
  xai: "xAI",
  openrouter: "OpenRouter",
  apple: "Apple",
  whispersm: "WhisperSM",
  custom: "Custom",
};

/** Vendor of an on-device language model, derived from its family label. */
export const localLlmVendor = (family: string): VendorId => {
  const f = family.toLowerCase();
  if (f.includes("qwen")) return "alibaba";
  if (f.includes("llama")) return "meta";
  if (f.includes("mistral") || f.includes("ministral")) return "mistral";
  return "whispersm";
};

/** Vendor of a post-process provider (for logos next to modes). */
export const providerVendor = (providerId: string): VendorId => {
  switch (providerId) {
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "gemini":
      return "google";
    case "mistral":
      return "mistral";
    case "groq":
      return "groq";
    case "zai":
      return "zai";
    case "cerebras":
      return "cerebras";
    case "xai":
      return "xai";
    case "openrouter":
      return "openrouter";
    case "deepgram":
      return "deepgram";
    case "elevenlabs":
      return "elevenlabs";
    case "cohere":
      return "cohere";
    case "apple_intelligence":
      return "apple";
    case "local":
      return "whispersm";
    default:
      return "custom";
  }
};

/**
 * Speech models that are older or superseded; the library hides them behind
 * "Older models" so the main list stays short.
 */
export const OLDER_SPEECH_MODEL_IDS = new Set<string>([
  "moonshine-base",
  "moonshine-tiny-streaming-en",
  "moonshine-small-streaming-en",
  "breeze-asr",
  "groq-whisper-large-v3",
  "canary-180m-flash",
]);
