@echo off
setlocal EnableDelayedExpansion
title EasyRent24 - shared with client
rem ============================================================================
rem  Double-click to put EasyRent24 on the internet for your client to test.
rem
rem  Starts a free Cloudflare quick tunnel to the app on this computer and gives
rem  you a https://....trycloudflare.com link to send to your client. Payments
rem  use the built-in prototype checkout (FNB cards approve, no real money).
rem
rem  The link works only while this computer is on, Docker is running and the
rem  "EasyRent tunnel" window is open. It changes every time you run this.
rem  Stop sharing: close the "EasyRent tunnel" window.
rem
rem  Needs: Docker Desktop, cloudflared (winget install Cloudflare.cloudflared)
rem ============================================================================

cd /d "%~dp0"
echo.
echo  EasyRent24 - share with your client
echo  -----------------------------------

rem --- Safety: never go public with the default login secret or live payments
findstr /r /c:"^JWT_SECRET=.........................................*" .env >nul 2>&1
if errorlevel 1 (
    echo  .env has no JWT_SECRET. Add a long random value before sharing the app.
    goto :fail
)
findstr /r /c:"^PAYFAST_MODE=live" .env >nul 2>&1
if not errorlevel 1 (
    echo  .env is set to live PayFast. Client testing uses the prototype checkout:
    echo  set PAYFAST_MODE=sandbox in .env, then run this again.
    goto :fail
)

where cloudflared >nul 2>&1
if errorlevel 1 (
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
echo  [2/4] Opening the public link (up to a minute)...
start "EasyRent tunnel" /min cmd /c "cloudflared tunnel --no-autoupdate --url http://localhost:3000 2> "%TUNNEL_LOG%""
set "PUBLIC_URL="
set /a waited=0
:wait_tunnel
ping -n 2 127.0.0.1 >nul
set /a waited+=1
for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "$t = Get-Content -Raw '%TUNNEL_LOG%' -ErrorAction SilentlyContinue; if ($t -match 'Registered tunnel connection' -and $t -match '(https://[a-z0-9-]+\.trycloudflare\.com)') { $Matches[1] }"`) do set "PUBLIC_URL=%%u"
if defined PUBLIC_URL goto :tunnel_ready
if !waited! geq 180 (
    echo  The tunnel did not come up within 3 minutes. See %TUNNEL_LOG%
    goto :fail
)
goto :wait_tunnel
:tunnel_ready

rem --- App: invite links and payment returns use the public link ---------------
set "APP_URL=!PUBLIC_URL!"
set "APP_BROWSER_URL="
set "PAYMENT_PROVIDER=demo"
echo  [3/4] Building and starting the app for !PUBLIC_URL! (a few minutes)...
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
echo !PUBLIC_URL!| clip
start "" !PUBLIC_URL!
echo.
echo  ===========================================================================
echo   EasyRent24 is live. Send your client this link (already copied):
echo.
echo     !PUBLIC_URL!
echo.
echo   Logins (password: Password123^^!)
echo     Super admin   admin@easyrent24.co.za
echo     Agent         agent@easyrent24.co.za
echo     Landlord      landlord@easyrent24.co.za
echo   Tenants sign up through invite links the agent or landlord creates.
echo   Payments: choose FNB to approve. Other banks are declined. No real money.
echo.
echo   Keep this computer on and the "EasyRent tunnel" window open.
echo   To stop sharing, close the "EasyRent tunnel" window.
echo  ===========================================================================
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
