@echo off
setlocal
title Movie Ticket Booking System - DA3 JDBC Server
cd /d "%~dp0"

echo ============================================================================
echo   MOVIE TICKET BOOKING SYSTEM - DA3 (VIT ADBMS)
echo   Database: Oracle 21c Express Edition (XEPDB1)
echo   Front-end to Back-end Connectivity: Pure Java JDBC (java.sql.*)
echo ============================================================================
echo.

echo [INFO] Compiling Java source files...
if not exist "bin" mkdir bin
javac -encoding UTF-8 -cp "lib/ojdbc11.jar" -d "bin" src\com\cinema\db\*.java src\com\cinema\dao\*.java src\com\cinema\server\*.java src\com\cinema\*.java
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Compilation failed. Please check javac installation.
    pause
    exit /b %ERRORLEVEL%
)
echo [INFO] Compilation successful!
echo.

echo [INFO] Starting Java JDBC HTTP Server on http://localhost:8080 ...
echo [INFO] Press Ctrl+C in this terminal window to stop the server.
echo.

java -cp "bin;lib/ojdbc11.jar" com.cinema.Main
pause
