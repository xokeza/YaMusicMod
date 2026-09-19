<div align="center">

<img src="https://avatars.mds.yandex.net/i?id=b6d04faca77f714b5f3cb55149490e4a_l-4079565-images-thumbs&n=13" width="80" alt="logo" />

# YaMusicMod

> Мод для десктопного клиента **Яндекс Музыки**

[![Release](https://img.shields.io/github/v/release/xokeza/YaMusicMod?style=flat-square&color=fc3c44&label=релиз)](https://github.com/xokeza/YaMusicMod/releases)
[![License: MIT](https://img.shields.io/badge/лицензия-MIT-blue?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/платформа-Windows%20%7C%20Linux-lightgrey?style=flat-square&logo=windows&logoColor=white)](#-установка)
[![Stars](https://img.shields.io/github/stars/xokeza/YaMusicMod?style=flat-square&color=fc3c44)](https://github.com/xokeza/YaMusicMod/stargazers)

<br/>

**Discord Rich Presence · Скачивание треков · Кастомные шрифты**

<br/>

</div>

---

## 📖 О проекте

**YaMusicMod** — это мод для официального десктопного клиента [Яндекс Музыки](https://music.yandex.ru/download/), который расширяет его возможности без замены оригинального приложения.

Мод патчит `app.asar` — файл с исходным кодом Electron-приложения — и внедряет свой JavaScript прямо в интерфейс. Оригинальный клиент сохраняется в резервной копии, и в любой момент можно откатиться обратно.

### Зачем это нужно?

- **Discord RPC** — чтобы друзья видели, что ты слушаешь прямо в профиле Discord
- **Скачивание треков** — забрать любимую музыку в MP3 без сторонних сервисов
- **Кастомные шрифты** — потому что интерфейс должен выглядеть так, как тебе нравится

---

## ✨ Возможности

<table>
  <tr>
    <td>🎵</td>
    <td><b>Discord Rich Presence</b></td>
    <td>Название трека, исполнитель и обложка альбома отображаются в твоём профиле Discord в реальном времени</td>
  </tr>
  <tr>
    <td>⬇</td>
    <td><b>Скачивание треков</b></td>
    <td>Скачай текущий трек или весь плейлист в MP3 с выбором качества (128 / 192 / 320 kbps)</td>
  </tr>
  <tr>
    <td>🔤</td>
    <td><b>Кастомные шрифты</b></td>
    <td>Смени шрифт интерфейса на любой из предустановленных: Inter, Nunito, Rubik, Manrope, Space Grotesk</td>
  </tr>
  <tr>
    <td>⚙</td>
    <td><b>Панель настроек</b></td>
    <td>Удобная кнопка <i>«Настройки мода»</i> прямо над аккаунтом — всё в одном месте</td>
  </tr>
  <tr>
    <td>🔘</td>
    <td><b>Кнопка в Discord</b></td>
    <td>Опциональная кнопка «Скачать мод» под треком в Discord — включается в настройках</td>
  </tr>
  <tr>
    <td>♻️</td>
    <td><b>Безопасный откат</b></td>
    <td>Мод создаёт резервную копию <code>app.asar.bak</code> — одна команда возвращает всё обратно</td>
  </tr>
</table>

---

## 🛠 Технологии

| Слой | Технология | Назначение |
|------|-----------|------------|
| **Runtime** | Node.js ≥ 18 | Патчер и main process мода |
| **Десктоп** | Electron | Среда выполнения Яндекс Музыки |
| **Упаковка** | `@electron/asar` | Распаковка и переупаковка `app.asar` |
| **Discord RPC** | `discord-rpc` | Интеграция с Discord |
| **Скачивание** | `yt-dlp` | Извлечение аудио (идёт в комплекте) |
| **UI мода** | Vanilla JS + Shadow DOM | Панель настроек, изолированная от стилей ЯМ |
| **Шрифты** | Google Fonts API | Динамическая загрузка шрифтов |
| **CI/CD** | GitHub Actions | Автосборка релизов по тегу |

---

## 📦 Установка

### Требования

- [Node.js](https://nodejs.org/) версии **18 или выше**
- Установленный [Яндекс Музыка](https://music.yandex.ru/download/) (десктопный клиент)
- [Discord](https://discord.com/) (для функции RPC)

### 1. Клонировать репозиторий

```bash
git clone https://github.com/xokeza/YaMusicMod.git
cd YaMusicMod
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Собрать мод

```bash
npm run build
```

### 4. Установить мод

```bash
npm run patch
```

> Патчер автоматически найдёт Яндекс Музыку, создаст резервную копию `app.asar.bak` и внедрит мод.

### 5. Перезапустить Яндекс Музыку

После перезапуска над блоком аккаунта появится кнопка **⚙ Настройки мода**.

---

## 🗂 Структура проекта

```
YaMusicMod/
│
├── patcher/
│   ├── index.js          # CLI-патчер: поиск ЯМ, запуск установки
│   └── patch.js          # Логика: extract → inject → repack app.asar
│
├── src/
│   ├── preload.js            # IPC-мост renderer ↔ main (contextBridge)
│   ├── main-injection.js     # Main process: Discord RPC + yt-dlp
│   └── renderer/
│       ├── index.js          # Точка входа renderer (бандл модулей)
│       ├── track-observer.js # MutationObserver — следит за треком
│       ├── settings-ui.js    # UI панели настроек (Shadow DOM)
│       └── fonts.js          # Менеджер шрифтов Google Fonts
│
├── build/                # Собранный бандл (после npm run build)
├── build.js              # Скрипт сборки — склеивает модули renderer
├── package.json
└── .github/
    └── workflows/
        └── release.yml   # CI: автосборка при push тега v*.*.*
```

---

## ⚙ Настройки мода

Открой **⚙ Настройки мода** прямо в Яндекс Музыке:

<details>
<summary><b>🎵 Discord Rich Presence</b></summary>

- Включить / выключить RPC одним тоглом
- Показывать кнопку «Скачать мод» в профиле Discord
- Указать собственный **Discord Application ID** (если хочешь кастомное имя приложения)

</details>

<details>
<summary><b>⬇ Скачивание треков</b></summary>

- Выбрать **папку сохранения** для MP3-файлов
- Выбрать **качество**: 128 / 192 / 320 kbps
- Кнопки: **Скачать трек** и **Скачать плейлист**
- Прогресс загрузки отображается прямо в панели

</details>

<details>
<summary><b>🔤 Шрифты интерфейса</b></summary>

| Шрифт | Характер |
|-------|---------|
| **Inter** | Современный, нейтральный |
| **Nunito** | Мягкий, закруглённый |
| **Rubik** | Чёткий, геометрический |
| **Manrope** | Технологичный |
| **Space Grotesk** | Дизайнерский |
| **Системный** | Шрифт ОС по умолчанию |

</details>

---

## 🔄 Удаление мода

```bash
npm run unpatch
```

Восстанавливает оригинальный `app.asar` из резервной копии. Яндекс Музыка возвращается в первоначальное состояние.

---

## 🚀 Выпуск новой версии

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions автоматически:
1. Соберёт бандл
2. Скачает свежие бинари `yt-dlp` для Windows и Linux
3. Создаст архивы и опубликует **GitHub Release**

---

## ❓ FAQ

**Мод перестал работать после обновления ЯМ**
```bash
npm run unpatch && npm run patch
```

**Discord не показывает активность**
Убедись, что Discord запущен и в настройках мода включён RPC.

**Как указать свой Discord Application ID?**
Создай приложение на [discord.com/developers](https://discord.com/developers/applications), скопируй Client ID и вставь его в поле в настройках мода.

**yt-dlp не работает на Linux**
```bash
chmod +x build/bin/yt-dlp
```

---

## 📄 Лицензия

Распространяется под лицензией [MIT](LICENSE).

Проект создан в ознакомительных целях. Не нарушает ToS Яндекс Музыки, так как не обходит DRM и не распространяет защищённый контент.

---

<div align="center">
  <sub>Сделано с ❤ · <a href="https://github.com/xokeza">xokeza</a></sub>
</div>
