@echo off
setlocal
title Test JDBC Console - DA3 Viva Demo
cd /d "%~dp0"

echo ============================================================================
echo   RUNNING INTERACTIVE JDBC CONSOLE DEMO (ORACLE 21c + JDBC)
echo ============================================================================
echo.

echo [INFO] Compiling Java source files...
if not exist "bin" mkdir bin
javac -encoding UTF-8 -cp "lib/ojdbc11.jar" -d "bin" src\com\cinema\db\*.java src\com\cinema\dao\*.java src\com\cinema\server\*.java src\com\cinema\*.java
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Compilation failed.
    pause
    exit /b %ERRORLEVEL%
)

java -cp "bin;lib/ojdbc11.jar" com.cinema.JdbcCliDemo
echo.
pause
