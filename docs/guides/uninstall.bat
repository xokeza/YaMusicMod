@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Удаление YaMusicMod

echo ========================================================
echo        Откат к оригинальной версии Яндекс Музыки
echo ========================================================
echo.

taskkill /F /IM "Яндекс Музыка.exe" 2>nul
taskkill /F /IM "YandexMusic.exe" 2>nul
timeout /t 1 /nobreak >nul

set "YM_DIR=%LOCALAPPDATA%\Programs\YandexMusic"

if exist "%YM_DIR%\resources\app.asar.bak" (
    del "%YM_DIR%\resources\app.asar" 2>nul
    move "%YM_DIR%\resources\app.asar.bak" "%YM_DIR%\resources\app.asar" >nul
    echo [+] app.asar восстановлен из резервной копии.
) else (
    echo [-] Резервная копия app.asar.bak не найдена.
)

for %%f in ("%YM_DIR%\*.exe.bak") do (
    set "bakFile=%%f"
    set "origExe=!bakFile:~0,-4!"
    del "!origExe!" 2>nul
    move "%%f" "!origExe!" >nul
    echo [+] Исполняемый файл восстановлен из бэкапа.
)

echo.
echo ========================================================
echo   Оригинальная версия Яндекс Музыки восстановлена!
echo ========================================================
pause
