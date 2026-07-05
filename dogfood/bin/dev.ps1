$ErrorActionPreference = "Stop"

$dogfood = Split-Path -Parent $PSScriptRoot
Set-Location $dogfood

Write-Host "[dev] Dogfood root: $dogfood"

function Get-DerivedNetbirdPublicManagementUrl {
    if ($env:NETBIRD_PUBLIC_MANAGEMENT_URL) {
        return $env:NETBIRD_PUBLIC_MANAGEMENT_URL
    }

    $protocol = if ($env:NETBIRD_HTTP_PROTOCOL) { $env:NETBIRD_HTTP_PROTOCOL } else { "http" }
    $port = if ($env:NETBIRD_SERVER_PORT) { $env:NETBIRD_SERVER_PORT } else { "9081" }
    $domain = if ($env:NETBIRD_DOMAIN) { $env:NETBIRD_DOMAIN } else { "netbird.local" }
    $url = "$protocol`://$domain"

    if (($protocol -eq "http" -and $port -ne "80") -or ($protocol -eq "https" -and $port -ne "443")) {
        $url = "$url`:$port"
    }

    return $url
}

function Set-DotEnvVar {
    param(
        [string]$Key,
        [string]$Value,
        [string]$Path
    )

    $lines = Get-Content $Path
    $updated = $false
    $newLines = foreach ($line in $lines) {
        if ($line -match "^$Key=") {
            $updated = $true
            "$Key=$Value"
        } else {
            $line
        }
    }

    if (-not $updated) {
        $newLines += "$Key=$Value"
    }

    Set-Content -Path $Path -Value $newLines
}

$envFile = Join-Path $dogfood ".env"
$envExample = Join-Path $dogfood ".env.example"

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

if (-not $env:NETBIRD_PUBLIC_MANAGEMENT_URL) {
    $derivedUrl = Get-DerivedNetbirdPublicManagementUrl
    $env:NETBIRD_PUBLIC_MANAGEMENT_URL = $derivedUrl
    Set-DotEnvVar -Key "NETBIRD_PUBLIC_MANAGEMENT_URL" -Value $derivedUrl -Path $envFile
    Write-Host "[dev] Derived NETBIRD_PUBLIC_MANAGEMENT_URL=$derivedUrl"
}

$netbirdConfig = Join-Path $dogfood "infra\netbird\config.yaml"
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

    bash "$dogfood/scripts/init-netbird-config.sh"
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
    try {
        $keyResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api-keys" -ContentType "application/json" -Body $body
    } catch {
        Write-Error "[dev] Failed to create ADMIN_API_KEY. Ensure NAULITE_E2E_ALLOW_BRIDGE=1 on control-plane services, then run: docker compose up -d control-plane-1 control-plane-2"
    }
    $newKey = $keyResponse.secret

    if ($newKey) {
        Set-DotEnvVar -Key "ADMIN_API_KEY" -Value $newKey -Path $envFile
        $env:ADMIN_API_KEY = $newKey
        Write-Host "[dev] Wrote ADMIN_API_KEY to .env and restarting ui-backend ..."
        docker compose up -d ui-backend
    } else {
        Write-Warning "[dev] Could not parse API key secret from control plane response."
    }
} else {
    Write-Host "[dev] ADMIN_API_KEY already set in .env"
}

if (-not $env:NETBIRD_SETUP_KEY) {
    Write-Host "[dev] NETBIRD_SETUP_KEY is empty - fetching setup key via loopback ..."
    $setupResponse = Invoke-RestMethod -Method Get -Uri "http://localhost:8080/bootstrap/setup-key"
    $newSetupKey = $setupResponse.setupKey

    if ($newSetupKey) {
        Set-DotEnvVar -Key "NETBIRD_SETUP_KEY" -Value $newSetupKey -Path $envFile
        $env:NETBIRD_SETUP_KEY = $newSetupKey
        Write-Host "[dev] Wrote NETBIRD_SETUP_KEY to .env and restarting agent-1 ..."
        docker compose up -d agent-1
    } else {
        Write-Warning "[dev] Could not parse setup key from control plane response."
    }
} else {
    Write-Host "[dev] NETBIRD_SETUP_KEY already set in .env"
}

Write-Host ""
Write-Host "[dev] Stack is up."
Write-Host "  UI:              http://localhost:3000"
Write-Host "  Control plane:   http://localhost:8080"
Write-Host "  Agent health:    http://localhost:9470/health"
Write-Host "  NetBird (host):  $($env:NETBIRD_PUBLIC_MANAGEMENT_URL)"
Write-Host ""
Write-Host "Useful commands:"
Write-Host "  cd dogfood; docker compose logs -f"
Write-Host "  cd dogfood; docker compose down"
