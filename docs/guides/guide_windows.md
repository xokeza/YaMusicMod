# Руководство по установке YaMusicMod для Windows

## ◈ Содержимое архива:

- `install.bat` — **автоматический установщик в 1 клик** (закрывает плеер, копирует `app.asar`, обновляет Asar Integrity в `.exe` и запускает музыку).
- `install.ps1` — PowerShell-скрипт установки.
- `uninstall.bat` — откат к оригинальной версии Яндекс Музыки в 1 клик.
- `app.asar` — модифицированное ядро приложения.
- `icon.ico` — фирменная иконка мода (LLMusic).
- `guide.md` — данная инструкция.

---

## ▷ Способ 1: Автоматическая установка (Рекомендуется)

1. Распакуйте скачанный zip-архив `YaMusicMod-Windows.zip` в любую удобную папку.
2. Запустите файл **`install.bat`** (двойным кликом мыши).
3. Скрипт автоматически:
    - Завершит фоновые процессы Яндекс Музыки.
    - Сделает резервную копию оригинальных файлов.
    - Скопирует обновленный `app.asar` и иконку.
    - Обновит цифровую проверку целостности (`Asar Integrity`) в исполняемом `.exe`.
    - Предложит сразу запустить Яндекс Музыку!

---

## ▷ Способ 2: Если вы уже скопировали `app.asar` вручную

> [!IMPORTANT]
> **Почему Яндекс Музыка не запускается после простой замены файла?**
> В официальном приложении Яндекс Музыки на Windows включена встроенная защита Electron (`Asar Integrity`): при запуске `YandexMusic.exe` проверяет криптографический SHA256-хэш заголовка `app.asar`. Если файл был модифицирован, а хэш в `.exe` не обновлен, приложение аварийно завершается до открытия окна.

Чтобы обновить хэш прямо сейчас без повторной переброски файлов, откройте **PowerShell** (нажмите `Win + X` -> **Терминал** или **PowerShell**) и выполните одну команду:

```powershell
$dir = "$env:LOCALAPPDATA\Programs\YandexMusic"; Stop-Process -Name "Яндекс Музыка","YandexMusic" -Force -EA SilentlyContinue; $exe = (Get-ChildItem "$dir\*.exe" | Where-Object { ($_.Name -like "*Музыка*.exe" -or $_.Name -like "YandexMusic*.exe") -and $_.Name -notlike "*Uninstall*" })[0].FullName; $stream = [IO.File]::OpenRead("$dir\resources\app.asar"); $reader = New-Object IO.BinaryReader($stream); $reader.BaseStream.Seek(12, 0) | Out-Null; $h = [Security.Cryptography.SHA256]::Create().ComputeHash($reader.ReadBytes($reader.ReadUInt32())); $stream.Close(); $newHash = ($h | ForEach-Object { "{0:x2}" -f $_ }) -join ""; $bytes = [IO.File]::ReadAllBytes($exe); $text = [Text.Encoding]::ASCII.GetString($bytes); $idx = $text.IndexOf('resources\\app.asar'); $valIdx = $text.IndexOf('"value":"', $idx) + 9; [Buffer]::BlockCopy([Text.Encoding]::ASCII.GetBytes($newHash), 0, $bytes, $valIdx, 64); [IO.File]::WriteAllBytes($exe, $bytes); Start-Process $exe
```

После выполнения этой команды Яндекс Музыка сразу запустится с активным модом!

---

## ⟲ Удаление мода (откат к оригиналу):

Дважды нажмите **`uninstall.bat`** — он вернет оригинальные файлы `app.asar` и `.exe` из созданных при установке резервных копий (`.bak`).
