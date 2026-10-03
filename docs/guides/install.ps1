[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ">>> Завершение процессов Яндекс Музыки..." -ForegroundColor Cyan
Stop-Process -Name "Яндекс Музыка", "YandexMusic" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Поиск директории с Яндекс Музыкой
$possibleDirs = @(
    "$env:LOCALAPPDATA\Programs\YandexMusic",
    "$env:PROGRAMFILES\YandexMusic",
    "${env:PROGRAMFILES(X86)}\YandexMusic"
)

$ymDir = $null
foreach ($dir in $possibleDirs) {
    if (Test-Path $dir) {
        $ymDir = $dir
        break
    }
}

if (-not $ymDir) {
    Write-Host "[!] Папка Яндекс Музыки не найдена автоматически." -ForegroundColor Yellow
    $userPath = Read-Host "Введите полный путь к папке Яндекс Музыки (например, C:\Users\User\AppData\Local\Programs\YandexMusic)"
    if (Test-Path $userPath) {
        $ymDir = $userPath
    } else {
        Write-Host "[-] Указанный путь не существует: $userPath" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[+] Папка Яндекс Музыки: $ymDir" -ForegroundColor Green

# Поиск исполняемого файла
$exe = Get-ChildItem -Path $ymDir -Filter "*.exe" | Where-Object { ($_.Name -like "*Музыка*.exe" -or $_.Name -like "YandexMusic*.exe") -and $_.Name -notlike "*Uninstall*" } | Select-Object -First 1
if (-not $exe) {
    Write-Host "[-] Исполняемый файл YandexMusic.exe не найден в $ymDir" -ForegroundColor Red
    exit 1
}
$exePath = $exe.FullName
Write-Host "[+] Исполняемый файл: $exePath" -ForegroundColor Green

# 1. Замена app.asar
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$newAsar = Join-Path $scriptDir "app.asar"

if (-not (Test-Path $newAsar)) {
    Write-Host "[-] Файл app.asar не найден рядом со скриптом: $newAsar" -ForegroundColor Red
    exit 1
}

$destAsar = Join-Path $ymDir "resources\app.asar"
$backupAsar = Join-Path $ymDir "resources\app.asar.bak"

if (Test-Path $destAsar) {
    if (-not (Test-Path $backupAsar)) {
        Write-Host ">>> Создание бэкапа исходного app.asar -> app.asar.bak..." -ForegroundColor Cyan
        Copy-Item -Path $destAsar -Destination $backupAsar -Force
    }
}

Write-Host ">>> Копирование нового app.asar..." -ForegroundColor Cyan
Copy-Item -Path $newAsar -Destination $destAsar -Force
Write-Host "[+] app.asar успешно скопирован!" -ForegroundColor Green

# 2. Опционально: копирование иконки в assets\icon.ico
$newIcon = Join-Path $scriptDir "icon.ico"
if (Test-Path $newIcon) {
    $destIcon = Join-Path $ymDir "resources\assets\icon.ico"
    if (Test-Path (Split-Path -Parent $destIcon)) {
        Copy-Item -Path $newIcon -Destination $destIcon -Force -ErrorAction SilentlyContinue
        Write-Host "[+] Иконка приложения (icon.ico) обновлена!" -ForegroundColor Green
    }
}

# 3. Вычисление SHA256 хеша заголовка нового app.asar
Write-Host ">>> Вычисление integrity hash для app.asar..." -ForegroundColor Cyan
$stream = [System.IO.File]::OpenRead($destAsar)
$reader = New-Object System.IO.BinaryReader($stream)
$reader.BaseStream.Seek(12, [System.IO.SeekOrigin]::Begin) | Out-Null
$jsonLen = $reader.ReadUInt32()
$jsonBytes = $reader.ReadBytes($jsonLen)
$reader.Close()
$stream.Close()

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hashBytes = $sha256.ComputeHash($jsonBytes)
$newHash = ($hashBytes | ForEach-Object { "{0:x2}" -f $_ }) -join ""

Write-Host "[+] Новый SHA256 хеш: $newHash" -ForegroundColor Green

# 4. Патчинг Electron Asar Integrity в exe
$backupExe = "$exePath.bak"
if (-not (Test-Path $backupExe)) {
    Write-Host ">>> Создание бэкапа .exe -> $backupExe..." -ForegroundColor Cyan
    Copy-Item -Path $exePath -Destination $backupExe -Force
}

Write-Host ">>> Обход проверки целостности (Asar Integrity) в .exe..." -ForegroundColor Cyan
$exeBytes = [System.IO.File]::ReadAllBytes($exePath)
$text = [System.Text.Encoding]::ASCII.GetString($exeBytes)

$marker = 'resources\\app.asar'
$markerIdx = $text.IndexOf($marker)

if ($markerIdx -ge 0) {
    $valMarker = '"value":"'
    $valIdx = $text.IndexOf($valMarker, $markerIdx)
    if ($valIdx -ge 0) {
        $hashOffset = $valIdx + $valMarker.Length
        $oldHash = $text.Substring($hashOffset, 64)
        Write-Host "    Старый хеш в exe: $oldHash" -ForegroundColor Yellow
        Write-Host "    Новый хеш в exe:  $newHash" -ForegroundColor Green

        $newHashBytes = [System.Text.Encoding]::ASCII.GetBytes($newHash)
        [System.Buffer]::BlockCopy($newHashBytes, 0, $exeBytes, $hashOffset, 64)
        [System.IO.File]::WriteAllBytes($exePath, $exeBytes)
        Write-Host "[+] Проверка целостности в .exe успешно обновлена!" -ForegroundColor Green
    } else {
        Write-Host "[-] Не удалось определить позицию value в integrity JSON" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[!] Маркер Asar Integrity не найден в .exe (возможно, уже отключен)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Модификация YaMusicMod успешно установлена! ✓" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""

$startNow = Read-Host "Запустить Яндекс Музыку прямо сейчас? (Y/n)"
if ($startNow -ne "n" -and $startNow -ne "N") {
    Start-Process -FilePath $exePath
}
