@echo off
chcp 65001 >nul
title Установка YaMusicMod (LLMusic)

echo ========================================================
echo        Установка YaMusicMod для Яндекс Музыки
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] Произошла ошибка при установке.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Нажмите любую клавишу для закрытия...
pause >nul
