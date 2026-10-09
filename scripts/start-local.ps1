$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'dist\client\index.html'))) {
    throw 'Execute npm run build antes de iniciar.'
}
$taskPort = 3230
$taskPortLine = Get-Content -LiteralPath (Join-Path $taskRoot '.env') | Where-Object { $_ -match '^PORT=' } | Select-Object -First 1
if ($taskPortLine -match '^PORT=["'']?(\d+)') { $taskPort = [int]$Matches[1] }
if (Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue) {
    Write-Output "A porta $taskPort já está em uso. Nenhum processo foi alterado."
    exit 1
}
$taskLogs = Join-Path $taskRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $taskLogs | Out-Null
$taskNode = (Get-Command node).Source
$env:APP_ENV = 'development'
$env:PUBLIC_SITE = 'false'
$env:TRUST_PROXY = 'false'
$taskProcess = Start-Process -FilePath $taskNode -ArgumentList @('dist/server/index.js','--production') -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskLogs 'server.out.log') -RedirectStandardError (Join-Path $taskLogs 'server.err.log')
$taskProcess.Id | Set-Content -LiteralPath (Join-Path $taskLogs 'server.pid')
Write-Output "Geek Musical iniciado em http://localhost:$taskPort (processo $($taskProcess.Id))."
