//! Tauri commands for modes (post-process actions) selection.
//!
//! The *active mode* is the one applied by the main recording shortcut. It
//! can be changed from the Modes page or cycled with the "Change mode"
//! shortcut; both paths notify every window through `active-mode-changed`.

use crate::settings::{get_settings, write_settings, PostProcessAction};
use tauri::{AppHandle, Emitter};

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
