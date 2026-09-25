# Releasing WhisperSM

Releases are fully automated: push a version tag and GitHub Actions builds
signed installers for macOS (Apple Silicon + Intel), Windows and Linux,
uploads them to a GitHub release together with `latest.json`, and every
installed copy of WhisperSM picks the update up on its next check.

## One-time setup

### 1. Updater signing key (required)

The auto-updater only installs packages signed with the project's private
key. The matching public key is committed in `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`).

Add the private key as repository secrets
(**Settings › Secrets and variables › Actions**):

| Secret                               | Value                                          |
| ------------------------------------ | ---------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of the private key file (single line) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The key password (leave empty if it has none)  |

If you ever need a new key pair (the old private key is lost), generate one
and replace the public key in `tauri.conf.json`:

```bash
bunx tauri signer generate -w ~/.tauri/whispersm.key
```

Users on builds signed with the old key will have to reinstall manually
once, so keep the private key safe.

### 2. Apple Developer signing (optional but recommended)

Without it, macOS builds are ad-hoc signed and Gatekeeper shows a warning on
first launch. With a Developer ID certificate the DMG is signed and
notarized automatically.

| Secret                       | Value                                              |
| ---------------------------- | -------------------------------------------------- |
| `APPLE_CERTIFICATE`          | Base64 of the `.p12` Developer ID Application cert |
| `APPLE_CERTIFICATE_PASSWORD` | Password of the `.p12`                             |
| `KEYCHAIN_PASSWORD`          | Any random string (temporary CI keychain)          |
| `APPLE_ID`                   | Apple ID email used for notarization               |
| `APPLE_PASSWORD`             | App-specific password for that Apple ID            |
| `APPLE_TEAM_ID`              | Your 10-character team id                          |

The release workflow detects whether `APPLE_CERTIFICATE` is set and enables
signing automatically.

### 3. Windows code signing (optional)

Windows installers work unsigned (SmartScreen shows a warning on first run).
To sign with Azure Trusted Signing, set `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` and configure
`bundle.windows.signCommand` in `tauri.conf.json`.

## Cutting a release

```bash
# 1. Make sure main is green and up to date
git checkout main && git pull

# 2. Bump the version in package.json, tauri.conf.json, Cargo.toml, Cargo.lock,
#    commit and tag (patch | minor | major | x.y.z)
bun run release:bump patch --tag

# 3. Push the commit and the tag: this starts the Release workflow
git push --follow-tags
```

The **Release** workflow then:

1. checks that the tag matches the version and that the signing key is set,
2. creates a draft GitHub release,
3. builds and uploads: `.dmg` (arm64 + x64), `.exe` (NSIS) + `.msi`,
   `.deb`, `.rpm`, `.AppImage`, and the `*.sig` + `latest.json` updater files,
4. publishes the release once `latest.json` is present.

You can also start it from **Actions › Release › Run workflow** on any ref;
untick _publish_ to keep the release as a draft for testing.

## How auto-update works

- The app polls
  `https://github.com/Baptiste-Boin/WhisperSM/releases/latest/download/latest.json`
  at startup (and from the tray menu / About page).
- If the manifest version is newer, the sidebar shows **Update available**;
  one click downloads, verifies the signature, installs and restarts.
- Users can disable checks in **Settings › App › Check for Updates**.
- Portable Windows installs (a `Data` folder next to the executable) are
  never auto-updated; the app points them to the releases page instead.

## Verifying a download manually

```bash
# public key from src-tauri/tauri.conf.json (plugins.updater.pubkey)
echo "<pubkey>" | base64 -d > whispersm.pub
base64 -d < WhisperSM_x.y.z_aarch64.dmg.sig > WhisperSM.minisig
minisign -Vm WhisperSM_x.y.z_aarch64.dmg -p whispersm.pub -x WhisperSM.minisig
```
