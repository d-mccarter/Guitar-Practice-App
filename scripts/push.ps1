# Bump build number, commit, and push.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

python scripts/bump-build.py
git add build.json
$build = (Get-Content build.json | ConvertFrom-Json).build
git commit -m "Bump build to $build" --no-verify
git push --no-verify @args
