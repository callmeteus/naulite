#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory = $true)]
    [string]$HostUrl,
    [string]$NetbirdDomain = "netbird.local",
    [string]$NetbirdHttpProtocol = "http",
    [string]$NetbirdPublicManagementUrl = "",
    [int]$NetbirdServerPort = 9081
)

$ErrorActionPreference = "Stop"
$PlatformRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-Log {
    param([string]$Message)
    Write-Host "[naulite-control-plane] $Message"
}

function Set-EnvVar {
    param(
        [string]$Key,
        [string]$Value
    )

    $envFile = Join-Path $PlatformRoot ".env"
    $pattern = "^(?i)$([regex]::Escape($Key))=.*$"
    $line = "$Key=$Value"

    if (-not (Test-Path $envFile)) {
        Copy-Item (Join-Path $PlatformRoot ".env.example") $envFile
        Write-Log "created .env from .env.example"
    }

    $content = Get-Content $envFile -ErrorAction SilentlyContinue
  if ($null -eq $content) {
    $content = @()
  }

    $updated = $false
    $newContent = foreach ($entry in $content) {
        if ($entry -match $pattern) {
            $updated = $true
            $line
        }
        else {
            $entry
        }
    }

    if (-not $updated) {
        $newContent = @($newContent) + $line
    }

    Set-Content -Path $envFile -Value $newContent -Encoding UTF8
}

function Ensure-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "docker is required"
    }

    docker compose version | Out-Null
}

function Initialize-NetBird {
    $configPath = Join-Path $PlatformRoot "infra\netbird\config.yaml"
    if (Test-Path $configPath) {
        Write-Log "NetBird config already present"
        return
    }

    $env:NETBIRD_DOMAIN = $NetbirdDomain
    $env:NETBIRD_HTTP_PROTOCOL = $NetbirdHttpProtocol
    $env:NETBIRD_SERVER_PORT = "$NetbirdServerPort"
    & bash (Join-Path $PlatformRoot "scripts\init-netbird-config.sh")
}

function Wait-ForHealth {
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        try {
            Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get | Out-Null
            return
        }
        catch {
            Start-Sleep -Seconds 2
        }
    }

    throw "control plane did not become healthy in time"
}

function Ensure-AdminKey {
    $envFile = Join-Path $PlatformRoot ".env"
    $content = Get-Content $envFile
    $hasKey = $false

    foreach ($line in $content) {
        if ($line -match '^ADMIN_API_KEY=\s*\S+') {
            $hasKey = $true
            break
        }
    }

    if ($hasKey) {
        Write-Log "ADMIN_API_KEY already set in .env"
        return
    }

    $response = Invoke-RestMethod -Uri "http://localhost:8080/api-keys" -Method Post `
        -ContentType "application/json" `
        -Body '{"name":"bootstrap-admin"}'

    if ($response.secret) {
        Set-EnvVar -Key "ADMIN_API_KEY" -Value $response.secret
        Push-Location $PlatformRoot
        try {
            docker compose up -d ui-backend
        }
        finally {
            Pop-Location
        }
        Write-Log "wrote ADMIN_API_KEY to .env"
    }
}

$HostUrl = $HostUrl.TrimEnd("/")
Ensure-Docker
Set-EnvVar -Key "NAULITE_PUBLIC_URL" -Value $HostUrl
Set-EnvVar -Key "NETBIRD_DOMAIN" -Value $NetbirdDomain
Set-EnvVar -Key "NETBIRD_HTTP_PROTOCOL" -Value $NetbirdHttpProtocol
Set-EnvVar -Key "NETBIRD_SERVER_PORT" -Value "$NetbirdServerPort"

if (-not [string]::IsNullOrWhiteSpace($NetbirdPublicManagementUrl)) {
    Set-EnvVar -Key "NETBIRD_PUBLIC_MANAGEMENT_URL" -Value $NetbirdPublicManagementUrl
}

Push-Location $PlatformRoot
try {
    Initialize-NetBird
    Write-Log "starting docker compose stack"
    docker compose up -d --build
    Wait-ForHealth
    Ensure-AdminKey

    $setupKeyResponse = Invoke-RestMethod -Uri "http://localhost:8080/bootstrap/setup-key" -Method Get
    $setupKey = $setupKeyResponse.setupKey

    if ([string]::IsNullOrWhiteSpace($setupKey)) {
        throw "failed to obtain setup key"
    }

    Write-Host ""
    Write-Host "Control plane is ready."
    Write-Host "  UI:            http://localhost:13000"
    Write-Host "  Control plane: http://localhost:8080"
    Write-Host "  Public URL:    $HostUrl"
    Write-Host ""
    Write-Host "Install an agent on another machine:"
    Write-Host "  curl -fsSL <repo>/bootstrap/agent-install.sh | sudo bash -s -- --host $HostUrl --setup-key $setupKey"
}
finally {
    Pop-Location
}
