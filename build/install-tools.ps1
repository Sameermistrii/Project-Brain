# Installs the AI command-line tools Project Brain drives, for the current Windows user.
# The app installer runs this only if the person says yes. Tools already installed are skipped,
# and one tool failing never stops the others or the app install. Everything is logged to
# %TEMP%\project-brain-tools.log.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$log = Join-Path $env:TEMP 'project-brain-tools.log'

function Say([string]$Text) {
  Write-Output $Text
  Add-Content -LiteralPath $log -Value ("{0} {1}" -f (Get-Date -Format s), $Text)
}

# Installers add their folders to the user PATH; read it again so the next check sees them.
function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Test-Tool([string[]]$Paths, [string]$Command) {
  foreach ($path in $Paths) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $true }
  }
  return [bool](Get-Command $Command -ErrorAction SilentlyContinue)
}

# Each vendor installer runs in its own PowerShell, so an "exit" inside it cannot end this script.
function Invoke-Installer([string]$Body) {
  $runner = Join-Path $env:TEMP ('project-brain-install-' + [guid]::NewGuid().ToString() + '.ps1')
  Set-Content -LiteralPath $runner -Encoding UTF8 -Value $Body
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner *>> $log
  Remove-Item -LiteralPath $runner -ErrorAction SilentlyContinue
}

function Install-Step([string]$Name, [string[]]$Paths, [string]$Command, [scriptblock]$Install) {
  Refresh-Path
  if (Test-Tool $Paths $Command) {
    Say "$Name is already installed."
    return
  }
  Say "Installing $Name..."
  try {
    & $Install
    Refresh-Path
    if (Test-Tool $Paths $Command) { Say "$Name installed." }
    else { Say "$Name did not install. Use Connect in Project Brain to try again." }
  } catch {
    Say "$Name did not install: $($_.Exception.Message)"
  }
}

Say "Project Brain: installing missing AI tools."

Install-Step 'Claude Code' @(
  (Join-Path $env:USERPROFILE '.local\bin\claude.exe'),
  (Join-Path $env:APPDATA 'npm\claude.cmd')
) 'claude' {
  Invoke-Installer 'irm https://claude.ai/install.ps1 | iex'
}

Install-Step 'OpenAI Codex' @(
  (Join-Path $env:LOCALAPPDATA 'Programs\OpenAI\Codex\bin\codex.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\OpenAI\Codex\bin\codex.cmd')
) 'codex' {
  # Same fix the app uses at sign-in: the vendor script names a type that Windows PowerShell 5.1 cannot find.
  Invoke-Installer @'
$install = Invoke-RestMethod -Uri 'https://chatgpt.com/codex/install.ps1'
$oldType = '[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture'
$newType = '[System.Runtime.InteropServices.RuntimeInformation,mscorlib]::OSArchitecture'
Invoke-Expression ($install.Replace($oldType, $newType))
'@
}

Install-Step 'Grok Build' @(
  (Join-Path $env:USERPROFILE '.grok\bin\grok.exe')
) 'grok' {
  Invoke-Installer 'irm https://x.ai/cli/install.ps1 | iex'
}

Install-Step 'Cursor agent' @(
  (Join-Path $env:LOCALAPPDATA 'cursor-agent\agent.cmd'),
  (Join-Path $env:LOCALAPPDATA 'cursor-agent\agent.exe')
) 'cursor-agent' {
  # The same download the app uses at sign-in: Cursor's own package, unpacked into %LOCALAPPDATA%\cursor-agent.
  $meta = Invoke-RestMethod 'https://cursor.com/install?win32=true'
  $prefix = ([regex]::Match($meta, "downloadUrl = '([^']+)'")).Groups[1].Value
  $version = ([regex]::Match($meta, "version = '([^']+)'")).Groups[1].Value
  if (-not $prefix -or -not $version) { throw 'Cursor did not say where to download the agent.' }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
  $zip = Join-Path $env:TEMP 'project-brain-cursor-agent.zip'
  & curl.exe -L --fail --retry 3 -o $zip ($prefix + "windows/$arch/agent-cli-package.zip") *>> $log
  $extract = Join-Path $env:TEMP ('cursor-agent-extract-' + [guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Force -Path $extract | Out-Null
  & tar.exe -xf $zip -C $extract
  $root = Join-Path $env:LOCALAPPDATA 'cursor-agent'
  $final = Join-Path $root ('versions\' + $version)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $final) | Out-Null
  if (Test-Path -LiteralPath $final) { Remove-Item -LiteralPath $final -Recurse -Force }
  Move-Item -LiteralPath (Join-Path $extract 'dist-package') -Destination $final
  Get-ChildItem -LiteralPath $final -Filter 'cursor-agent*' | Copy-Item -Destination $root -Force
  foreach ($ext in @('exe', 'cmd', 'ps1')) {
    $src = Join-Path $root ('cursor-agent.' + $ext)
    if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $root ('agent.' + $ext)) -Force }
  }
  Remove-Item -LiteralPath $zip, $extract -Recurse -Force -ErrorAction SilentlyContinue
}

Install-Step 'Gemini CLI' @(
  (Join-Path $env:APPDATA 'npm\gemini.cmd')
) 'gemini' {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'it needs Node.js 20 or newer. Install Node.js from nodejs.org, then press Connect for Gemini in Project Brain.'
  }
  & npm install -g '@google/gemini-cli' *>> $log
}

Say "Done. Details are in $log"
# The app install must never fail because a tool did.
exit 0
