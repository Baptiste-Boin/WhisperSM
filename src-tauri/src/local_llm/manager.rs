//! Lifecycle management for on-device language models: downloads, lazy
//! loading, idle unloading and the Tauri events that keep the UI in sync.

use super::catalog::{self, LocalLlmModelInfo};
use super::engine::{GenerationOptions, LocalLlmEngine};
use super::LOCAL_LLM_PROVIDER_ID;
use crate::settings::{get_settings, write_settings, LLMModel};
use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const MODEL_FILE: &str = "model.gguf";
const TOKENIZER_FILE: &str = "tokenizer.json";
const IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(10);

/// Progress payload emitted on `local-llm-download-progress`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LocalLlmDownloadProgress {
    pub model_id: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f64,
}

/// Payload emitted on `local-llm-state-changed`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LocalLlmStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

/// Snapshot of the runtime state returned to the UI.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LocalLlmStatus {
    pub loaded_model_id: Option<String>,
    pub is_loading: bool,
    pub is_generating: bool,
    pub device: String,
}

struct LoadedModel {
    model_id: String,
    engine: LocalLlmEngine,
}

/// RAII guard that clears the `is_downloading` flag and cancel entry when a
/// download finishes, is cancelled, or fails.
struct DownloadCleanup<'a> {
    manager: &'a LocalLlmManager,
    model_id: String,
}

impl Drop for DownloadCleanup<'_> {
    fn drop(&mut self) {
        if let Ok(mut models) = self.manager.models.lock() {
            if let Some(model) = models.get_mut(&self.model_id) {
                model.is_downloading = false;
            }
        }
        if let Ok(mut flags) = self.manager.cancel_flags.lock() {
            flags.remove(&self.model_id);
        }
        self.manager.refresh_download_status();
    }
}

pub struct LocalLlmManager {
    app_handle: AppHandle,
    models_dir: PathBuf,
    models: Mutex<HashMap<String, LocalLlmModelInfo>>,
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
    engine: Mutex<Option<LoadedModel>>,
    is_loading: AtomicBool,
    is_generating: AtomicBool,
    last_activity: AtomicU64,
    shutdown: AtomicBool,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

impl LocalLlmManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let models_dir = crate::storage::llm_dir(app_handle);
        if !models_dir.exists() {
            fs::create_dir_all(&models_dir)?;
        }

        let models: HashMap<String, LocalLlmModelInfo> = catalog::catalog()
            .into_iter()
            .map(|m| (m.id.clone(), m))
            .collect();

        let manager = Self {
            app_handle: app_handle.clone(),
            models_dir,
            models: Mutex::new(models),
            cancel_flags: Mutex::new(HashMap::new()),
            engine: Mutex::new(None),
            is_loading: AtomicBool::new(false),
            is_generating: AtomicBool::new(false),
            last_activity: AtomicU64::new(now_secs()),
            shutdown: AtomicBool::new(false),
        };
        manager.refresh_download_status();
        manager.sync_saved_models();
        Ok(manager)
    }

    fn model_dir(&self, model_id: &str) -> PathBuf {
        self.models_dir.join(model_id)
    }

    fn model_path(&self, model_id: &str) -> PathBuf {
        self.model_dir(model_id).join(MODEL_FILE)
    }

    fn tokenizer_path(&self, model_id: &str) -> PathBuf {
        self.model_dir(model_id).join(TOKENIZER_FILE)
    }

    fn partial_path(&self, model_id: &str) -> PathBuf {
        self.model_dir(model_id)
            .join(format!("{}.partial", MODEL_FILE))
    }

    fn is_model_complete(&self, model_id: &str) -> bool {
        self.model_path(model_id).exists() && self.tokenizer_path(model_id).exists()
    }

    /// Re-scan the models directory and update `is_downloaded` /
    /// `partial_size` for every catalog entry.
    fn refresh_download_status(&self) {
        let mut models = match self.models.lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };
        for model in models.values_mut() {
            model.is_downloaded = self.is_model_complete(&model.id);
            model.partial_size = self
                .partial_path(&model.id)
                .metadata()
                .map(|m| m.len())
                .unwrap_or(0);
        }
    }

    /// Make sure every downloaded model has a matching saved language model
    /// (so it can be picked in modes) and that saved entries pointing to
    /// deleted models are removed.
    fn sync_saved_models(&self) {
        let downloaded: Vec<LocalLlmModelInfo> = self
            .list()
            .into_iter()
            .filter(|m| m.is_downloaded)
            .collect();
        let mut settings = get_settings(&self.app_handle);
        let mut changed = false;

        for model in &downloaded {
            let exists = settings
                .llm_models
                .iter()
                .any(|m| m.provider_id == LOCAL_LLM_PROVIDER_ID && m.model == model.id);
            if !exists {
                settings.llm_models.push(LLMModel {
                    id: format!("local_{}", model.id),
                    provider_id: LOCAL_LLM_PROVIDER_ID.to_string(),
                    model: model.id.clone(),
                    label: model.name.clone(),
                });
                changed = true;
            }
        }

        let before = settings.llm_models.len();
        let removed_ids: Vec<String> = settings
            .llm_models
            .iter()
            .filter(|m| {
                m.provider_id == LOCAL_LLM_PROVIDER_ID
                    && !downloaded.iter().any(|d| d.id == m.model)
            })
            .map(|m| m.id.clone())
            .collect();
        settings.llm_models.retain(|m| !removed_ids.contains(&m.id));
        if settings.llm_models.len() != before {
            changed = true;
            for action in settings.post_process_actions.iter_mut() {
                if let Some(id) = action.llm_model_id.as_deref() {
                    if removed_ids.iter().any(|r| r == id) {
                        action.llm_model_id = None;
                    }
                }
            }
        }

        if changed {
            write_settings(&self.app_handle, settings);
        }
    }

    pub fn list(&self) -> Vec<LocalLlmModelInfo> {
        let models = match self.models.lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };
        let mut list: Vec<LocalLlmModelInfo> = models.values().cloned().collect();
        let order: HashMap<String, usize> = catalog::catalog()
            .iter()
            .enumerate()
            .map(|(i, m)| (m.id.clone(), i))
            .collect();
        list.sort_by_key(|m| order.get(&m.id).copied().unwrap_or(usize::MAX));
        list
    }

    pub fn get(&self, model_id: &str) -> Option<LocalLlmModelInfo> {
        let models = match self.models.lock() {
            Ok(m) => m,
            Err(poisoned) => poisoned.into_inner(),
        };
        models.get(model_id).cloned()
    }

    pub fn status(&self) -> LocalLlmStatus {
        let loaded_model_id = self
            .engine
            .try_lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|m| m.model_id.clone()))
            .or_else(|| {
                // Engine is busy (loading or generating); report the id we
                // remember from the last state event instead of blocking.
                None
            });
        LocalLlmStatus {
            loaded_model_id,
            is_loading: self.is_loading.load(Ordering::Relaxed),
            is_generating: self.is_generating.load(Ordering::Relaxed),
            device: super::engine::device_label(),
        }
    }

    fn emit_state(&self, event_type: &str, model_id: Option<&str>, error: Option<String>) {
        let model_name = model_id.and_then(|id| self.get(id)).map(|m| m.name);
        let _ = self.app_handle.emit(
            "local-llm-state-changed",
            LocalLlmStateEvent {
                event_type: event_type.to_string(),
                model_id: model_id.map(|s| s.to_string()),
                model_name,
                error,
            },
        );
    }

    fn emit_progress(&self, model_id: &str, downloaded: u64, total: u64) {
        let percentage = if total > 0 {
            (downloaded as f64 / total as f64) * 100.0
        } else {
            0.0
        };
        let _ = self.app_handle.emit(
            "local-llm-download-progress",
            LocalLlmDownloadProgress {
                model_id: model_id.to_string(),
                downloaded,
                total,
                percentage,
            },
        );
    }

    /// Download the tokenizer and GGUF weights for a catalog model. Supports
    /// resuming a partially downloaded weights file and cancellation.
    pub async fn download(&self, model_id: &str) -> Result<()> {
        let info = self
            .get(model_id)
            .ok_or_else(|| anyhow!("Unknown local model: {}", model_id))?;

        if self.is_model_complete(model_id) {
            self.refresh_download_status();
            self.sync_saved_models();
            return Ok(());
        }

        {
            let mut models = self.models.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(model) = models.get_mut(model_id) {
                if model.is_downloading {
                    return Err(anyhow!("Model {} is already downloading", model_id));
                }
                model.is_downloading = true;
            }
        }
        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.cancel_flags
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(model_id.to_string(), cancel_flag.clone());
        let _cleanup = DownloadCleanup {
            manager: self,
            model_id: model_id.to_string(),
        };

        let dir = self.model_dir(model_id);
        fs::create_dir_all(&dir)?;
        let client = reqwest::Client::builder()
            .user_agent("WhisperSM/1.0 (+https://github.com/Baptiste-Boin/WhisperSM)")
            .build()?;

        // Tokenizer first: small, and needed before the model can load.
        let tokenizer_path = self.tokenizer_path(model_id);
        if !tokenizer_path.exists() {
            let tmp = dir.join(format!("{}.partial", TOKENIZER_FILE));
            let _ = fs::remove_file(&tmp);
            self.emit_progress(model_id, 0, info.size_mb * 1024 * 1024);
            download_file(&client, &info.tokenizer_url, &tmp, &cancel_flag, |_, _| {}).await?;
            if cancel_flag.load(Ordering::Relaxed) {
                let _ = fs::remove_file(&tmp);
                info!("Local LLM download cancelled: {}", model_id);
                return Ok(());
            }
            validate_json(&tmp).context("Downloaded tokenizer is not valid JSON")?;
            fs::rename(&tmp, &tokenizer_path)?;
        }

        // Then the weights, with resume support.
        let model_path = self.model_path(model_id);
        let partial = self.partial_path(model_id);
        if !model_path.exists() {
            let model_id_owned = model_id.to_string();
            let last_emit = Mutex::new(Instant::now() - Duration::from_secs(1));
            let completed = download_file(
                &client,
                &info.model_url,
                &partial,
                &cancel_flag,
                |downloaded, total| {
                    let mut last = last_emit.lock().unwrap_or_else(|p| p.into_inner());
                    if last.elapsed() >= Duration::from_millis(150) || downloaded == total {
                        self.emit_progress(&model_id_owned, downloaded, total);
                        *last = Instant::now();
                    }
                },
            )
            .await?;

            if cancel_flag.load(Ordering::Relaxed) {
                info!(
                    "Local LLM download cancelled: {} (partial file kept for resume)",
                    model_id
                );
                return Ok(());
            }
            if !completed {
                return Err(anyhow!("Download did not complete"));
            }
            validate_gguf(&partial).context("Downloaded file is not a valid GGUF model")?;
            fs::rename(&partial, &model_path)?;
        }

        self.refresh_download_status();
        self.sync_saved_models();
        let _ = self
            .app_handle
            .emit("local-llm-download-complete", model_id);
        info!("Local LLM download complete: {}", model_id);
        Ok(())
    }

    pub fn cancel_download(&self, model_id: &str) -> Result<()> {
        let flags = self.cancel_flags.lock().unwrap_or_else(|p| p.into_inner());
        match flags.get(model_id) {
            Some(flag) => {
                flag.store(true, Ordering::Relaxed);
                Ok(())
            }
            None => Err(anyhow!("No download in progress for {}", model_id)),
        }
    }

    /// Delete a model's files, unloading it first if it is the active one.
    pub fn delete(&self, model_id: &str) -> Result<()> {
        if self.loaded_model_id() == Some(model_id.to_string()) {
            self.unload();
        }
        let dir = self.model_dir(model_id);
        if dir.exists() {
            fs::remove_dir_all(&dir)
                .with_context(|| format!("Failed to delete {}", dir.display()))?;
        }
        self.refresh_download_status();
        self.sync_saved_models();
        info!("Local LLM deleted: {}", model_id);
        Ok(())
    }

    pub fn loaded_model_id(&self) -> Option<String> {
        self.engine
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .as_ref()
            .map(|m| m.model_id.clone())
    }

    pub fn unload(&self) {
        let mut guard = self.engine.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(loaded) = guard.take() {
            info!("Local LLM unloaded: {}", loaded.model_id);
            drop(loaded);
            self.emit_state("unloaded", None, None);
        }
    }

    fn touch(&self) {
        self.last_activity.store(now_secs(), Ordering::Relaxed);
    }

    /// Run a completion with the given catalog model, loading it on demand.
    /// Blocking: call from a blocking thread.
    pub fn generate(&self, model_id: &str, system: &str, user: &str) -> Result<String> {
        let info = self
            .get(model_id)
            .ok_or_else(|| anyhow!("Unknown local model: {}", model_id))?;
        if !self.is_model_complete(model_id) {
            return Err(anyhow!(
                "Model '{}' is not downloaded. Download it from Models › AI.",
                info.name
            ));
        }

        let mut guard = self.engine.lock().unwrap_or_else(|p| p.into_inner());
        self.touch();

        let needs_load = guard
            .as_ref()
            .map(|loaded| loaded.model_id != model_id)
            .unwrap_or(true);
        if needs_load {
            if let Some(previous) = guard.take() {
                debug!("Swapping local LLM {} -> {}", previous.model_id, model_id);
                drop(previous);
            }
            self.is_loading.store(true, Ordering::Relaxed);
            self.emit_state("loading_started", Some(model_id), None);
            let result = LocalLlmEngine::load(
                &self.model_path(model_id),
                &self.tokenizer_path(model_id),
                info.arch,
            );
            self.is_loading.store(false, Ordering::Relaxed);
            match result {
                Ok(engine) => {
                    *guard = Some(LoadedModel {
                        model_id: model_id.to_string(),
                        engine,
                    });
                    self.emit_state("loading_completed", Some(model_id), None);
                }
                Err(e) => {
                    error!("Failed to load local LLM {}: {:#}", model_id, e);
                    self.emit_state("loading_failed", Some(model_id), Some(format!("{:#}", e)));
                    return Err(e);
                }
            }
        }

        let loaded = guard
            .as_mut()
            .ok_or_else(|| anyhow!("Local model is not loaded"))?;

        // Give the model room to answer: roughly twice the input plus a
        // margin, bounded to keep latency predictable on CPU.
        let input_tokens = loaded.engine.count_tokens(user);
        let options = GenerationOptions {
            max_new_tokens: (input_tokens * 2 + 96).clamp(128, 1536),
            ..GenerationOptions::default()
        };

        self.is_generating.store(true, Ordering::Relaxed);
        self.emit_state("generating", Some(model_id), None);
        let result = loaded.engine.generate(system, user, options);
        self.is_generating.store(false, Ordering::Relaxed);
        self.emit_state("idle", Some(model_id), None);
        self.touch();

        result
    }

    /// Background thread that unloads the model after the configured idle
    /// timeout (shares the `model_unload_timeout` setting with speech models).
    pub fn start_idle_watcher(self: &Arc<Self>) {
        let manager = Arc::clone(self);
        thread::Builder::new()
            .name("local-llm-idle-watcher".into())
            .spawn(move || loop {
                thread::sleep(IDLE_CHECK_INTERVAL);
                if manager.shutdown.load(Ordering::Relaxed) {
                    break;
                }
                if manager.is_generating.load(Ordering::Relaxed)
                    || manager.is_loading.load(Ordering::Relaxed)
                {
                    continue;
                }
                let timeout = get_settings(&manager.app_handle)
                    .model_unload_timeout
                    .to_seconds();
                let Some(timeout) = timeout else { continue };
                if timeout == 0 {
                    // "Immediately": unload as soon as we are idle.
                    if manager.loaded_model_id().is_some() {
                        manager.unload();
                    }
                    continue;
                }
                let idle_for =
                    now_secs().saturating_sub(manager.last_activity.load(Ordering::Relaxed));
                if idle_for >= timeout && manager.loaded_model_id().is_some() {
                    info!("Local LLM idle for {}s, unloading", idle_for);
                    manager.unload();
                }
            })
            .expect("failed to spawn local LLM idle watcher");
    }
}

impl Drop for LocalLlmManager {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }
}

/// Stream `url` into `dest`, resuming from an existing partial file when the
/// server supports range requests. Returns `Ok(false)` when cancelled.
async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    cancel_flag: &AtomicBool,
    mut on_progress: impl FnMut(u64, u64),
) -> Result<bool> {
    let mut resume_from = dest.metadata().map(|m| m.len()).unwrap_or(0);
    let mut request = client.get(url);
    if resume_from > 0 {
        request = request.header("Range", format!("bytes={}-", resume_from));
    }
    let mut response = request.send().await?;

    if resume_from > 0 && response.status() == reqwest::StatusCode::OK {
        warn!(
            "Server ignored range request for {}, restarting download",
            url
        );
        let _ = fs::remove_file(dest);
        resume_from = 0;
        response = client.get(url).send().await?;
    }
    if resume_from > 0 && response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        // Partial file is already complete (or corrupt); start over.
        let _ = fs::remove_file(dest);
        resume_from = 0;
        response = client.get(url).send().await?;
    }
    if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
    {
        return Err(anyhow!(
            "HTTP {} while downloading {}",
            response.status(),
            url
        ));
    }

    let total = resume_from + response.content_length().unwrap_or(0);
    let mut downloaded = resume_from;
    let mut file = if resume_from > 0 {
        fs::OpenOptions::new().append(true).open(dest)?
    } else {
        fs::File::create(dest)?
    };

    on_progress(downloaded, total);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::Relaxed) {
            drop(file);
            return Ok(false);
        }
        let chunk = chunk?;
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total);
    }
    file.flush()?;
    drop(file);

    if total > 0 && downloaded != total {
        let _ = fs::remove_file(dest);
        return Err(anyhow!(
            "Download incomplete: expected {} bytes, got {}",
            total,
            downloaded
        ));
    }
    Ok(true)
}

fn validate_gguf(path: &Path) -> Result<()> {
    let mut file = fs::File::open(path)?;
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic)?;
    if &magic != b"GGUF" {
        let _ = fs::remove_file(path);
        return Err(anyhow!("Bad GGUF magic"));
    }
    Ok(())
}

fn validate_json(path: &Path) -> Result<()> {
    let content = fs::read_to_string(path)?;
    serde_json::from_str::<serde_json::Value>(&content)?;
    Ok(())
}
