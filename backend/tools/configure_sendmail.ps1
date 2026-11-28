param(
    [string]$XamppRoot = 'C:/xampp',
    [string]$SendmailDirectory,
    [string]$ProfileDirectory,
    [string]$ServiceAccount,
    [switch]$AllowLoopbackTest
)
$ErrorActionPreference = 'Stop'
# Native XAMPP sendmail does not expand environment placeholders in its INI.
# Generate a NEW private profile from process environment; never print secrets.
function RequiredSetting([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($value) -or $value -ne $value.Trim() -or $value -match '[^\x20-\x7e]') {
        throw "Missing or invalid $Name. Use a single printable ASCII value without surrounding whitespace."
    }
    return $value
}
$smtpServer = RequiredSetting 'EQUIPIFY_SMTP_HOST'
if ($smtpServer -notmatch '^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$') { throw 'Invalid SMTP host.' }
$smtpPortText = RequiredSetting 'EQUIPIFY_SMTP_PORT'
$smtpPort = 0
if (![int]::TryParse($smtpPortText, [ref]$smtpPort) -or $smtpPort -lt 1 -or $smtpPort -gt 65535) { throw 'Invalid SMTP port.' }
$security = (RequiredSetting 'EQUIPIFY_SMTP_SECURITY').ToLowerInvariant()
$loopbackTest = $AllowLoopbackTest -and $smtpServer -eq '127.0.0.1' -and $smtpPort -ge 1024
if ($security -notin @('tls','ssl') -and !($security -eq 'none' -and $loopbackTest)) {
    throw 'Use tls (STARTTLS) or ssl (implicit TLS). Unencrypted SMTP is permitted only for an explicit loopback test.'
}
$username = RequiredSetting 'EQUIPIFY_SMTP_USERNAME'
$password = RequiredSetting 'EQUIPIFY_SMTP_PASSWORD'
$sender = RequiredSetting 'EQUIPIFY_MAIL_FROM'
try { $senderAddress = New-Object System.Net.Mail.MailAddress($sender) } catch { throw 'Invalid authorized sender.' }
if ($senderAddress.Address -cne $sender -or $sender -match '[<>"\s]') { throw 'Use a single sender email address.' }
$domain = $sender.Split('@')[-1]
$source = [IO.Path]::GetFullPath($(if ($SendmailDirectory) { $SendmailDirectory } else { Join-Path $XamppRoot 'sendmail' }))
if (!(Test-Path -LiteralPath (Join-Path $source 'sendmail.exe') -PathType Leaf)) { throw 'XAMPP sendmail executable was not found.' }
if (!$loopbackTest) {
    $legacyLibrary = Join-Path $source 'libeay32.dll'
    if ((Test-Path -LiteralPath $legacyLibrary) -and (Get-Item -LiteralPath $legacyLibrary).VersionInfo.ProductVersion -match '^0\.9\.8') {
        throw 'This bundled OpenSSL 0.9.8 build lacks TLS 1.2. Supply a reviewed, provider-compatible sendmail bundle using SendmailDirectory before configuring live credentials.'
    }
}
if (!$ProfileDirectory) {
    if (!$env:LOCALAPPDATA) { throw 'Set a private ProfileDirectory outside the repository and web roots.' }
    $ProfileDirectory = Join-Path $env:LOCALAPPDATA ('Equipify/sendmail-' + [guid]::NewGuid().ToString('N'))
}
$smtpProfilePath = [IO.Path]::GetFullPath($ProfileDirectory).TrimEnd('\','/')
if (Test-Path -LiteralPath $smtpProfilePath) { throw 'ProfileDirectory must be NEW. Existing profiles are never overwritten.' }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$forbidden = @($projectRoot, (Join-Path $XamppRoot 'htdocs'), (Join-Path $XamppRoot 'apache'))
foreach ($root in $forbidden) {
    $absolute = [IO.Path]::GetFullPath($root).TrimEnd('\','/')
    if ($smtpProfilePath.Equals($absolute, [StringComparison]::OrdinalIgnoreCase) -or $smtpProfilePath.StartsWith($absolute + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'SMTP profiles must be outside the repository and web-serving directories.'
    }
}
# Avoid a pre-existing junction redirecting a supposedly private destination.
$ancestor = Split-Path -Parent $smtpProfilePath
while ($ancestor) {
    if (Test-Path -LiteralPath $ancestor) {
        if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Profile ancestors must not be junctions or symbolic links.'
        }
    }
    $parent = Split-Path -Parent $ancestor
    if ($parent -eq $ancestor) { break }
    $ancestor = $parent
}
New-Item -ItemType Directory -Path $smtpProfilePath | Out-Null
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$identities = @([Security.Principal.WindowsIdentity]::GetCurrent().User,
    (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))
if ($ServiceAccount) {
    $identities += (New-Object Security.Principal.NTAccount($ServiceAccount)).Translate([Security.Principal.SecurityIdentifier])
}
foreach ($identity in $identities) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl',
        'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $smtpProfilePath -AclObject $acl
Copy-Item -LiteralPath (Join-Path $source 'sendmail.exe') -Destination (Join-Path $smtpProfilePath 'sendmail.exe')
Get-ChildItem -LiteralPath $source -Filter '*.dll' -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $smtpProfilePath $_.Name)
}
# Windows INI APIs strip the outer quotes and preserve internal punctuation.
# Values never enter command arguments, the repository or console output.
$content = @"
[sendmail]
smtp_server=$smtpServer
smtp_port=$smtpPort
smtp_ssl=$security
default_domain=$domain
hostname=$domain
auth_username="$username"
auth_password="$password"
force_sender=$sender
force_recipient=
error_logfile=
debug_logfile=
pop3_server=
pop3_username=
pop3_password=
"@
[IO.File]::WriteAllText((Join-Path $smtpProfilePath 'sendmail.ini'), $content, [Text.Encoding]::ASCII)
$executable = Join-Path $smtpProfilePath 'sendmail.exe'
$env:EQUIPIFY_SENDMAIL_EXE = $executable
Write-Output 'Private sendmail profile created; credentials and native logs are not printed.'
Write-Output 'EQUIPIFY_SENDMAIL_EXE is set in this PowerShell process.'
Write-Output ('Profile: ' + $smtpProfilePath)
Write-Output 'Restart/start only the intended PHP/Apache process from this environment to inherit its settings.'
