# =============================================================
# SKY-MAGYCC JUDAS - itch.io 自動デプロイスクリプト
# =============================================================
# 使用方法:
#   powershell -File scripts/deploy-itch.ps1
#
# 前提条件:
#   1. C:\butler\butler.exe がインストール済みであること
#   2. butler login でitch.ioアカウントに認証済みであること
#   3. itch.io上にプロジェクトページが作成済みであること
# =============================================================

# --- 設定 ---
# TODO: itch.io のユーザー名とゲームスラッグに置き換えてください
$ITCH_USER = "suzukigame"
$ITCH_GAME = "sky-magycc-judas"
$BUTLER_PATH = "C:\butler\butler.exe"

# --- パス ---
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$NSIS_DIR = Join-Path $PROJECT_ROOT "src-tauri\target\release\bundle\nsis"
$WEB_DIR = Join-Path $PROJECT_ROOT "dist"

# --- バージョン取得 ---
$PackageJson = Get-Content (Join-Path $PROJECT_ROOT "package.json") | ConvertFrom-Json
$VERSION = $PackageJson.version

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " SKY-MAGYCC JUDAS Deploy to itch.io" -ForegroundColor Cyan
Write-Host " Version: $VERSION" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# --- 1. Tauri ビルド (Windows Desktop) ---
Write-Host "`n[1/3] Building Tauri desktop app..." -ForegroundColor Yellow
Push-Location $PROJECT_ROOT
npm run tauri:build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Tauri build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# --- 2. Desktop版をitch.ioにプッシュ ---
Write-Host "`n[2/3] Pushing Windows build to itch.io..." -ForegroundColor Yellow
if (Test-Path $NSIS_DIR) {
    & $BUTLER_PATH push $NSIS_DIR "${ITCH_USER}/${ITCH_GAME}:windows" --userversion $VERSION
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Butler push (windows) failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "WARNING: NSIS directory not found. Skipping desktop push." -ForegroundColor Yellow
}

# --- 3. Web版をitch.ioにプッシュ ---
Write-Host "`n[3/3] Pushing Web build to itch.io..." -ForegroundColor Yellow
if (Test-Path $WEB_DIR) {
    & $BUTLER_PATH push $WEB_DIR "${ITCH_USER}/${ITCH_GAME}:web" --userversion $VERSION
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Butler push (web) failed!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "WARNING: dist directory not found. Run 'npm run build' first." -ForegroundColor Yellow
}

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host " Deploy complete! Version: $VERSION" -ForegroundColor Green
Write-Host " https://${ITCH_USER}.itch.io/${ITCH_GAME}" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
