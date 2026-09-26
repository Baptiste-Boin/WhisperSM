use log::{debug, warn};
use serde::de::{self, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::fmt;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub const APPLE_INTELLIGENCE_PROVIDER_ID: &str = "apple_intelligence";
pub const APPLE_INTELLIGENCE_DEFAULT_MODEL_ID: &str = "Apple Intelligence";

#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

// Custom deserializer to handle both old numeric format (1-5) and new string format ("trace", "debug", etc.)
impl<'de> Deserialize<'de> for LogLevel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct LogLevelVisitor;

        impl<'de> Visitor<'de> for LogLevelVisitor {
            type Value = LogLevel;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string or integer representing log level")
            }

            fn visit_str<E: de::Error>(self, value: &str) -> Result<LogLevel, E> {
                match value.to_lowercase().as_str() {
                    "trace" => Ok(LogLevel::Trace),
                    "debug" => Ok(LogLevel::Debug),
                    "info" => Ok(LogLevel::Info),
                    "warn" => Ok(LogLevel::Warn),
                    "error" => Ok(LogLevel::Error),
                    _ => Err(E::unknown_variant(
                        value,
                        &["trace", "debug", "info", "warn", "error"],
                    )),
                }
            }

            fn visit_u64<E: de::Error>(self, value: u64) -> Result<LogLevel, E> {
                match value {
                    1 => Ok(LogLevel::Trace),
                    2 => Ok(LogLevel::Debug),
                    3 => Ok(LogLevel::Info),
                    4 => Ok(LogLevel::Warn),
                    5 => Ok(LogLevel::Error),
                    _ => Err(E::invalid_value(de::Unexpected::Unsigned(value), &"1-5")),
                }
            }
        }

        deserializer.deserialize_any(LogLevelVisitor)
    }
}

impl From<LogLevel> for tauri_plugin_log::LogLevel {
    fn from(level: LogLevel) -> Self {
        match level {
            LogLevel::Trace => tauri_plugin_log::LogLevel::Trace,
            LogLevel::Debug => tauri_plugin_log::LogLevel::Debug,
            LogLevel::Info => tauri_plugin_log::LogLevel::Info,
            LogLevel::Warn => tauri_plugin_log::LogLevel::Warn,
            LogLevel::Error => tauri_plugin_log::LogLevel::Error,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct ShortcutBinding {
    pub id: String,
    pub name: String,
    pub description: String,
    pub default_binding: String,
    pub current_binding: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LLMPrompt {
    pub id: String,
    pub name: String,
    pub prompt: String,
}

/// A saved language model: a (provider, model) pair the user added in the
/// Models > Language Models tab. Referenced by post-process actions.
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct LLMModel {
    pub id: String,
    pub provider_id: String,
    pub model: String,
    pub label: String,
}

/// A mode (post-processing action): a prompt applied to the transcription
/// through a saved language model, optionally with its own speech model.
/// A mode with an empty prompt is a plain "voice to text" mode.
///
/// Can be triggered by a dedicated global shortcut (stored in `bindings`
/// under `ppa_<id>`), by pressing `trigger_key` while a recording is in
/// progress, or by being the active mode (see `AppSettings::active_mode_id`).
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct PostProcessAction {
    pub id: String,
    pub name: String,
    pub prompt: String,
    #[serde(default)]
    pub llm_model_id: Option<String>,
    #[serde(default = "default_action_icon")]
    pub icon: String,
    #[serde(default)]
    pub trigger_key: Option<u8>,
    /// Speech model used when this mode is active. `None` means the app-wide
    /// selected model.
    #[serde(default)]
    pub speech_model_id: Option<String>,
}

impl PostProcessAction {
    /// A mode without a prompt only transcribes; no language model runs.
    pub fn is_voice_only(&self) -> bool {
        self.prompt.trim().is_empty()
    }
}

pub fn default_action_icon() -> String {
    "sparkles".to_string()
}

/// Id of the built-in "Voice to text" mode that ships with every install.
pub const VOICE_TO_TEXT_MODE_ID: &str = "act_voice_to_text";

/// Interface theme preference.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    Auto,
    Light,
    /// Default: dark interface, like Superwhisper.
    #[default]
    Dark,
}

/// Look of the floating recording window.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type, Default)]
#[serde(rename_all = "lowercase")]
pub enum OverlayStyle {
    /// Timer, waveform and pause/cancel controls.
    #[default]
    Classic,
    /// Compact pill with the waveform only.
    Mini,
}

/// A vocabulary replacement: whenever `from` is transcribed it is rewritten
/// as `to` (case-insensitive, whole words).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Type)]
pub struct VocabularyReplacement {
    pub from: String,
    pub to: String,
}

/// Prefix for per-action global shortcut binding ids stored in `bindings`.
pub const ACTION_BINDING_PREFIX: &str = "ppa_";

pub fn action_binding_id(action_id: &str) -> String {
    format!("{}{}", ACTION_BINDING_PREFIX, action_id)
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct PostProcessProvider {
    pub id: String,
    pub label: String,
    pub base_url: String,
    #[serde(default)]
    pub allow_base_url_edit: bool,
    #[serde(default)]
    pub models_endpoint: Option<String>,
    #[serde(default)]
    pub supports_structured_output: bool,
    /// Offers chat/language models usable by modes.
    #[serde(default = "default_true")]
    pub supports_language: bool,
    /// Offers a speech-to-text endpoint usable as a cloud voice model.
    #[serde(default)]
    pub supports_speech: bool,
    /// Where the user can create an API key.
    #[serde(default)]
    pub api_key_url: Option<String>,
    /// Short note about the provider's free tier, shown in the API key dialog.
    #[serde(default)]
    pub free_tier: Option<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
pub enum OverlayPosition {
    None,
    Top,
    Bottom,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum ModelUnloadTimeout {
    Never,
    Immediately,
    Min2,
    Min5,
    Min10,
    Min15,
    Hour1,
    Sec15, // Debug mode only
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum PasteMethod {
    CtrlV,
    Direct,
    None,
    ShiftInsert,
    CtrlShiftV,
    ExternalScript,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum ClipboardHandling {
    DontModify,
    CopyToClipboard,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum AutoSubmitKey {
    Enter,
    CtrlEnter,
    CmdEnter,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum RecordingRetentionPeriod {
    Never,
    PreserveLimit,
    Days3,
    Weeks2,
    Months3,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum KeyboardImplementation {
    Tauri,
    HandyKeys,
}

impl Default for KeyboardImplementation {
    fn default() -> Self {
        #[cfg(target_os = "linux")]
        return KeyboardImplementation::Tauri;
        #[cfg(not(target_os = "linux"))]
        return KeyboardImplementation::HandyKeys;
    }
}

impl Default for ModelUnloadTimeout {
    fn default() -> Self {
        ModelUnloadTimeout::Min5
    }
}

impl Default for PasteMethod {
    fn default() -> Self {
        // Default to CtrlV for macOS and Windows, Direct for Linux
        #[cfg(target_os = "linux")]
        return PasteMethod::Direct;
        #[cfg(not(target_os = "linux"))]
        return PasteMethod::CtrlV;
    }
}

impl Default for ClipboardHandling {
    fn default() -> Self {
        ClipboardHandling::DontModify
    }
}

impl Default for AutoSubmitKey {
    fn default() -> Self {
        AutoSubmitKey::Enter
    }
}

impl ModelUnloadTimeout {
    pub fn to_minutes(self) -> Option<u64> {
        match self {
            ModelUnloadTimeout::Never => None,
            ModelUnloadTimeout::Immediately => Some(0), // Special case for immediate unloading
            ModelUnloadTimeout::Min2 => Some(2),
            ModelUnloadTimeout::Min5 => Some(5),
            ModelUnloadTimeout::Min10 => Some(10),
            ModelUnloadTimeout::Min15 => Some(15),
            ModelUnloadTimeout::Hour1 => Some(60),
            ModelUnloadTimeout::Sec15 => Some(0), // Special case for debug - handled separately
        }
    }

    pub fn to_seconds(self) -> Option<u64> {
        match self {
            ModelUnloadTimeout::Never => None,
            ModelUnloadTimeout::Immediately => Some(0), // Special case for immediate unloading
            ModelUnloadTimeout::Sec15 => Some(15),
            _ => self.to_minutes().map(|m| m * 60),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum SoundTheme {
    Marimba,
    Pop,
    Custom,
}

impl SoundTheme {
    fn as_str(&self) -> &'static str {
        match self {
            SoundTheme::Marimba => "marimba",
            SoundTheme::Pop => "pop",
            SoundTheme::Custom => "custom",
        }
    }

    pub fn to_start_path(&self) -> String {
        format!("resources/{}_start.wav", self.as_str())
    }

    pub fn to_stop_path(&self) -> String {
        format!("resources/{}_stop.wav", self.as_str())
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum TypingTool {
    Auto,
    Wtype,
    Kwtype,
    Dotool,
    Ydotool,
    Xdotool,
}

impl Default for TypingTool {
    fn default() -> Self {
        TypingTool::Auto
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum WhisperAcceleratorSetting {
    Auto,
    Cpu,
    Gpu,
}

impl Default for WhisperAcceleratorSetting {
    fn default() -> Self {
        WhisperAcceleratorSetting::Auto
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum OrtAcceleratorSetting {
    Auto,
    Cpu,
    Cuda,
    #[serde(rename = "directml")]
    DirectMl,
    Rocm,
}

impl Default for OrtAcceleratorSetting {
    fn default() -> Self {
        OrtAcceleratorSetting::Auto
    }
}

#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub(crate) struct SecretMap(HashMap<String, String>);

impl fmt::Debug for SecretMap {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let redacted: HashMap<&String, &str> = self
            .0
            .iter()
            .map(|(k, v)| (k, if v.is_empty() { "" } else { "[REDACTED]" }))
            .collect();
        redacted.fmt(f)
    }
}

impl std::ops::Deref for SecretMap {
    type Target = HashMap<String, String>;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::DerefMut for SecretMap {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}

/* Persisted application settings ------------------------------------- */
#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct AppSettings {
    pub bindings: HashMap<String, ShortcutBinding>,
    pub push_to_talk: bool,
    pub audio_feedback: bool,
    #[serde(default = "default_audio_feedback_volume")]
    pub audio_feedback_volume: f32,
    #[serde(default = "default_sound_theme")]
    pub sound_theme: SoundTheme,
    #[serde(default = "default_start_hidden")]
    pub start_hidden: bool,
    #[serde(default = "default_autostart_enabled")]
    pub autostart_enabled: bool,
    #[serde(default = "default_update_checks_enabled")]
    pub update_checks_enabled: bool,
    #[serde(default = "default_model")]
    pub selected_model: String,
    #[serde(default = "default_always_on_microphone")]
    pub always_on_microphone: bool,
    #[serde(default)]
    pub selected_microphone: Option<String>,
    #[serde(default)]
    pub clamshell_microphone: Option<String>,
    #[serde(default)]
    pub selected_output_device: Option<String>,
    #[serde(default = "default_translate_to_english")]
    pub translate_to_english: bool,
    #[serde(default = "default_selected_language")]
    pub selected_language: String,
    #[serde(default = "default_overlay_position")]
    pub overlay_position: OverlayPosition,
    #[serde(default = "default_debug_mode")]
    pub debug_mode: bool,
    #[serde(default = "default_log_level")]
    pub log_level: LogLevel,
    #[serde(default)]
    pub custom_words: Vec<String>,
    #[serde(default)]
    pub model_unload_timeout: ModelUnloadTimeout,
    #[serde(default = "default_word_correction_threshold")]
    pub word_correction_threshold: f64,
    #[serde(default = "default_history_limit")]
    pub history_limit: usize,
    #[serde(default = "default_recording_retention_period")]
    pub recording_retention_period: RecordingRetentionPeriod,
    #[serde(default)]
    pub paste_method: PasteMethod,
    #[serde(default)]
    pub clipboard_handling: ClipboardHandling,
    #[serde(default = "default_auto_submit")]
    pub auto_submit: bool,
    #[serde(default)]
    pub auto_submit_key: AutoSubmitKey,
    #[serde(default = "default_post_process_enabled")]
    pub post_process_enabled: bool,
    #[serde(default = "default_post_process_provider_id")]
    pub post_process_provider_id: String,
    #[serde(default = "default_post_process_providers")]
    pub post_process_providers: Vec<PostProcessProvider>,
    #[serde(default = "default_post_process_api_keys")]
    pub post_process_api_keys: SecretMap,
    #[serde(default = "default_post_process_models")]
    pub post_process_models: HashMap<String, String>,
    #[serde(default = "default_post_process_prompts")]
    pub post_process_prompts: Vec<LLMPrompt>,
    #[serde(default)]
    pub post_process_selected_prompt_id: Option<String>,
    #[serde(default)]
    pub llm_models: Vec<LLMModel>,
    #[serde(default)]
    pub post_process_actions: Vec<PostProcessAction>,
    #[serde(default)]
    pub post_process_actions_initialized: bool,
    #[serde(default)]
    pub mute_while_recording: bool,
    #[serde(default)]
    pub append_trailing_space: bool,
    #[serde(default = "default_app_language")]
    pub app_language: String,
    #[serde(default)]
    pub experimental_enabled: bool,
    #[serde(default)]
    pub lazy_stream_close: bool,
    #[serde(default)]
    pub keyboard_implementation: KeyboardImplementation,
    #[serde(default = "default_show_tray_icon")]
    pub show_tray_icon: bool,
    #[serde(default = "default_paste_delay_ms")]
    pub paste_delay_ms: u64,
    #[serde(default = "default_typing_tool")]
    pub typing_tool: TypingTool,
    pub external_script_path: Option<String>,
    #[serde(default)]
    pub custom_filler_words: Option<Vec<String>>,
    #[serde(default)]
    pub whisper_accelerator: WhisperAcceleratorSetting,
    #[serde(default)]
    pub ort_accelerator: OrtAcceleratorSetting,
    #[serde(default = "default_whisper_gpu_device")]
    pub whisper_gpu_device: i32,
    #[serde(default)]
    pub extra_recording_buffer_ms: u64,
    #[serde(default)]
    pub long_audio_model: Option<String>,
    #[serde(default = "default_long_audio_threshold_seconds")]
    pub long_audio_threshold_seconds: f32,
    /// Interface theme (auto follows the system).
    #[serde(default)]
    pub theme: ThemePreference,
    /// Look of the floating recording window.
    #[serde(default)]
    pub overlay_style: OverlayStyle,
    /// Keep the recording window visible (in an idle state) between recordings.
    #[serde(default)]
    pub overlay_always_show: bool,
    /// Mode applied by the main recording shortcut.
    #[serde(default)]
    pub active_mode_id: Option<String>,
    /// Vocabulary replacements applied to every transcription.
    #[serde(default)]
    pub vocabulary_replacements: Vec<VocabularyReplacement>,
    /// Drop silent audio (voice activity detection) before transcribing.
    #[serde(default = "default_true")]
    pub silence_removal: bool,
}

fn default_model() -> String {
    "".to_string()
}

fn default_always_on_microphone() -> bool {
    false
}

fn default_translate_to_english() -> bool {
    false
}

fn default_start_hidden() -> bool {
    false
}

fn default_autostart_enabled() -> bool {
    false
}

fn default_update_checks_enabled() -> bool {
    true
}

fn default_selected_language() -> String {
    "auto".to_string()
}

fn default_overlay_position() -> OverlayPosition {
    #[cfg(target_os = "linux")]
    return OverlayPosition::None;
    #[cfg(not(target_os = "linux"))]
    return OverlayPosition::Bottom;
}

fn default_debug_mode() -> bool {
    false
}

fn default_log_level() -> LogLevel {
    LogLevel::Debug
}

fn default_word_correction_threshold() -> f64 {
    0.18
}

fn default_paste_delay_ms() -> u64 {
    60
}

fn default_auto_submit() -> bool {
    false
}

fn default_history_limit() -> usize {
    5
}

fn default_recording_retention_period() -> RecordingRetentionPeriod {
    RecordingRetentionPeriod::PreserveLimit
}

fn default_audio_feedback_volume() -> f32 {
    1.0
}

fn default_sound_theme() -> SoundTheme {
    SoundTheme::Marimba
}

fn default_post_process_enabled() -> bool {
    false
}

fn default_app_language() -> String {
    tauri_plugin_os::locale()
        .map(|l| l.replace('_', "-"))
        .unwrap_or_else(|| "en".to_string())
}

fn default_show_tray_icon() -> bool {
    true
}

fn default_post_process_provider_id() -> String {
    "openai".to_string()
}

/// Build a cloud provider entry with the common defaults.
#[allow(clippy::too_many_arguments)]
fn cloud_provider(
    id: &str,
    label: &str,
    base_url: &str,
    structured_output: bool,
    supports_language: bool,
    supports_speech: bool,
    api_key_url: &str,
    free_tier: Option<&str>,
) -> PostProcessProvider {
    PostProcessProvider {
        id: id.to_string(),
        label: label.to_string(),
        base_url: base_url.to_string(),
        allow_base_url_edit: false,
        models_endpoint: if supports_language {
            Some("/models".to_string())
        } else {
            None
        },
        supports_structured_output: structured_output,
        supports_language,
        supports_speech,
        api_key_url: Some(api_key_url.to_string()),
        free_tier: free_tier.map(|s| s.to_string()),
    }
}

fn default_post_process_providers() -> Vec<PostProcessProvider> {
    let mut providers = vec![
        cloud_provider(
            "gemini",
            "Google Gemini",
            "https://generativelanguage.googleapis.com/v1beta/openai",
            true,
            true,
            false,
            "https://aistudio.google.com/apikey",
            Some("Free tier: Flash models at no cost, rate limited."),
        ),
        cloud_provider(
            "mistral",
            "Mistral AI",
            "https://api.mistral.ai/v1",
            true,
            true,
            true,
            "https://console.mistral.ai/api-keys",
            Some("Free Experiment plan: all models, rate limited, no card."),
        ),
        cloud_provider(
            "groq",
            "Groq",
            "https://api.groq.com/openai/v1",
            false,
            true,
            true,
            "https://console.groq.com/keys",
            Some("Free tier: open-weight chat models and Whisper transcription."),
        ),
        cloud_provider(
            "zai",
            "Z.AI",
            "https://api.z.ai/api/paas/v4",
            true,
            true,
            false,
            "https://z.ai/manage-apikey/apikey-list",
            Some("GLM Flash models are free."),
        ),
        cloud_provider(
            "cerebras",
            "Cerebras",
            "https://api.cerebras.ai/v1",
            true,
            true,
            false,
            "https://cloud.cerebras.ai",
            Some("Free trial credits on sign-up."),
        ),
        cloud_provider(
            "openrouter",
            "OpenRouter",
            "https://openrouter.ai/api/v1",
            true,
            true,
            false,
            "https://openrouter.ai/keys",
            Some("Models tagged \":free\" cost nothing."),
        ),
        cloud_provider(
            "deepgram",
            "Deepgram",
            "https://api.deepgram.com/v1",
            false,
            false,
            true,
            "https://console.deepgram.com",
            Some("$200 free credit on sign-up, no card."),
        ),
        cloud_provider(
            "elevenlabs",
            "ElevenLabs",
            "https://api.elevenlabs.io/v1",
            false,
            false,
            true,
            "https://elevenlabs.io/app/settings/api-keys",
            Some("Free plan includes Scribe transcription credits."),
        ),
        cloud_provider(
            "cohere",
            "Cohere",
            "https://api.cohere.com/v2",
            false,
            false,
            true,
            "https://dashboard.cohere.com/api-keys",
            Some("Trial keys are free, rate limited."),
        ),
        cloud_provider(
            "openai",
            "OpenAI",
            "https://api.openai.com/v1",
            true,
            true,
            true,
            "https://platform.openai.com/api-keys",
            None,
        ),
        cloud_provider(
            "anthropic",
            "Anthropic",
            "https://api.anthropic.com/v1",
            false,
            true,
            false,
            "https://console.anthropic.com/settings/keys",
            None,
        ),
    ];

    // Note: We always include Apple Intelligence on macOS ARM64 without checking availability
    // at startup. The availability check is deferred to when the user actually tries to use it
    // (in actions.rs). This prevents crashes on macOS 26.x beta where accessing
    // SystemLanguageModel.default during early app initialization causes SIGABRT.
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        providers.push(PostProcessProvider {
            id: APPLE_INTELLIGENCE_PROVIDER_ID.to_string(),
            label: "Apple Intelligence".to_string(),
            base_url: "apple-intelligence://local".to_string(),
            allow_base_url_edit: false,
            models_endpoint: None,
            supports_structured_output: true,
            supports_language: true,
            supports_speech: false,
            api_key_url: None,
            free_tier: None,
        });
    }

    // On-device models served by the bundled inference engine
    providers.push(PostProcessProvider {
        id: crate::local_llm::LOCAL_LLM_PROVIDER_ID.to_string(),
        label: "On-device (WhisperSM)".to_string(),
        base_url: "local://whispersm".to_string(),
        allow_base_url_edit: false,
        models_endpoint: None,
        supports_structured_output: false,
        supports_language: true,
        supports_speech: false,
        api_key_url: None,
        free_tier: None,
    });

    // Custom provider always comes last
    providers.push(PostProcessProvider {
        id: "custom".to_string(),
        label: "Custom".to_string(),
        base_url: "http://localhost:11434/v1".to_string(),
        allow_base_url_edit: true,
        models_endpoint: Some("/models".to_string()),
        supports_structured_output: false,
        supports_language: true,
        supports_speech: true,
        api_key_url: None,
        free_tier: None,
    });

    providers
}

fn default_post_process_api_keys() -> SecretMap {
    let mut map = HashMap::new();
    for provider in default_post_process_providers() {
        map.insert(provider.id, String::new());
    }
    SecretMap(map)
}

fn default_model_for_provider(provider_id: &str) -> String {
    if provider_id == APPLE_INTELLIGENCE_PROVIDER_ID {
        return APPLE_INTELLIGENCE_DEFAULT_MODEL_ID.to_string();
    }
    String::new()
}

fn default_post_process_models() -> HashMap<String, String> {
    let mut map = HashMap::new();
    for provider in default_post_process_providers() {
        map.insert(
            provider.id.clone(),
            default_model_for_provider(&provider.id),
        );
    }
    map
}

fn default_post_process_prompts() -> Vec<LLMPrompt> {
    vec![
        LLMPrompt {
            id: "default_improve_transcriptions".to_string(),
            name: "Clean up".to_string(),
            prompt: "Clean this transcript:\n1. Fix spelling, capitalization, and punctuation errors\n2. Convert number words to digits (twenty-five → 25, ten percent → 10%, five dollars → $5)\n3. Replace spoken punctuation with symbols (period → ., comma → ,, question mark → ?)\n4. Remove filler words (um, uh, like as filler)\n5. Keep the language in the original version (if it was french, keep it in french for example)\n\nPreserve exact meaning and word order. Do not paraphrase or reorder content.\n\nReturn only the cleaned transcript.\n\nTranscript:\n${output}".to_string(),
        },
        LLMPrompt {
            id: "default_email".to_string(),
            name: "Email".to_string(),
            prompt: "Rewrite this dictated text as a clear, polite email body. Keep the original language, meaning and tone. Fix grammar and punctuation, split into short paragraphs, add a greeting and a sign-off only if the text implies them. Do not invent facts.\n\nReturn only the email text.\n\nText:\n${output}".to_string(),
        },
        LLMPrompt {
            id: "default_message".to_string(),
            name: "Message".to_string(),
            prompt: "Turn this dictated text into a short, natural chat message. Keep the original language and meaning, remove filler words and repetitions, keep it casual and concise. Do not add anything that was not said.\n\nReturn only the message.\n\nText:\n${output}".to_string(),
        },
        LLMPrompt {
            id: "default_notes".to_string(),
            name: "Notes".to_string(),
            prompt: "Convert this dictated text into structured notes in the original language. Use short bullet points, group related ideas, keep names, numbers and dates exact. Do not add information that was not said.\n\nReturn only the notes.\n\nText:\n${output}".to_string(),
        },
    ]
}

/// Icon used for the built-in prompts when they are migrated into actions.
fn default_icon_for_prompt(prompt_id: &str) -> String {
    match prompt_id {
        "default_email" => "mail",
        "default_message" => "chat",
        "default_notes" => "checklist",
        _ => "sparkles",
    }
    .to_string()
}

fn default_long_audio_threshold_seconds() -> f32 {
    10.0
}

fn default_whisper_gpu_device() -> i32 {
    -1 // auto
}

fn default_typing_tool() -> TypingTool {
    TypingTool::Auto
}

fn ensure_post_process_defaults(settings: &mut AppSettings) -> bool {
    let mut changed = false;
    for provider in default_post_process_providers() {
        // Use match to do a single lookup - either sync existing or add new
        match settings
            .post_process_providers
            .iter_mut()
            .find(|p| p.id == provider.id)
        {
            Some(existing) => {
                // Sync capability metadata for existing providers (migration)
                if existing.supports_structured_output != provider.supports_structured_output {
                    debug!(
                        "Updating supports_structured_output for provider '{}' from {} to {}",
                        provider.id,
                        existing.supports_structured_output,
                        provider.supports_structured_output
                    );
                    existing.supports_structured_output = provider.supports_structured_output;
                    changed = true;
                }
                if existing.supports_language != provider.supports_language
                    || existing.supports_speech != provider.supports_speech
                    || existing.api_key_url != provider.api_key_url
                    || existing.free_tier != provider.free_tier
                    || existing.label != provider.label
                {
                    existing.supports_language = provider.supports_language;
                    existing.supports_speech = provider.supports_speech;
                    existing.api_key_url = provider.api_key_url.clone();
                    existing.free_tier = provider.free_tier.clone();
                    existing.label = provider.label.clone();
                    changed = true;
                }
            }
            None => {
                // Provider doesn't exist, add it
                settings.post_process_providers.push(provider.clone());
                changed = true;
            }
        }

        if !settings.post_process_api_keys.contains_key(&provider.id) {
            settings
                .post_process_api_keys
                .insert(provider.id.clone(), String::new());
            changed = true;
        }

        let default_model = default_model_for_provider(&provider.id);
        match settings.post_process_models.get_mut(&provider.id) {
            Some(existing) => {
                if existing.is_empty() && !default_model.is_empty() {
                    *existing = default_model.clone();
                    changed = true;
                }
            }
            None => {
                settings
                    .post_process_models
                    .insert(provider.id.clone(), default_model);
                changed = true;
            }
        }
    }

    changed
}

/// One-time migration: build saved language models and post-process actions
/// from the legacy prompt/provider configuration. Returns true when settings
/// were modified and need to be persisted.
fn ensure_post_process_actions(settings: &mut AppSettings) -> bool {
    if settings.post_process_actions_initialized {
        return false;
    }

    // Migrate the active provider/model pair into a saved language model.
    let mut default_model_id: Option<String> = settings.llm_models.first().map(|m| m.id.clone());
    if default_model_id.is_none() {
        if let Some(provider) = settings.active_post_process_provider().cloned() {
            if provider.id != APPLE_INTELLIGENCE_PROVIDER_ID {
                if let Some(model) = settings.post_process_models.get(&provider.id).cloned() {
                    if !model.trim().is_empty() {
                        let id = format!("llm_{}", chrono::Utc::now().timestamp_millis());
                        settings.llm_models.push(LLMModel {
                            id: id.clone(),
                            provider_id: provider.id.clone(),
                            model: model.clone(),
                            label: model,
                        });
                        default_model_id = Some(id);
                    }
                }
            }
        }
    }

    // Migrate prompts into actions, assigning trigger keys 1..9.
    if settings.post_process_actions.is_empty() {
        for (index, prompt) in settings.post_process_prompts.iter().enumerate() {
            let trigger_key = u8::try_from(index + 1).ok().filter(|key| *key <= 9);
            settings.post_process_actions.push(PostProcessAction {
                id: format!("act_migrated_{}", index),
                name: prompt.name.clone(),
                prompt: prompt.prompt.clone(),
                llm_model_id: default_model_id.clone(),
                icon: default_icon_for_prompt(&prompt.id),
                trigger_key,
                speech_model_id: None,
            });
        }
    }

    settings.post_process_actions_initialized = true;
    true
}

/// Make sure the built-in "Voice to text" mode exists and that
/// `active_mode_id` points to an existing mode. Runs on every load.
fn ensure_modes(settings: &mut AppSettings) -> bool {
    let mut changed = false;

    if !settings
        .post_process_actions
        .iter()
        .any(|action| action.id == VOICE_TO_TEXT_MODE_ID)
    {
        settings.post_process_actions.insert(
            0,
            PostProcessAction {
                id: VOICE_TO_TEXT_MODE_ID.to_string(),
                name: "Voice to text".to_string(),
                prompt: String::new(),
                llm_model_id: None,
                icon: "mic".to_string(),
                trigger_key: None,
                speech_model_id: None,
            },
        );
        changed = true;
    }

    let active_is_valid = settings
        .active_mode_id
        .as_deref()
        .map(|id| settings.post_process_actions.iter().any(|a| a.id == id))
        .unwrap_or(false);
    if !active_is_valid {
        settings.active_mode_id = Some(VOICE_TO_TEXT_MODE_ID.to_string());
        changed = true;
    }

    changed
}

/// Ensure every post-process action has a matching `ppa_<id>` shortcut binding
/// (created empty so the binding UI can manage it) and prune any orphan
/// `ppa_` bindings whose action no longer exists. Returns true when settings
/// were modified. Runs on every load so migrated actions stay consistent.
fn ensure_action_bindings(settings: &mut AppSettings) -> bool {
    let mut changed = false;

    // Create a binding for any action that lacks one. Collect first to avoid
    // borrowing post_process_actions while mutating bindings.
    let to_create: Vec<(String, String)> = settings
        .post_process_actions
        .iter()
        .map(|action| (action_binding_id(&action.id), action.name.clone()))
        .filter(|(binding_id, _)| !settings.bindings.contains_key(binding_id))
        .collect();
    for (binding_id, name) in to_create {
        settings.bindings.insert(
            binding_id.clone(),
            ShortcutBinding {
                id: binding_id,
                name,
                description: "Starts a transcription processed with this action.".to_string(),
                default_binding: String::new(),
                current_binding: String::new(),
            },
        );
        changed = true;
    }

    // Prune orphan ppa_ bindings (action deleted out of band).
    let valid_ids: std::collections::HashSet<String> = settings
        .post_process_actions
        .iter()
        .map(|action| action_binding_id(&action.id))
        .collect();
    let orphans: Vec<String> = settings
        .bindings
        .keys()
        .filter(|key| key.starts_with(ACTION_BINDING_PREFIX) && !valid_ids.contains(*key))
        .cloned()
        .collect();
    for key in orphans {
        settings.bindings.remove(&key);
        changed = true;
    }

    changed
}

pub const SETTINGS_STORE_PATH: &str = "settings_store.json";

pub fn get_default_settings() -> AppSettings {
    #[cfg(target_os = "windows")]
    let default_shortcut = "ctrl+space";
    #[cfg(target_os = "macos")]
    let default_shortcut = "option+space";
    #[cfg(target_os = "linux")]
    let default_shortcut = "ctrl+space";
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let default_shortcut = "alt+space";

    let mut bindings = HashMap::new();
    bindings.insert(
        "transcribe".to_string(),
        ShortcutBinding {
            id: "transcribe".to_string(),
            name: "Transcribe".to_string(),
            description: "Converts your speech into text.".to_string(),
            default_binding: default_shortcut.to_string(),
            current_binding: default_shortcut.to_string(),
        },
    );
    #[cfg(target_os = "windows")]
    let default_post_process_shortcut = "ctrl+shift+space";
    #[cfg(target_os = "macos")]
    let default_post_process_shortcut = "option+shift+space";
    #[cfg(target_os = "linux")]
    let default_post_process_shortcut = "ctrl+shift+space";
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let default_post_process_shortcut = "alt+shift+space";

    bindings.insert(
        "transcribe_with_post_process".to_string(),
        ShortcutBinding {
            id: "transcribe_with_post_process".to_string(),
            name: "Transcribe with Post-Processing".to_string(),
            description: "Converts your speech into text and applies AI post-processing."
                .to_string(),
            default_binding: default_post_process_shortcut.to_string(),
            current_binding: default_post_process_shortcut.to_string(),
        },
    );
    bindings.insert(
        "push_to_talk".to_string(),
        ShortcutBinding {
            id: "push_to_talk".to_string(),
            name: "Push to Talk".to_string(),
            description: "Hold to record, release when done.".to_string(),
            default_binding: "".to_string(),
            current_binding: "".to_string(),
        },
    );
    #[cfg(target_os = "macos")]
    let default_change_mode_shortcut = "option+shift+k";
    #[cfg(not(target_os = "macos"))]
    let default_change_mode_shortcut = "ctrl+shift+k";
    bindings.insert(
        "change_mode".to_string(),
        ShortcutBinding {
            id: "change_mode".to_string(),
            name: "Change mode".to_string(),
            description: "Switches to the next mode.".to_string(),
            default_binding: default_change_mode_shortcut.to_string(),
            current_binding: default_change_mode_shortcut.to_string(),
        },
    );
    bindings.insert(
        "cancel".to_string(),
        ShortcutBinding {
            id: "cancel".to_string(),
            name: "Cancel".to_string(),
            description: "Cancels the current recording.".to_string(),
            default_binding: "escape".to_string(),
            current_binding: "escape".to_string(),
        },
    );
    bindings.insert(
        "pause".to_string(),
        ShortcutBinding {
            id: "pause".to_string(),
            name: "Pause / Resume".to_string(),
            description: "Pauses or resumes the current recording.".to_string(),
            default_binding: "f6".to_string(),
            current_binding: "f6".to_string(),
        },
    );
    bindings.insert(
        "show_history".to_string(),
        ShortcutBinding {
            id: "show_history".to_string(),
            name: "Show History".to_string(),
            description: "Opens the app window and navigates to the History tab.".to_string(),
            default_binding: "".to_string(),
            current_binding: "".to_string(),
        },
    );
    bindings.insert(
        "copy_latest_history".to_string(),
        ShortcutBinding {
            id: "copy_latest_history".to_string(),
            name: "Copy Latest History".to_string(),
            description: "Copies the latest transcription entry to your clipboard.".to_string(),
            default_binding: "".to_string(),
            current_binding: "".to_string(),
        },
    );

    AppSettings {
        bindings,
        push_to_talk: true,
        audio_feedback: false,
        audio_feedback_volume: default_audio_feedback_volume(),
        sound_theme: default_sound_theme(),
        start_hidden: default_start_hidden(),
        autostart_enabled: default_autostart_enabled(),
        update_checks_enabled: default_update_checks_enabled(),
        selected_model: "".to_string(),
        always_on_microphone: false,
        selected_microphone: None,
        clamshell_microphone: None,
        selected_output_device: None,
        translate_to_english: false,
        selected_language: "auto".to_string(),
        overlay_position: default_overlay_position(),
        debug_mode: false,
        log_level: default_log_level(),
        custom_words: Vec::new(),
        model_unload_timeout: ModelUnloadTimeout::default(),
        word_correction_threshold: default_word_correction_threshold(),
        history_limit: default_history_limit(),
        recording_retention_period: default_recording_retention_period(),
        paste_method: PasteMethod::default(),
        clipboard_handling: ClipboardHandling::default(),
        auto_submit: default_auto_submit(),
        auto_submit_key: AutoSubmitKey::default(),
        post_process_enabled: default_post_process_enabled(),
        post_process_provider_id: default_post_process_provider_id(),
        post_process_providers: default_post_process_providers(),
        post_process_api_keys: default_post_process_api_keys(),
        post_process_models: default_post_process_models(),
        post_process_prompts: default_post_process_prompts(),
        post_process_selected_prompt_id: None,
        llm_models: Vec::new(),
        post_process_actions: Vec::new(),
        post_process_actions_initialized: false,
        mute_while_recording: false,
        append_trailing_space: false,
        app_language: default_app_language(),
        experimental_enabled: false,
        lazy_stream_close: false,
        keyboard_implementation: KeyboardImplementation::default(),
        show_tray_icon: default_show_tray_icon(),
        paste_delay_ms: default_paste_delay_ms(),
        typing_tool: default_typing_tool(),
        external_script_path: None,
        custom_filler_words: None,
        whisper_accelerator: WhisperAcceleratorSetting::default(),
        ort_accelerator: OrtAcceleratorSetting::default(),
        whisper_gpu_device: default_whisper_gpu_device(),
        extra_recording_buffer_ms: 0,
        long_audio_model: None,
        long_audio_threshold_seconds: default_long_audio_threshold_seconds(),
        theme: ThemePreference::default(),
        overlay_style: OverlayStyle::default(),
        overlay_always_show: false,
        active_mode_id: None,
        vocabulary_replacements: Vec::new(),
        silence_removal: true,
    }
}

impl AppSettings {
    pub fn active_post_process_provider(&self) -> Option<&PostProcessProvider> {
        self.post_process_providers
            .iter()
            .find(|provider| provider.id == self.post_process_provider_id)
    }

    pub fn post_process_provider(&self, provider_id: &str) -> Option<&PostProcessProvider> {
        self.post_process_providers
            .iter()
            .find(|provider| provider.id == provider_id)
    }

    pub fn post_process_provider_mut(
        &mut self,
        provider_id: &str,
    ) -> Option<&mut PostProcessProvider> {
        self.post_process_providers
            .iter_mut()
            .find(|provider| provider.id == provider_id)
    }

    pub fn llm_model(&self, id: &str) -> Option<&LLMModel> {
        self.llm_models.iter().find(|model| model.id == id)
    }

    pub fn post_process_action(&self, id: &str) -> Option<&PostProcessAction> {
        self.post_process_actions
            .iter()
            .find(|action| action.id == id)
    }

    pub fn post_process_action_by_trigger_key(&self, key: u8) -> Option<&PostProcessAction> {
        self.post_process_actions
            .iter()
            .find(|action| action.trigger_key == Some(key))
    }

    /// The mode applied by the main recording shortcut.
    pub fn active_mode(&self) -> Option<&PostProcessAction> {
        self.active_mode_id
            .as_deref()
            .and_then(|id| self.post_process_action(id))
    }

    /// The action used by the generic "transcribe with post-processing"
    /// shortcut when no specific action was selected: the active mode when it
    /// uses AI, otherwise the first AI mode in the list.
    pub fn default_post_process_action(&self) -> Option<&PostProcessAction> {
        self.active_mode()
            .filter(|action| !action.is_voice_only())
            .or_else(|| {
                self.post_process_actions
                    .iter()
                    .find(|action| !action.is_voice_only())
            })
    }
}

pub fn load_or_create_app_settings(app: &AppHandle) -> AppSettings {
    // Initialize store
    let store = app
        .store(crate::portable::store_path(SETTINGS_STORE_PATH))
        .expect("Failed to initialize store");

    let mut settings = if let Some(settings_value) = store.get("settings") {
        // Parse the entire settings object
        match serde_json::from_value::<AppSettings>(settings_value) {
            Ok(mut settings) => {
                debug!("Found existing settings: {:?}", settings);
                let default_settings = get_default_settings();
                let mut updated = false;

                // Merge default bindings into existing settings
                for (key, value) in default_settings.bindings {
                    if !settings.bindings.contains_key(&key) {
                        debug!("Adding missing binding: {}", key);
                        settings.bindings.insert(key, value);
                        updated = true;
                    }
                }

                if updated {
                    debug!("Settings updated with new bindings");
                    store.set("settings", serde_json::to_value(&settings).unwrap());
                }

                settings
            }
            Err(e) => {
                warn!("Failed to parse settings: {}", e);
                // Fall back to default settings if parsing fails
                let default_settings = get_default_settings();
                store.set("settings", serde_json::to_value(&default_settings).unwrap());
                default_settings
            }
        }
    } else {
        let default_settings = get_default_settings();
        store.set("settings", serde_json::to_value(&default_settings).unwrap());
        default_settings
    };

    let mut changed = ensure_post_process_defaults(&mut settings);
    changed |= ensure_post_process_actions(&mut settings);
    changed |= ensure_modes(&mut settings);
    changed |= ensure_action_bindings(&mut settings);
    if changed {
        store.set("settings", serde_json::to_value(&settings).unwrap());
    }

    settings
}

pub fn get_settings(app: &AppHandle) -> AppSettings {
    let store = app
        .store(crate::portable::store_path(SETTINGS_STORE_PATH))
        .expect("Failed to initialize store");

    let mut settings = if let Some(settings_value) = store.get("settings") {
        serde_json::from_value::<AppSettings>(settings_value).unwrap_or_else(|_| {
            let default_settings = get_default_settings();
            store.set("settings", serde_json::to_value(&default_settings).unwrap());
            default_settings
        })
    } else {
        let default_settings = get_default_settings();
        store.set("settings", serde_json::to_value(&default_settings).unwrap());
        default_settings
    };

    let mut updated = false;

    // Backfill new default bindings that the user's stored settings don't know
    // about yet (e.g. new bindings added in later versions). Without this, the
    // UI renders undefined bindings using the generic fallback label.
    let default_bindings = get_default_settings().bindings;
    for (key, value) in default_bindings {
        if !settings.bindings.contains_key(&key) {
            debug!("Adding missing binding: {}", key);
            settings.bindings.insert(key, value);
            updated = true;
        }
    }

    if ensure_post_process_defaults(&mut settings) {
        updated = true;
    }

    if ensure_post_process_actions(&mut settings) {
        updated = true;
    }

    if ensure_modes(&mut settings) {
        updated = true;
    }

    if ensure_action_bindings(&mut settings) {
        updated = true;
    }

    if updated {
        store.set("settings", serde_json::to_value(&settings).unwrap());
    }

    settings
}

pub fn write_settings(app: &AppHandle, settings: AppSettings) {
    let store = app
        .store(crate::portable::store_path(SETTINGS_STORE_PATH))
        .expect("Failed to initialize store");

    store.set("settings", serde_json::to_value(&settings).unwrap());
}

pub fn get_bindings(app: &AppHandle) -> HashMap<String, ShortcutBinding> {
    let settings = get_settings(app);

    settings.bindings
}

pub fn get_stored_binding(app: &AppHandle, id: &str) -> ShortcutBinding {
    let bindings = get_bindings(app);

    let binding = bindings.get(id).unwrap().clone();

    binding
}

pub fn get_history_limit(app: &AppHandle) -> usize {
    let settings = get_settings(app);
    settings.history_limit
}

pub fn get_recording_retention_period(app: &AppHandle) -> RecordingRetentionPeriod {
    let settings = get_settings(app);
    settings.recording_retention_period
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_disable_auto_submit() {
        let settings = get_default_settings();
        assert!(!settings.auto_submit);
        assert_eq!(settings.auto_submit_key, AutoSubmitKey::Enter);
    }

    #[test]
    fn debug_output_redacts_api_keys() {
        let mut settings = get_default_settings();
        settings
            .post_process_api_keys
            .insert("openai".to_string(), "sk-proj-secret-key-12345".to_string());
        settings.post_process_api_keys.insert(
            "anthropic".to_string(),
            "sk-ant-secret-key-67890".to_string(),
        );
        settings
            .post_process_api_keys
            .insert("empty_provider".to_string(), "".to_string());

        let debug_output = format!("{:?}", settings);

        assert!(!debug_output.contains("sk-proj-secret-key-12345"));
        assert!(!debug_output.contains("sk-ant-secret-key-67890"));
        assert!(debug_output.contains("[REDACTED]"));
    }

    #[test]
    fn secret_map_debug_redacts_values() {
        let map = SecretMap(HashMap::from([("key".into(), "secret".into())]));
        let out = format!("{:?}", map);
        assert!(!out.contains("secret"));
        assert!(out.contains("[REDACTED]"));
    }

    #[test]
    fn modes_migration_adds_voice_mode_and_active_mode() {
        let mut settings = get_default_settings();
        assert!(ensure_post_process_actions(&mut settings));
        assert!(ensure_modes(&mut settings));
        assert_eq!(
            settings.post_process_actions.first().map(|a| a.id.as_str()),
            Some(VOICE_TO_TEXT_MODE_ID)
        );
        assert!(settings.post_process_actions[0].is_voice_only());
        assert_eq!(
            settings.active_mode_id.as_deref(),
            Some(VOICE_TO_TEXT_MODE_ID)
        );
        // The generic AI shortcut skips the voice-only mode.
        let default_ai = settings.default_post_process_action().unwrap();
        assert!(!default_ai.is_voice_only());
        // Second run is a no-op.
        assert!(!ensure_modes(&mut settings));
    }

    #[test]
    fn dangling_active_mode_is_reset() {
        let mut settings = get_default_settings();
        ensure_post_process_actions(&mut settings);
        ensure_modes(&mut settings);
        settings.active_mode_id = Some("does-not-exist".to_string());
        assert!(ensure_modes(&mut settings));
        assert_eq!(
            settings.active_mode_id.as_deref(),
            Some(VOICE_TO_TEXT_MODE_ID)
        );
    }

    #[test]
    fn providers_include_speech_and_language_capabilities() {
        let providers = default_post_process_providers();
        let deepgram = providers.iter().find(|p| p.id == "deepgram").unwrap();
        assert!(deepgram.supports_speech && !deepgram.supports_language);
        let mistral = providers.iter().find(|p| p.id == "mistral").unwrap();
        assert!(mistral.supports_speech && mistral.supports_language);
        let gemini = providers.iter().find(|p| p.id == "gemini").unwrap();
        assert!(gemini.supports_language && !gemini.supports_speech);
    }
}
