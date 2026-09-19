param(
  [string]$ImagePath,
  [switch]$TokenFromClipboard
)

$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot '..\environment.json'
$config = [System.IO.File]::ReadAllText($configPath) | ConvertFrom-Json
$baseUrl = [string]$config.backendUrl
$uri = [uri]$baseUrl
if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
  throw 'A verified HTTPS backend URL is required in environment.json.'
}
Write-Host ('ArchBuddy cloud test: ' + $baseUrl)
Write-Host 'This sends ONE image to your cloud service and DeepSeek. A model call may be billed.'
if ([string]::IsNullOrWhiteSpace($ImagePath)) {
  $ImagePath = Read-Host 'Paste the full path of a PNG, JPG or WebP reference image'
}
$ImagePath = $ImagePath.Trim().Trim('"')
$item = Get-Item -LiteralPath $ImagePath
if ($item.PSIsContainer -or $item.Length -lt 1 -or $item.Length -gt 10MB) {
  throw 'Choose one image file between 1 byte and 10 MB.'
}
$formats = @{ '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.webp'='image/webp' }
$mimeType = $formats[$item.Extension.ToLowerInvariant()]
if (-not $mimeType) { throw 'Only PNG, JPEG and WebP files are supported.' }
$secureToken = $null
$pointer = [IntPtr]::Zero
$token = $null
$headers = $null
$body = $null
$response = $null
try {
  if ($TokenFromClipboard) {
    # Wait AFTER command entry so copying this command cannot replace the token.
    $null = Read-Host 'Copy the actual ARCHBUDDY_TEST_TOKEN value now, then press Enter here (do NOT paste it)'
    $token = [string](Get-Clipboard -Raw)
  } else {
    $secureToken = Read-Host 'Paste ARCHBUDDY_TEST_TOKEN (hidden; NOT your DeepSeek API key)' -AsSecureString
    if ($null -ne $secureToken) {
      $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
      $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
  }
  $token = ([string]$token).Trim()
  if ($token.Length -lt 32 -or $token.Length -gt 256) {
    throw ('Received ' + $token.Length + ' characters. Expected the SAME 32-256 character test token configured on the cloud service. No request was sent.')
  }
  if ($token -notmatch '\A[\x21-\x7e]{32,256}\z' -or $token -match '\A\*+\z') {
    throw 'Copy the actual test token, not masked stars. Internal spaces or non-ASCII characters are invalid. No request was sent.'
  }
  $headers = @{ Authorization = 'Bearer ' + $token; Accept = 'application/json'; 'x-archbuddy-request-id' = [guid]::NewGuid().ToString() }
  $body = @{ image = @{ mimeType = $mimeType; base64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($item.FullName)) } } | ConvertTo-Json -Depth 4 -Compress
  Write-Host 'Analyzing... Please allow up to 120 seconds. No automatic retry.'
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method POST -Uri ($baseUrl.TrimEnd('/') + '/api/analyze') -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
  } catch {
    # Do not echo exception objects, request headers, tokens, or upstream bodies.
    $status = 0
    if ($null -ne $_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    Write-Host ('Cloud analysis failed. HTTP status: ' + $status) -ForegroundColor Red
    Write-Host '401: check test token; 429: test limit/busy; 502/504: model error/timeout; 0: connection failed.'
    return
  }
  $result = $response.Content | ConvertFrom-Json
  if (@($result.sections).Count -lt 5) { throw 'Cloud returned an incomplete analysis result.' }
  Write-Host ('SUCCESS | Model: ' + $result.model + ' | Duration: ' + $result.durationMs + ' ms') -ForegroundColor Green
  if ($null -ne $result.usage) {
    Write-Host 'Provider token usage (reported values; no inferred total):'
    foreach ($field in @('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'total_tokens')) {
      $value = $result.usage.$field
      if ($null -ne $value) { Write-Host ('  ' + $field + ': ' + $value) }
    }
    Write-Host ('Usage saved to quota database: ' + [bool]$result.usageRecorded)
  } else {
    Write-Host 'Token usage: unknown (not returned by the provider or deployed server).'
  }
  if ($null -ne $result.quota) {
    Write-Host ('Remaining today (Asia/Shanghai): user ' + $result.quota.userRemaining + '/20, project ' + $result.quota.projectRemaining + '/200')
  }
  foreach ($section in $result.sections) {
    Write-Output ('[' + $section.title + ']')
    Write-Output $section.text
    Write-Output ''
  }
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  if ($null -ne $secureToken) { $secureToken.Dispose() }
  if ($null -ne $headers) { $headers.Clear() }
  $token = $null
  $body = $null
  $response = $null
}
