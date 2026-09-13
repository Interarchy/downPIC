$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.suoyinshi.capture'
if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key -Force }
Write-Output 'Chrome Native Messaging host registration removed.'
