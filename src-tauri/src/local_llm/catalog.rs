//! Curated catalog of on-device language models.
//!
//! All models are instruction-tuned, 4-bit quantized GGUF files hosted on
//! Hugging Face. Sizes are rounded up from the exact file sizes so the UI
//! can show a realistic download estimate.

use serde::{Deserialize, Serialize};
use specta::Type;

/// Model architecture, used to pick the right candle implementation and
/// chat template.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocalLlmArch {
    Qwen2,
    Llama,
    /// Mistral 7B family: Llama weights layout with the `[INST]` chat template.
    Mistral,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LocalLlmModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Model family shown as a badge (e.g. "Qwen 2.5").
    pub family: String,
    /// Parameter count label (e.g. "1.5B").
    pub parameters: String,
    /// Quantization label (e.g. "Q4_K_M").
    pub quantization: String,
    pub arch: LocalLlmArch,
    pub model_url: String,
    pub tokenizer_url: String,
    /// Approximate download size in megabytes (model + tokenizer).
    pub size_mb: u64,
    /// Recommended minimum RAM in gigabytes.
    pub min_ram_gb: u32,
    /// 0.0 - 1.0, higher is better output quality.
    pub quality_score: f32,
    /// 0.0 - 1.0, higher is faster.
    pub speed_score: f32,
    /// Whether the model handles languages other than English well.
    pub multilingual: bool,
    pub is_recommended: bool,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u64,
}

fn entry(
    id: &str,
    name: &str,
    description: &str,
    family: &str,
    parameters: &str,
    arch: LocalLlmArch,
    model_url: &str,
    tokenizer_url: &str,
    size_mb: u64,
    min_ram_gb: u32,
    quality_score: f32,
    speed_score: f32,
    multilingual: bool,
    is_recommended: bool,
) -> LocalLlmModelInfo {
    LocalLlmModelInfo {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        family: family.to_string(),
        parameters: parameters.to_string(),
        quantization: "Q4_K_M".to_string(),
        arch,
        model_url: model_url.to_string(),
        tokenizer_url: tokenizer_url.to_string(),
        size_mb,
        min_ram_gb,
        quality_score,
        speed_score,
        multilingual,
        is_recommended,
        is_downloaded: false,
        is_downloading: false,
        partial_size: 0,
    }
}

/// The built-in catalog, in display order.
pub fn catalog() -> Vec<LocalLlmModelInfo> {
    vec![
        entry(
            "qwen2.5-0.5b-instruct",
            "Qwen 2.5 Nano",
            "Tiny and instant. Good for punctuation and basic cleanup.",
            "Qwen 2.5",
            "0.5B",
            LocalLlmArch::Qwen2,
            "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
            "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct/resolve/main/tokenizer.json",
            476,
            4,
            0.45,
            0.98,
            true,
            false,
        ),
        entry(
            "qwen2.5-1.5b-instruct",
            "Qwen 2.5 Standard",
            "Best balance of quality and speed. Multilingual, great for French and English.",
            "Qwen 2.5",
            "1.5B",
            LocalLlmArch::Qwen2,
            "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf",
            "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/resolve/main/tokenizer.json",
            1073,
            8,
            0.7,
            0.85,
            true,
            true,
        ),
        entry(
            "qwen2.5-3b-instruct",
            "Qwen 2.5 Pro",
            "Higher quality rewrites and formatting. Needs a recent machine.",
            "Qwen 2.5",
            "3B",
            LocalLlmArch::Qwen2,
            "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
            "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/resolve/main/tokenizer.json",
            2015,
            16,
            0.85,
            0.6,
            true,
            false,
        ),
        entry(
            "llama-3.2-1b-instruct",
            "Llama 3.2 Light",
            "Meta's compact model. Fast, English-first.",
            "Llama 3.2",
            "1B",
            LocalLlmArch::Llama,
            "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Llama-3.2-1B-Instruct/resolve/main/tokenizer.json",
            787,
            8,
            0.6,
            0.9,
            false,
            false,
        ),
        entry(
            "llama-3.2-3b-instruct",
            "Llama 3.2 Pro",
            "Meta's 3B model. Strong instruction following, English-first.",
            "Llama 3.2",
            "3B",
            LocalLlmArch::Llama,
            "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Llama-3.2-3B-Instruct/resolve/main/tokenizer.json",
            1943,
            16,
            0.82,
            0.6,
            false,
            false,
        ),
        entry(
            "llama-3.1-8b-instruct",
            "Llama 3.1 8B",
            "Meta's 8B model. Excellent rewrites in many languages. Needs 16 GB RAM.",
            "Llama 3.1",
            "8B",
            LocalLlmArch::Llama,
            "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/Meta-Llama-3.1-8B-Instruct/resolve/main/tokenizer.json",
            4700,
            16,
            0.9,
            0.35,
            true,
            false,
        ),
        entry(
            "mistral-7b-instruct-v0.3",
            "Mistral 7B v0.3",
            "Mistral AI's open 7B model. Great for French and English. Needs 16 GB RAM.",
            "Mistral",
            "7B",
            LocalLlmArch::Mistral,
            "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf",
            "https://huggingface.co/unsloth/mistral-7b-instruct-v0.3/resolve/main/tokenizer.json",
            4170,
            16,
            0.88,
            0.4,
            true,
            false,
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_are_unique_and_have_one_recommendation() {
        let models = catalog();
        let mut ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        let len = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), len);
        assert_eq!(models.iter().filter(|m| m.is_recommended).count(), 1);
    }

    #[test]
    fn catalog_urls_point_to_hugging_face() {
        for model in catalog() {
            assert!(model.model_url.starts_with("https://huggingface.co/"));
            assert!(model.tokenizer_url.starts_with("https://huggingface.co/"));
            assert!(model.model_url.ends_with(".gguf"));
            assert!(model.tokenizer_url.ends_with("tokenizer.json"));
        }
    }
}
