# test_upload_throttle.ps1 - Bandwidth-throttled audio upload testing script
Param(
    [string]$AudioFile = "sample_audio/test_call_red.m4a",
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [string]$RateLimit = "1M" # e.g. "500k", "1M", "2M", "0" (unlimited)
)

Write-Host "=== Inflect Chunked Upload Performance & Throttle Tester ===" -ForegroundColor Cyan

# 1. Resolve Audio File Path
$resolvedPath = $null
if (Test-Path $AudioFile) {
    $resolvedPath = (Resolve-Path $AudioFile).Path
} elseif (Test-Path (Join-Path $PSScriptRoot $AudioFile)) {
    $resolvedPath = (Resolve-Path (Join-Path $PSScriptRoot $AudioFile)).Path
} elseif (Test-Path (Join-Path $PSScriptRoot "sample_audio/test_call_red.m4a")) {
    $resolvedPath = (Resolve-Path (Join-Path $PSScriptRoot "sample_audio/test_call_red.m4a")).Path
}

if (-not $resolvedPath) {
    Write-Error "Audio file not found. Checked: $AudioFile"
    exit 1
}

$fileItem = Get-Item $resolvedPath
$totalBytes = $fileItem.Length
$fileName = $fileItem.Name
Write-Host "[+] Target Audio File: $fileName ($([Math]::Round($totalBytes / 1KB, 2)) KB)" -ForegroundColor Green

# 2. Authenticate against Backend
Write-Host "[*] Authenticating with test credentials..." -ForegroundColor Gray
$loginBody = '{"email":"tester@inflect.ai","password":"TestPass123!"}'
$sess = $null
$loginResp = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody -SessionVariable sess
$tokenCookie = $sess.Cookies.GetCookies($BaseUrl)["inflect_token"].Value
if (-not $tokenCookie) {
    Write-Error "Failed to obtain inflect_token session cookie."
    exit 1
}
Write-Host "[+] Authenticated as: $($loginResp.fullName) ($($loginResp.orgName))" -ForegroundColor Green

# 3. Compute Audio File SHA-256
$fileBytes = [System.IO.File]::ReadAllBytes($resolvedPath)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$fullHashBytes = $sha256.ComputeHash($fileBytes)
$fullSha256Hex = [BitConverter]::ToString($fullHashBytes).Replace("-", "").ToLower()

# 4. Initialize Chunked Upload Session
$chunkSize = 2 * 1024 * 1024 # 2MB chunks
$totalChunks = [Math]::Ceiling($totalBytes / $chunkSize)
if ($totalChunks -lt 1) { $totalChunks = 1 }

$initPayload = @{
    filename = $fileName
    sizeBytes = $totalBytes
    sha256 = $fullSha256Hex
    mimeType = "audio/mp4"
} | ConvertTo-Json -Compress

Write-Host "[*] Initializing upload session ($totalChunks chunk(s))..." -ForegroundColor Gray
$tmpPayloadFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmpPayloadFile, $initPayload)

$initRaw = & curl.exe -s -X POST "$BaseUrl/api/uploads/init" `
    -H "Cookie: inflect_token=$tokenCookie" `
    -H "Content-Type: application/json" `
    --data-binary "@$tmpPayloadFile"
Remove-Item $tmpPayloadFile -Force -ErrorAction SilentlyContinue

$initJson = $initRaw | ConvertFrom-Json
$uploadId = $initJson.uploadId

if (-not $uploadId) {
    Write-Host "[i] Server response: $initRaw" -ForegroundColor Yellow
    if ($initJson.deduplicated) {
        Write-Host "[+] Audio asset was already deduplicated (Asset ID: $($initJson.assetId))." -ForegroundColor Green
        exit 0
    }
    Write-Error "Failed to initialize upload."
    exit 1
}
Write-Host "[+] Session created! Upload ID: $uploadId" -ForegroundColor Green

# 5. Stream Chunks with curl and SHA-256 integrity check
$uploadStopwatch = [System.Diagnostics.Stopwatch]::StartNew()

for ($i = 0; $i -lt $totalChunks; $i++) {
    $offset = $i * $chunkSize
    $length = [Math]::Min($chunkSize, $totalBytes - $offset)
    $chunkData = New-Object byte[] $length
    [Array]::Copy($fileBytes, $offset, $chunkData, 0, $length)

    $chunkTmpFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllBytes($chunkTmpFile, $chunkData)

    # Compute SHA-256 for header verification
    $hashBytes = $sha256.ComputeHash($chunkData)
    $hashHex = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()

    $chunkStart = [System.Diagnostics.Stopwatch]::StartNew()
    $putUrl = "$BaseUrl/api/uploads/$uploadId/chunk/$i"
    
    $curlArgs = @(
        "-s", "-X", "PUT", $putUrl,
        "-H", "Cookie: inflect_token=$tokenCookie",
        "-H", "Content-Type: application/octet-stream",
        "-H", "x-chunk-hash: $hashHex",
        "--data-binary", "@$chunkTmpFile"
    )
    if ($RateLimit -and $RateLimit -ne "0") {
        $curlArgs += @("--limit-rate", $RateLimit)
    }

    $chunkResp = & curl.exe @curlArgs
    $chunkStart.Stop()
    Remove-Item $chunkTmpFile -Force -ErrorAction SilentlyContinue

    $chunkSpeedKb = ($length / 1024.0) / ([Math]::Max(0.001, $chunkStart.Elapsed.TotalSeconds))
    Write-Host "    Chunk $($i + 1)/$totalChunks ($([Math]::Round($length / 1KB, 1)) KB) uploaded in $($chunkStart.ElapsedMilliseconds) ms ($([Math]::Round($chunkSpeedKb, 1)) KB/s)" -ForegroundColor Cyan
}

# 6. Complete Upload
Write-Host "[*] Finalizing upload assembly..." -ForegroundColor Gray
$completeRaw = & curl.exe -s -X POST "$BaseUrl/api/uploads/$uploadId/complete" `
    -H "Cookie: inflect_token=$tokenCookie" `
    -H "Content-Type: application/json" `
    -d "{}"
$uploadStopwatch.Stop()

$completeJson = $null
try {
    $completeJson = $completeRaw | ConvertFrom-Json
} catch {}

$totalSeconds = $uploadStopwatch.Elapsed.TotalSeconds
$effectiveThroughput = ($totalBytes / 1024.0) / [Math]::Max(0.001, $totalSeconds)

Write-Host "`n=== Upload Benchmark Results ===" -ForegroundColor Green
Write-Host "Status:        COMPLETED" -ForegroundColor Green
if ($completeJson -and $completeJson.assetId) {
    Write-Host "Asset ID:      $($completeJson.assetId)" -ForegroundColor Green
    Write-Host "Format:        $($completeJson.detectedFormat)" -ForegroundColor Green
    Write-Host "Duration:      $($completeJson.durationSeconds)s" -ForegroundColor Green
}
Write-Host "Total Size:    $([Math]::Round($totalBytes / 1KB, 2)) KB"
Write-Host "Elapsed Time:  $([Math]::Round($totalSeconds, 2)) seconds"
Write-Host "Throughput:    $([Math]::Round($effectiveThroughput, 1)) KB/s"
Write-Host "Rate Limit:    $RateLimit"
