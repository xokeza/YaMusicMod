# YaMusicMod v1.34.1 🌲

Обновление модификации для настольного приложения Яндекс Музыка (Linux, Windows, macOS).

---

### ✨ Что нового в v1.34.1:

- **Фирменный стиль и логотип LLMusic**:
    - Приложение теперь использует официальный векторный логотип `website/logo.svg` в качестве иконки приложения, окна и системного трея.
    - Внутренние SVG-спрайты интерфейса (`musicLogo`, `musicLogoLeftRu`, `musicLogoLeftEn`) и миниплеера обновлены на актуальный логотип мода.
    - Сгенерирован полный набор многослойных иконок для всех платформ (`.ico` для Windows, 32-bit RGBA PNG от 16x16 до 512x512 и SVG для Linux/macOS).
- **Поддержка Wayland и тайлинговых композиторов**:
    - Исправлено сопоставление `app_id` (`YandexMusic`) под Wayland (Niri, Sway, Hyprland, GNOME Wayland, KDE Plasma).
    - Добавлена интеграция `app.setDesktopName('YandexMusic.desktop')` и регистрация соответствующих `.desktop` и иконок тем Breeze/Papirus/hicolor.
- **Оптимизация сборки**:
    - Корректная сборка пакетов без обязательного наличия Windows-специфичных C++ заголовков на Linux/macOS.
- **Всё включенное из v1.34.0**:
    - **DelTracks**: воспроизведение заблокированных/недоступных треков через встроенный плеер Sonata.
    - **CustomBackground**: загрузка видео без звука (MP4), анимаций (GIF) и картинок (PNG/JPG/WEBP), регулировка размытия и затемнения.
    - **CustomFonts**: выбор любого системного шрифта или загрузка файлов `.woff2`/`.ttf`/`.otf`.
    - **Управление плагинами**: модальное окно настроек и индивидуальные переключатели прямо в настройках приложения.

---

### 📦 Загрузки по платформам:

- 🐧 **[YaMusicMod-Linux.zip](https://github.com/xokeza/YaMusicMod/releases/download/v1.34.1/YaMusicMod-Linux.zip)** — для Linux (Ubuntu, Debian, Fedora, Arch и др.). Внутри `app.asar` + инструкция `guide.md`.
- 🪟 **[YaMusicMod-Windows.zip](https://github.com/xokeza/YaMusicMod/releases/download/v1.34.1/YaMusicMod-Windows.zip)** — для Windows 10/11. Внутри `app.asar` + инструкция `guide.md`.
- 🍏 **[YaMusicMod-macOS.zip](https://github.com/xokeza/YaMusicMod/releases/download/v1.34.1/YaMusicMod-macOS.zip)** — для macOS (Intel & Apple Silicon). Внутри `app.asar` + инструкция `guide.md`.

> [!NOTE]
> **О мобильных устройствах (Android / iOS):**
> Мобильные приложения Яндекс Музыки являются нативными бинарными приложениями (Kotlin / Swift), не используют движок Electron и не содержат файл `app.asar`. Поэтому данный мод предназначен исключительно для настольных ОС (Linux, Windows, macOS).
