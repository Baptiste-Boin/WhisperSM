//! Tauri commands for on-device language models.

use crate::local_llm::{LocalLlmManager, LocalLlmModelInfo, LocalLlmStatus};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
#[specta::specta]
pub async fn get_local_llm_models(
    manager: State<'_, Arc<LocalLlmManager>>,
) -> Result<Vec<LocalLlmModelInfo>, String> {
    Ok(manager.list())
}

#[tauri::command]
#[specta::specta]
pub async fn download_local_llm_model(
    app: AppHandle,
    manager: State<'_, Arc<LocalLlmManager>>,
    model_id: String,
) -> Result<(), String> {
    let result = manager
        .download(&model_id)
        .await
        .map_err(|e| format!("{:#}", e));
    if let Err(ref error) = result {
        let _ = app.emit(
            "local-llm-download-failed",
            serde_json::json!({ "model_id": &model_id, "error": error }),
        );
    }
    result
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_local_llm_download(
    manager: State<'_, Arc<LocalLlmManager>>,
    model_id: String,
) -> Result<(), String> {
    manager
        .cancel_download(&model_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_local_llm_model(
    manager: State<'_, Arc<LocalLlmManager>>,
    model_id: String,
) -> Result<(), String> {
    // Deleting may wait for an in-flight generation to release the engine,
    // so keep it off the async runtime threads.
    let manager = Arc::clone(&manager);
    tauri::async_runtime::spawn_blocking(move || {
        manager.delete(&model_id).map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("Local LLM task failed: {}", e))?
}

#[tauri::command]
#[specta::specta]
pub async fn get_local_llm_status(
    manager: State<'_, Arc<LocalLlmManager>>,
) -> Result<LocalLlmStatus, String> {
    Ok(manager.status())
}

#[tauri::command]
#[specta::specta]
pub async fn unload_local_llm(manager: State<'_, Arc<LocalLlmManager>>) -> Result<(), String> {
    let manager = Arc::clone(&manager);
    tauri::async_runtime::spawn_blocking(move || manager.unload())
        .await
        .map_err(|e| format!("Local LLM task failed: {}", e))
}

/// Run a prompt through a downloaded local model. Used by the "Try it"
/// panel so users can check a model before assigning it to a mode.
#[tauri::command]
#[specta::specta]
pub async fn test_local_llm(
    manager: State<'_, Arc<LocalLlmManager>>,
    model_id: String,
    prompt: String,
    text: String,
) -> Result<String, String> {
    let manager = Arc::clone(&manager);
    let user = if prompt.contains("${output}") {
        prompt.replace("${output}", &text)
    } else {
        format!("{}\n\n{}", prompt.trim(), text)
    };
    tauri::async_runtime::spawn_blocking(move || {
        manager
            .generate(&model_id, crate::actions::LOCAL_SYSTEM_PROMPT, &user)
            .map_err(|e| format!("{:#}", e))
    })
    .await
    .map_err(|e| format!("Local LLM task failed: {}", e))?
}
