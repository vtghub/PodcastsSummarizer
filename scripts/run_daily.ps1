# Daily podcast pipeline runner — called by Windows Task Scheduler
# Logs to data/logs/pipeline_YYYY-MM-DD.log

# Force UTF-8 throughout — critical when launched by Task Scheduler
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONUTF8 = "1"

# Always work from the project root regardless of Task Scheduler's CWD
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Python  = Join-Path $Root ".venv\Scripts\python.exe"
$Script  = Join-Path $Root "scripts\manage_podcasts.py"
$LogDir  = Join-Path $Root "data\logs"
$LogFile = Join-Path $LogDir ("pipeline_" + (Get-Date -Format "yyyy-MM-dd") + ".log")

New-Item -ItemType Directory -Force $LogDir | Out-Null

# Ensure Ollama is running (start silently if not already up)
if (-not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
    $ollama = (Get-Command ollama -ErrorAction SilentlyContinue)?.Source
    if ($ollama) {
        Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 5
    }
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "`n=== Pipeline started at $timestamp ===" -Encoding UTF8

& $Python $Script run 2>&1 | ForEach-Object { $_ } | Tee-Object -FilePath $LogFile -Append

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $LogFile -Value "=== Pipeline finished at $timestamp ===" -Encoding UTF8
