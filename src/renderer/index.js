/**
 * YaMusicMod — Renderer Entry Point
 * Последовательно запускает все модули мода в renderer process.
 */

(function () {
  'use strict';

  if (window.__yamModLoaded) return;
  window.__yamModLoaded = true;

  console.log('[YaMod] Инициализация renderer...');

  const scripts = [
    __YAM_FONTS__,
    __YAM_TRACK_OBSERVER__,
    __YAM_SETTINGS_UI__,
  ];

  for (const code of scripts) {
    try {
      new Function(code)();
    } catch (err) {
      console.error('[YaMod] Ошибка модуля:', err);
    }
  }

  console.log('[YaMod] Renderer загружен ✓');
})();

