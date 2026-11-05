import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type Provider = "cursor" | "claude" | "gpt" | "grok";

export interface AccountState {
  provider: Provider;
  label: string;
  installed: boolean;
  loggedIn: boolean;
  /** Why the last sign-in failed, if it did. */
  problem?: string;
}

/** Called with each line of live output while a model works. */
export type Progress = (line: string) => void;

export interface UsageEvent {
  provider: Provider;
  ok: boolean;
  tokens?: number;
  costUsd?: number;
  error?: string;
}

export class StoppedError extends Error {
  constructor() {
    super("Stopped.");
  }
}

const WINDOWS = process.platform === "win32";
const MAC = process.platform === "darwin";
const signInProblems = new Map<Provider, string>();
let usageListener: ((event: UsageEvent) => void) | null = null;

/** The desktop app records usage per model; the CLI and MCP server do not set this. */
export function setUsageListener(listener: ((event: UsageEvent) => void) | null): void {
  usageListener = listener;
}

const LABELS: Record<Provider, string> = {
  cursor: "Cursor",
  claude: "Claude",
  gpt: "ChatGPT",
  grok: "Grok",
};

// Each check starts up to four programs, so the window reuses a recent answer.
const ACCOUNT_TTL_MS = 10_000;
let accountCache: { at: number; states: Promise<AccountState[]> } | null = null;

export function accountStates(): Promise<AccountState[]> {
  if (!accountCache || Date.now() - accountCache.at > ACCOUNT_TTL_MS) {
    accountCache = { at: Date.now(), states: readAccountStates() };
  }
  return accountCache.states;
}

export function forgetAccountStates(): void {
  accountCache = null;
}

async function readAccountStates(): Promise<AccountState[]> {
  const [cursor, claude, codex, grok] = await Promise.all([
    Promise.resolve(cursorAgentBin()),
    Promise.resolve(claudeBin() || null).then((found) => found || resolveBin("claude")),
    Promise.resolve(codexBin() || null).then((found) => found || resolveBin("codex")),
    Promise.resolve(grokBin() || null).then((found) => found || resolveBin("grok")),
  ]);
  const [cursorIn, claudeIn, codexIn, grokIn] = await Promise.all([
    cursor ? cursorLoggedIn(cursor) : Promise.resolve(false),
    claude ? claudeLoggedIn(claude) : Promise.resolve(false),
    Promise.resolve(Boolean(codex) && hasAuth("gpt")),
    Promise.resolve(Boolean(grok) && hasAuth("grok")),
  ]);
  const states: AccountState[] = [
    { provider: "cursor", label: LABELS.cursor, installed: Boolean(cursor), loggedIn: cursorIn },
    { provider: "claude", label: LABELS.claude, installed: Boolean(claude), loggedIn: claudeIn },
    { provider: "gpt", label: LABELS.gpt, installed: Boolean(codex), loggedIn: codexIn },
    { provider: "grok", label: LABELS.grok, installed: Boolean(grok), loggedIn: grokIn },
  ];
  for (const state of states) {
    const problem = signInProblems.get(state.provider);
    if (problem && !state.loggedIn) state.problem = problem;
  }
  return states;
}

export function isProvider(value: unknown): value is Provider {
  return value === "cursor" || value === "claude" || value === "gpt" || value === "grok";
}

/** What sign-in would download and install first, or null when nothing is needed. Claude has no installer here. */
export function installNeeded(provider: Provider): { label: string; tool: string; site: string } | null {
  if (provider === "claude" || installedBin(provider)) return null;
  if (provider === "cursor") return { label: LABELS.cursor, tool: "the Cursor agent", site: "cursor.com" };
  if (provider === "gpt") return { label: LABELS.gpt, tool: "OpenAI Codex", site: "chatgpt.com" };
  return { label: LABELS.grok, tool: "Grok Build", site: "x.ai" };
}

/** Starts the account login in the background and opens Chrome. Ask the person before calling this when installNeeded() is not null. */
export function beginSignIn(provider: Provider): string {
  if (!isProvider(provider)) throw new Error("Unknown model.");
  forgetAccountStates();
  if ((provider === "gpt" || provider === "grok") && hasAuth(provider) && installedBin(provider)) {
    return `${LABELS[provider]} is already signed in.`;
  }
  if (!WINDOWS) return beginSignInUnix(provider);
  const dir = path.join(os.tmpdir(), "project-brain-signin");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = `${provider}-${Date.now()}`;
  const script = path.join(dir, `${stamp}.ps1`);
  const log = path.join(dir, `${stamp}.log`);
  fs.writeFileSync(script, signInScript(provider, log), "utf8");
  fs.writeFileSync(log, "");
  watchLoginLog(log);
  launchSignIn(script);
  const label = LABELS[provider];
  if (provider === "claude" || installedBin(provider)) return `Opening Chrome for ${label}.`;
  return `Opening Chrome for ${label}. The first sign-in takes a minute.`;
}

function launchSignIn(file: string): void {
  const quoted = file.replace(/'/g, "''");
  spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${quoted}'`,
    ],
    { windowsHide: true, stdio: "ignore" },
  ).unref();
}

function signInScript(provider: Provider, log: string): string {
  const lines = [
    "$ErrorActionPreference = 'Continue'",
    "$ProgressPreference = 'SilentlyContinue'",
    `$env:SIGNIN_LOG = '${psQuote(log)}'`,
    "function Refresh-Path {",
    "  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')",
    "  $user = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "  $extra = @(",
    "    (Join-Path $env:USERPROFILE '.local\\bin'),",
    "    (Join-Path $env:LOCALAPPDATA 'cursor-agent'),",
    "    (Join-Path $env:LOCALAPPDATA 'Programs\\OpenAI\\Codex\\bin'),",
    "    (Join-Path $env:USERPROFILE '.grok\\bin')",
    "  ) -join ';'",
    "  $env:Path = \"$machine;$user;$extra\"",
    "}",
    "function Resolve-Tool([string[]]$Candidates) {",
    "  foreach ($candidate in $Candidates) {",
    "    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }",
    "  }",
    "  return $null",
    "}",
    "function Open-LoginPage([string]$Text) {",
    "  if ($script:loginOpened) { return }",
    "  foreach ($match in [regex]::Matches($Text, 'https://\\S+')) {",
    "    $url = $match.Value.TrimEnd('.', ',', ';', ')')",
    "    if ($url -match 'downloads\\.|docs\\.|\\.zip|\\.ps1|/install') { continue }",
    "    if ($url -notmatch 'auth\\.x\\.ai|cursor\\.com|chatgpt\\.com|openai\\.com|claude\\.ai|anthropic\\.com|accounts\\.google\\.com|grok\\.com') { continue }",
    "    $script:loginOpened = $true",
    "    Add-Content -LiteralPath $env:SIGNIN_LOG -Value $url",
    "    return",
    "  }",
    "}",
    "function Read-LoginText([string]$Path) {",
    "  if (-not (Test-Path -LiteralPath $Path)) { return '' }",
    "  try {",
    "    $stream = [IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')",
    "    $reader = New-Object IO.StreamReader($stream)",
    "    $text = $reader.ReadToEnd()",
    "    $reader.Close()",
    "    return $text",
    "  } catch { return '' }",
    "}",
    "function Invoke-Login([string]$File, [string[]]$Arguments) {",
    "  $stdout = $env:SIGNIN_LOG + '.out'",
    "  $stderr = $env:SIGNIN_LOG + '.err'",
    "  Remove-Item -LiteralPath $stdout,$stderr -ErrorAction SilentlyContinue",
    "  $proc = Start-Process -FilePath $File -ArgumentList $Arguments -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden",
    "  while (-not $proc.HasExited) {",
    "    Open-LoginPage ((Read-LoginText $stdout) + (Read-LoginText $stderr))",
    "    Start-Sleep -Milliseconds 300",
    "  }",
    "  Open-LoginPage ((Read-LoginText $stdout) + (Read-LoginText $stderr))",
    "}",
    "function Invoke-Installer([string]$Body) {",
    "  $runner = Join-Path $env:TEMP ('project-brain-install-' + [guid]::NewGuid().ToString() + '.ps1')",
    "  Set-Content -LiteralPath $runner -Encoding UTF8 -Value $Body",
    "  powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $runner",
    "}",
    "Refresh-Path",
    ...loginBody(provider),
    "",
  ];
  return lines.join("\r\n");
}

function loginBody(provider: Provider): string[] {
  if (provider === "cursor") {
    return [
      "$cursor = Resolve-Tool @(",
      "  (Join-Path $env:LOCALAPPDATA 'cursor-agent\\agent.cmd'),",
      "  (Join-Path $env:LOCALAPPDATA 'cursor-agent\\agent.exe')",
      ")",
      "if (-not $cursor) {",
      "  $meta = Invoke-RestMethod 'https://cursor.com/install?win32=true'",
      "  $prefix = ([regex]::Match($meta, \"downloadUrl = '([^']+)'\")).Groups[1].Value",
      "  $version = ([regex]::Match($meta, \"version = '([^']+)'\")).Groups[1].Value",
      "  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }",
      "  $zip = Join-Path $env:TEMP 'project-brain-cursor-agent.zip'",
      "  & curl.exe -L --fail --retry 3 -o $zip ($prefix + \"windows/$arch/agent-cli-package.zip\")",
      "  $extract = Join-Path $env:TEMP ('cursor-agent-extract-' + [guid]::NewGuid().ToString())",
      "  New-Item -ItemType Directory -Force -Path $extract | Out-Null",
      "  & tar.exe -xf $zip -C $extract",
      "  $root = Join-Path $env:LOCALAPPDATA 'cursor-agent'",
      "  $final = Join-Path $root ('versions\\' + $version)",
      "  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $final) | Out-Null",
      "  if (Test-Path -LiteralPath $final) { Remove-Item -LiteralPath $final -Recurse -Force }",
      "  Move-Item -LiteralPath (Join-Path $extract 'dist-package') -Destination $final",
      "  Get-ChildItem -LiteralPath $final -Filter 'cursor-agent*' | Copy-Item -Destination $root -Force",
      "  foreach ($ext in @('exe','cmd','ps1')) {",
      "    $src = Join-Path $root ('cursor-agent.' + $ext)",
      "    if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $root ('agent.' + $ext)) -Force }",
      "  }",
      "  Refresh-Path",
      "  $cursor = Resolve-Tool @(",
      "    (Join-Path $env:LOCALAPPDATA 'cursor-agent\\agent.cmd'),",
      "    (Join-Path $env:LOCALAPPDATA 'cursor-agent\\agent.exe')",
      "  )",
      "}",
      "if (-not $cursor) { Add-Content -LiteralPath $env:SIGNIN_LOG -Value 'Sign-in failed before the browser could open.'; return }",
      "$env:NO_OPEN_BROWSER = '1'",
      "Invoke-Login $cursor @('login')",
    ];
  }
  if (provider === "claude") {
    return [
      "$claude = Resolve-Tool @(",
      "  (Join-Path $env:APPDATA 'npm\\claude.cmd'),",
      "  (Join-Path $env:APPDATA 'npm\\claude.ps1')",
      ")",
      "if (-not $claude) { $found = Get-Command claude -ErrorAction SilentlyContinue; if ($found) { $claude = $found.Source } }",
      "if (-not $claude) { Add-Content -LiteralPath $env:SIGNIN_LOG -Value 'Sign-in failed before the browser could open.'; return }",
      "Invoke-Login $claude @('auth','login')",
    ];
  }
  if (provider === "gpt") {
    return [
      "$codex = Resolve-Tool @(",
      "  (Join-Path $env:LOCALAPPDATA 'Programs\\OpenAI\\Codex\\bin\\codex.exe'),",
      "  (Join-Path $env:LOCALAPPDATA 'Programs\\OpenAI\\Codex\\bin\\codex.cmd')",
      ")",
      "if (-not $codex) {",
      "  Invoke-Installer @'",
      "$ProgressPreference = 'SilentlyContinue'",
      "$ErrorActionPreference = 'Continue'",
      "$install = Invoke-RestMethod -Uri 'https://chatgpt.com/codex/install.ps1'",
      "$oldType = '[System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture'",
      "$newType = '[System.Runtime.InteropServices.RuntimeInformation,mscorlib]::OSArchitecture'",
      "Invoke-Expression ($install.Replace($oldType, $newType))",
      "'@",
      "  Refresh-Path",
      "  $codex = Resolve-Tool @(",
      "    (Join-Path $env:LOCALAPPDATA 'Programs\\OpenAI\\Codex\\bin\\codex.exe'),",
      "    (Join-Path $env:LOCALAPPDATA 'Programs\\OpenAI\\Codex\\bin\\codex.cmd')",
      "  )",
      "}",
      "if (-not $codex) { Add-Content -LiteralPath $env:SIGNIN_LOG -Value 'Sign-in failed before the browser could open.'; return }",
      "$state = & $codex login status 2>&1 | Out-String",
      "if ($state -match 'Logged in using') { return }",
      "Invoke-Login $codex @('login')",
    ];
  }
  return [
    "$grok = Resolve-Tool @(",
    "  (Join-Path $env:USERPROFILE '.grok\\bin\\grok.exe')",
    ")",
    "if (-not $grok) {",
    "  Invoke-Installer @'",
    "$ProgressPreference = 'SilentlyContinue'",
    "$ErrorActionPreference = 'Continue'",
    "irm https://x.ai/cli/install.ps1 | iex",
    "'@",
    "  Refresh-Path",
    "  $grok = Resolve-Tool @((Join-Path $env:USERPROFILE '.grok\\bin\\grok.exe'))",
    "}",
    "if (-not $grok) { Add-Content -LiteralPath $env:SIGNIN_LOG -Value 'Sign-in failed before the browser could open.'; return }",
    "Invoke-Login $grok @('login','--oauth')",
  ];
}

function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function watchLoginLog(log: string): void {
  const opened = new Set<string>();
  const timer = setInterval(() => {
    if (!fs.existsSync(log)) return;
    const text = fs.readFileSync(log, "utf8");
    for (const match of text.match(/https?:\/\/[^\s"'<>]+/g) || []) {
      const url = match.replace(/[),.;]+$/g, "");
      if (opened.has(url) || !isLoginUrl(url)) continue;
      opened.add(url);
      openChrome(url);
    }
  }, 400);
  setTimeout(() => clearInterval(timer), 15 * 60 * 1000);
}

export function isLoginUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host.startsWith("downloads.") || host.startsWith("docs.") || host === "git-scm.com" || host === "github.com") return false;
  if (/\.(ps1|zip|exe|msi)(\?|$)/i.test(parsed.pathname) || /\/install\/?$/i.test(parsed.pathname)) return false;
  const allowed = ["cursor.com", "cursor.sh", "chatgpt.com", "openai.com", "claude.ai", "anthropic.com", "x.ai", "grok.com", "accounts.google.com"];
  return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

const UNIX_INSTALL: Record<Exclude<Provider, "claude">, string> = {
  cursor: "curl -fsS https://cursor.com/install | bash",
  gpt: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
  grok: "curl -fsSL https://x.ai/cli/install.sh | bash",
};
const LOGIN_ARGS: Record<Provider, string[]> = {
  cursor: ["login"],
  claude: ["auth", "login"],
  gpt: ["login"],
  grok: ["login", "--oauth"],
};
const BIN_NAMES: Record<Provider, string> = { cursor: "cursor-agent", claude: "claude", gpt: "codex", grok: "grok" };

/**
 * Mac and Linux sign-in: install with the vendor's own script if needed, then run the tool's login.
 * Claude, Codex, and Grok open the browser themselves; Cursor is told not to, and its login page is opened here.
 */
function beginSignInUnix(provider: Provider): string {
  const label = LABELS[provider];
  signInProblems.delete(provider);
  void (async () => {
    try {
      if (provider !== "claude" && installNeeded(provider)) {
        const install = await run("/bin/bash", ["-lc", UNIX_INSTALL[provider]], { timeoutMs: 10 * 60_000 });
        if (install.code !== 0) throw new Error(`Installing failed: ${clipLine(install.stderr || install.stdout)}`);
      }
      const bin = installedBin(provider) || (await resolveBin(BIN_NAMES[provider]));
      if (!bin) throw new Error(provider === "claude" ? "Install Claude Code from claude.com/claude-code first." : `${label}'s tool was not found after installing.`);
      if (provider === "gpt") {
        const status = await run(bin, ["login", "status"], { timeoutMs: 20_000 });
        if (/logged in/i.test(status.stdout + status.stderr)) return;
      }
      const opened = new Set<string>();
      const login = await run(bin, LOGIN_ARGS[provider], {
        timeoutMs: 15 * 60_000,
        env: provider === "cursor" ? { NO_OPEN_BROWSER: "1" } : undefined,
        onOutput: (text) => {
          if (provider !== "cursor") return;
          for (const match of text.match(/https?:\/\/[^\s"'<>]+/g) || []) {
            const url = match.replace(/[),.;]+$/g, "");
            if (opened.has(url) || !isLoginUrl(url)) continue;
            opened.add(url);
            openChrome(url);
          }
        },
      });
      if (login.code !== 0) throw new Error(clipLine(login.stderr || login.stdout) || "Sign-in did not finish.");
    } catch (error) {
      signInProblems.set(provider, error instanceof Error ? error.message : "Sign-in did not finish.");
    } finally {
      forgetAccountStates();
    }
  })();
  return `Opening the browser for ${label}.`;
}

function clipLine(text: string): string {
  const flat = trim(text).replace(/\s+/g, " ");
  return flat.length > 300 ? `${flat.slice(0, 299)}…` : flat;
}

function chromeExecutable(): string | null {
  if (MAC) {
    const app = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return fs.existsSync(app) ? app : null;
  }
  if (!WINDOWS) return null;
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ];
  return candidates.find((file) => file && fs.existsSync(file)) || null;
}

function openChrome(url: string): void {
  const chrome = chromeExecutable();
  if (chrome) {
    spawn(chrome, [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (MAC) {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (!WINDOWS) {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("cmd.exe", ["/d", "/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

/** Signs out of the model accounts. Does not sign out of the Cursor editor. */
export async function signOutModels(): Promise<string> {
  forgetAccountStates();
  const jobs: Promise<unknown>[] = [];
  const claude = claudeBin() || (await resolveBin("claude"));
  if (claude) jobs.push(run(claude, ["auth", "logout"], { timeoutMs: 20_000 }));
  const codex = codexBin() || (await resolveBin("codex"));
  if (codex) jobs.push(run(codex, ["logout"], { timeoutMs: 20_000 }));
  const grok = grokBin() || (await resolveBin("grok"));
  if (grok) jobs.push(run(grok, ["logout"], { timeoutMs: 20_000 }));
  const cursor = cursorAgentBin();
  if (cursor) jobs.push(run(cursor, ["logout"], { timeoutMs: 20_000 }));
  await Promise.all(jobs);
  forgetAccountStates();
  return "Signed out of the models. The Cursor editor stays signed in.";
}

export interface AskOptions {
  onProgress?: Progress;
  /** Edits take longer than a read-only answer; Stop is how a person ends a long one. */
  timeoutMs?: number;
}

interface Answer {
  text: string;
  tokens?: number;
  costUsd?: number;
}

export async function askModel(
  provider: Provider,
  prompt: string,
  allowEdits: boolean,
  cwd: string,
  options: AskOptions = {},
): Promise<string> {
  const file = path.join(os.tmpdir(), `project-brain-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(file, prompt);
  const timeoutMs = options.timeoutMs ?? (allowEdits ? 30 * 60_000 : 5 * 60_000);
  const progress = options.onProgress ?? (() => {});
  try {
    let answer: Answer;
    if (provider === "cursor") answer = await askCursor(file, allowEdits, cwd, timeoutMs, progress);
    else if (provider === "claude") answer = await askClaude(prompt, allowEdits, cwd, timeoutMs, progress);
    else if (provider === "gpt") answer = await askCodex(file, allowEdits, cwd, timeoutMs, progress);
    else answer = await askGrok(file, allowEdits, cwd, timeoutMs, progress);
    usageListener?.({ provider, ok: true, tokens: answer.tokens, costUsd: answer.costUsd });
    return answer.text;
  } catch (error) {
    if (!(error instanceof StoppedError)) {
      usageListener?.({ provider, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function askClaude(prompt: string, allowEdits: boolean, cwd: string, timeoutMs: number, progress: Progress): Promise<Answer> {
  const bin = claudeBin() || (await resolveBin("claude"));
  if (!bin) throw new Error("Sign in to Claude from the notch first.");
  // stream-json reports each step as it happens, so the notch can show what Claude is doing.
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--add-dir", cwd];
  if (allowEdits) args.push("--permission-mode", "acceptEdits");
  else args.push("--permission-mode", "plan", "--permission-prompts", "none", "--disallowed-tools", "Edit,Write,NotebookEdit");
  const stream = claudeStream(progress);
  const result = await run(bin, args, { cwd, stdin: prompt, timeoutMs, onOutput: (text, from) => from === "stdout" && stream.feed(text) });
  stream.flush();
  if (result.stopped) throw new StoppedError();
  const final = stream.result();
  if (final.isError || (result.code !== 0 && !final.text)) {
    throw new Error(final.text || trim(result.stderr) || "Claude did not answer.");
  }
  return { text: final.text, tokens: final.tokens, costUsd: final.costUsd };
}

/** Reads Claude's stream-json lines: progress from each step, the answer and usage from the last "result" line. */
export function claudeStream(progress: Progress) {
  let buffer = "";
  let said: string[] = [];
  let finalText = "";
  let isError = false;
  let tokens: number | undefined;
  let costUsd: number | undefined;
  const line = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    let event: any;
    try {
      event = JSON.parse(text);
    } catch {
      return;
    }
    if (event.type === "assistant" && Array.isArray(event.message?.content)) {
      for (const part of event.message.content) {
        if (part.type === "text" && part.text?.trim()) {
          said.push(part.text.trim());
          progress(firstLine(part.text));
        } else if (part.type === "tool_use") {
          progress(describeTool(String(part.name ?? ""), part.input ?? {}));
        }
      }
    } else if (event.type === "result") {
      finalText = typeof event.result === "string" ? event.result.trim() : "";
      isError = Boolean(event.is_error);
      const usage = event.usage ?? {};
      const total = Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0);
      tokens = total > 0 ? total : undefined;
      costUsd = typeof event.total_cost_usd === "number" ? event.total_cost_usd : undefined;
    }
  };
  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      lines.forEach(line);
    },
    flush() {
      line(buffer);
      buffer = "";
    },
    result() {
      return { text: finalText || said.join("\n\n"), isError, tokens, costUsd };
    },
  };
}

function describeTool(name: string, input: Record<string, unknown>): string {
  const file = typeof input.file_path === "string" ? path.basename(input.file_path) : "";
  if (name === "Read" && file) return `Reading ${file}`;
  if ((name === "Edit" || name === "MultiEdit") && file) return `Editing ${file}`;
  if (name === "Write" && file) return `Writing ${file}`;
  if (name === "Bash" && typeof input.command === "string") return `Running ${firstLine(input.command)}`;
  if ((name === "Grep" || name === "Glob") && typeof input.pattern === "string") return `Searching for ${input.pattern}`;
  return `Using ${name || "a tool"}`;
}

function firstLine(text: string): string {
  const line = trim(text).split(/\r?\n/).find((item) => item.trim()) ?? "";
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}

/** Progress for tools without structured output: the latest non-empty line they printed. */
function lineProgress(progress: Progress) {
  return (text: string) => {
    const lines = trim(text).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const last = lines[lines.length - 1];
    if (last) progress(last.length > 160 ? `${last.slice(0, 159)}…` : last);
  };
}

async function askCodex(promptFile: string, allowEdits: boolean, cwd: string, timeoutMs: number, progress: Progress): Promise<Answer> {
  const bin = codexBin() || (await resolveBin("codex"));
  if (!bin) throw new Error("Sign in to ChatGPT from the notch first.");
  const prompt = fs.readFileSync(promptFile, "utf8");
  const args = ["exec", "--skip-git-repo-check", "--cd", cwd, "--sandbox", allowEdits ? "workspace-write" : "read-only"];
  const model = codexModel();
  if (model) args.push("-m", model);
  args.push("-");
  const result = await run(bin, args, { cwd, stdin: prompt, timeoutMs, onOutput: lineProgress(progress) });
  if (result.stopped) throw new StoppedError();
  if (result.code !== 0) throw new Error(trim(result.stderr || result.stdout) || "ChatGPT did not answer.");
  // Codex ends with a "tokens used" line on stderr.
  const used = /tokens used\s*[:\n]\s*([\d,]+)/i.exec(result.stderr + result.stdout);
  return { text: trim(result.stdout), tokens: used ? Number(used[1].replace(/,/g, "")) : undefined };
}

async function askGrok(promptFile: string, allowEdits: boolean, cwd: string, timeoutMs: number, progress: Progress): Promise<Answer> {
  const bin = grokBin() || (await resolveBin("grok"));
  if (!bin) throw new Error("Sign in to Grok from the notch first.");
  const args = ["--cwd", cwd, "--prompt-file", promptFile, "--output-format", "plain", "--max-turns", allowEdits ? "6" : "4"];
  // Removing Edit and Write alone leaves Grok's shell able to change files; the sandbox blocks writes outside ~/.grok and temp.
  if (!allowEdits) args.push("--disallowed-tools", "Edit,Write", "--sandbox", "read-only");
  const result = await run(bin, args, { cwd, timeoutMs, onOutput: lineProgress(progress) });
  if (result.stopped) throw new StoppedError();
  if (result.code !== 0) throw new Error(trim(result.stderr || result.stdout) || "Grok did not answer.");
  return { text: trim(result.stdout) };
}

async function askCursor(file: string, allowEdits: boolean, cwd: string, timeoutMs: number, progress: Progress): Promise<Answer> {
  const bin = cursorAgentBin();
  if (!bin) throw new Error("Sign in to Cursor from the notch first.");
  const args = ["-p", "--trust", "--workspace", cwd, "--add-dir", path.dirname(file)];
  if (allowEdits) args.push("--force");
  else args.push("--mode", "ask");
  args.push(`Read ${file} and follow it. That file is the task.`);
  const result = await run(bin, args, { cwd, timeoutMs, onOutput: lineProgress(progress) });
  if (result.stopped) throw new StoppedError();
  if (result.code !== 0) throw new Error(trim(result.stderr || result.stdout) || "Cursor did not answer.");
  return { text: trim(result.stdout) };
}

async function cursorLoggedIn(bin: string): Promise<boolean> {
  const result = await run(bin, ["status"], { timeoutMs: 20_000 });
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (/not authenticated|not logged|login required|sign in/.test(text)) return false;
  return result.code === 0 && /logged in|authenticated|@/.test(text);
}

async function claudeLoggedIn(bin: string): Promise<boolean> {
  const result = await run(bin, ["auth", "status"], { timeoutMs: 20_000 });
  try {
    const parsed = JSON.parse(result.stdout) as { loggedIn?: boolean };
    return Boolean(parsed.loggedIn);
  } catch {
    return false;
  }
}

function hasAuth(provider: "gpt" | "grok"): boolean {
  const file = path.join(os.homedir(), provider === "gpt" ? ".codex" : ".grok", "auth.json");
  try {
    return fs.statSync(file).size > 0;
  } catch {
    return false;
  }
}

function installedBin(provider: Provider): string | null {
  if (provider === "cursor") return cursorAgentBin();
  if (provider === "claude") return claudeBin();
  if (provider === "gpt") return codexBin();
  if (provider === "grok") return grokBin();
  return null;
}

/**
 * Where Mac and Linux installers put these tools. A Mac app does not get the shell's PATH, so look directly.
 * PROJECT_BRAIN_TOOL_DIRS replaces the list (tests use it so they never find the real tools).
 */
function unixDirs(): string[] {
  const forced = process.env.PROJECT_BRAIN_TOOL_DIRS;
  if (forced !== undefined) return forced.split(path.delimiter).filter(Boolean);
  return [path.join(os.homedir(), ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin", path.join(os.homedir(), ".npm-global", "bin")];
}

function unixBin(name: string): string | null {
  if (WINDOWS) return null;
  for (const dir of unixDirs()) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function claudeBin(): string | null {
  if (!WINDOWS) return unixBin("claude");
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return (
    firstExisting(path.join(appData, "npm"), ["claude.cmd", "claude.exe"]) ||
    firstExisting(path.join(os.homedir(), ".local", "bin"), ["claude.cmd", "claude.exe", "claude"])
  );
}

function cursorAgentBin(): string | null {
  if (!WINDOWS) return unixBin("cursor-agent");
  return firstExisting(path.join(localAppData(), "cursor-agent"), ["agent.cmd", "agent.exe", "cursor-agent.cmd"]);
}

function codexBin(): string | null {
  if (!WINDOWS) return unixBin("codex");
  return firstExisting(path.join(localAppData(), "Programs", "OpenAI", "Codex", "bin"), ["codex.exe", "codex.cmd"]);
}

function codexModel(): string | null {
  const file = path.join(os.homedir(), ".codex", "models_cache.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      models?: { slug?: string; visibility?: string; priority?: number }[];
    };
    const listed = (raw.models ?? []).filter((model) => model.slug && model.visibility === "list");
    listed.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
    return listed[0]?.slug ?? null;
  } catch {
    return null;
  }
}

function grokBin(): string | null {
  return firstExisting(path.join(os.homedir(), ".grok", "bin"), WINDOWS ? ["grok.exe", "grok.cmd"] : ["grok"]) || unixBin("grok");
}

function firstExisting(root: string, names: string[]): string | null {
  return names.map((name) => path.join(root, name)).find((file) => fs.existsSync(file)) || null;
}

function localAppData(): string {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
}

async function resolveBin(name: string): Promise<string | null> {
  const home = path.join(os.homedir(), ".local", "bin");
  for (const candidate of [path.join(home, `${name}.cmd`), path.join(home, `${name}.exe`), path.join(home, name)]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  if (!WINDOWS) {
    if (process.env.PROJECT_BRAIN_TOOL_DIRS !== undefined) return null;
    // A login shell picks up Homebrew and npm paths that a Mac app does not inherit. Names here are fixed, never user input.
    const found = await run("/bin/bash", ["-lc", `command -v ${name}`], { timeoutMs: 8_000 });
    const hit = found.stdout.trim().split(/\r?\n/)[0];
    return found.code === 0 && hit ? hit : null;
  }
  const result = await run("where.exe", [name], { timeoutMs: 8_000 });
  const hits = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return hits.find((line) => line.toLowerCase().endsWith(".cmd")) || hits[0] || null;
}

interface RunOptions {
  cwd?: string;
  stdin?: string;
  timeoutMs: number;
  env?: Record<string, string>;
  onOutput?: (text: string, from: "stdout" | "stderr") => void;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  stopped: boolean;
}

/** Running model tools, so Stop can end them. */
const active = new Set<{ child: ReturnType<typeof spawn>; stop: () => void }>();

/** Stops every model that is working right now. Returns how many were stopped. */
export function stopAll(): number {
  const running = [...active];
  for (const entry of running) entry.stop();
  return running.length;
}

function run(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    let spawned: ReturnType<typeof spawn>;
    try {
      spawned = launch(command, args, options.cwd, options.env);
    } catch (error) {
      resolve({ code: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error), stopped: false });
      return;
    }
    let stdout = "";
    let stderr = "";
    let stopped = false;
    const entry = {
      child: spawned,
      stop: () => {
        stopped = true;
        stopTree(spawned);
      },
    };
    active.add(entry);
    const timer = setTimeout(() => {
      stopTree(spawned);
      stderr += "\nTimed out.";
    }, options.timeoutMs);
    spawned.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      options.onOutput?.(text, "stdout");
    });
    spawned.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      options.onOutput?.(text, "stderr");
    });
    spawned.on("error", (error) => {
      clearTimeout(timer);
      active.delete(entry);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`, stopped });
    });
    spawned.on("close", (code) => {
      clearTimeout(timer);
      active.delete(entry);
      resolve({ code: code ?? 1, stdout, stderr, stopped });
    });
    if (options.stdin !== undefined) {
      spawned.stdin?.write(options.stdin);
      spawned.stdin?.end();
    }
  });
}

function launch(command: string, args: string[], cwd?: string, env?: Record<string, string>) {
  const shell = WINDOWS && /\.(cmd|bat)$/i.test(command);
  return spawn(command, shell ? args.map(quoteCmd) : args, {
    ...(cwd ? { cwd } : {}),
    env: childEnv(env),
    windowsHide: true,
    shell,
  });
}

/** npm-installed tools start with "#!/usr/bin/env node", so on a Mac they need Homebrew's folders on PATH too. */
function childEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env = { ...process.env, ...(extra ?? {}) };
  if (!WINDOWS) env.PATH = [...new Set([...(env.PATH ?? "").split(":"), ...unixDirs()].filter(Boolean))].join(":");
  return env;
}

export type HealthState = "ready" | "not-installed" | "signed-out" | "needs-update";

export interface ToolHealth {
  provider: Provider;
  label: string;
  state: HealthState;
  detail: string;
}

/** The options Project Brain passes to each tool. If a tool update drops one, asking that model will fail. */
const NEEDED_FLAGS: Record<Provider, { args: string[]; flags: string[] }> = {
  claude: { args: ["--help"], flags: ["--output-format", "--add-dir", "--permission-mode", "--verbose"] },
  gpt: { args: ["exec", "--help"], flags: ["--skip-git-repo-check", "--cd", "--sandbox"] },
  grok: { args: ["--help"], flags: ["--prompt-file", "--output-format", "--max-turns", "--disallowed-tools", "--sandbox"] },
  cursor: { args: ["--help"], flags: ["--workspace", "--trust", "--force"] },
};

/** Flags from `needed` that a tool's --help text does not mention. */
export function missingFlags(help: string, needed: string[]): string[] {
  return needed.filter((flag) => !new RegExp(`(^|[\\s,(\\[])${flag.replace(/[-]/g, "\\-")}(?=$|[\\s,=<\\[)])`, "m").test(help));
}

/** Checks each model's tool: installed, signed in, and still accepting the options Project Brain uses. */
export async function toolHealth(): Promise<ToolHealth[]> {
  forgetAccountStates();
  const states = await accountStates();
  return Promise.all(
    states.map(async (state): Promise<ToolHealth> => {
      const base = { provider: state.provider, label: state.label };
      if (!state.installed) return { ...base, state: "not-installed", detail: "Not installed. Connect installs it." };
      const bin = installedBin(state.provider) || (await resolveBin(BIN_NAMES[state.provider]));
      if (bin) {
        const help = await run(bin, NEEDED_FLAGS[state.provider].args, { timeoutMs: 20_000 });
        const missing = missingFlags(`${help.stdout}\n${help.stderr}`, NEEDED_FLAGS[state.provider].flags);
        if (missing.length) {
          return {
            ...base,
            state: "needs-update",
            detail: `This version does not list ${missing.join(", ")}. Update ${state.label}'s tool. If it is already current, Project Brain needs an update.`,
          };
        }
      }
      if (!state.loggedIn) return { ...base, state: "signed-out", detail: state.problem ? `Not signed in. Last try: ${state.problem}` : "Not signed in." };
      return { ...base, state: "ready", detail: "Ready." };
    }),
  );
}

function stopTree(child: ReturnType<typeof spawn>): void {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  child.kill();
}

export function quoteCmd(arg: string): string {
  if (!arg.length) return '""';
  // cmd.exe expands %VAR% even inside quotes, and there is no reliable escape for it.
  if (arg.includes("%")) throw new Error(`Windows cannot pass "${arg}" to this tool because it contains %. Rename the folder.`);
  if (!/[\s"&|<>^]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '""')}"`;
}

function trim(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "").trim();
}
