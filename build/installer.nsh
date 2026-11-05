; Added to the Windows installer by electron-builder (nsis.include).
; After the app is installed, offer to install the AI command-line tools it drives.
; Silent installs, which includes every auto-update, skip the question and install nothing.
!include LogicLib.nsh

!macro customInstall
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "Also install the AI tools Dexter uses?$\r$\n$\r$\nClaude Code, OpenAI Codex, Grok Build, the Cursor agent, and Gemini CLI. Tools you already have are skipped. Each comes from its maker's website, needs an internet connection, and can take a few minutes.$\r$\n$\r$\nChoose No to skip. You can install any of them later with Connect in Integrations." /SD IDNO IDNO pbSkipTools
    DetailPrint "Installing the AI tools. This can take a few minutes..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-tools.ps1"'
    Pop $0
    DetailPrint "AI tools: done. A log is in %TEMP%\project-brain-tools.log"
    pbSkipTools:
  ${EndIf}
!macroend
