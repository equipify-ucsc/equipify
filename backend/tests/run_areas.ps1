param([string]$XamppRoot = 'C:/xampp')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$php = Join-Path $XamppRoot 'php/php.exe'
$httpd = Join-Path $XamppRoot 'apache/bin/httpd.exe'
$originalDatabase = [Environment]::GetEnvironmentVariable('EQUIPIFY_DB_NAME', 'Process')
$originalMailEnabled = [Environment]::GetEnvironmentVariable('EQUIPIFY_MAIL_ENABLE_SEND', 'Process')
$apacheProcess = $null
Push-Location $projectRoot
try {
    $env:EQUIPIFY_MAIL_ENABLE_SEND = '0'
    $output = & $php backend/tests/areas_test.php 2>&1
    $testExit = $LASTEXITCODE
    $output | Write-Output
    if ($testExit -ne 0) { throw 'Area database tests failed.' }
    $databaseLine = $output | Where-Object { "$_" -match '^TEST_DATABASE=' } | Select-Object -Last 1
    $testDatabase = "$databaseLine" -replace '^TEST_DATABASE=', ''
    if ($testDatabase -notmatch '^equipify_areas_test_[a-z0-9_]+$') { throw 'No isolated database identified.' }
    $runDirectory = 'tmp/areas/' + $testDatabase
    New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
    $projectConfigPath = $projectRoot.Replace('\', '/')
    $xamppConfigPath = $XamppRoot.Replace('\', '/')
    $config = @"
ServerRoot "$xamppConfigPath/apache"
Listen 127.0.0.1:18081
ServerName localhost
PidFile "$projectConfigPath/$runDirectory/httpd.pid"
ErrorLog "$projectConfigPath/$runDirectory/apache-error.log"
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule authz_host_module modules/mod_authz_host.so
LoadModule dir_module modules/mod_dir.so
LoadModule mime_module modules/mod_mime.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule headers_module modules/mod_headers.so
LoadFile "$xamppConfigPath/php/php8ts.dll"
LoadModule php_module "$xamppConfigPath/php/php8apache2_4.dll"
PHPIniDir "$xamppConfigPath/php"
php_admin_value upload_tmp_dir "$projectConfigPath/tmp"
php_admin_value sys_temp_dir "$projectConfigPath/tmp"
php_admin_value session.save_path "$projectConfigPath/tmp/admin-users-sessions"
php_admin_value disable_functions "mail"
DocumentRoot "$projectConfigPath"
TypesConfig "$xamppConfigPath/apache/conf/mime.types"
DirectoryIndex index.html index.php
Header always set X-Equipify-Test-Database "$testDatabase"
<FilesMatch "\.php$">
    SetHandler application/x-httpd-php
</FilesMatch>
<Directory "$projectConfigPath">
    AllowOverride All
    Require all granted
</Directory>
"@
    $configFile = $runDirectory + '/httpd.conf'
    New-Item -ItemType Directory -Path 'tmp/admin-users-sessions' -Force | Out-Null
    $config | Set-Content -LiteralPath $configFile -Encoding ascii
    # Apache prints "Syntax OK" to stderr even on success. Windows PowerShell
    # must judge its exit code, rather than treating that message as a failure.
    try {
        $ErrorActionPreference = 'Continue'
        $syntaxOutput = & $httpd -d . -t -f $configFile 2>&1
        $syntaxExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = 'Stop' }
    $syntaxOutput | ForEach-Object { "$_" }
    if ($syntaxExit -ne 0) { throw 'Isolated Apache configuration check failed.' }
    # Do not stop or reuse an existing listener, which might be another project.
    $listener = New-Object System.Net.Sockets.TcpClient
    try { $listener.Connect('127.0.0.1', 18081); $portBusy = $true } catch { $portBusy = $false } finally { $listener.Dispose() }
    if ($portBusy) { throw 'Port 18081 is already in use. No existing service was stopped.' }
    $env:EQUIPIFY_DB_NAME = $testDatabase
    $apacheProcess = Start-Process -FilePath $httpd -ArgumentList @('-d', '.', '-f', $configFile) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:18081/frontend/shared/complaints.js' -TimeoutSec 2
            if ($response.Headers['X-Equipify-Test-Database'] -eq $testDatabase) { $ready = $true; break }
        } catch { }
        if ($apacheProcess.HasExited) { throw 'Isolated Apache exited; inspect its temporary error log.' }
    }
    if (!$ready) { throw 'Isolated Apache did not become ready.' }
    & $php backend/tests/area_scope_http_test.php $testDatabase
    if ($LASTEXITCODE -ne 0) { throw 'Area HTTP tests failed.' }
    $failures = 0
    $phpFiles = Get-ChildItem backend -Recurse -Filter *.php
    foreach ($file in $phpFiles) {
        $lint = & $php -l $file.FullName 2>&1
        if ($LASTEXITCODE -ne 0) { $lint | Write-Output; $failures++ }
    }
    if ($failures -ne 0) { throw 'PHP syntax checks failed.' }
    "PASS: $($phpFiles.Count) PHP files passed syntax checks."
} finally {
    if ($null -ne $apacheProcess -and !$apacheProcess.HasExited) {
        # -k shutdown addresses Windows services, so stop only the standalone
        # process created here and its known child, never the XAMPP service.
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $($apacheProcess.Id)" |
            Where-Object { $_.Name -eq 'httpd.exe' }
        Stop-Process -Id $apacheProcess.Id -ErrorAction SilentlyContinue
        $children | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    }
    [Environment]::SetEnvironmentVariable('EQUIPIFY_DB_NAME', $originalDatabase, 'Process')
    [Environment]::SetEnvironmentVariable('EQUIPIFY_MAIL_ENABLE_SEND', $originalMailEnabled, 'Process')
    Pop-Location
}
