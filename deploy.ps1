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
