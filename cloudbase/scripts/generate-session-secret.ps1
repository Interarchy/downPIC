param()
$ErrorActionPreference = 'Stop'
$bytes = New-Object byte[] 48
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $generator.GetBytes($bytes)
} finally {
  $generator.Dispose()
}
$secret = [Convert]::ToBase64String($bytes)
Set-Clipboard -Value $secret
Write-Host 'A new ARCHBUDDY_SESSION_SECRET was copied to the clipboard.'
Write-Host 'Paste it only into the archbuddy-api service environment variable, then clear clipboard history.'
Write-Host 'The secret value was not printed or written to a file.'
