$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..")
Set-Location $ProjectRoot

$FrontendUrl = if ($env:FRONTEND_URL) { $env:FRONTEND_URL } else { "http://localhost:3000" }
$BackendUrl = if ($env:BACKEND_URL) { $env:BACKEND_URL } else { "http://localhost:8000" }
$Failures = 0

function Write-Ok($Message) { Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Fail($Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red }
function Write-Warn($Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Info($Message) { Write-Host "[INFO] $Message" -ForegroundColor Cyan }

function Test-Get($Label, $Url) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 15 | Out-Null
        Write-Ok "$Label reachable: $Url"
        return $true
    } catch {
        Write-Fail "$Label failed: $Url"
        Write-Host $_.Exception.Message
        return $false
    }
}

function Test-Chat {
    try {
        $Body = @{ message = "Say hello from AgentSQL in one short sentence." } | ConvertTo-Json
        $Response = Invoke-RestMethod -Method Post -Uri "$BackendUrl/api/chat" -ContentType "application/json" -Body $Body -TimeoutSec 60
        Write-Ok "Chat API reachable: $BackendUrl/api/chat"
        Write-Info "Chat response:"
        $Response | ConvertTo-Json -Depth 6
        return $true
    } catch {
        Write-Fail "Chat API failed"
        Write-Host $_.Exception.Message
        return $false
    }
}

function Test-EnvFile {
    if (-not (Test-Path ".env")) {
        Write-Fail ".env file not found"
        return $false
    }

    Write-Info "Using env file: $(Resolve-Path ".env")"

    $Line = Get-Content ".env" | Where-Object { $_ -match "^NVIDIA_API_KEY=" } | Select-Object -First 1
    $Value = if ($Line) { $Line -replace "^NVIDIA_API_KEY=", "" } else { "" }

    if ($Value.Trim().Length -gt 0) {
        Write-Ok "NVIDIA_API_KEY is present in .env"
    } else {
        Write-Warn "NVIDIA_API_KEY is empty in .env"
        Write-Warn "Add the key, then recreate the backend container: docker compose up -d --force-recreate backend"
    }

    return $true
}

function Test-BackendRuntimeEnv {
    try {
        docker compose ps backend | Out-Null
        Write-Info "Backend container env snapshot:"
        docker compose exec -T backend sh -lc '
            nvidia_len=${#NVIDIA_API_KEY}
            echo "  NVIDIA_API_KEY=<redacted length=${nvidia_len}>"
            echo "  NVIDIA_BASE_URL=${NVIDIA_BASE_URL}"
            echo "  NVIDIA_MODEL=${NVIDIA_MODEL}"
            echo "  DATABASE_URL=$(echo "$DATABASE_URL" | sed -E "s#//([^:]+):([^@]+)@#//\1:<redacted>@#")"
        '
    } catch {
        Write-Warn "Could not inspect backend container env"
    }
}

function Test-Database {
    try {
        $Response = Invoke-RestMethod -Method Get -Uri "$BackendUrl/api/database/health" -TimeoutSec 30
        Write-Ok "Database health check passed"
        $Response | ConvertTo-Json -Depth 6
        return $true
    } catch {
        $StatusCode = $null
        if ($_.Exception.Response) {
            $StatusCode = [int]$_.Exception.Response.StatusCode
        }
        Write-Fail "Database health check failed$(if ($StatusCode) { " with HTTP $StatusCode" })"
        Write-Warn "If backend runs in Docker, MySQL host must be host.docker.internal, not localhost."
        Write-Warn "Confirm MySQL is running on Windows port 3306 and database sqlagent exists."
        Write-Warn "Confirm username/password match docker-compose.yml DATABASE_URL."
        return $false
    }
}

Write-Host ""
Write-Host "=================================================================================================================="
Write-Host "                                      SQL AGENT - CONNECTION TEST"
Write-Host "=================================================================================================================="
Write-Host ""

if (-not (Test-EnvFile)) { $Failures++ }
Test-BackendRuntimeEnv
if (-not (Test-Get "Frontend" $FrontendUrl)) { $Failures++ }
if (-not (Test-Get "Backend health" "$BackendUrl/health")) { $Failures++ }
if (-not (Test-Chat)) { $Failures++ }
if (-not (Test-Database)) { $Failures++ }

Write-Info "Docker Compose services:"
docker compose ps

Write-Host ""
if ($Failures -eq 0) {
    Write-Ok "All connection checks passed"
    exit 0
}

Write-Fail "$Failures connection check(s) failed"
exit 1
