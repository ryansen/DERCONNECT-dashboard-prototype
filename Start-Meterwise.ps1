param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$projectDir = Join-Path $PSScriptRoot 'sites\meterwise'
$distDir = Join-Path $projectDir 'dist'
$runtimeDir = Join-Path $projectDir '.local'
$statePath = Join-Path $runtimeDir 'server.json'
$url = 'http://127.0.0.1:8765'

if ($Stop) {
    if (Test-Path -LiteralPath $statePath) {
        $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        $server = Get-Process -Id $saved.pid -ErrorAction SilentlyContinue
        if ($server -and $server.StartTime.ToUniversalTime().ToString('o') -eq $saved.started) {
            Stop-Process -Id $server.Id
            Write-Host 'Meterwise local server stopped.'
        } else { Write-Host 'The saved Meterwise server is no longer running.' }
        Remove-Item -LiteralPath $statePath
    } else { Write-Host 'No launcher-managed Meterwise server is running.' }
    exit
}

try {
    $existing = Invoke-RestMethod -Uri "$url/data/metadata.json" -TimeoutSec 2
    if ($existing.seed -eq 20261023 -and $existing.rows -eq 32256) {
        Write-Host "Meterwise is already running. Open this address in Opera: $url"
        exit
    }
} catch { }

$pythonCandidates = @(
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe')
)
$pythonPath = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $pythonPath) {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonCommand) { $pythonPath = $pythonCommand.Source }
}
if (-not $pythonPath) { throw 'Python was not found. Install Python 3, then run this launcher again.' }
if (-not (Test-Path -LiteralPath (Join-Path $distDir 'index.html'))) { throw "Dashboard files are missing from $distDir" }
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$server = Start-Process -FilePath $pythonPath -ArgumentList @('-u','-m','http.server','8765','--bind','127.0.0.1','--directory',('"'+$distDir+'"')) -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log')
@{pid=$server.Id; started=$server.StartTime.ToUniversalTime().ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $statePath
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $metadata = Invoke-RestMethod -Uri "$url/data/metadata.json" -TimeoutSec 1
        if ($metadata.seed -eq 20261023 -and $metadata.rows -eq 32256) {
            Write-Host "Meterwise is running. Open this address in Opera: $url"
            Write-Host 'You can close this launcher window. Use Stop-Meterwise.cmd to stop the server.'
            exit
        }
    } catch { }
    if ($server.HasExited) { throw "Server could not start. See $runtimeDir\server-error.log (port 8765 may be in use)." }
    Start-Sleep -Milliseconds 200
}
throw "Server did not become ready. See $runtimeDir\server-error.log"
