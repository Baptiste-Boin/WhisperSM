/**
 * Catalog of cloud language models shown in the Models library.
 *
 * Only providers with a free tier are listed (the user brings their own API
 * key). Voice models and on-device language models come from the backend
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
}

export const CLOUD_LLM_CATALOG: CloudLlmCatalogEntry[] = [
  // Google AI Studio — Flash models are free (rate limited)
  {
    id: "gemini-3-flash",
    providerId: "gemini",
    model: "gemini-3-flash-preview",
    name: "Gemini 3.0 Flash",
    vendor: "google",
    speed: 0.85,
    accuracy: 0.85,
    description: "Google's fast general model. Free tier on AI Studio.",
  },
  {
    id: "gemini-3.5-flash-lite",
    providerId: "gemini",
    model: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    vendor: "google",
    speed: 0.95,
    accuracy: 0.8,
    description: "Lightest and fastest Gemini. Free tier on AI Studio.",
  },
  {
    id: "gemini-3.7-flash",
    providerId: "gemini",
    model: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    vendor: "google",
    speed: 0.85,
    accuracy: 0.9,
    badge: "new",
    description: "Latest Gemini Flash. Free tier on AI Studio.",
  },
  // Mistral — free Experiment plan
  {
    id: "mistral-small",
    providerId: "mistral",
    model: "mistral-small-latest",
    name: "Mistral Small",
    vendor: "mistral",
    speed: 0.9,
    accuracy: 0.82,
    description:
      "Fast and multilingual, excellent in French. Free Experiment plan.",
  },
  {
    id: "mistral-medium",
    providerId: "mistral",
    model: "mistral-medium-latest",
    name: "Mistral Medium",
    vendor: "mistral",
    speed: 0.8,
    accuracy: 0.88,
    description: "Balanced Mistral model. Free Experiment plan.",
  },
  {
    id: "mistral-large",
    providerId: "mistral",
    model: "mistral-large-latest",
    name: "Mistral Large",
    vendor: "mistral",
    speed: 0.7,
    accuracy: 0.93,
    description: "Mistral's most capable model. Free Experiment plan.",
  },
  {
    id: "ministral-8b",
    providerId: "mistral",
    model: "ministral-8b-latest",
    name: "Ministral 8B",
    vendor: "mistral",
    speed: 0.95,
    accuracy: 0.78,
    description: "Small, very fast Mistral model. Free Experiment plan.",
  },
  // Groq — free tier
  {
    id: "groq-gpt-oss-20b",
    providerId: "groq",
    model: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    vendor: "openai",
    speed: 0.95,
    accuracy: 0.85,
    description: "OpenAI's open-weight model served by Groq. Free tier.",
  },
  {
    id: "groq-gpt-oss-120b",
    providerId: "groq",
    model: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    vendor: "openai",
    speed: 0.9,
    accuracy: 0.92,
    description: "OpenAI's large open-weight model served by Groq. Free tier.",
  },
  {
    id: "groq-qwen3.6-27b",
    providerId: "groq",
    model: "qwen/qwen3.6-27b",
    name: "Qwen 3.6 27B",
    vendor: "alibaba",
    speed: 0.9,
    accuracy: 0.88,
    description: "Alibaba's multilingual model served by Groq. Free tier.",
  },
  // Z.AI — GLM Flash models are free
  {
    id: "zai-glm-4.7-flash",
    providerId: "zai",
    model: "glm-4.7-flash",
    name: "GLM-4.7 Flash",
    vendor: "zai",
    speed: 0.9,
    accuracy: 0.85,
    badge: "new",
    description: "Z.AI's free Flash model.",
  },
  {
    id: "zai-glm-4.5-flash",
    providerId: "zai",
    model: "glm-4.5-flash",
    name: "GLM-4.5 Flash",
    vendor: "zai",
    speed: 0.9,
    accuracy: 0.8,
    description: "Z.AI's free Flash model, previous generation.",
  },
  // Cerebras — free trial credits
  {
    id: "cerebras-llama-3.3-70b",
    providerId: "cerebras",
    model: "llama-3.3-70b",
    name: "Llama 3.3 70B",
    vendor: "meta",
    speed: 0.95,
    accuracy: 0.9,
    description: "Meta's Llama 3.3 at Cerebras speed. Free trial credits.",
  },
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
  "tiny",
  "tiny.en",
  "base",
  "base.en",
  "small",
  "small.en",
  "medium",
  "medium.en",
  "moonshine-base",
  "moonshine-tiny-streaming-en",
  "moonshine-small-streaming-en",
  "breeze-asr",
  "groq-whisper-large-v3",
  "deepgram-nova-2",
  "canary-180m-flash",
]);
