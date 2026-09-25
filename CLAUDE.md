# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Prerequisites:** [Rust](https://rustup.rs/) (latest stable), [Bun](https://bun.sh/)

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri dev
# If cmake error on macOS:
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev

# Build for production
bun run tauri build

# Linting and formatting (run before committing)
bun run lint              # ESLint for frontend
bun run lint:fix          # ESLint with auto-fix
bun run format            # Prettier + cargo fmt
bun run format:check      # Check formatting without changes
```

**Model Setup (Required for Development):**

```bash
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.handy.computer/silero_vad_v4.onnx
```

## Architecture Overview

WhisperSM is a cross-platform desktop speech-to-text app built with Tauri 2.x (Rust backend + React/TypeScript frontend). It is a fork of Handy/Parler with a redesigned UI, on-device LLM post-processing and GitHub-based auto-updates.

### Backend Structure (src-tauri/src/)

- `lib.rs` - Main entry point, Tauri setup, manager initialization
- `managers/` - Core business logic:
  - `audio.rs` - Audio recording and device management
  - `model.rs` - Model downloading and management
  - `transcription.rs` - Speech-to-text processing pipeline
  - `history.rs` - Transcription history storage
- `audio_toolkit/` - Low-level audio processing:
  - `audio/` - Device enumeration, recording, resampling
  - `vad/` - Voice Activity Detection (Silero VAD)
- `local_llm/` - On-device language models (GGUF via `candle`):
  - `catalog.rs` - Curated model list (Qwen 2.5, Llama 3.2) with Hugging Face URLs
  - `engine.rs` - Inference (chat templates, sampling, KV-cache reset)
  - `manager.rs` - Downloads with resume/cancel, lazy load, idle unload, Tauri events
- `commands/` - Tauri command handlers for frontend communication (`local_llm.rs` for AI models)
- `actions.rs` - Transcription pipeline + post-processing (cloud providers, Apple Intelligence, `local` provider)
- `shortcut/` - Global keyboard shortcut handling
- `settings.rs` - Application settings management (providers, saved language models, modes = `post_process_actions`)

### Frontend Structure (src/)

- `App.tsx` - Shell (sidebar + page router, onboarding gate, global toasts)
- `pages/` - Home, Modes, Models (Speech / AI tabs), History, Settings, About
- `components/Sidebar.tsx` - Navigation + speech model status + updater
- `components/settings/` - Individual setting rows reused by the Settings page
- `components/onboarding/OnboardingWizard.tsx` - Welcome → permissions → speech model → AI model → ready
- `components/ui/` - Design system primitives (Button, Dropdown, SettingsGroup, Kbd, SegmentedControl…)
- `stores/settingsStore.ts`, `modelStore.ts`, `localLlmStore.ts` - Zustand stores
- `bindings.ts` - Auto-generated Tauri type bindings (tauri-specta). Regenerate with `cd src-tauri && cargo test export_bindings -- --ignored`
- `overlay/` - Recording overlay window code
- `App.css` - Design tokens (Geist font, accent gradient, light/dark surfaces)

### Key Patterns

**Manager Pattern:** Core functionality organized into managers (Audio, Model, Transcription) initialized at startup and managed via Tauri state.

**Command-Event Architecture:** Frontend → Backend via Tauri commands; Backend → Frontend via events.

**Pipeline Processing:** Audio → VAD → Whisper/Parakeet → (optional mode: local candle model or cloud API) → Clipboard/Paste

**State Flow:** Zustand → Tauri Command → Rust State → Persistence (tauri-plugin-store)

## Internationalization (i18n)

All user-facing strings must use i18next translations. ESLint enforces this (no hardcoded strings in JSX).

**Adding new text:**

1. Add key to `src/i18n/locales/en/translation.json`
2. Use in component: `const { t } = useTranslation(); t('key.path')`

**File structure:**

```
src/i18n/
├── index.ts           # i18n setup
├── languages.ts       # Language metadata
└── locales/
    ├── en/translation.json  # English (source)
    ├── es/translation.json  # Spanish
    ├── fr/translation.json  # French
    └── vi/translation.json  # Vietnamese
```

## Code Style

**Rust:**

- Run `cargo fmt` and `cargo clippy` before committing
- Handle errors explicitly (avoid unwrap in production)
- Use descriptive names, add doc comments for public APIs

**TypeScript/React:**

- Strict TypeScript, avoid `any` types
- Functional components with hooks
- Tailwind CSS for styling
- Path aliases: `@/` → `./src/`

## Releases

- `bun run release:bump <patch|minor|major> --tag` then `git push --follow-tags` triggers `.github/workflows/release.yml`, which builds all platforms and publishes a GitHub release with `latest.json` for the in-app updater. See `RELEASING.md`.
- CI for pull requests lives in `.github/workflows/ci.yml` (frontend checks + Rust tests with the mock transcription engine).

## Commit Guidelines

Use conventional commits:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation
- `refactor:` code refactoring
- `chore:` maintenance

## CLI Parameters

WhisperSM supports command-line parameters on all platforms for integration with scripts, window managers, and autostart configurations.

**Implementation files:**

- `src-tauri/src/cli.rs` - CLI argument definitions (clap derive)
- `src-tauri/src/main.rs` - Argument parsing before Tauri launch
- `src-tauri/src/lib.rs` - Applying CLI overrides (setup closure + single-instance callback)
- `src-tauri/src/signal_handle.rs` - `send_transcription_input()` reusable function

**Available flags:**

| Flag                     | Description                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `--toggle-transcription` | Toggle recording on/off on a running instance (via `tauri_plugin_single_instance`) |
| `--toggle-post-process`  | Toggle recording with post-processing on/off on a running instance                 |
| `--cancel`               | Cancel the current operation on a running instance                                 |
| `--start-hidden`         | Launch without showing the main window (tray icon still visible)                   |
| `--no-tray`              | Launch without the system tray icon (closing window quits the app)                 |
| `--debug`                | Enable debug mode with verbose (Trace) logging                                     |

**Key design decisions:**

- CLI flags are runtime-only overrides — they do NOT modify persisted settings
- Remote control flags (`--toggle-transcription`, `--toggle-post-process`, `--cancel`) work by launching a second instance that sends its args to the running instance via `tauri_plugin_single_instance`, then exits
- `send_transcription_input()` in `signal_handle.rs` is shared between signal handlers and CLI to avoid code duplication
- `CliArgs` is stored in Tauri managed state (`.manage()`) so it's accessible in `on_window_event` and other handlers

## Debug Mode

Access debug features: `Cmd+Shift+D` (macOS) or `Ctrl+Shift+D` (Windows/Linux)

## Platform Notes

- **macOS**: Metal acceleration, accessibility permissions required
- **Windows**: Vulkan acceleration, code signing
- **Linux**: OpenBLAS + Vulkan, limited Wayland support, overlay disabled by default
