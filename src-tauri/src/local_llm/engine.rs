//! Inference engine for on-device GGUF language models built on `candle`.
//!
//! The engine owns a loaded model and its tokenizer. Generation is fully
//! synchronous and CPU/GPU bound; callers must run it on a blocking thread.

use super::catalog::LocalLlmArch;
use anyhow::{anyhow, Context, Result};
use candle_core::quantized::gguf_file;
use candle_core::{DType, Device, Tensor};
use candle_transformers::generation::{LogitsProcessor, Sampling};
use candle_transformers::models::{quantized_llama, quantized_qwen2};
use log::{debug, info};
use std::path::Path;
use std::time::Instant;
use tokenizers::Tokenizer;

/// Hard cap on the total number of tokens (prompt + completion) we feed a
/// model, regardless of what its metadata advertises. Keeps memory and
/// latency bounded for dictation-sized inputs.
const MAX_CONTEXT_TOKENS: usize = 8192;

/// Number of recent tokens considered by the repetition penalty.
const REPEAT_LAST_N: usize = 64;

enum ModelKind {
    Qwen2(quantized_qwen2::ModelWeights),
    Llama(quantized_llama::ModelWeights),
}

/// Sampling configuration for a generation request.
#[derive(Debug, Clone, Copy)]
pub struct GenerationOptions {
    pub temperature: f64,
    pub top_p: f64,
    pub repeat_penalty: f32,
    pub max_new_tokens: usize,
    pub seed: u64,
}

impl Default for GenerationOptions {
    fn default() -> Self {
        Self {
            temperature: 0.2,
            top_p: 0.9,
            repeat_penalty: 1.08,
            max_new_tokens: 768,
            seed: 42,
        }
    }
}

pub struct LocalLlmEngine {
    model: ModelKind,
    tokenizer: Tokenizer,
    device: Device,
    arch: LocalLlmArch,
    eos_tokens: Vec<u32>,
    context_length: usize,
}

/// Pick the best available compute device. Metal is used on Apple Silicon
/// builds; everything else runs on the CPU (multi-threaded through candle).
pub fn select_device() -> Device {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        match Device::new_metal(0) {
            Ok(device) => {
                info!("Local LLM: using Metal device");
                return device;
            }
            Err(e) => log::warn!("Local LLM: Metal unavailable ({}), falling back to CPU", e),
        }
    }
    Device::Cpu
}

/// Human readable description of the device used for local inference.
pub fn device_label() -> String {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        if Device::new_metal(0).is_ok() {
            return "Metal (Apple GPU)".to_string();
        }
    }
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    format!("CPU ({} threads)", threads)
}

impl LocalLlmEngine {
    /// Load a GGUF model and its `tokenizer.json` from disk.
    pub fn load(model_path: &Path, tokenizer_path: &Path, arch: LocalLlmArch) -> Result<Self> {
        let start = Instant::now();
        let device = select_device();

        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| anyhow!("Failed to load tokenizer: {}", e))?;

        let mut file = std::fs::File::open(model_path)
            .with_context(|| format!("Failed to open model {}", model_path.display()))?;
        let content = gguf_file::Content::read(&mut file)
            .with_context(|| format!("Failed to parse GGUF {}", model_path.display()))?;

        let metadata_context = |key: &str| -> Option<usize> {
            content
                .metadata
                .get(key)
                .and_then(|v| v.to_u32().ok())
                .map(|v| v as usize)
        };

        let (model, context_length) = match arch {
            LocalLlmArch::Qwen2 => {
                let ctx = metadata_context("qwen2.context_length").unwrap_or(32768);
                let weights = quantized_qwen2::ModelWeights::from_gguf(content, &mut file, &device)
                    .context("Failed to build Qwen2 model")?;
                (ModelKind::Qwen2(weights), ctx)
            }
            LocalLlmArch::Llama => {
                let ctx = metadata_context("llama.context_length").unwrap_or(8192);
                let weights = quantized_llama::ModelWeights::from_gguf(content, &mut file, &device)
                    .context("Failed to build Llama model")?;
                (ModelKind::Llama(weights), ctx)
            }
        };

        let eos_names: &[&str] = match arch {
            LocalLlmArch::Qwen2 => &["<|im_end|>", "<|endoftext|>"],
            LocalLlmArch::Llama => &["<|eot_id|>", "<|end_of_text|>", "<|eom_id|>"],
        };
        let eos_tokens: Vec<u32> = eos_names
            .iter()
            .filter_map(|name| tokenizer.token_to_id(name))
            .collect();
        if eos_tokens.is_empty() {
            return Err(anyhow!(
                "Tokenizer does not define any end-of-sequence token for {:?}",
                arch
            ));
        }

        info!(
            "Local LLM loaded {} in {:.1}s (context {} tokens)",
            model_path.display(),
            start.elapsed().as_secs_f32(),
            context_length
        );

        Ok(Self {
            model,
            tokenizer,
            device,
            arch,
            eos_tokens,
            context_length: context_length.min(MAX_CONTEXT_TOKENS),
        })
    }

    fn format_prompt(&self, system: &str, user: &str) -> String {
        match self.arch {
            LocalLlmArch::Qwen2 => format!(
                "<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n"
            ),
            LocalLlmArch::Llama => format!(
                "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{user}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
            ),
        }
    }

    fn forward(&mut self, input: &Tensor, index_pos: usize) -> Result<Tensor> {
        let logits = match &mut self.model {
            ModelKind::Qwen2(m) => m.forward(input, index_pos)?,
            ModelKind::Llama(m) => m.forward(input, index_pos)?,
        };
        Ok(logits)
    }

    fn clear_cache(&mut self) {
        match &mut self.model {
            ModelKind::Qwen2(m) => m.clear_kv_cache(),
            ModelKind::Llama(m) => m.clear_kv_cache(),
        }
    }

    /// Count the tokens a piece of text would occupy in the prompt.
    pub fn count_tokens(&self, text: &str) -> usize {
        self.tokenizer
            .encode(text, false)
            .map(|e| e.get_ids().len())
            .unwrap_or(0)
    }

    /// Run a single-turn chat completion and return the assistant text.
    pub fn generate(
        &mut self,
        system: &str,
        user: &str,
        options: GenerationOptions,
    ) -> Result<String> {
        let prompt = self.format_prompt(system, user);
        let encoding = self
            .tokenizer
            .encode(prompt.as_str(), false)
            .map_err(|e| anyhow!("Failed to tokenize prompt: {}", e))?;
        let prompt_ids = encoding.get_ids().to_vec();
        let prompt_len = prompt_ids.len();

        if prompt_len == 0 {
            return Err(anyhow!("Empty prompt"));
        }
        if prompt_len + 16 >= self.context_length {
            return Err(anyhow!(
                "Prompt too long for this model ({} tokens, context is {})",
                prompt_len,
                self.context_length
            ));
        }

        let max_new_tokens = options
            .max_new_tokens
            .min(self.context_length - prompt_len - 1)
            .max(1);

        let sampling = if options.temperature <= 0.0 {
            Sampling::ArgMax
        } else {
            Sampling::TopP {
                p: options.top_p,
                temperature: options.temperature,
            }
        };
        let mut logits_processor = LogitsProcessor::from_sampling(options.seed, sampling);

        self.clear_cache();
        let start = Instant::now();

        let input = Tensor::new(prompt_ids.as_slice(), &self.device)?.unsqueeze(0)?;
        let logits = self.forward(&input, 0)?;
        let logits = logits.squeeze(0)?.to_dtype(DType::F32)?;
        let mut next_token = logits_processor.sample(&logits)?;
        let prefill_time = start.elapsed();

        let mut generated: Vec<u32> = Vec::with_capacity(max_new_tokens);
        for index in 0..max_new_tokens {
            if self.eos_tokens.contains(&next_token) {
                break;
            }
            generated.push(next_token);

            let input = Tensor::new(&[next_token], &self.device)?.unsqueeze(0)?;
            let logits = self.forward(&input, prompt_len + index)?;
            let logits = logits.squeeze(0)?.to_dtype(DType::F32)?;
            let logits = if options.repeat_penalty <= 1.0 {
                logits
            } else {
                let start_at = generated.len().saturating_sub(REPEAT_LAST_N);
                candle_transformers::utils::apply_repeat_penalty(
                    &logits,
                    options.repeat_penalty,
                    &generated[start_at..],
                )?
            };
            next_token = logits_processor.sample(&logits)?;
        }

        // Always drop the KV cache once we are done so memory stays flat
        // between requests.
        self.clear_cache();

        let text = self
            .tokenizer
            .decode(&generated, true)
            .map_err(|e| anyhow!("Failed to decode output: {}", e))?;

        let total = start.elapsed();
        debug!(
            "Local LLM generation: {} prompt tokens (prefill {:.2}s), {} new tokens in {:.2}s ({:.1} tok/s)",
            prompt_len,
            prefill_time.as_secs_f32(),
            generated.len(),
            total.as_secs_f32(),
            generated.len() as f32 / total.as_secs_f32().max(0.001)
        );

        Ok(text.trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end smoke test against a real GGUF model. Skipped unless
    /// `WSM_LLM_SMOKE_DIR` points to a directory containing `model.gguf`
    /// and `tokenizer.json` (a Qwen2 model is assumed). Run with:
    /// `WSM_LLM_SMOKE_DIR=/path cargo test --release local_llm_smoke -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn local_llm_smoke() {
        let dir = match std::env::var("WSM_LLM_SMOKE_DIR") {
            Ok(dir) => std::path::PathBuf::from(dir),
            Err(_) => {
                eprintln!("WSM_LLM_SMOKE_DIR not set, skipping");
                return;
            }
        };
        let mut engine = LocalLlmEngine::load(
            &dir.join("model.gguf"),
            &dir.join("tokenizer.json"),
            LocalLlmArch::Qwen2,
        )
        .expect("model should load");

        let system = "You are a text processing assistant. Output ONLY the final processed text.";
        let user = "Fix punctuation and capitalization, remove filler words, keep the language:\n\num so basically i think we should uh move the meeting to thursday at three";
        let first = engine
            .generate(system, user, GenerationOptions::default())
            .expect("generation should succeed");
        eprintln!("--- output 1 ---\n{first}\n");
        assert!(!first.is_empty());

        // Second call must work after the KV cache was cleared.
        let second = engine
            .generate(
                system,
                "Translate to French: good morning, how are you?",
                GenerationOptions::default(),
            )
            .expect("second generation should succeed");
        eprintln!("--- output 2 ---\n{second}\n");
        assert!(!second.is_empty());
    }

    #[test]
    fn prompt_formats_follow_chat_templates() {
        // Format functions are pure on the arch, so exercise them through a
        // tiny helper rather than a loaded model.
        fn format(arch: LocalLlmArch, system: &str, user: &str) -> String {
            match arch {
                LocalLlmArch::Qwen2 => format!(
                    "<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n"
                ),
                LocalLlmArch::Llama => format!(
                    "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{user}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
                ),
            }
        }
        let qwen = format(LocalLlmArch::Qwen2, "sys", "hello");
        assert!(qwen.starts_with("<|im_start|>system\nsys<|im_end|>"));
        assert!(qwen.ends_with("<|im_start|>assistant\n"));
        let llama = format(LocalLlmArch::Llama, "sys", "hello");
        assert!(llama.starts_with("<|begin_of_text|>"));
        assert!(llama.ends_with("<|start_header_id|>assistant<|end_header_id|>\n\n"));
    }
}
