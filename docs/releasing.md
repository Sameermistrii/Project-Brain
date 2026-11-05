# Releasing installers

## Build on your own computer

- Windows installer: `npm run dist:win` on Windows. The installer lands in `release/`.
- Mac installer: `npm run dist:mac` on a Mac. Mac installers can only be built on a Mac.

## Publish with auto-update (GitHub Releases)

1. The code is on `github.com/Sameermistrii/Project-Brain`. Releases are published there.
2. Raise `version` in `package.json` (for example `0.2.0`) and commit.
3. Push a tag with the same version: `git tag v0.2.0 && git push origin v0.2.0`.
4. The **Release** workflow builds the Windows and Mac installers on GitHub's machines, runs the tests, and publishes them to GitHub Releases.
5. Installed copies check for updates at start and every 6 hours, download in the background, and install when the app quits.

## Code signing (strongly recommended)

Without signing, the installers still work, but:

- Windows SmartScreen warns "Windows protected your PC" until enough people have installed it.
- macOS refuses to open the app until the person allows it in System Settings.
- **Mac auto-update only works for a signed app.**

Add these as repository secrets (Settings → Secrets and variables → Actions):

| Secret | What it is |
|---|---|
| `WIN_CERTIFICATE` | Windows code-signing certificate (.pfx), base64-encoded |
| `WIN_CERTIFICATE_PASSWORD` | Its password |
| `MAC_CERTIFICATE` | Apple "Developer ID Application" certificate (.p12), base64-encoded. Needs the Apple Developer Program. |
| `MAC_CERTIFICATE_PASSWORD` | Its password |
| `APPLE_ID` | The Apple ID email of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for that Apple ID, used for notarization |
| `APPLE_TEAM_ID` | Your Apple Developer team ID |

## App icon

Put a 1024×1024 PNG at `build/icon.png`. Until then the installers use Electron's default icon.
