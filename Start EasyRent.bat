@echo off
setlocal EnableDelayedExpansion
title EasyRent24
rem ============================================================================
rem  Double-click to start EasyRent24 (Postgres + app in Docker) and open it
rem  in your browser. Safe to run again: it only rebuilds what changed.
rem  To stop the app:  docker compose down   (in this folder)
rem ============================================================================

cd /d "%~dp0"

echo.
echo  EasyRent24
echo  ----------

rem --- 1. Make sure Docker is running -----------------------------------------
docker info >nul 2>&1
if not errorlevel 1 goto :docker_ready

if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    echo.
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
echo  [1/3] Docker is running

rem --- Port 3000 must not be taken by another program (e.g. another dev server)
set "BLOCKER="
for /f "usebackq delims=" %%n in (`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { (Get-Process -Id $_.OwningProcess).ProcessName } | Where-Object { $_ -notmatch 'docker|wslrelay|vpnkit' } | Select-Object -First 1"`) do set "BLOCKER=%%n"
if defined BLOCKER (
    echo.
    echo  Port 3000 is already in use by another program: !BLOCKER!
    echo  Close it ^(for example another "npm run dev"^) and run this again.
    goto :fail
)

rem --- 2. Build (if needed) and start the database and app --------------------
echo  [2/3] Starting database and app (the first run takes a few minutes)...
docker compose up -d --build
if errorlevel 1 (
    echo.
    echo  Could not start the containers. See the messages above.
    goto :fail
)

rem --- 3. Wait until the app answers, then open it -----------------------------
echo  [3/3] Waiting for the app to be ready...
set /a waited=0
:wait_app
curl -s http://localhost:3000/api/health 2>nul | findstr "backendImportWorking" >nul
if not errorlevel 1 goto :app_ready
if !waited! geq 180 (
    echo  The app did not become ready within 3 minutes.
    echo  Check the logs with:  docker compose logs app
    goto :fail
)
ping -n 3 127.0.0.1 >nul
set /a waited+=2
goto :wait_app

:app_ready
start "" http://localhost:3000

echo.
echo  EasyRent24 is running at http://localhost:3000
echo.
echo  Demo accounts (password: Password123^^!)
echo    landlord@easyrent24.co.za   agent@easyrent24.co.za   tenant@easyrent24.co.za   handyman@easyrent24.co.za   admin@easyrent24.co.za
echo.
echo  To stop it later, run:  docker compose down   (in this folder)
echo  For real PayFast payments use "Start EasyRent (public).bat" instead.
echo.
rem Keep this window open for a moment so the details can be read.
ping -n 16 127.0.0.1 >nul
exit /b 0

:fail
echo.
pause
exit /b 1
