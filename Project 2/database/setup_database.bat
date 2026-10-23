@echo off
setlocal
title Setup Oracle Database - DA3
cd /d "%~dp0"

echo ============================================================================
echo   INITIALIZING ORACLE 21c ADVANCED DATABASE SCHEMA, PROCEDURES & TRIGGERS
echo ============================================================================
echo.

set SQLPLUS_EXE=C:\app\dbhomeXE\bin\sqlplus.exe
if not exist "%SQLPLUS_EXE%" (
    set SQLPLUS_EXE=sqlplus
)

echo [INFO] Running setup_oracle.sql using SQL*Plus...
"%SQLPLUS_EXE%" -S cinema_admin/cinema123@//localhost:1521/XEPDB1 @setup_oracle.sql

echo.
echo [INFO] Database initialization completed!
echo.
pause
