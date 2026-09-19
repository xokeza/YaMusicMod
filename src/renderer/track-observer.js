/**
 * YaMusicMod — Track Observer
 * MutationObserver, следит за DOM Яндекс Музыки и определяет текущий трек.
 */

(function () {
  'use strict';

  // Селекторы ЯМ (могут меняться при обновлениях клиента)
  const SELECTORS = {
    title: [
      '.PlayerBarDesktop__trackTitle',
      '.player-controls__track-title',
      '[class*="TrackTitle"]',
      '[class*="track-title"]',
    ],
    artist: [
      '.PlayerBarDesktop__trackArtists',
      '.player-controls__track-artists',
      '[class*="TrackArtists"]',
      '[class*="track-artists"]',
    ],
    cover: [
      '.PlayerBarDesktop__cover img',
      '.player-controls__cover img',
      '[class*="PlayerBarDesktop"] img',
      '[class*="Cover"] img',
    ],
  };

  function queryFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  let lastTrackKey = '';

  function extractTrackData() {
    const titleEl = queryFirst(SELECTORS.title);
    const artistEl = queryFirst(SELECTORS.artist);
    const coverEl = queryFirst(SELECTORS.cover);

    const title = titleEl ? titleEl.textContent.trim() : '';
    const artist = artistEl ? artistEl.textContent.trim() : '';
    const albumArt = coverEl ? coverEl.src : '';

    // Текущий URL трека из адресной строки (если есть)
    const trackUrl = window.location.href;

    return { title, artist, albumArt, trackUrl };
  }

  function onTrackChange() {
    const data = extractTrackData();
    if (!data.title) return;

    const key = `${data.title}__${data.artist}`;
    if (key === lastTrackKey) return;
    lastTrackKey = key;

    data.startTimestamp = Math.floor(Date.now() / 1000);

    // Отправляем в main process через IPC (если доступен)
    if (window.yaModIPC) {
      window.yaModIPC.send('ya-mod:track-changed', data);
    }

    // Диспатчим кастомное событие (для settings-ui и других частей мода)
    document.dispatchEvent(new CustomEvent('ya-mod:track-changed', { detail: data }));
  }

  // Наблюдаем за изменениями в плеере
  const observer = new MutationObserver(() => {
    onTrackChange();
  });

  function startObserving() {
    const target = document.body;
    if (!target) return;

    observer.observe(target, { childList: true, subtree: true, characterData: true });
    // Первичный вызов — на случай если трек уже играет
    onTrackChange();
    console.log('[YaMod] Track observer запущен ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserving);
  } else {
    startObserving();
  }

  window.__yamTrackObserver = { getTrackData: extractTrackData };
})();
