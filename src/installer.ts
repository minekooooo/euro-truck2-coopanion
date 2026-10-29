/**
 * ETS2 telemetry dependency installer.
 *
 * The game only has a 64-bit build; the official RenCloud scs-sdk-plugin release
 * contains Win32/ and Win64/ DLLs, and we install the Win64 one into:
 *
 *   <game root>\bin\win_x64\plugins\scs-telemetry.dll
 *
 * Downloads and ZIP extraction are done by Windows PowerShell so the installer
 * follows the same system proxy as the rest of the game/Coopanion on Chinese
 * Windows setups. The archive is only unpacked; the DLL is never executed here.
 */
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GameRootInfo {
  gameRoot: string;
  valid: boolean;
  error: string | null;
  exePath: string;
  pluginsDir: string;
  dllPath: string;
  dllInstalled: boolean;
  dllBytes: number;
}

export interface TelemetryInstallResult {
  ok: true;
  release: string;
  asset: string;
  dllPath: string;
  bytes: number;
  backup: string | null;
  message: string;
}

function stripQuotes(value: string): string {
  const s = value.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Accepts the game root, or a path inside it such as ...\bin\win_x64.
 * Always returns a normalized absolute path.
 */
export function inspectGameRoot(raw: string): GameRootInfo {
  const input = stripQuotes(raw || '');
  if (!input) {
    return {
      gameRoot: '',
      valid: false,
      error: '还没有选择游戏根目录',
      exePath: '',
      pluginsDir: '',
      dllPath: '',
      dllInstalled: false,
      dllBytes: 0,
    };
  }
  let root = resolve(input);
  // Allow selecting bin\win_x64 or its parent by mistake; normalize upward.
  const win64 = join(root, 'bin', 'win_x64', 'eurotrucks2.exe');
  if (!existsSync(win64) && basename(root).toLowerCase() === 'win_x64') {
    const parent = dirname(dirname(root));
    const parentExe = join(parent, 'bin', 'win_x64', 'eurotrucks2.exe');
    if (existsSync(parentExe)) root = parent;
  }
  const exePath = join(root, 'bin', 'win_x64', 'eurotrucks2.exe');
  const pluginsDir = join(root, 'bin', 'win_x64', 'plugins');
  const dllPath = join(pluginsDir, 'scs-telemetry.dll');
  const valid = existsSync(exePath) && statSync(exePath).isFile();
  let dllBytes = 0;
  if (existsSync(dllPath)) {
    try {
      dllBytes = statSync(dllPath).size;
    } catch {
      dllBytes = 0;
    }
  }
  return {
    gameRoot: root,
    valid,
    error: valid
      ? null
      : '这个目录不是 ETS2 游戏根目录：找不到 bin\\win_x64\\eurotrucks2.exe',
    exePath,
    pluginsDir,
    dllPath,
    dllInstalled: dllBytes > 0,
    dllBytes,
  };
}

function psQuote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

function powershellScript(dllPath: string): string {
  const target = psQuote(dllPath);
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$target = ${target}
$targetDir = Split-Path -Parent $target
if (Get-Process -Name 'eurotrucks2' -ErrorAction SilentlyContinue) {
  throw '请先退出游戏再安装/更新遥测 DLL（游戏正在占用文件）。'
}
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$tmp = Join-Path $env:TEMP ('ets2-telemetry-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
try {
  $url = $null
  $tag = 'fallback'
  try {
    $headers = @{ 'User-Agent' = 'coopanion-ets2-dafeiyu'; 'Accept' = 'application/vnd.github+json' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/RenCloud/scs-sdk-plugin/releases/latest' -Headers $headers -TimeoutSec 30
    $asset = @($release.assets | Where-Object { $_.name -like '*.zip' }) | Select-Object -First 1
    if ($asset) {
      $url = $asset.browser_download_url
      $tag = $release.tag_name
    }
  } catch {}
  if (-not $url) {
    $url = 'https://github.com/RenCloud/scs-sdk-plugin/releases/download/V.1.12.1/release_v_1_12_1.zip'
    $tag = 'V.1.12.1 (fallback)'
  }
  $zip = Join-Path $tmp 'release.zip'
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 120
  $extract = Join-Path $tmp 'extract'
  Expand-Archive -LiteralPath $zip -DestinationPath $extract -Force
  $dll = @(Get-ChildItem -Path $extract -Recurse -Filter 'scs-telemetry.dll' -File | Where-Object { $_.FullName -match 'Win64' }) | Select-Object -First 1
  if (-not $dll) { throw 'release zip does not contain Win64\\scs-telemetry.dll' }
  $backup = $null
  if (Test-Path -LiteralPath $target) {
    $backup = $target + '.bak-' + (Get-Date -Format 'yyyyMMddHHmmss')
    Copy-Item -LiteralPath $target -Destination $backup -Force
  }
  Copy-Item -LiteralPath $dll.FullName -Destination $target -Force
  $size = (Get-Item -LiteralPath $target).Length
  [pscustomobject]@{
    ok = $true
    release = $tag
    asset = (Split-Path -Leaf $zip)
    dllPath = $target
    bytes = $size
    backup = $backup
  } | ConvertTo-Json -Compress
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
`;
}

/** Download the latest release and install/repair the Win64 telemetry DLL. */
export async function installScsTelemetry(gameRoot: string): Promise<TelemetryInstallResult> {
  const info = inspectGameRoot(gameRoot);
  if (!info.valid) throw new Error(info.error ?? '无效的游戏根目录');
  const script = powershellScript(info.dllPath);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  let stdout = '';
  try {
    const result = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 180_000, maxBuffer: 2 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (error) {
    const err = error as { stderr?: string; stdout?: string; message?: string };
    const detail = (err.stderr || err.stdout || err.message || '').trim();
    throw new Error(`下载/安装遥测失败：${detail.slice(-1200) || 'PowerShell 执行失败'}`);
  }
  const line = stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  if (!line) throw new Error('安装脚本没有返回结果');
  let parsed: Omit<TelemetryInstallResult, 'message'>;
  try {
    parsed = JSON.parse(line) as Omit<TelemetryInstallResult, 'message'>;
  } catch {
    throw new Error(`无法解析安装结果：${line.slice(0, 500)}`);
  }
  if (!parsed.ok || !parsed.dllPath || !parsed.bytes) {
    throw new Error('安装脚本返回了不完整的结果');
  }
  return {
    ...parsed,
    message: `已安装 ${parsed.release} 到 ${parsed.dllPath}（${Math.round(parsed.bytes / 1024)} KB）。重启游戏后生效。`,
  };
}
