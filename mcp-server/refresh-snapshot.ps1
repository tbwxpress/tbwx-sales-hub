# Refresh the local prod-snapshot.db from the live SalesHub VPS.
# Run this before a monthly analysis session so Claude Code (saleshub-leads MCP) sees fresh data.
#   Usage:  powershell -File mcp-server/refresh-snapshot.ps1
$ErrorActionPreference = "Stop"
$key       = "$env:USERPROFILE\.ssh\hostinger_vps"
$vps       = "root@187.124.99.176"
$remoteVol = "/var/lib/docker/volumes/saleshub_saleshub_data/_data"
$local     = Join-Path $PSScriptRoot "data\prod-snapshot.db"

New-Item -ItemType Directory -Force (Split-Path $local) | Out-Null

Write-Host "1/3  Snapshotting prod inbox.db inside the container..."
ssh -i $key -o StrictHostKeyChecking=accept-new $vps "docker exec saleshub-app-1 sh -c 'cp /app/data/inbox.db /app/data/_snapshot.db'"

Write-Host "2/3  Pulling snapshot down..."
scp -i $key -o StrictHostKeyChecking=accept-new "${vps}:${remoteVol}/_snapshot.db" $local

Write-Host "3/3  Cleaning up remote snapshot..."
ssh -i $key -o StrictHostKeyChecking=accept-new $vps "docker exec saleshub-app-1 rm -f /app/data/_snapshot.db"

$sizeMb = [math]::Round((Get-Item $local).Length / 1MB, 1)
Write-Host "Done. Snapshot refreshed -> $local ($sizeMb MB)" -ForegroundColor Green
Write-Host "The saleshub-leads MCP will use this on your next Claude Code session."
