//! Cloud speech-to-text providers.
//!
//! Cloud voice models send the recorded audio (16 kHz mono WAV) to a
//! provider's transcription endpoint and return the text. Every provider
//! with a free tier is supported through one of three wire formats:
//!
//! - OpenAI-compatible `POST {base}/audio/transcriptions` (Groq, Mistral,
//!   Cohere, OpenAI, custom endpoints): multipart `file` + `model`.
//! - Deepgram `POST {base}/listen?model=…`: raw WAV body.
//! - ElevenLabs `POST {base}/speech-to-text`: multipart `file` + `model_id`.
//!
//! The functions here are blocking so they can be called from the
//! synchronous transcription pipeline; the HTTP call runs on a dedicated
//! thread with its own small runtime.

use crate::audio_toolkit::constants::WHISPER_SAMPLE_RATE;
use crate::settings::PostProcessProvider;
use anyhow::{anyhow, Context, Result};
use log::{debug, info};
use reqwest::multipart::{Form, Part};
use std::io::Cursor;
use std::time::{Duration, Instant};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const USER_AGENT: &str = "WhisperSM/1.0 (+https://github.com/Baptiste-Boin/WhisperSM)";

/// Options for a single cloud transcription request.
#[derive(Debug, Clone)]
pub struct CloudTranscriptionRequest {
    pub provider: PostProcessProvider,
    pub api_key: String,
    pub model: String,
    /// ISO 639-1 language code, `None` for auto-detection.
    pub language: Option<String>,
    /// Ask the provider to translate to English (OpenAI-compatible only).
    pub translate: bool,
    /// Words the model should be biased towards (used as prompt where the
    /// API supports it).
    pub prompt_words: Vec<String>,
}

/// Encode 16 kHz mono f32 samples as a 16-bit PCM WAV file in memory.
pub fn encode_wav(samples: &[f32]) -> Result<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: WHISPER_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::with_capacity(44 + samples.len() * 2));
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)?;
        for sample in samples {
            let clamped = sample.clamp(-1.0, 1.0);
            writer.write_sample((clamped * i16::MAX as f32) as i16)?;
        }
        writer.finalize()?;
    }
    Ok(cursor.into_inner())
}

/// Transcribe `samples` with a cloud provider. Blocking.
pub fn transcribe(request: CloudTranscriptionRequest, samples: &[f32]) -> Result<String> {
    if request.api_key.trim().is_empty() && request.provider.id != "custom" {
        return Err(anyhow!(
            "{} needs an API key. Add one in Models library.",
            request.provider.label
        ));
    }
    let wav = encode_wav(samples)?;
    let started = Instant::now();
    info!(
        "Cloud transcription via {} ({}) — {} KB of audio",
        request.provider.id,
        request.model,
        wav.len() / 1024
    );

    // The transcription pipeline is synchronous and may already be running
    // on an async runtime thread, so the HTTP call gets its own thread and
    // runtime instead of blocking the caller's executor.
    let handle = std::thread::Builder::new()
        .name("cloud-stt".into())
        .spawn(move || -> Result<String> {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .context("Failed to start HTTP runtime")?;
            runtime.block_on(transcribe_async(request, wav))
        })
        .context("Failed to spawn cloud transcription thread")?;

    let text = handle
        .join()
        .map_err(|_| anyhow!("Cloud transcription thread panicked"))??;
    info!(
        "Cloud transcription completed in {}ms",
        started.elapsed().as_millis()
    );
    Ok(text)
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .context("Failed to build HTTP client")
}

async fn transcribe_async(request: CloudTranscriptionRequest, wav: Vec<u8>) -> Result<String> {
    let base = request.provider.base_url.trim_end_matches('/').to_string();
    match request.provider.id.as_str() {
        "deepgram" => transcribe_deepgram(&request, &base, wav).await,
        "elevenlabs" => transcribe_elevenlabs(&request, &base, wav).await,
        _ => transcribe_openai_compatible(&request, &base, wav).await,
    }
}

async fn read_error(response: reqwest::Response) -> anyhow::Error {
    let status = response.status();
    let body = response
        .text()
        .await
        .unwrap_or_else(|_| "unreadable error body".to_string());
    let body = body.chars().take(400).collect::<String>();
    anyhow!("Transcription request failed ({}): {}", status, body)
}

/// OpenAI-style `/audio/transcriptions` (Groq, Mistral, Cohere, OpenAI…).
async fn transcribe_openai_compatible(
    request: &CloudTranscriptionRequest,
    base: &str,
    wav: Vec<u8>,
) -> Result<String> {
    let path = if request.translate && request.provider.id == "openai" {
        "/audio/translations"
    } else {
        "/audio/transcriptions"
    };
    let url = format!("{}{}", base, path);
    debug!("POST {}", url);

    let file = Part::bytes(wav)
        .file_name("recording.wav")
        .mime_str("audio/wav")?;
    let mut form = Form::new()
        .part("file", file)
        .text("model", request.model.clone());
    if let Some(language) = request.language.as_deref().filter(|l| !l.is_empty()) {
        form = form.text("language", language.to_string());
    }
    if request.provider.id != "cohere" {
        form = form.text("response_format", "json");
        if !request.prompt_words.is_empty() {
            form = form.text("prompt", request.prompt_words.join(", "));
        }
    }

    let mut builder = client()?.post(&url).multipart(form);
    if !request.api_key.is_empty() {
        builder = builder.bearer_auth(&request.api_key);
        if request.provider.id == "mistral" {
            builder = builder.header("x-api-key", &request.api_key);
        }
    }

    let response = builder.send().await.context("HTTP request failed")?;
    if !response.status().is_success() {
        return Err(read_error(response).await);
    }
    let body: serde_json::Value = response.json().await.context("Invalid JSON response")?;
    extract_text(&body, &["text", "transcript", "transcription"])
}

/// Deepgram pre-recorded API: raw audio body, `Authorization: Token`.
async fn transcribe_deepgram(
    request: &CloudTranscriptionRequest,
    base: &str,
    wav: Vec<u8>,
) -> Result<String> {
    let mut url = format!("{}/listen?model={}&smart_format=true", base, request.model);
    match request.language.as_deref().filter(|l| !l.is_empty()) {
        Some(language) => url.push_str(&format!("&language={}", language)),
        None => url.push_str("&detect_language=true"),
    }
    for word in &request.prompt_words {
        url.push_str(&format!("&keyterm={}", urlencoding_encode(word)));
    }
    debug!("POST {}", url);

    let response = client()?
        .post(&url)
        .header("Authorization", format!("Token {}", request.api_key))
        .header("Content-Type", "audio/wav")
        .body(wav)
        .send()
        .await
        .context("HTTP request failed")?;
    if !response.status().is_success() {
        return Err(read_error(response).await);
    }
    let body: serde_json::Value = response.json().await.context("Invalid JSON response")?;
    body.pointer("/results/channels/0/alternatives/0/transcript")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .ok_or_else(|| anyhow!("Deepgram response did not contain a transcript"))
}

/// ElevenLabs Scribe: multipart with `model_id`, `xi-api-key` header.
async fn transcribe_elevenlabs(
    request: &CloudTranscriptionRequest,
    base: &str,
    wav: Vec<u8>,
) -> Result<String> {
    let url = format!("{}/speech-to-text", base);
    debug!("POST {}", url);

    let file = Part::bytes(wav)
        .file_name("recording.wav")
        .mime_str("audio/wav")?;
    let mut form = Form::new()
        .part("file", file)
        .text("model_id", request.model.clone())
        .text("tag_audio_events", "false");
    if let Some(language) = request.language.as_deref().filter(|l| !l.is_empty()) {
        form = form.text("language_code", language.to_string());
    }

    let response = client()?
        .post(&url)
        .header("xi-api-key", &request.api_key)
        .multipart(form)
        .send()
        .await
        .context("HTTP request failed")?;
    if !response.status().is_success() {
        return Err(read_error(response).await);
    }
    let body: serde_json::Value = response.json().await.context("Invalid JSON response")?;
    extract_text(&body, &["text"])
}

fn extract_text(body: &serde_json::Value, keys: &[&str]) -> Result<String> {
    for key in keys {
        if let Some(text) = body.get(key).and_then(|v| v.as_str()) {
            return Ok(text.trim().to_string());
        }
    }
    Err(anyhow!("Transcription response did not contain any text"))
}

/// Minimal percent-encoding for query values (letters, digits and `-._~`
/// pass through, everything else is escaped).
fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_encoding_produces_valid_header() {
        let samples: Vec<f32> = (0..1600).map(|i| (i as f32 * 0.01).sin() * 0.5).collect();
        let wav = encode_wav(&samples).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        // 44-byte header + 2 bytes per sample
        assert_eq!(wav.len(), 44 + samples.len() * 2);
        let reader = hound::WavReader::new(Cursor::new(wav)).unwrap();
        assert_eq!(reader.spec().sample_rate, WHISPER_SAMPLE_RATE);
        assert_eq!(reader.spec().channels, 1);
    }

    #[test]
    fn extract_text_falls_back_across_keys() {
        let body = serde_json::json!({ "transcript": " hello " });
        assert_eq!(
            extract_text(&body, &["text", "transcript"]).unwrap(),
            "hello"
        );
        let empty = serde_json::json!({ "other": 1 });
        assert!(extract_text(&empty, &["text"]).is_err());
    }

    #[test]
    fn query_values_are_percent_encoded() {
        assert_eq!(urlencoding_encode("Charge Bee"), "Charge%20Bee");
        assert_eq!(urlencoding_encode("a-b_c.d~"), "a-b_c.d~");
    }
}
