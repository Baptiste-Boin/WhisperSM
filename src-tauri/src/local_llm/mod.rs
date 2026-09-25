//! On-device language models for post-processing.
//!
//! WhisperSM can run small instruction-tuned language models (GGUF, 4-bit
//! quantized) entirely on the user's machine through the `candle` inference
//! library. This module contains:
//!
//! - [`catalog`]: the curated list of downloadable models,
//! - [`engine`]: the inference engine (prompt formatting, sampling),
//! - [`manager`]: downloads, lifecycle (lazy load / idle unload) and the
//!   Tauri events the UI listens to.
//!
//! Local models are exposed to the post-processing pipeline as a built-in
//! provider whose id is [`LOCAL_LLM_PROVIDER_ID`]. A saved language model
//! for that provider stores the catalog model id in its `model` field.

pub mod catalog;
pub mod engine;
pub mod manager;

pub use catalog::LocalLlmModelInfo;
pub use manager::{LocalLlmManager, LocalLlmStatus};

/// Provider id used for on-device models in `post_process_providers`.
pub const LOCAL_LLM_PROVIDER_ID: &str = "local";
