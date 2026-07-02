$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[dev] Platform root: $root"

$envFile = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"

if (-not (Test-Path $envFile)) {
    Copy-Item $envExample $envFile
    Write-Host "[dev] Created .env from .env.example"
}

function Import-DotEnv {
    param([string]$Path)

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line.Length -eq 0 -or $line.StartsWith("#")) {
            return
        }

        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $name = $parts[0].Trim()
            $value = $parts[1].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

Import-DotEnv $envFile

$netbirdConfig = Join-Path $root "infra\netbird\config.yaml"
if (-not (Test-Path $netbirdConfig)) {
    if (-not $env:NETBIRD_DOMAIN) {
        $env:NETBIRD_DOMAIN = "netbird.local"
    }

    if (-not $env:NETBIRD_HTTP_PROTOCOL) {
        $env:NETBIRD_HTTP_PROTOCOL = "http"
    }

    Write-Host "[dev] Initializing NetBird config (NETBIRD_DOMAIN=$($env:NETBIRD_DOMAIN)) ..."

    $bash = Get-Command bash -ErrorAction SilentlyContinue
    if (-not $bash) {
        Write-Error "bash is required to run init-netbird-config.sh (Git for Windows or WSL)."
    }

    bash "$root/scripts/init-netbird-config.sh"
} else {
    Write-Host "[dev] NetBird config already present at infra/netbird/config.yaml"
}

Write-Host "[dev] Starting docker compose (build + detached) ..."
docker compose up -d --build

Write-Host "[dev] Waiting for control plane health on http://localhost:8080/health ..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing -TimeoutSec 3
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $ready) {
    Write-Error "[dev] Control plane did not become healthy in time. Check: docker compose logs control-plane-1"
}

Write-Host "[dev] Control plane is healthy."

if (-not $env:ADMIN_API_KEY) {
    Write-Host "[dev] ADMIN_API_KEY is empty - creating a dev API key via loopback ..."
    $body = '{"name":"dev-admin"}'
    $keyResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api-keys" -ContentType "application/json" -Body $body
    $newKey = $keyResponse.secret

    if ($newKey) {
        $lines = Get-Content $envFile
        $updated = $false
        $newLines = foreach ($line in $lines) {
            if ($line -match "^ADMIN_API_KEY=") {
                $updated = $true
                "ADMIN_API_KEY=$newKey"
            } else {
                $line
            }
        }

        if (-not $updated) {
            $newLines += "ADMIN_API_KEY=$newKey"
        }

        Set-Content -Path $envFile -Value $newLines
        $env:ADMIN_API_KEY = $newKey
        Write-Host "[dev] Wrote ADMIN_API_KEY to .env and restarting ui-backend ..."
        docker compose up -d ui-backend
    } else {
        Write-Warning "[dev] Could not parse API key secret from control plane response."
    }
} else {
    Write-Host "[dev] ADMIN_API_KEY already set in .env"
}

Write-Host ""
Write-Host "[dev] Stack is up."
Write-Host "  UI:              http://localhost:3000"
Write-Host "  Control plane:   http://localhost:8080"
Write-Host "  Agent health:    http://localhost:9470/health"
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  docker compose logs -f"
Write-Host "  docker compose down"
