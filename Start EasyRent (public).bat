@echo off
setlocal EnableDelayedExpansion
title EasyRent24 (public - live PayFast)
rem ============================================================================
rem  Double-click to run EasyRent24 with REAL PayFast payments on this machine.
rem
rem  PayFast confirms payments by calling the app from the internet (ITN), which
rem  it can't do to localhost. This starts a free Cloudflare quick tunnel so it
rem  can, while you keep browsing at http://localhost:3000.
rem
rem  Needs: Docker Desktop, cloudflared, and your PayFast merchant key +
rem  passphrase in the .env file next to this script.
rem  Stop:  close the "EasyRent tunnel" window, then  docker compose down
rem ============================================================================

cd /d "%~dp0"
echo.
echo  EasyRent24 - public mode (real PayFast payments)
echo  ------------------------------------------------

rem --- PayFast credentials present? --------------------------------------------
findstr /r /c:"^PAYFAST_MERCHANT_KEY=..*" .env >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Your PayFast merchant key is not set.
    echo  Open .env in this folder and fill in PAYFAST_MERCHANT_KEY and PAYFAST_PASSPHRASE
    echo  from PayFast dashboard -^> Settings -^> Integration, then run this again.
    goto :fail
)

where cloudflared >nul 2>&1
if errorlevel 1 (
    echo.
    echo  cloudflared is not installed. Install it with:  winget install Cloudflare.cloudflared
    goto :fail
)

rem --- Docker ------------------------------------------------------------------
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ready
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    echo  Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop/
    goto :fail
)
echo  Starting Docker Desktop...
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a waited=0
:wait_docker
ping -n 4 127.0.0.1 >nul
set /a waited+=3
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ready
if !waited! geq 180 (
    echo  Docker did not start within 3 minutes.
    goto :fail
)
goto :wait_docker
:docker_ready
echo  [1/4] Docker is running

rem --- Public tunnel -----------------------------------------------------------
set "TUNNEL_LOG=%TEMP%\easyrent-tunnel.log"
taskkill /fi "WINDOWTITLE eq EasyRent tunnel*" /f >nul 2>&1
del "%TUNNEL_LOG%" >nul 2>&1
echo  [2/4] Opening a public tunnel for PayFast (up to a minute)...
start "EasyRent tunnel" /min cmd /c "cloudflared tunnel --no-autoupdate --protocol http2 --url http://localhost:3000 2> "%TUNNEL_LOG%""
set "PUBLIC_URL="
set /a waited=0
:wait_tunnel
ping -n 2 127.0.0.1 >nul
set /a waited+=1
rem Only read the URL once the tunnel is registered: looking the name up any
rem earlier makes DNS cache it as "does not exist".
for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "$t = Get-Content -Raw '%TUNNEL_LOG%' -ErrorAction SilentlyContinue; if ($t -match 'Registered tunnel connection' -and $t -match '(https://[a-z0-9-]+\.trycloudflare\.com)') { $Matches[1] }"`) do set "PUBLIC_URL=%%u"
if defined PUBLIC_URL goto :tunnel_ready
if !waited! geq 180 (
    echo  The tunnel did not come up within 3 minutes. See %TUNNEL_LOG%
    goto :fail
)
goto :wait_tunnel
:tunnel_ready
echo        PayFast will notify:  !PUBLIC_URL!/api/payments/payfast/notify

rem --- App (APP_URL = tunnel for PayFast; browser returns to localhost) --------
set "APP_URL=!PUBLIC_URL!"
set "APP_BROWSER_URL=http://localhost:3000"
echo  [3/4] Starting database and app...
docker compose up -d --build
if errorlevel 1 (
    echo  Could not start the containers. See the messages above.
    goto :fail
)

echo  [4/4] Waiting for the app to be ready...
set /a waited=0
:wait_app
curl -s http://localhost:3000/api/health 2>nul | findstr "backendImportWorking" >nul
if not errorlevel 1 goto :app_ready
if !waited! geq 180 (
    echo  The app did not become ready within 3 minutes.  docker compose logs app
    goto :fail
)
ping -n 3 127.0.0.1 >nul
set /a waited+=2
goto :wait_app

:app_ready
start "" http://localhost:3000
echo.
echo  EasyRent24 is running with LIVE PayFast payments.
echo    Browse:           http://localhost:3000
echo    PayFast notifies: !PUBLIC_URL!
echo.
echo  Payments here are REAL. Keep the minimised "EasyRent tunnel" window open,
echo  or PayFast can't confirm payments. The address changes every run.
echo.
echo  Demo accounts (password: Password123^^!)
echo    landlord@demo.com   agent@demo.com   tenant@demo.com   handyman@demo.com
echo.
ping -n 21 127.0.0.1 >nul
exit /b 0

:fail
echo.
pause
exit /b 1
