$ErrorActionPreference = "Stop"

if (-not $env:NETBIRD_DOMAIN) {
    Write-Error "NETBIRD_DOMAIN is required. Example: `$env:NETBIRD_DOMAIN = 'vpn.example.com'"
}

$root = Split-Path -Parent $PSScriptRoot
$nbDir = Join-Path $root "infra\netbird"

if ((Test-Path (Join-Path $nbDir "config.yaml")) -and (Test-Path (Join-Path $nbDir "docker-compose.yml"))) {
    Write-Host "NetBird already initialized in infra/netbird/."
    exit 0
}

$bash = Get-Command bash -ErrorAction SilentlyContinue
if (-not $bash) {
    Write-Error "bash is required (Git for Windows or WSL). Install Git for Windows or run setup-netbird.sh from WSL."
}

Write-Host "Running official NetBird getting-started.sh via bash ..."
Push-Location $nbDir
try {
    bash -lc "curl -fsSL https://github.com/netbirdio/netbird/releases/latest/download/getting-started.sh | bash"
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "NetBird stack files are in infra/netbird/."
Write-Host "Start everything from the platform root:"
Write-Host "  docker compose up -d"
