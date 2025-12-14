#!/usr/bin/env pwsh
# Quick deploy script for ai-workflow-tool

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

Write-Host "Building web app..." -ForegroundColor Cyan
cd web
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

cd $projectRoot

Write-Host "Deploying to Firebase..." -ForegroundColor Cyan
npx firebase deploy --only hosting

Write-Host "Deployment complete! Visit: https://try1-7d848.web.app" -ForegroundColor Green
