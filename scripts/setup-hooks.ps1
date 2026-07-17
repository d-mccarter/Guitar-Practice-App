# Install the pre-push hook (run once per clone).
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Copy-Item -Force .githooks\pre-push .git\hooks\pre-push
Write-Output 'Installed pre-push hook — build.json will bump on every git push.'
