# Руководство по установке YaMusicMod для macOS

## ◈ Содержимое архива:

- `app.asar` — модифицированное ядро Яндекс Музыки (со встроенными плагинами, настройками и улучшениями).
- `guide.md` — данная инструкция.

---

## ▷ Установка за 1 минуту:

1. **Полностью закройте Яндекс Музыку** (Command + Q).

2. **Перейдите к ресурсам приложения**:
    - Откройте **Finder** -> раздел **Программы** (Applications).
    - Найдите **Яндекс Музыка** (Yandex Music).
    - Нажмите правой кнопкой мыши (или Control + клик) -> **«Показать содержимое пакета»** (Show Package Contents).
    - Перейдите в папку `Contents/Resources/`.

    _Или выполните команду в Терминале:_

    ```bash
    cd "/Applications/Yandex Music.app/Contents/Resources"
    ```

3. **Сделайте резервную копию оригинала**:

    ```bash
    cp "/Applications/Yandex Music.app/Contents/Resources/app.asar" "/Applications/Yandex Music.app/Contents/Resources/app.asar.bak"
    ```

4. **Замените `app.asar`**:
    - Перетащите файл `app.asar` из этого архива в папку `Contents/Resources/` (с подтверждением замены).

5. **Снимите карантин Gatekeeper** (если при запуске macOS блокирует приложение):

    ```bash
    xattr -cr "/Applications/Yandex Music.app"
    ```

6. **Запустите Яндекс Музыку** — приятного прослушивания!

---

## ⟲ Удаление мода (откат к оригиналу):

```bash
cp "/Applications/Yandex Music.app/Contents/Resources/app.asar.bak" "/Applications/Yandex Music.app/Contents/Resources/app.asar"
```
