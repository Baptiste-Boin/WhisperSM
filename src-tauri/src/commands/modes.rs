//! Tauri commands for modes (post-process actions) selection.
//!
//! The *active mode* is the one applied by the main recording shortcut. It
//! can be changed from the Modes page or cycled with the "Change mode"
//! shortcut; both paths notify every window through `active-mode-changed`.

use crate::settings::{get_settings, write_settings, PostProcessAction};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, serde::Serialize)]
struct ActiveModeEvent {
    id: String,
    name: String,
    icon: String,
}

fn emit_active_mode(app: &AppHandle, mode: &PostProcessAction) {
    let _ = app.emit(
        "active-mode-changed",
        ActiveModeEvent {
            id: mode.id.clone(),
            name: mode.name.clone(),
            icon: mode.icon.clone(),
        },
    );
}

/// Persist `id` as the active mode and notify the UI.
pub fn set_active_mode_internal(app: &AppHandle, id: &str) -> Result<PostProcessAction, String> {
    let mut settings = get_settings(app);
    let mode = settings
        .post_process_action(id)
        .cloned()
        .ok_or_else(|| format!("Mode '{}' not found", id))?;
    settings.active_mode_id = Some(mode.id.clone());
    write_settings(app, settings);
    emit_active_mode(app, &mode);
    // Keep the menu bar's Mode submenu in sync (not while recording, where
    // the menu shows the recording controls).
    let recording = app
        .try_state::<std::sync::Arc<crate::managers::audio::AudioRecordingManager>>()
        .map(|manager| manager.is_recording())
        .unwrap_or(false);
    if !recording {
        crate::tray::update_tray_menu(app, &crate::tray::TrayIconState::Idle, None);
    }
    Ok(mode)
}

/// Select the mode after the active one (wrapping around), show it briefly
/// in the recording window and notify the UI.
pub fn cycle_active_mode_internal(app: &AppHandle) -> Result<PostProcessAction, String> {
    let settings = get_settings(app);
    if settings.post_process_actions.is_empty() {
        return Err("No modes configured".to_string());
    }
    let current_index = settings
        .active_mode_id
        .as_deref()
        .and_then(|id| {
            settings
                .post_process_actions
                .iter()
                .position(|action| action.id == id)
        })
        .unwrap_or(settings.post_process_actions.len() - 1);
    let next_index = (current_index + 1) % settings.post_process_actions.len();
    let next_id = settings.post_process_actions[next_index].id.clone();
    let mode = set_active_mode_internal(app, &next_id)?;
    crate::overlay::flash_mode_overlay(app, &mode.name);
    Ok(mode)
}

#[tauri::command]
#[specta::specta]
pub fn set_active_mode(app: AppHandle, id: String) -> Result<PostProcessAction, String> {
    set_active_mode_internal(&app, &id)
}

#[tauri::command]
#[specta::specta]
pub fn cycle_active_mode(app: AppHandle) -> Result<PostProcessAction, String> {
    cycle_active_mode_internal(&app)
}

/// Per-mode options edited in the mode editor (everything except the name,
/// instructions, models and shortcuts, which `update_post_process_action`
/// handles).
#[derive(Debug, Clone, serde::Deserialize, specta::Type)]
pub struct ModeOptions {
    pub preset: Option<String>,
    pub tone: Option<u8>,
    pub language: Option<String>,
    pub activate_apps: Vec<String>,
    pub context_application: bool,
    pub context_clipboard: bool,
}

const PRESETS: [&str; 7] = [
    "super", "voice", "message", "mail", "note", "meeting", "custom",
];

#[tauri::command]
#[specta::specta]
pub fn update_mode_options(
    app: AppHandle,
    id: String,
    options: ModeOptions,
) -> Result<PostProcessAction, String> {
    if let Some(preset) = options.preset.as_deref() {
        if !PRESETS.contains(&preset) {
            return Err(format!("Unknown preset '{}'", preset));
        }
    }
    if options.tone.is_some_and(|tone| tone > 4) {
        return Err("Tone must be between 0 and 4".to_string());
    }

    let mut settings = get_settings(&app);
    let mode = settings
        .post_process_actions
        .iter_mut()
        .find(|action| action.id == id)
        .ok_or_else(|| format!("Mode '{}' not found", id))?;

    mode.preset = options.preset;
    mode.tone = options.tone;
    mode.language = options
        .language
        .map(|language| language.trim().to_string())
        .filter(|language| !language.is_empty());
    let mut apps: Vec<String> = Vec::new();
    for app_name in options.activate_apps {
        let app_name = app_name.trim().to_string();
        if !app_name.is_empty() && !apps.iter().any(|a| a.eq_ignore_ascii_case(&app_name)) {
            apps.push(app_name);
        }
    }
    mode.activate_apps = apps;
    mode.context_application = options.context_application;
    mode.context_clipboard = options.context_clipboard;

    let updated = mode.clone();
    write_settings(&app, settings);
    Ok(updated)
}

/// Applications seen in recent dictations, most recent first, to suggest in
/// a mode's "Activate for apps" picker.
#[tauri::command]
#[specta::specta]
pub async fn get_recent_apps(
    history: tauri::State<'_, std::sync::Arc<crate::managers::history::HistoryManager>>,
) -> Result<Vec<String>, String> {
    history
        .recent_app_names(30)
        .await
        .map_err(|e| e.to_string())
}
