# run_pyspy.ps1 - Automated py-spy flamegraph generator for Inflect Uvicorn Server
Param(
    [int]$Duration = 10,
    [int]$Rate = 100,
    [string]$OutputFile = "profile_flamegraph.svg"
)

Write-Host "=== Inflect py-spy Flamegraph Profiler ===" -ForegroundColor Cyan

# 1. Locate Uvicorn / Python PID listening on port 8000
$netstat = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$targetPid = $null

if ($netstat) {
    $targetPid = $netstat.OwningProcess
    Write-Host "[+] Found server process listening on port 8000 with PID: $targetPid" -ForegroundColor Green
} else {
    Write-Host "[-] No process listening on port 8000. Looking for Uvicorn python process..." -ForegroundColor Yellow
    $pyProc = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*uvicorn*" } | Select-Object -First 1
    if ($pyProc) {
        $targetPid = $pyProc.Id
        Write-Host "[+] Detected Uvicorn process with PID: $targetPid" -ForegroundColor Green
    }
}

if (-not $targetPid) {
    Write-Error "Could not find a running Uvicorn server on port 8000. Ensure the backend is started before profiling."
    exit 1
}

# 2. Check if py-spy is installed
$pyspyCmd = Get-Command "py-spy" -ErrorAction SilentlyContinue
if (-not $pyspyCmd) {
    Write-Host "[!] py-spy is not found in PATH. You can install it via: pip install py-spy" -ForegroundColor Yellow
    Write-Host "[*] Attempting to run via python -m py_spy..."
}

Write-Host "[*] Recording $Duration-second flamegraph at $Rate Hz on PID $targetPid..." -ForegroundColor Cyan
Write-Host "    (Generating traffic simultaneously will capture richer CPU stack traces)" -ForegroundColor DarkGray

try {
    if ($pyspyCmd) {
        & py-spy record -o $OutputFile --pid $targetPid --duration $Duration --rate $Rate --nonblocking
    } else {
        & python -m py_spy record -o $OutputFile --pid $targetPid --duration $Duration --rate $Rate --nonblocking
    }

    if (Test-Path $OutputFile) {
        Write-Host "`n[+] Flamegraph successfully generated: $(Resolve-Path $OutputFile)" -ForegroundColor Green
        Write-Host "[+] Open this SVG file in any web browser to explore interactive CPU call stacks." -ForegroundColor Green
    }
} catch {
    Write-Error "Failed to record with py-spy: $_"
}
