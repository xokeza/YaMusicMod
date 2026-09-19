/**
 * YaMusicMod — Main Process Injection
 * Запускается в main process Яндекс Музыки.
 * Управляет Discord RPC и скачиванием треков через yt-dlp.
 */

'use strict';

const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ─── Discord RPC ─────────────────────────────────────────────────────────────

let rpcClient = null;
let rpcReady = false;

// Discord Application ID — можно сменить в настройках мода
const DEFAULT_CLIENT_ID = '1381234567890123456';

function getSettings() {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'ya-mod-settings.json');
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function startRPC(clientId) {
  if (rpcClient) {
    try { rpcClient.destroy(); } catch (_) {}
    rpcClient = null;
    rpcReady = false;
  }

  try {
    const RPC = require('discord-rpc');
    RPC.register(clientId);
    rpcClient = new RPC.Client({ transport: 'ipc' });

    rpcClient.on('ready', () => {
      rpcReady = true;
      console.log('[YaMod] Discord RPC подключён.');
    });

    rpcClient.login({ clientId }).catch((err) => {
      console.warn('[YaMod] Discord RPC не подключился:', err.message);
    });
  } catch (err) {
    console.warn('[YaMod] discord-rpc недоступен:', err.message);
  }
}

function stopRPC() {
  if (rpcClient) {
    try { rpcClient.clearActivity(); rpcClient.destroy(); } catch (_) {}
    rpcClient = null;
    rpcReady = false;
    console.log('[YaMod] Discord RPC отключён.');
  }
}

function updateActivity(trackData) {
  if (!rpcClient || !rpcReady) return;

  const settings = getSettings();
  const showButton = settings?.discordRpc?.showDownloadButton !== false;

  const activity = {
    details: trackData.title || 'Неизвестный трек',
    state: trackData.artist || 'Неизвестный исполнитель',
    largeImageKey: trackData.albumArt || 'yamusic_logo',
    largeImageText: 'Яндекс Музыка',
    smallImageKey: 'play',
    smallImageText: 'Слушает',
    instance: false,
    startTimestamp: trackData.startTimestamp || Math.floor(Date.now() / 1000),
  };

  if (showButton) {
    activity.buttons = [
      { label: '⬇ Скачать мод', url: 'https://github.com/xokeza/YaMusicMod' },
    ];
  }

  try {
    rpcClient.setActivity(activity);
  } catch (err) {
    console.warn('[YaMod] Не удалось обновить активность:', err.message);
  }
}

// ─── IPC обработчики ──────────────────────────────────────────────────────────

// Инициализация RPC при запуске, если включён
app.whenReady().then(() => {
  const settings = getSettings();
  if (settings?.discordRpc?.enabled) {
    const clientId = settings?.discordRpc?.clientId || DEFAULT_CLIENT_ID;
    startRPC(clientId);
  }
});

// Трек сменился — обновляем RPC
ipcMain.on('ya-mod:track-changed', (_event, trackData) => {
  updateActivity(trackData);
});

// Включить/выключить RPC из настроек
ipcMain.on('ya-mod:rpc-toggle', (_event, { enabled, clientId }) => {
  if (enabled) {
    startRPC(clientId || DEFAULT_CLIENT_ID);
  } else {
    stopRPC();
  }
});

// Сохранить настройки
ipcMain.handle('ya-mod:save-settings', (_event, settings) => {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'ya-mod-settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Загрузить настройки
ipcMain.handle('ya-mod:load-settings', () => {
  return getSettings();
});

// ─── Скачивание через yt-dlp ──────────────────────────────────────────────────

function getYtDlpPath() {
  const modDir = path.dirname(__filename);
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const bundled = path.join(modDir, '..', 'bin', binName);
  if (fs.existsSync(bundled)) return bundled;
  // Фоллбэк — системный yt-dlp
  return binName;
}

function downloadWithYtDlp(event, { url, outputPath, quality }) {
  const ytDlp = getYtDlpPath();
  const outputTemplate = path.join(outputPath, '%(title)s.%(ext)s');
  const audioQuality = quality || '192';

  const args = [
    url,
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', audioQuality + 'K',
    '-o', outputTemplate,
    '--no-playlist',
    '--newline',
  ];

  const proc = spawn(ytDlp, args);

  proc.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) {
      event.sender.send('ya-mod:download-progress', { line, done: false });
    }
  });

  proc.stderr.on('data', (data) => {
    console.warn('[YaMod yt-dlp stderr]', data.toString());
  });

  proc.on('close', (code) => {
    event.sender.send('ya-mod:download-progress', {
      line: code === 0 ? 'Скачано!' : `Ошибка (код ${code})`,
      done: true,
      ok: code === 0,
    });
  });

  proc.on('error', (err) => {
    event.sender.send('ya-mod:download-progress', {
      line: `Не удалось запустить yt-dlp: ${err.message}`,
      done: true,
      ok: false,
    });
  });
}

ipcMain.on('ya-mod:download-track', (event, payload) => {
  downloadWithYtDlp(event, { ...payload, playlist: false });
});

ipcMain.on('ya-mod:download-playlist', (event, payload) => {
  const args_extra = ['--yes-playlist'];
  downloadWithYtDlp(event, { ...payload, playlist: true });
});

// ─── Инжектируем preload в новые окна ────────────────────────────────────────

const { BrowserWindow } = require('electron');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

// Перехватываем создание каждого нового окна и добавляем наш preload
app.on('browser-window-created', (_event, win) => {
  // Electron не позволяет переопределить preload после создания окна,
  // поэтому используем webContents API для инжекции скрипта при загрузке
  win.webContents.on('dom-ready', () => {
    const rendererCode = fs.readFileSync(path.join(__dirname, 'renderer', 'index.js'), 'utf8');
    win.webContents.executeJavaScript(rendererCode).catch((err) => {
      console.warn('[YaMod] Ошибка инжекции renderer:', err.message);
    });
  });
});

console.log('[YaMod] Main injection загружен ✓');
