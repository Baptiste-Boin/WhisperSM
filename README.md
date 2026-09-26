<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="112" alt="WhisperSM icon" />
</p>

<h1 align="center">WhisperSM</h1>

<p align="center">
  <strong>Private speech to text for macOS, Windows and Linux, with on-device AI post-processing.</strong><br />
  Hold a shortcut, speak, release: your words are typed into whatever app you are using.
</p>

<p align="center">
  <a href="https://github.com/Baptiste-Boin/WhisperSM/releases/latest">Download</a> ·
  <a href="#features">Features</a> ·
  <a href="#modes-ai-post-processing">Modes</a> ·
  <a href="BUILD.md">Build from source</a> ·
  <a href="RELEASING.md">Releasing</a>
</p>

WhisperSM is a fork of [Handy](https://github.com/cjpais/Handy) (via [Parler](https://github.com/Melvynx/Parler)) with a redesigned interface, a bundled on-device language model runtime, professional installers and one-click updates from GitHub Releases. Everything runs on your computer: audio, transcription and AI rewriting never leave it unless you explicitly add a cloud provider.

## Features

- **Dictate anywhere.** One global shortcut (toggle or push-to-talk) pastes text into the active app. A second shortcut switches the active mode.
- **Voice models, local or cloud.** Offline: Whisper (Tiny to Large v3 Turbo, English-only variants), NVIDIA Parakeet, Moonshine, SenseVoice, GigaAM and Canary, with GPU acceleration (Metal on macOS, Vulkan on Windows/Linux). Cloud, with a free tier and your own key: Whisper on Groq, Mistral Voxtral, Deepgram Nova 2 / Nova 3 / Nova Medical, ElevenLabs Scribe and Cohere Transcribe.
- **Modes.** A mode picks the voice model and, optionally, an AI model plus a prompt that rewrites the result (clean up, email, message, notes or anything you write). The active mode is used by the main shortcut; each mode can also have its own shortcut or a number key pressed while recording.
- **Language models with a free tier, or on-device.** Gemini Flash, Mistral (Small, Medium, Large, Ministral), GPT-OSS and Qwen on Groq, GLM Flash on Z.AI, Llama 3.3 on Cerebras. Offline: Qwen 2.5, Llama 3.2, Llama 3.1 8B and Mistral 7B, downloaded from inside the app and run through [candle](https://github.com/huggingface/candle). No Ollama, no account.
- **Models library.** Every model in one table: type, speed and accuracy, cloud or offline, favourites, one-click download or API key.
- **Vocabulary.** Words the models should know, and replacements such as “super whisper → Superwhisper”.
- **Home dashboard.** Words per minute, words dictated, apps used and time saved, this week or all time.
- **History with audio.** Search, replay, re-transcribe or rewrite any dictation; each entry remembers the app it was dictated into.
- **Configuration like a native app.** Light, dark or automatic theme; classic, mini or hidden recording window; sound effects; silence removal; clipboard and paste behaviour.
- **Professional installers and auto-update.** Signed DMG, NSIS/MSI installers, `.deb`, `.rpm` and AppImage, updated from GitHub Releases in one click.
- **Localized.** 20 interface languages, French and English maintained first.

## Quick start

1. Download the installer for your platform from the [latest release](https://github.com/Baptiste-Boin/WhisperSM/releases/latest).
2. Install and launch WhisperSM. The onboarding wizard asks for microphone (and, on macOS, accessibility) permission, downloads a voice model and optionally an on-device AI model.
3. Put the cursor in any text field, hold the shortcut (`⌥ Space` on macOS, `Ctrl Space` on Windows/Linux), speak, release.

## Modes

A mode is a voice model plus, optionally, an AI model and a prompt. WhisperSM ships with five:

| Mode          | Key | What it does                                        |
| ------------- | --- | --------------------------------------------------- |
| Voice to text | –   | Plain transcription, nothing rewritten (built in)   |
| Clean up      | 1   | Fixes punctuation, numbers, removes filler words    |
| Email         | 2   | Turns the dictation into a polite, structured email |
| Message       | 3   | Short, casual chat message                          |
| Notes         | 4   | Bullet-point notes                                  |

The **active mode** (green dot in Modes) is what the main shortcut uses; `⌥ ⇧ K` (`Ctrl Shift K`) cycles to the next one. Press a mode's number key while recording to apply it once, or give it its own global shortcut. Modes can also be applied afterwards from History.

## Models

Everything lives in **Models library**. Only models that are free to use are listed: either they run on your computer, or the provider has a free tier and you paste your own key (Google AI Studio, Mistral, Groq, Z.AI, Cerebras, Deepgram, ElevenLabs, Cohere).

### Voice models (offline)

| Model                                 | Size       | Languages       |
| ------------------------------------- | ---------- | --------------- |
| Whisper Tiny / Base / Small           | 75–500 MB  | 99 (or English) |
| Whisper Medium                        | 0.5 GB     | 99 (or English) |
| Whisper Large v3 / v3 Turbo           | 1.1–1.6 GB | 99              |
| Parakeet / Parakeet Multilanguage     | ~480 MB    | English / 25 EU |
| Moonshine, SenseVoice, GigaAM, Canary | 30–700 MB  | see library     |

### Voice models (cloud, free tier)

Whisper Large v3 Turbo and v3 (Groq), Voxtral Mini Transcribe (Mistral), Nova 2 / Nova 3 / Nova Medical (Deepgram), Scribe (ElevenLabs), Cohere Transcribe (Cohere). Audio is sent to the provider only when such a model is selected.

### On-device language models

| Model             | Params | Download | RAM   | Notes                               |
| ----------------- | ------ | -------- | ----- | ----------------------------------- |
| Qwen 2.5 Nano     | 0.5B   | 476 MB   | 4 GB  | Punctuation and basic cleanup       |
| Qwen 2.5 Standard | 1.5B   | 1.0 GB   | 8 GB  | Recommended, multilingual (FR/EN/…) |
| Qwen 2.5 Pro      | 3B     | 2.0 GB   | 16 GB | Best rewrites                       |
| Llama 3.2 Light   | 1B     | 787 MB   | 8 GB  | English-first                       |
| Llama 3.2 Pro     | 3B     | 1.9 GB   | 16 GB | English-first                       |
| Llama 3.1 8B      | 8B     | 4.7 GB   | 16 GB | Multilingual, best quality          |
| Mistral 7B v0.3   | 7B     | 4.2 GB   | 16 GB | Great for French and English        |

Models are fetched once from Hugging Face into the app data folder (`llm/<model>/`). They load lazily on first use and unload after the idle timeout configured in Advanced settings.

## Development

```bash
bun install
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.handy.computer/silero_vad_v4.onnx
bun run tauri dev
```

Useful scripts:

| Command                       | Purpose                                 |
| ----------------------------- | --------------------------------------- |
| `bun run lint` / `lint:fix`   | ESLint (enforces i18n for JSX strings)  |
| `bun run typecheck`           | TypeScript                              |
| `bun run format`              | Prettier + `cargo fmt`                  |
| `bun run check:translations`  | Every locale has every English key      |
| `bun run release:bump patch`  | Bump the version everywhere (see below) |
| `cargo test` (in `src-tauri`) | Rust unit tests                         |

See [BUILD.md](BUILD.md) for platform prerequisites and [CLAUDE.md](CLAUDE.md) for an architecture overview.

### Regenerating TypeScript bindings

Tauri commands are typed through `tauri-specta`. Bindings are exported automatically by `tauri dev`; to regenerate them without launching the app:

```bash
cd src-tauri && cargo test export_bindings -- --ignored
```

## Releasing and auto-update

```bash
bun run release:bump patch --tag   # bumps version, commits, tags vX.Y.Z
git push --follow-tags             # Release workflow builds and publishes
```

The workflow builds every platform, uploads the installers plus `latest.json` and publishes the release; installed apps update themselves. Signing-key setup is described in [RELEASING.md](RELEASING.md).

## CLI

WhisperSM keeps Handy's command-line flags for scripting and window-manager integration:

```bash
whispersm --toggle-transcription   # start/stop recording on the running instance
whispersm --toggle-post-process    # same, applying the default mode
whispersm --cancel
whispersm --start-hidden --no-tray
whispersm --debug
```

On Linux/Wayland you can also send `SIGUSR2` (toggle) or `SIGUSR1` (toggle with AI) to the process.

## Privacy

- Audio is captured locally and transcribed by a model on your machine.
- On-device AI models run inside the app. Nothing is sent anywhere.
- Cloud providers are used only for modes you explicitly point at them. API keys are stored in the local settings file.
- Update checks fetch a small JSON manifest from GitHub; they can be disabled in Configuration.

## Credits

WhisperSM is built on [Handy](https://github.com/cjpais/Handy) by CJ Pais and the [Parler](https://github.com/Melvynx/Parler) fork by Melvynx, and uses [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [transcribe-rs](https://github.com/cjpais/transcribe-rs), [candle](https://github.com/huggingface/candle), [Tauri](https://tauri.app) and the open-weight [Qwen 2.5](https://huggingface.co/Qwen), [Llama](https://huggingface.co/meta-llama) and [Mistral](https://huggingface.co/mistralai) models. The interface is modelled on [Superwhisper](https://superwhisper.com).

## License

MIT. See [LICENSE](LICENSE).
