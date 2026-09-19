/**
 * YaMusicMod — Settings UI
 * Вставляет кнопку «⚙ Настройки мода» над аккаунтом
 * и рендерит панель настроек в Shadow DOM.
 */

(function () {
  'use strict';

  // ─── Настройки по умолчанию ───────────────────────────────────────────────

  const DEFAULT_SETTINGS = {
    discordRpc: {
      enabled: false,
      showDownloadButton: true,
      clientId: '',
    },
    download: {
      outputPath: '',
      quality: '192',
    },
    fonts: {
      selected: 'Системный',
    },
  };

  // ─── Хранилище настроек ───────────────────────────────────────────────────

  async function loadSettings() {
    try {
      if (window.yaModIPC) {
        const s = await window.yaModIPC.invoke('ya-mod:load-settings');
        return { ...DEFAULT_SETTINGS, ...s };
      }
    } catch (_) {}
    // Фоллбэк на localStorage (для браузерной версии)
    try {
      const raw = localStorage.getItem('ya-mod-settings');
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...DEFAULT_SETTINGS };
  }

  async function saveSettings(settings) {
    try {
      if (window.yaModIPC) {
        await window.yaModIPC.invoke('ya-mod:save-settings', settings);
      }
    } catch (_) {}
    try {
      localStorage.setItem('ya-mod-settings', JSON.stringify(settings));
    } catch (_) {}
  }

  // ─── HTML/CSS панели настроек ─────────────────────────────────────────────

  const PANEL_CSS = `
    :host {
      all: initial;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(4px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity .2s;
    }
    .overlay.visible { opacity: 1; }
    .panel {
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      width: 480px;
      max-width: 95vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: 28px;
      color: #e8e8f0;
      box-shadow: 0 24px 60px rgba(0,0,0,0.6);
      transform: translateY(8px);
      transition: transform .2s;
    }
    .overlay.visible .panel { transform: translateY(0); }

    h2 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .subtitle {
      margin: 0 0 24px;
      font-size: 13px;
      color: #888;
    }
    .section {
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .section:last-of-type { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #fc3c44;
      margin-bottom: 14px;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .row:last-child { margin-bottom: 0; }
    .label { font-size: 14px; color: #ccc; }
    .label small { display: block; font-size: 11px; color: #666; margin-top: 2px; }

    /* Toggle switch */
    .toggle {
      position: relative;
      width: 44px;
      height: 24px;
      flex-shrink: 0;
    }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-track {
      position: absolute;
      inset: 0;
      background: #333;
      border-radius: 12px;
      cursor: pointer;
      transition: background .2s;
    }
    .toggle input:checked + .toggle-track { background: #fc3c44; }
    .toggle-thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      background: #fff;
      border-radius: 50%;
      transition: transform .2s;
      pointer-events: none;
    }
    .toggle input:checked ~ .toggle-thumb { transform: translateX(20px); }

    /* Inputs */
    input[type="text"], select {
      background: #12121f;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      color: #e8e8f0;
      font-size: 13px;
      padding: 8px 12px;
      outline: none;
      transition: border-color .15s;
    }
    input[type="text"]:focus, select:focus {
      border-color: #fc3c44;
    }
    input[type="text"].full { width: 100%; box-sizing: border-box; margin-top: 8px; }
    select { cursor: pointer; }

    /* Кнопки */
    .btn {
      padding: 10px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity .15s, transform .1s;
    }
    .btn:active { transform: scale(0.97); }
    .btn-primary { background: #fc3c44; color: #fff; }
    .btn-primary:hover { opacity: 0.88; }
    .btn-ghost { background: transparent; color: #888; border: 1px solid rgba(255,255,255,0.1); }
    .btn-ghost:hover { color: #ccc; border-color: rgba(255,255,255,0.2); }
    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }

    /* Download progress */
    .download-section input[type="text"] { width: 100%; box-sizing: border-box; margin-top: 8px; }
    .progress-log {
      margin-top: 10px;
      background: #0d0d1a;
      border-radius: 8px;
      padding: 10px;
      font-size: 12px;
      font-family: monospace;
      color: #aaa;
      max-height: 80px;
      overflow-y: auto;
      display: none;
    }
    .progress-log.visible { display: block; }
  `;

  function buildPanelHTML(settings) {
    const rpc = settings.discordRpc;
    const dl = settings.download;
    const font = settings.fonts;
    const fonts = window.__yamFonts ? window.__yamFonts.list : ['Системный', 'Inter', 'Nunito', 'Rubik', 'Manrope', 'Space Grotesk'];

    return `
      <div class="overlay" id="yam-overlay">
        <div class="panel" role="dialog" aria-label="Настройки мода">
          <h2>⚙ Настройки мода</h2>
          <p class="subtitle">YaMusicMod — Discord RPC · Загрузка треков · Шрифты</p>

          <!-- Discord RPC -->
          <div class="section">
            <div class="section-title">Discord Rich Presence</div>
            <div class="row">
              <span class="label">Включить RPC</span>
              <label class="toggle">
                <input type="checkbox" id="rpc-enabled" ${rpc.enabled ? 'checked' : ''}>
                <span class="toggle-track"></span>
                <span class="toggle-thumb"></span>
              </label>
            </div>
            <div class="row">
              <span class="label">
                Кнопка «Скачать мод»
                <small>Отображается в профиле Discord</small>
              </span>
              <label class="toggle">
                <input type="checkbox" id="rpc-button" ${rpc.showDownloadButton ? 'checked' : ''}>
                <span class="toggle-track"></span>
                <span class="toggle-thumb"></span>
              </label>
            </div>
            <div class="row" style="display:block">
              <span class="label">
                Discord Application ID
                <small>Оставь пустым — будет использован встроенный</small>
              </span>
              <input type="text" class="full" id="rpc-client-id" placeholder="1234567890123456789" value="${rpc.clientId || ''}">
            </div>
          </div>

          <!-- Загрузка треков -->
          <div class="section download-section">
            <div class="section-title">Загрузка треков</div>
            <div class="row" style="display:block">
              <span class="label">Папка сохранения</span>
              <input type="text" id="dl-path" placeholder="/home/user/Music" value="${dl.outputPath || ''}">
            </div>
            <div class="row" style="margin-top:12px">
              <span class="label">Качество (kbps)</span>
              <select id="dl-quality">
                <option value="128" ${dl.quality === '128' ? 'selected' : ''}>128 kbps</option>
                <option value="192" ${dl.quality === '192' ? 'selected' : ''}>192 kbps</option>
                <option value="320" ${dl.quality === '320' ? 'selected' : ''}>320 kbps</option>
              </select>
            </div>
            <div class="row" style="margin-top:12px;gap:8px;justify-content:flex-start">
              <button class="btn btn-ghost" id="dl-track-btn">⬇ Скачать трек</button>
              <button class="btn btn-ghost" id="dl-playlist-btn">📋 Скачать плейлист</button>
            </div>
            <div class="progress-log" id="dl-log"></div>
          </div>

          <!-- Шрифты -->
          <div class="section">
            <div class="section-title">Шрифт интерфейса</div>
            <div class="row">
              <span class="label">Выбранный шрифт</span>
              <select id="font-select">
                ${fonts.map(f => `<option value="${f}" ${font.selected === f ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="footer">
            <button class="btn btn-ghost" id="yam-cancel">Отмена</button>
            <button class="btn btn-primary" id="yam-save">Сохранить</button>
          </div>
        </div>
      </div>
    `;
  }

  // ─── Кнопка настроек ─────────────────────────────────────────────────────

  const BUTTON_SELECTORS = [
    '.UserInfo__account',
    '.user-account',
    '[class*="UserAccount"]',
    '[class*="user-account"]',
    '[class*="Account"]',
  ];

  function findAccountBlock() {
    for (const sel of BUTTON_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  let buttonInjected = false;

  function injectSettingsButton() {
    if (buttonInjected) return;

    const accountEl = findAccountBlock();
    if (!accountEl) return;

    const btn = document.createElement('button');
    btn.id = 'ya-mod-settings-btn';
    btn.title = 'Настройки мода';
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span>Настройки мода</span>
    `;

    Object.assign(btn.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      marginBottom: '4px',
      background: 'rgba(252, 60, 68, 0.12)',
      border: '1px solid rgba(252, 60, 68, 0.3)',
      borderRadius: '8px',
      color: '#fc3c44',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
      width: '100%',
      transition: 'background .15s',
    });

    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(252, 60, 68, 0.22)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(252, 60, 68, 0.12)'; });
    btn.addEventListener('click', openPanel);

    accountEl.parentNode.insertBefore(btn, accountEl);
    buttonInjected = true;
    console.log('[YaMod] Кнопка настроек вставлена ✓');
  }

  // ─── Панель настроек ──────────────────────────────────────────────────────

  let panelHost = null;

  async function openPanel() {
    if (panelHost) return;

    const settings = await loadSettings();

    // Shadow DOM — изолируемся от стилей ЯМ
    panelHost = document.createElement('div');
    panelHost.id = 'ya-mod-panel-host';
    const shadow = panelHost.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.innerHTML = buildPanelHTML(settings);
    shadow.appendChild(container);

    document.body.appendChild(panelHost);

    // Анимация появления
    requestAnimationFrame(() => {
      shadow.getElementById('yam-overlay').classList.add('visible');
    });

    attachPanelListeners(shadow, settings);
  }

  function closePanel() {
    if (!panelHost) return;
    const overlay = panelHost.shadowRoot.getElementById('yam-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => {
      panelHost.remove();
      panelHost = null;
    }, 200);
  }

  function attachPanelListeners(shadow, settings) {
    const overlay = shadow.getElementById('yam-overlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePanel();
    });

    shadow.getElementById('yam-cancel').addEventListener('click', closePanel);

    // Шрифт — предпросмотр в реальном времени
    shadow.getElementById('font-select').addEventListener('change', (e) => {
      if (window.__yamFonts) window.__yamFonts.apply(e.target.value);
    });

    // Сохранить
    shadow.getElementById('yam-save').addEventListener('click', async () => {
      const newSettings = {
        discordRpc: {
          enabled: shadow.getElementById('rpc-enabled').checked,
          showDownloadButton: shadow.getElementById('rpc-button').checked,
          clientId: shadow.getElementById('rpc-client-id').value.trim(),
        },
        download: {
          outputPath: shadow.getElementById('dl-path').value.trim(),
          quality: shadow.getElementById('dl-quality').value,
        },
        fonts: {
          selected: shadow.getElementById('font-select').value,
        },
      };

      await saveSettings(newSettings);

      // Применяем шрифт
      if (window.__yamFonts) {
        window.__yamFonts.apply(newSettings.fonts.selected);
      }

      // Обновляем RPC состояние
      if (window.yaModIPC) {
        window.yaModIPC.send('ya-mod:rpc-toggle', {
          enabled: newSettings.discordRpc.enabled,
          clientId: newSettings.discordRpc.clientId,
        });
      }

      closePanel();
    });

    // Загрузка трека
    shadow.getElementById('dl-track-btn').addEventListener('click', () => {
      const url = window.location.href;
      const outputPath = shadow.getElementById('dl-path').value.trim();
      const quality = shadow.getElementById('dl-quality').value;

      if (!outputPath) {
        alert('Укажи папку для сохранения!');
        return;
      }

      const log = shadow.getElementById('dl-log');
      log.classList.add('visible');
      log.textContent = 'Запускаю yt-dlp...\n';

      if (window.yaModIPC) {
        window.yaModIPC.send('ya-mod:download-track', { url, outputPath, quality });
        window.yaModIPC.on('ya-mod:download-progress', ({ line, done, ok }) => {
          log.textContent += line + '\n';
          log.scrollTop = log.scrollHeight;
          if (done) {
            log.textContent += ok ? '✅ Готово!' : '❌ Ошибка.';
          }
        });
      } else {
        log.textContent = '⚠ IPC недоступен (нужен Electron-клиент ЯМ)';
      }
    });

    // Загрузка плейлиста
    shadow.getElementById('dl-playlist-btn').addEventListener('click', () => {
      const url = window.location.href;
      const outputPath = shadow.getElementById('dl-path').value.trim();
      const quality = shadow.getElementById('dl-quality').value;

      if (!outputPath) {
        alert('Укажи папку для сохранения!');
        return;
      }

      const log = shadow.getElementById('dl-log');
      log.classList.add('visible');
      log.textContent = 'Запускаю yt-dlp (плейлист)...\n';

      if (window.yaModIPC) {
        window.yaModIPC.send('ya-mod:download-playlist', { url, outputPath, quality });
        window.yaModIPC.on('ya-mod:download-progress', ({ line, done, ok }) => {
          log.textContent += line + '\n';
          log.scrollTop = log.scrollHeight;
          if (done) {
            log.textContent += ok ? '✅ Готово!' : '❌ Ошибка.';
          }
        });
      }
    });
  }

  // ─── Инициализация ────────────────────────────────────────────────────────

  // Кнопку пробуем вставить сразу и при мутациях DOM (SPA)
  function tryInject() {
    injectSettingsButton();
  }

  const injectorObserver = new MutationObserver(tryInject);
  injectorObserver.observe(document.body, { childList: true, subtree: true });
  tryInject();

  // Применяем сохранённый шрифт при загрузке
  loadSettings().then((settings) => {
    if (window.__yamFonts && settings.fonts.selected && settings.fonts.selected !== 'Системный') {
      window.__yamFonts.apply(settings.fonts.selected);
    }
  });

  window.__yamSettingsUI = { open: openPanel, close: closePanel };
})();

