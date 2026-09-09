# deploy.ps1 -- Wheatland Construction
# ALWAYS use this script. Never run wrangler directly.
# Usage: .\deploy.ps1 staging    (for staging)
#        .\deploy.ps1 main       (for production -- requires explicit approval)
#
# This script enforces the SOP build -> commit -> deploy sequence.
# Skipping the build step is the #1 cause of broken deploys on this site.

param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("staging","main")]
  [string]$Branch
)

$ErrorActionPreference = "Stop"
$SiteRoot = $PSScriptRoot

Write-Host "`n[1/4] Running build..." -ForegroundColor Cyan
Set-Location $SiteRoot
node build.js
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed. Deploy aborted."; exit 1 }

Write-Host "`n[2/4] Committing to git..." -ForegroundColor Cyan
git add .
$commitMsg = "deploy: build + deploy to $Branch $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { Write-Host "Nothing new to commit (or commit failed) -- continuing." -ForegroundColor Yellow }

Write-Host "`n[3/4] Pushing to GitHub ($Branch)..." -ForegroundColor Cyan
git push origin $Branch
if ($LASTEXITCODE -ne 0) { Write-Error "Git push failed. Deploy aborted."; exit 1 }

Write-Host "`n[3.5/4] Validating dist/ before deploy..." -ForegroundColor Cyan
# HARD GUARD: dist/index.html must start with <!DOCTYPE to prove a real build ran.
# If it starts with <!-- HEADER --> or anything else, the build was skipped or corrupted.
$distIndex = Join-Path $SiteRoot "dist\index.html"
if (-not (Test-Path $distIndex)) {
  Write-Error "DEPLOY BLOCKED: dist/index.html does not exist. Run node build.js first."
  exit 1
}
$firstLine = (Get-Content $distIndex -TotalCount 1).Trim()
if ($firstLine -notmatch '^<!DOCTYPE') {
  Write-Error "DEPLOY BLOCKED: dist/index.html does not start with <!DOCTYPE. Got: '$firstLine'. This means the build was skipped or dist/ is corrupted. Run node build.js and try again."
  exit 1
}
# Also verify CSS exists in dist/
$distCss = Join-Path $SiteRoot "dist\css\style.css"
if (-not (Test-Path $distCss)) {
  Write-Error "DEPLOY BLOCKED: dist/css/style.css is missing. Run node build.js first."
  exit 1
}
Write-Host "   dist/index.html validated (starts with <!DOCTYPE). CSS present. Safe to deploy." -ForegroundColor Green

Write-Host "`n[4/4] Deploying to Cloudflare Pages ($Branch)..." -ForegroundColor Cyan
$credPath = "C:\Users\KillerGrowth\.openclaw\workspace\References\credentials.md"
$token = (Select-String -Path $credPath -Pattern "cfut_[A-Za-z0-9_]+" | Select-Object -First 1).Matches[0].Value
if (-not $token) { Write-Error "Could not read CF token from credentials.md"; exit 1 }

$env:CLOUDFLARE_API_TOKEN = $token
$env:CLOUDFLARE_ACCOUNT_ID = "27cafbbee6f8e1db0d9499405d4755c1"
npx wrangler pages deploy ./dist --project-name wheatland-construction --branch $Branch
if ($LASTEXITCODE -ne 0) { Write-Error "Wrangler deploy failed."; exit 1 }

Write-Host "`n✅ Deploy complete -> $Branch" -ForegroundColor Green
if ($Branch -eq "staging") {
  Write-Host "   Staging URL: https://staging.wheatland-construction.pages.dev" -ForegroundColor Gray
} else {
  Write-Host "   Live URL: https://wheatlandconstruction.com" -ForegroundColor Gray
}
