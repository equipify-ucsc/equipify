param([string]$XamppRoot = 'C:/xampp1', [switch]$KeepServer)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$php = Join-Path $XamppRoot 'php/php.exe'
$original = @{}
foreach ($key in @('EQUIPIFY_DB_NAME','EQUIPIFY_DB_PORT','EQUIPIFY_MAIL_ENABLE_SEND','EQUIPIFY_TEST_PHP')) { $original[$key] = [Environment]::GetEnvironmentVariable($key,'Process') }
$server = $null
Push-Location $projectRoot
try {
    $env:EQUIPIFY_DB_PORT = '13307'
    $env:EQUIPIFY_MAIL_ENABLE_SEND = '0'
    $env:EQUIPIFY_TEST_PHP = $php
    & $php backend/tests/week4_test.php
    if ($LASTEXITCODE -ne 0) { throw 'Week 4 backend tests failed.' }
    & $php backend/tests/week4_vehicle_test.php
    if ($LASTEXITCODE -ne 0) { throw 'Week 4 vehicle backend tests failed.' }
    node backend/tests/week4_concurrency_test.js
    if ($LASTEXITCODE -ne 0) { throw 'Week 4 concurrency tests failed.' }
    $fixture = Get-Content tmp/week4-fixture.json -Raw | ConvertFrom-Json
    if ($fixture.database -notmatch '^equipify_week4_test_[a-z0-9_]+$') { throw 'Expected Week 4 test database.' }
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1',18086); $occupied = $true } catch { $occupied = $false } finally { $client.Dispose() }
    if ($occupied) { throw 'Port 18086 is in use. No existing service was stopped.' }
    $env:EQUIPIFY_DB_NAME = $fixture.database
    $arguments = @('-S','127.0.0.1:18086','-t',('"'+$projectRoot+'"'),('"'+(Join-Path $projectRoot 'backend/tests/isolated_router.php')+'"'))
    $server = Start-Process -FilePath $php -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot 'tmp/week4-http-out.log') -RedirectStandardError (Join-Path $projectRoot 'tmp/week4-http-error.log')
    $ready = $false
    for ($attempt=0;$attempt -lt 40;$attempt++) {
        Start-Sleep -Milliseconds 150
        try { $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:18086/frontend/shared/api.js' -TimeoutSec 2
            if ($response.Headers['X-Equipify-Test-Database'] -eq $fixture.database) { $ready = $true; break }
        } catch { }
        if ($server.HasExited) { throw 'Isolated HTTP server exited.' }
    }
    if (!$ready) { throw 'Isolated HTTP server did not become ready.' }
    $fixture | Add-Member -NotePropertyName php_pid -NotePropertyValue $server.Id -Force
    $fixture | ConvertTo-Json -Depth 6 | Set-Content tmp/week4-active.json
    & $php backend/tests/week4_http_test.php $fixture.database
    if ($LASTEXITCODE -ne 0) { throw 'Week 4 HTTP tests failed.' }
    & $php backend/tests/week4_vehicle_http_test.php $fixture.database
    if ($LASTEXITCODE -ne 0) { throw 'Week 4 vehicle HTTP tests failed.' }
    # Run before browser tests: this verifier snapshots users and must have
    # exclusive fixture use while checking that denied logins leave them alone.
    & $php backend/tests/fixture_login_security_test.php
    if ($LASTEXITCODE -ne 0) { throw 'Public fixture production/isolation guard failed.' }
    if ($KeepServer) { "Manual test server: http://127.0.0.1:18086 (synthetic database only)"; $server = $null }
} finally {
    if ($null -ne $server -and !$server.HasExited) { Stop-Process -Id $server.Id }
    foreach ($key in $original.Keys) { [Environment]::SetEnvironmentVariable($key,$original[$key],'Process') }
    Pop-Location
}
