//! The user-visible WhisperSM folder, laid out like Superwhisper's
//! `~/Documents/superwhisper`:
//!
//! ```text
//! ~/Documents/WhisperSM/
//! ├── models/        speech models (+ models/llm for on-device language models)
//! ├── modes/         one JSON file per mode (mirror of the settings)
//! ├── recordings/    one folder per dictation: <unix time>/output.wav + meta.json
//! └── settings/      settings_store.json
//! ```
//!
//! The folder is created on first launch and data from the previous
//! application-support location is moved into it. In portable mode the
//! portable `Data/` directory is used as the base instead of Documents.
//! The history database and logs stay in the application-support folder.

use crate::settings::{AppSettings, PostProcessAction};
use log::{debug, info, warn};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

pub const FOLDER_NAME: &str = "WhisperSM";
pub const MODELS_DIR: &str = "models";
pub const LLM_DIR: &str = "llm";
pub const MODES_DIR: &str = "modes";
pub const RECORDINGS_DIR: &str = "recordings";
pub const SETTINGS_DIR: &str = "settings";
pub const RECORDING_AUDIO_FILE: &str = "output.wav";
pub const RECORDING_META_FILE: &str = "meta.json";

static USER_FOLDER: OnceLock<PathBuf> = OnceLock::new();

fn base_folder(app: &AppHandle) -> PathBuf {
    if let Some(dir) = crate::portable::data_dir() {
        return dir.clone();
    }
    match app.path().document_dir() {
        Ok(documents) => documents.join(FOLDER_NAME),
        Err(e) => {
            warn!(
                "Documents folder unavailable ({}), using the app data folder",
                e
            );
            crate::portable::app_data_dir(app).unwrap_or_else(|_| PathBuf::from(FOLDER_NAME))
        }
    }
}

/// Resolve and create the WhisperSM folder and move data from the old
/// application-support layout into it. Must run before the settings store
/// is opened (first thing in the setup hook).
pub fn init(app: &AppHandle) -> PathBuf {
    if let Some(folder) = USER_FOLDER.get() {
        return folder.clone();
    }
    let base = base_folder(app);
    for sub in [MODELS_DIR, MODES_DIR, RECORDINGS_DIR, SETTINGS_DIR] {
        if let Err(e) = fs::create_dir_all(base.join(sub)) {
            warn!("Failed to create {}: {}", base.join(sub).display(), e);
        }
    }
    if let Ok(old) = crate::portable::app_data_dir(app) {
        migrate_legacy_layout(&old, &base);
    }
    info!("WhisperSM folder: {}", base.display());
    let _ = USER_FOLDER.set(base.clone());
    base
}

fn folder(app: &AppHandle) -> PathBuf {
    USER_FOLDER.get().cloned().unwrap_or_else(|| init(app))
}

pub fn models_dir(app: &AppHandle) -> PathBuf {
    folder(app).join(MODELS_DIR)
}

pub fn llm_dir(app: &AppHandle) -> PathBuf {
    folder(app).join(MODELS_DIR).join(LLM_DIR)
}

pub fn recordings_dir(app: &AppHandle) -> PathBuf {
    folder(app).join(RECORDINGS_DIR)
}

/// Absolute path of a file in the settings folder, if the folder is known.
pub fn settings_file(name: &str) -> Option<PathBuf> {
    USER_FOLDER
        .get()
        .map(|folder| folder.join(SETTINGS_DIR).join(name))
}

/* ------------------------------------------------------------------ */
/* Migration from the application-support layout                      */
/* ------------------------------------------------------------------ */

/// Move `from` to `to` (rename, falling back to copy + delete across
/// volumes). Never overwrites an existing destination.
fn move_path(from: &Path, to: &Path) {
    if !from.exists() || to.exists() {
        return;
    }
    if let Some(parent) = to.parent() {
        let _ = fs::create_dir_all(parent);
    }
    match fs::rename(from, to) {
        Ok(()) => debug!("Moved {} -> {}", from.display(), to.display()),
        Err(rename_err) => match copy_recursive(from, to) {
            Ok(()) => {
                let removed = if from.is_dir() {
                    fs::remove_dir_all(from)
                } else {
                    fs::remove_file(from)
                };
                if let Err(e) = removed {
                    warn!("Copied {} but could not remove it: {}", from.display(), e);
                }
            }
            Err(copy_err) => warn!(
                "Could not move {} to {} ({}; {})",
                from.display(),
                to.display(),
                rename_err,
                copy_err
            ),
        },
    }
}

fn copy_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_recursive(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(from, to).map(|_| ())
    }
}

/// Move the entries of directory `from` into directory `to`.
fn move_dir_contents(from: &Path, to: &Path) {
    if from == to || !from.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(from) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }
        move_path(&entry.path(), &to.join(&name));
    }
    // Remove the old directory when it is now empty.
    let _ = fs::remove_dir(from);
}

fn migrate_legacy_layout(old: &Path, base: &Path) {
    let settings_dir = base.join(SETTINGS_DIR);
    move_path(
        &old.join(crate::settings::SETTINGS_STORE_PATH),
        &settings_dir.join(crate::settings::SETTINGS_STORE_PATH),
    );
    move_dir_contents(&old.join(MODELS_DIR), &base.join(MODELS_DIR));
    move_dir_contents(&old.join(LLM_DIR), &base.join(MODELS_DIR).join(LLM_DIR));
    // Recordings are moved by the history manager, which also updates the
    // database paths.
}

/* ------------------------------------------------------------------ */
/* Modes mirror                                                       */
/* ------------------------------------------------------------------ */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ModeFile<'a> {
    key: &'a str,
    name: &'a str,
    /// "voice" for plain dictation, "custom" when a prompt rewrites the text.
    #[serde(rename = "type")]
    kind: &'a str,
    prompt: &'a str,
    icon: &'a str,
    active: bool,
    trigger_key: Option<u8>,
    voice_model: Option<&'a str>,
    language_model: Option<ModeLanguageModel<'a>>,
}

#[derive(Serialize)]
struct ModeLanguageModel<'a> {
    provider: &'a str,
    model: &'a str,
    label: &'a str,
}

static LAST_MODES_MIRROR: Mutex<Option<String>> = Mutex::new(None);

fn mode_file_name(action: &PostProcessAction) -> String {
    let safe: String = action
        .id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!("{}.json", safe)
}

/// Write one JSON file per mode into `modes/` and remove files of deleted
/// modes. Cheap to call on every settings write: nothing is written when
/// the modes did not change.
pub fn mirror_modes(settings: &AppSettings) {
    let Some(folder) = USER_FOLDER.get() else {
        return;
    };
    let dir = folder.join(MODES_DIR);

    let files: Vec<(String, String)> = settings
        .post_process_actions
        .iter()
        .map(|action| {
            let llm = action
                .llm_model_id
                .as_deref()
                .and_then(|id| settings.llm_model(id))
                .filter(|_| !action.is_voice_only())
                .map(|m| ModeLanguageModel {
                    provider: &m.provider_id,
                    model: &m.model,
                    label: &m.label,
                });
            let file = ModeFile {
                key: &action.id,
                name: &action.name,
                kind: if action.is_voice_only() {
                    "voice"
                } else {
                    "custom"
                },
                prompt: &action.prompt,
                icon: &action.icon,
                active: settings.active_mode_id.as_deref() == Some(action.id.as_str()),
                trigger_key: action.trigger_key,
                voice_model: action.speech_model_id.as_deref(),
                language_model: llm,
            };
            let json = serde_json::to_string_pretty(&file).unwrap_or_default();
            (mode_file_name(action), json)
        })
        .collect();

    let fingerprint = files
        .iter()
        .map(|(name, json)| format!("{name}\n{json}"))
        .collect::<Vec<_>>()
        .join("\n");
    {
        let mut last = LAST_MODES_MIRROR.lock().unwrap_or_else(|p| p.into_inner());
        if last.as_deref() == Some(fingerprint.as_str()) {
            return;
        }
        *last = Some(fingerprint);
    }

    if let Err(e) = fs::create_dir_all(&dir) {
        warn!("Failed to create modes folder: {}", e);
        return;
    }
    for (name, json) in &files {
        if let Err(e) = fs::write(dir.join(name), json) {
            warn!("Failed to write mode file {}: {}", name, e);
        }
    }
    // Remove files of modes that no longer exist (only files we own).
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let ours = name.starts_with("act_") && name.ends_with(".json");
            if ours && !files.iter().any(|(file, _)| *file == name) {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Recording folders                                                  */
/* ------------------------------------------------------------------ */

/// Create a new `recordings/<unix time>/` folder and return the path stored
/// in history (`<unix time>/output.wav`, relative to `recordings/`) and the
/// absolute audio path.
pub fn allocate_recording(recordings_dir: &Path, timestamp: i64) -> (String, PathBuf) {
    let mut name = timestamp.to_string();
    let mut suffix = 1;
    while recordings_dir.join(&name).exists() {
        name = format!("{}-{}", timestamp, suffix);
        suffix += 1;
    }
    let dir = recordings_dir.join(&name);
    if let Err(e) = fs::create_dir_all(&dir) {
        warn!("Failed to create recording folder {}: {}", dir.display(), e);
    }
    (
        format!("{}/{}", name, RECORDING_AUDIO_FILE),
        dir.join(RECORDING_AUDIO_FILE),
    )
}

/// Folder of a recording stored as `<folder>/output.wav`, if the history
/// path uses the per-recording layout.
pub fn recording_folder(recordings_dir: &Path, file_name: &str) -> Option<PathBuf> {
    let (folder, _) = file_name.split_once('/')?;
    if folder.is_empty() || folder == "." || folder == ".." || folder.contains('\\') {
        return None;
    }
    Some(recordings_dir.join(folder))
}

/// Delete a recording: its whole folder for the per-recording layout, or the
/// single WAV file for legacy entries.
pub fn remove_recording(recordings_dir: &Path, file_name: &str) -> std::io::Result<bool> {
    if let Some(folder) = recording_folder(recordings_dir, file_name) {
        if folder.exists() {
            fs::remove_dir_all(folder)?;
            return Ok(true);
        }
        return Ok(false);
    }
    let path = recordings_dir.join(file_name);
    if path.exists() {
        fs::remove_file(path)?;
        return Ok(true);
    }
    Ok(false)
}

/// `meta.json` written next to each recording, modelled on Superwhisper's.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecordingMeta {
    pub language_selected: String,
    pub app_version: String,
    pub separate_speakers_enabled: bool,
    pub model_key: String,
    pub speakers: Vec<String>,
    pub recording_device: String,
    pub language_model_name: String,
    pub result: String,
    pub realtime_enabled: bool,
    pub literal_punctuation_enabled: bool,
    pub prompt: String,
    pub model_name: String,
    /// Recorded speech, in milliseconds.
    pub duration: i64,
    pub segments: Vec<String>,
    pub application_context_enabled: bool,
    pub raw_result: String,
    /// Transcription + post-processing time, in milliseconds.
    pub processing_time: i64,
    pub translation_enabled: bool,
    /// Local time, `YYYY-MM-DDTHH:MM:SS`.
    pub datetime: String,
    pub prompt_context: PromptContext,
    pub system_audio_enabled: bool,
    pub mode_name: String,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PromptContext {
    pub application_context: ApplicationContext,
    pub system_context: SystemContext,
    pub mode_context: ModeContext,
    pub user_context: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct ApplicationContext {
    pub nouns: Vec<String>,
    pub name: String,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct SystemContext {
    pub time: String,
    pub language: String,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct ModeContext {
    pub examples: Vec<String>,
    #[serde(rename = "type")]
    pub kind: String,
    pub language: String,
}

/// Write `meta.json` for a recording stored in the per-recording layout.
pub fn write_recording_meta(recordings_dir: &Path, file_name: &str, meta: &RecordingMeta) {
    let Some(folder) = recording_folder(recordings_dir, file_name) else {
        return;
    };
    match serde_json::to_string_pretty(meta) {
        Ok(json) => {
            if let Err(e) = fs::write(folder.join(RECORDING_META_FILE), json) {
                warn!("Failed to write {}: {}", RECORDING_META_FILE, e);
            }
        }
        Err(e) => warn!("Failed to serialise recording meta: {}", e),
    }
}

/// Update the text fields of an existing `meta.json` (after re-transcribing
/// or rewriting an entry from History).
pub fn update_recording_meta_text(
    recordings_dir: &Path,
    file_name: &str,
    raw_result: &str,
    result: &str,
    prompt: Option<&str>,
) {
    let Some(folder) = recording_folder(recordings_dir, file_name) else {
        return;
    };
    let path = folder.join(RECORDING_META_FILE);
    let mut value: serde_json::Value = fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if let Some(object) = value.as_object_mut() {
        object.insert("rawResult".into(), raw_result.into());
        object.insert("result".into(), result.into());
        if let Some(prompt) = prompt {
            object.insert("prompt".into(), prompt.into());
        }
    }
    if let Ok(json) = serde_json::to_string_pretty(&value) {
        let _ = fs::write(path, json);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocates_unique_recording_folders() {
        let dir = tempfile::TempDir::new().unwrap();
        let (first, first_path) = allocate_recording(dir.path(), 1768924555);
        assert_eq!(first, "1768924555/output.wav");
        assert!(first_path.parent().unwrap().is_dir());
        let (second, _) = allocate_recording(dir.path(), 1768924555);
        assert_eq!(second, "1768924555-1/output.wav");
    }

    #[test]
    fn removes_whole_recording_folder() {
        let dir = tempfile::TempDir::new().unwrap();
        let (file_name, audio) = allocate_recording(dir.path(), 42);
        fs::write(&audio, b"wav").unwrap();
        write_recording_meta(dir.path(), &file_name, &RecordingMeta::default());
        assert!(dir.path().join("42/meta.json").exists());
        assert!(remove_recording(dir.path(), &file_name).unwrap());
        assert!(!dir.path().join("42").exists());
    }

    #[test]
    fn rejects_parent_folder_names() {
        let dir = Path::new("/tmp/recordings");
        assert!(recording_folder(dir, "../output.wav").is_none());
        assert!(recording_folder(dir, "legacy.wav").is_none());
        assert_eq!(recording_folder(dir, "7/output.wav"), Some(dir.join("7")));
    }

    #[test]
    fn meta_uses_superwhisper_keys() {
        let meta = RecordingMeta {
            model_key: "large".into(),
            mode_name: "Default".into(),
            ..Default::default()
        };
        let json = serde_json::to_value(&meta).unwrap();
        assert_eq!(json["modelKey"], "large");
        assert_eq!(json["modeName"], "Default");
        assert!(json["promptContext"]["applicationContext"]["nouns"].is_array());
        assert!(json["promptContext"]["modeContext"]["type"].is_string());
    }

    #[test]
    fn updates_meta_text_fields() {
        let dir = tempfile::TempDir::new().unwrap();
        let (file_name, _) = allocate_recording(dir.path(), 7);
        write_recording_meta(dir.path(), &file_name, &RecordingMeta::default());
        update_recording_meta_text(dir.path(), &file_name, "raw", "final", Some("p"));
        let value: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(dir.path().join("7/meta.json")).unwrap())
                .unwrap();
        assert_eq!(value["rawResult"], "raw");
        assert_eq!(value["result"], "final");
        assert_eq!(value["prompt"], "p");
        assert_eq!(value["appVersion"], "");
    }
}
