(function () {
    'use strict';

    const ADDON_NAME = 'DelTracks';
    const DB_NAME = 'DelTracksDB';
    const REMOTE_DB_URL = 'https://raw.githubusercontent.com/xokeza/YaMusicMod/main/src/main/lib/pulsesync/system/addons/DelTracks/tracks.json';
    const XOKEZA_ENDPOINTS = [
        'https://xokeza.su/llmusic/tracks.json',
        'https://xokeza.su/llmusic/musics.json',
        'https://xokeza.su/llmusic/api.php',
        'https://xokeza.su/llmusic/index.php'
    ];
    const KNOWN_DIRECT_REMOTE_TRACKS = [
        {
            url: 'https://xokeza.su/llmusic/musics/ural.mp3',
            fallbackTitle: 'Священная война',
            fallbackArtist: 'Урал Гайсин',
            fallbackAlbum: 'Священная война - Single',
            year: '2022',
            label: 'Independent'
        }
    ];

    function log(...args) {
        console.debug('[' + ADDON_NAME + ']', ...args);
    }

    function normalizeStr(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/[ё]/g, 'е')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // 1. Известные удалённые и заблокированные треки (динамическая база)
    const DEFAULT_TRACKS = [];

    let allTracks = [...DEFAULT_TRACKS];
    let localCustomTracks = [];
    let trackUrlCache = {};
    let scannedAlbumsCache = new Map();

    // 2. IndexedDB для локальных треков
    let dbPromise = null;
    function openDB() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, 2);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('custom_tracks')) {
                        db.createObjectStore('custom_tracks', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('discovered_tracks')) {
                        db.createObjectStore('discovered_tracks', { keyPath: 'id' });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbPromise;
    }

    async function loadStoredTracks() {
        try {
            const db = await openDB();
            const tx = db.transaction(['custom_tracks', 'discovered_tracks'], 'readonly');
            const customReq = tx.objectStore('custom_tracks').getAll();
            const discReq = tx.objectStore('discovered_tracks').getAll();

            customReq.onsuccess = () => {
                localCustomTracks = customReq.result || [];
                mergeTracks();
            };
            discReq.onsuccess = () => {
                const discovered = discReq.result || [];
                mergeTracks(discovered);
            };
        } catch (e) {
            log('Error reading IndexedDB:', e);
        }
    }

    function mergeTracks(extra = []) {
        const map = new Map();
        for (const t of DEFAULT_TRACKS) map.set(t.id, t);
        for (const t of allTracks) map.set(t.id, t);
        for (const t of extra) map.set(t.id, t);
        for (const t of localCustomTracks) map.set(t.id, t);
        allTracks = Array.from(map.values());
    }

    // 3. Поиск трека в Apple Music / Deezer каталогах
    async function searchAlbumExternalTracks(artistName, albumName) {
        const cacheKey = `${normalizeStr(artistName)}__${normalizeStr(albumName)}`;
        if (scannedAlbumsCache.has(cacheKey)) {
            return scannedAlbumsCache.get(cacheKey);
        }

        let externalTracks = [];

        // 3.1. Deezer API (отлично индексирует ру-треки и альбомы Cupsize и др.)
        try {
            const q = encodeURIComponent(`${artistName} ${albumName}`);
            const dzSearch = await fetch(`https://api.deezer.com/search/album?q=${q}`);
            if (dzSearch.ok) {
                const dData = await dzSearch.json();
                const normArtist = normalizeStr(artistName);
                const normAlbum = normalizeStr(albumName);

                const matchedAlbum =
                    (dData.data || []).find((a) => {
                        const aArtist = normalizeStr(a.artist?.name);
                        const aAlbum = normalizeStr(a.title);
                        return (aArtist.includes(normArtist) || normArtist.includes(aArtist)) && (aAlbum.includes(normAlbum) || normAlbum.includes(aAlbum));
                    }) || dData.data?.[0];

                if (matchedAlbum?.id) {
                    const trRes = await fetch(`https://api.deezer.com/album/${matchedAlbum.id}/tracks?limit=100`);
                    if (trRes.ok) {
                        const trData = await trRes.json();
                        if (trData.data?.length > 0) {
                            externalTracks = trData.data.map((s) => ({
                                id: `deltracks-deezer-${s.id}`,
                                source: 'Deezer',
                                title: s.title,
                                artist: s.artist?.name || artistName,
                                artistAliases: [normalizeStr(s.artist?.name || artistName)],
                                album: matchedAlbum.title,
                                albumAliases: [normalizeStr(matchedAlbum.title)],
                                position: s.track_position,
                                duration: s.duration,
                                previewUrl: s.preview,
                                url: s.preview,
                                coverUri: matchedAlbum.cover_big || '',
                            }));
                        }
                    }
                }
            }
        } catch (e) {
            log('Deezer album search failed:', e);
        }

        // 3.2. Если Deezer не нашел - пробуем iTunes / Apple Music
        if (externalTracks.length === 0) {
            try {
                const q = encodeURIComponent(`${artistName} ${albumName}`);
                const itunesSearch = await fetch(`https://itunes.apple.com/search?term=${q}&entity=album&limit=5`);
                if (itunesSearch.ok) {
                    const data = await itunesSearch.json();
                    const normArtist = normalizeStr(artistName);
                    const normAlbum = normalizeStr(albumName);

                    const matchedAlbum =
                        (data.results || []).find((a) => {
                            const aArtist = normalizeStr(a.artistName);
                            const aAlbum = normalizeStr(a.collectionName);
                            return (aArtist.includes(normArtist) || normArtist.includes(aArtist)) && (aAlbum.includes(normAlbum) || normAlbum.includes(aAlbum));
                        }) || data.results?.[0];

                    if (matchedAlbum?.collectionId) {
                        const lookup = await fetch(`https://itunes.apple.com/lookup?id=${matchedAlbum.collectionId}&entity=song`);
                        if (lookup.ok) {
                            const lData = await lookup.json();
                            const songs = (lData.results || []).filter((r) => r.wrapperType === 'track');
                            if (songs.length > 0) {
                                externalTracks = songs.map((s) => ({
                                    id: `deltracks-itunes-${s.trackId}`,
                                    source: 'Apple Music / iTunes',
                                    title: s.trackName,
                                    artist: s.artistName,
                                    artistAliases: [normalizeStr(s.artistName)],
                                    album: s.collectionName,
                                    albumAliases: [normalizeStr(s.collectionName)],
                                    position: s.trackNumber,
                                    duration: Math.round((s.trackTimeMillis || 0) / 1000),
                                    previewUrl: s.previewUrl,
                                    url: s.previewUrl,
                                    coverUri: s.artworkUrl100?.replace('100x100bb', '600x600bb') || '',
                                }));
                            }
                        }
                    }
                }
            } catch (e) {
                log('iTunes lookup failed:', e.message);
            }
        }

        scannedAlbumsCache.set(cacheKey, externalTracks);
        return externalTracks;
    }

    // 4. Разрешение источника аудио для трека
    async function resolveAudioStream(artist, title, fallbackUrl) {
        // Пробуем прямой поиск в Deezer по исполнителю и названию трека
        try {
            const query = encodeURIComponent(`${artist} ${title}`);
            const dzRes = await fetch(`https://api.deezer.com/search?q=${query}`);
            if (dzRes.ok) {
                const dzData = await dzRes.json();
                const matched =
                    (dzData.data || []).find((item) => {
                        const iTitle = normalizeStr(item.title);
                        const tTitle = normalizeStr(title);
                        return iTitle.includes(tTitle) || tTitle.includes(iTitle);
                    }) || dzData.data?.[0];

                if (matched?.preview) {
                    log('Resolved audio from Deezer:', matched.preview);
                    return matched.preview;
                }
            }
        } catch (e) {
            log('Deezer single search failed:', e);
        }

        // Если не найден в Deezer, пробуем iTunes
        try {
            const query = encodeURIComponent(`${artist} ${title}`);
            const itRes = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=5`);
            if (itRes.ok) {
                const itData = await itRes.json();
                const matched =
                    (itData.results || []).find((item) => {
                        const iTitle = normalizeStr(item.trackName);
                        const tTitle = normalizeStr(title);
                        return iTitle.includes(tTitle) || tTitle.includes(iTitle);
                    }) || itData.results?.[0];

                if (matched?.previewUrl) {
                    log('Resolved audio from iTunes:', matched.previewUrl);
                    return matched.previewUrl;
                }
            }
        } catch (e) {
            log('iTunes single search failed:', e);
        }

        return fallbackUrl || null;
    }

    // 5. Автономный аудиоплеер для гарантированного воспроизведения любого удалённого трека
    let globalAudio = null;
    function getAudioPlayer() {
        if (!globalAudio) {
            globalAudio = new Audio();
            globalAudio.volume = 1.0;
        }
        return globalAudio;
    }

    async function playDelTrack(track) {
        log('DelTracks playing:', track.title, track);

        try {
            if (window.pulsesyncApi?.notify) {
                window.pulsesyncApi.notify('Воспроизведение: ' + (track.title || 'Трек') + ' (DelTracks)', 'info');
            }
        } catch (e) {}

        let streamUrl = trackUrlCache[track.id];
        if (!streamUrl) {
            streamUrl = await resolveAudioStream(track.artist, track.title, track.url);
            if (streamUrl) trackUrlCache[track.id] = streamUrl;
        }

        const urlToPlay = streamUrl || track.url;
        if (!urlToPlay) {
            log('No audio url available for track:', track.title);
            return;
        }

        trackUrlCache[track.id] = urlToPlay;

        // 1. Попытка запустить нативно через Sonata (чтобы отображалось в нижнем PlayerBar Яндекс Музыки)
        const sonata = window.sonata || window.sonataState?.sonata;
        if (sonata && typeof sonata.playContext === 'function') {
            try {
                log('Playing via native Sonata player:', track.id);
                const trackEntity = {
                    id: String(track.id),
                    type: 'music',
                    meta: {
                        id: String(track.id),
                        title: track.title,
                        artists: [{ name: track.artist || 'Исполнитель', id: 0 }],
                        artistNames: track.artist || '',
                        albums: [{
                            id: 0,
                            title: track.album || track.title,
                            coverUri: track.coverUri || ''
                        }],
                        coverUri: track.coverUri || '',
                        durationMs: (track.duration || 180) * 1000,
                        available: true,
                        isAvailable: true,
                        availableForPremiumUsers: true,
                        availableFullWithoutPermission: true,
                        trackSource: 'DelTracks',
                        specialAudioResources: []
                    }
                };

                await sonata.playContext({
                    contextData: {
                        type: 'various',
                        meta: trackEntity.meta
                    },
                    entitiesData: [trackEntity],
                    queueParams: { index: 0 },
                    loadContextMeta: false
                });
                log('Sonata playContext successful!');
                return;
            } catch (err) {
                log('Sonata playContext threw error, falling back to direct audio:', err);
            }
        }

        // 2. Запасной плеер: автономный Audio элемент
        const player = getAudioPlayer();
        player.pause();
        player.src = urlToPlay;

        try {
            await player.play();
            log('Direct audio playback started successfully');

            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.artist || 'DelTracks',
                    album: track.album || '',
                    artwork: track.coverUri ? [{ src: track.coverUri }] : [],
                });
                navigator.mediaSession.playbackState = 'playing';
                navigator.mediaSession.setActionHandler('play', () => player.play());
                navigator.mediaSession.setActionHandler('pause', () => player.pause());
            }
        } catch (err) {
            log('Direct audio play error:', err);
        }
    }

    // 6. Webpack DI хук для GetFileInfoResource
    function initWebpack() {
        const webpackGlobal = window.webpackChunk_N_E;
        if (!webpackGlobal || !Array.isArray(webpackGlobal)) {
            setTimeout(initWebpack, 100);
            return;
        }

        let appRequire = null;
        try {
            webpackGlobal.push([
                [Symbol('requireGetter__' + ADDON_NAME)],
                {},
                (internalRequire) => {
                    appRequire = internalRequire;
                },
            ]);
            webpackGlobal.pop();
        } catch (e) {}

        if (!appRequire) {
            setTimeout(initWebpack, 100);
            return;
        }

        hookDI(appRequire);
    }

    function hookDI(appRequire) {
        function findModule(...requiredStrings) {
            for (const id in appRequire.m) {
                try {
                    const mod = appRequire(id);
                    const keys = Object.keys(mod);
                    if (requiredStrings.every((s) => keys.includes(s))) return mod;
                } catch (e) {}
            }
            return null;
        }

        const diModule = findModule('Dt', 'P9', 'Gr', 'do');
        if (!diModule?.Dt) {
            setTimeout(() => hookDI(appRequire), 300);
            return;
        }

        const di = diModule.Dt;
        const originalDiGet = di.prototype.get;
        let hooked = false;

        di.prototype.get = function (_) {
            const result = originalDiGet.apply(this, arguments);
            if (!hooked) {
                const gfir = this.shared.get('GetFileInfoResource');
                if (gfir) {
                    hooked = true;
                    di.prototype.get = originalDiGet;
                    hookPlayback(gfir);
                }
            }
            return result;
        };
    }

    function hookPlayback(gfir) {
        const originalGetFileInfo = gfir.getLocalFileDownloadInfo;
        gfir.getLocalFileDownloadInfo = async function (trackId) {
            const track = allTracks.find((t) => String(t.id) === String(trackId));
            if (track) {
                let streamUrl = trackUrlCache[track.id];
                if (!streamUrl) {
                    streamUrl = await resolveAudioStream(track.artist, track.title, track.url);
                    if (streamUrl) trackUrlCache[track.id] = streamUrl;
                }
                if (streamUrl) {
                    return {
                        trackId: trackId,
                        urls: [streamUrl],
                    };
                }
            }
            return originalGetFileInfo.apply(this, arguments);
        };

        const originalIsDownloaded = gfir.isTrackDownloaded;
        gfir.isTrackDownloaded = async function (trackId, _) {
            const track = allTracks.find((t) => String(t.id) === String(trackId));
            if (track) return true;
            return originalIsDownloaded.apply(this, arguments);
        };
    }

    // 7. Тултип и бейдж DelTracks
    let tooltipEl = null;
    function getTooltip() {
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'deltracks-tooltip';
            document.body.appendChild(tooltipEl);
        }
        return tooltipEl;
    }

    function showTooltip(targetEl, text) {
        const tip = getTooltip();
        tip.textContent = text;
        const rect = targetEl.getBoundingClientRect();
        const top = rect.bottom + 8;
        const left = Math.max(10, rect.left + rect.width / 2 - 120);
        tip.style.top = top + 'px';
        tip.style.left = left + 'px';
        tip.classList.add('visible');
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.classList.remove('visible');
    }

        function createDelTracksBadge() {
        const container = document.createElement('span');
        container.className = 'deltracks-mark-container';
        container.setAttribute('title', 'DelTracks: Трек восстановлен');

        const badge = document.createElement('span');
        badge.className = 'deltracks-badge';
        badge.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" style="flex-shrink:0;">
            <circle cx="12" cy="12" r="10" fill="#1DA1F2"/>
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill="#FFFFFF"/>
          </svg>
          <span style="line-height:1; font-size:11px; font-weight:600;">DelTracks</span>
        `;
        container.appendChild(badge);

        container.addEventListener('mouseenter', () => {
            showTooltip(container, 'Этот трек был автоматически добавлен плагином DelTracks');
        });
        container.addEventListener('mouseleave', hideTooltip);
        return container;
    }

    // 8.
    function unlockExistingTracks() {
        const trackRows = document.querySelectorAll("[class*='CommonTrack_root']");
        trackRows.forEach((row) => {
            const titleEl = row.querySelector("[class*='CommonTrack_title']");
            const rawTitle = titleEl?.textContent?.trim();
            const normTitle = normalizeStr(rawTitle);
            if (!normTitle) return;

            const artistEl = row.querySelector("[class*='CommonTrack_artists'], [class*='ArtistTitle']");
            const rawArtist = artistEl?.textContent?.trim() || '';

            // Проверяем, помечена ли строка как отключенная/заблокированная
            const isDisabled =
                row.classList.contains('CommonTrack_disabled__3T2b9') ||
                row.hasAttribute('aria-disabled') ||
                row.getAttribute('aria-disabled') === 'true' ||
                row.querySelector("[class*='CommonTrack_disabled']") ||
                row.querySelector("[aria-disabled='true']") ||
                row.style.opacity === '0.5';

            // Оставляем только заблокированные/недоступные треки
            if (!isDisabled) return;

            // Ищем совпадение среди базы DelTracks
            let matched = findMatchedTrack(rawArtist, rawTitle);

            // Если трек заблокирован, но отсутствует в базе, регистрируем его
            if (!matched) {
                matched = {
                    id: 'deltracks-auto-' + encodeURIComponent(normTitle).slice(0, 30),
                    title: rawTitle,
                    artist: rawArtist,
                    artistAliases: [normalizeStr(rawArtist)],
                    album: '',
                    albumAliases: [],
                    source: 'AutoDetected',
                };
                allTracks.push(matched);
            }

            if (matched) {
                // Добавляем бейдж если ещё нет
                const metaContainer = row.querySelector('.Meta_titleContainer__gDuXr') || titleEl.parentElement;
                if (metaContainer && !metaContainer.querySelector('.deltracks-mark-container')) {
                    metaContainer.appendChild(createDelTracksBadge());
                }

                // Убираем визуальные признаки блокировки
                row.classList.remove('CommonTrack_disabled__3T2b9');
                row.removeAttribute('aria-disabled');
                row.style.opacity = '1';
                row.style.cursor = 'pointer';

                // Перехватываем клик на всей строке трека и дочерних кнопках в capture фазе
                const clickHandler = (e) => {
                    // Не перехватываем клики по кнопке доп. опций / контекстного меню
                    if (e.target.closest("[data-test-id*='CONTEXT_MENU'], [class*='ContextMenu']")) {
                        return;
                    }
                    e.stopImmediatePropagation();
                    e.stopPropagation();
                    e.preventDefault();
                    playDelTrack(matched);
                };

                if (!row.getAttribute('data-deltracks-bound')) {
                    row.setAttribute('data-deltracks-bound', '1');
                    row.addEventListener('click', clickHandler, true);
                    row.addEventListener('dblclick', clickHandler, true);

                    // Также вешаем прямо на кнопку play если она есть
                    const playBtn = row.querySelector("[class*='PlayButton'], [class*='playButton'], button");
                    if (playBtn) {
                        playBtn.addEventListener('click', clickHandler, true);
                    }
                }
            }
        });
    }

    // 9. Очистка синтезированных треков (показ удаленных треков через mp3 отключен)
    function checkAndInjectMissingTracks() {
        const synthesized = document.querySelectorAll('.deltracks-synthesized-track');
        synthesized.forEach((el) => el.remove());
    }

    // 10. Наблюдатель
    const observer = new MutationObserver(() => {
        unlockExistingTracks();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Экспорт API
    window.__deltracks = {
        getTracks: () => allTracks,
        play: playDelTrack,
        resolveAudioForTrackId: async (trackId, entity) => {
            log('Resolving fallback audio for trackId:', trackId, 'entity:', entity);
            if (trackUrlCache[trackId]) {
                return trackUrlCache[trackId];
            }
            for (const [k, v] of Object.entries(trackUrlCache)) {
                if (String(trackId).includes(k) || k.includes(String(trackId))) {
                    return v;
                }
            }
            let title = '';
            let artist = '';
            let album = '';

            // 1. Извлекаем метаданные напрямую из Sonata entity если передано
            if (entity && entity.data && entity.data.meta) {
                const m = entity.data.meta;
                title = m.title || '';
                if (Array.isArray(m.artists) && m.artists.length > 0) {
                    artist = m.artists
                        .map((a) => a.name)
                        .filter(Boolean)
                        .join(', ');
                } else if (m.artist && m.artist.name) {
                    artist = m.artist.name;
                }
                if (Array.isArray(m.albums) && m.albums.length > 0) {
                    album = m.albums[0]?.title || '';
                }
            }

            // 2. Ищем в локальных/найденных DelTracks
            if (!title) {
                const matchedLocal = allTracks.find((t) => String(t.id) === String(trackId) || (t.trackIds && t.trackIds.includes(String(trackId))));
                if (matchedLocal) {
                    title = matchedLocal.title;
                    artist = matchedLocal.artist;
                    album = matchedLocal.album;
                    if (matchedLocal.url && !trackUrlCache[trackId]) {
                        trackUrlCache[trackId] = matchedLocal.url;
                    }
                }
            }

            // 3. Ищем в DOM по селекторам
            if (!title) {
                const domTrack =
                    document.querySelector(`[data-deltracks-id="${trackId}"]`) ||
                    document.querySelector(`[data-test-id*="${trackId}"]`) ||
                    document.querySelector(`[data-track-id="${trackId}"]`);
                if (domTrack) {
                    title = domTrack.querySelector("[class*='CommonTrack_title']")?.textContent?.trim() || '';
                    artist = domTrack.querySelector("[class*='CommonTrack_artists'], [class*='ArtistTitle']")?.textContent?.trim() || '';
                }
            }

            // 4. Если всё ещё нет названия, извлекаем из активной строки или текущего URL
            if (!title) {
                const playingOrActiveRow = document.querySelector(
                    "[class*='CommonTrack_playing'], [class*='CommonTrack_current'], [class*='CommonTrack_root'][class*='active']",
                );
                if (playingOrActiveRow) {
                    title = playingOrActiveRow.querySelector("[class*='CommonTrack_title']")?.textContent?.trim() || '';
                    artist = playingOrActiveRow.querySelector("[class*='CommonTrack_artists'], [class*='ArtistTitle']")?.textContent?.trim() || '';
                }
            }

            log('Auto-detected track info for stream resolution:', { trackId, artist, title, album });
            if (!title && !artist) {
                log('Could not detect track title/artist for trackId:', trackId);
                return null;
            }

            // Проверяем кэш потоков
            if (trackUrlCache[trackId]) {
                return trackUrlCache[trackId];
            }

            const streamUrl = await resolveAudioStream(artist, title, null);
            if (streamUrl) {
                trackUrlCache[trackId] = streamUrl;
                return streamUrl;
            }
            return null;
        },
    };

    
    // ─── Парсер ID3v2/ID3v1 тегов прямо из MP3 потока ──────────────────────
    async function fetchMp3Id3Tags(mp3Url) {
        try {
            const resp = await fetch(mp3Url, {
                headers: { Range: 'bytes=0-131072' }
            });
            if (!resp.ok && resp.status !== 206) return null;
            const buffer = await resp.arrayBuffer();
            const bytes = new Uint8Array(buffer);

            let title = null;
            let artist = null;
            let album = null;
            let year = null;
            let coverUri = null;

            if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) { // "ID3"
                const ver = bytes[3];
                const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
                const limit = Math.min(bytes.length, tagSize + 10);
                let pos = 10;

                while (pos + 10 < limit) {
                    let frameId = '';
                    for (let i = 0; i < 4; i++) {
                        frameId += String.fromCharCode(bytes[pos + i]);
                    }
                    if (frameId.charCodeAt(0) === 0) break;

                    let frameSize = 0;
                    if (ver === 4) {
                        frameSize = ((bytes[pos + 4] & 0x7f) << 21) | ((bytes[pos + 5] & 0x7f) << 14) | ((bytes[pos + 6] & 0x7f) << 7) | (bytes[pos + 7] & 0x7f);
                    } else {
                        frameSize = (bytes[pos + 4] << 24) | (bytes[pos + 5] << 16) | (bytes[pos + 6] << 8) | bytes[pos + 7];
                    }

                    pos += 10;
                    if (pos + frameSize > bytes.length) break;

                    const frameData = bytes.subarray(pos, pos + frameSize);
                    pos += frameSize;

                    function decodeText(data) {
                        if (!data || data.length <= 1) return '';
                        const enc = data[0];
                        const textBytes = data.subarray(1);
                        try {
                            if (enc === 1) { // UTF-16 with BOM
                                return new TextDecoder('utf-16').decode(textBytes).replace(/\0+$/, '').trim();
                            } else if (enc === 2) { // UTF-16BE
                                return new TextDecoder('utf-16be').decode(textBytes).replace(/\0+$/, '').trim();
                            } else if (enc === 3) { // UTF-8
                                return new TextDecoder('utf-8').decode(textBytes).replace(/\0+$/, '').trim();
                            } else { // ISO-8859-1 or Windows-1251
                                return new TextDecoder('windows-1251').decode(textBytes).replace(/\0+$/, '').trim();
                            }
                        } catch (e) {
                            return '';
                        }
                    }

                    if (frameId === 'TIT2') title = decodeText(frameData);
                    else if (frameId === 'TPE1') artist = decodeText(frameData);
                    else if (frameId === 'TALB') album = decodeText(frameData);
                    else if (frameId === 'TYER' || frameId === 'TDRC') year = decodeText(frameData);
                    else if (frameId === 'APIC') {
                        try {
                            let mime = 'image/jpeg';
                            let picStart = -1;

                            // Ищем сигнатуры JPEG (0xFF 0xD8 0xFF) или PNG (0x89 0x50 0x4E 0x47)
                            for (let i = 0; i < frameData.length - 3; i++) {
                                if (frameData[i] === 0xff && frameData[i + 1] === 0xd8 && frameData[i + 2] === 0xff) {
                                    picStart = i;
                                    mime = 'image/jpeg';
                                    break;
                                }
                                if (frameData[i] === 0x89 && frameData[i + 1] === 0x50 && frameData[i + 2] === 0x4e && frameData[i + 3] === 0x47) {
                                    picStart = i;
                                    mime = 'image/png';
                                    break;
                                }
                            }

                            if (picStart !== -1) {
                                const picBytes = frameData.subarray(picStart);
                                let binary = '';
                                const chunkSz = 8192;
                                for (let i = 0; i < picBytes.length; i += chunkSz) {
                                    const chunk = picBytes.subarray(i, i + chunkSz);
                                    binary += String.fromCharCode.apply(null, chunk);
                                }
                                coverUri = 'data:' + mime + ';base64,' + btoa(binary);
                            }
                        } catch (e) {
                            log('APIC parse failed:', e);
                        }
                    }
                }
            }

            return { title, artist, album, year, coverUri };
        } catch (e) {
            log('MP3 ID3 fetch error:', e);
            return null;
        }
    }

    // Загрузка и синхронизация удалённых треков из каталогов и прямых MP3 источников
    async function syncRemoteTracks() {
        log('Starting remote tracks sync...');
        const discovered = [];

        // 1. Проверяем внешние API/JSON эндпоинты xokeza.su
        for (const ep of XOKEZA_ENDPOINTS) {
            try {
                const res = await fetch(ep, { headers: { 'Accept': 'application/json' } });
                if (res.ok) {
                    const contentType = res.headers.get('content-type') || '';
                    if (contentType.includes('json')) {
                        const data = await res.json();
                        const list = Array.isArray(data) ? data : (data.tracks || data.items || []);
                        for (const item of list) {
                            if (item && item.url) {
                                const trId = item.id || ('deltracks-remote-' + encodeURIComponent(item.title || item.url).slice(0, 30));
                                trackUrlCache[trId] = item.url;
                                let cUri = item.coverUri || item.cover || '';
                                let itemTitle = item.title;
                                let itemArtist = item.artist;
                                let itemAlbum = item.album || '';
                                let itemYear = item.year || '';

                                // Если обложка или метаданные не указаны в json, парсим напрямую из ID3 тегов mp3-файла
                                if (!cUri || !itemTitle || !itemArtist) {
                                    try {
                                        const id3 = await fetchMp3Id3Tags(item.url);
                                        if (id3) {
                                            if (!cUri && id3.coverUri) cUri = id3.coverUri;
                                            if (!itemTitle && id3.title) itemTitle = id3.title;
                                            if (!itemArtist && id3.artist) itemArtist = id3.artist;
                                            if (!itemAlbum && id3.album) itemAlbum = id3.album;
                                            if (!itemYear && id3.year) itemYear = id3.year;
                                        }
                                    } catch (e) {
                                        log('ID3 tag parse error for remote item:', item.url, e);
                                    }
                                }

                                discovered.push({
                                    id: trId,
                                    title: itemTitle,
                                    artist: itemArtist,
                                    artistAliases: [normalizeStr(itemArtist)],
                                    album: itemAlbum,
                                    albumAliases: [normalizeStr(itemAlbum)],
                                    year: itemYear,
                                    label: item.label || '',
                                    url: item.url,
                                    coverUri: cUri,
                                    source: 'Xokeza Remote'
                                });
                            }
                        }
                        log(`Loaded ${list.length} tracks from ${ep}`);
                    }
                }
            } catch (e) {}
        }

        // 2. Обрабатываем прямые MP3 файлы (парсинг ID3 тегов: исполнитель, трек, обложка)
        for (const candidate of KNOWN_DIRECT_REMOTE_TRACKS) {
            try {
                const parsedId3 = await fetchMp3Id3Tags(candidate.url);
                const title = parsedId3?.title || candidate.fallbackTitle;
                const artist = parsedId3?.artist || candidate.fallbackArtist;
                const album = parsedId3?.album || candidate.fallbackAlbum;
                const year = parsedId3?.year || candidate.year;
                const coverUri = parsedId3?.coverUri || candidate.coverUri || '';

                if (title && artist) {
                    const trackObj = {
                        id: 'deltracks-' + normalizeStr(artist).replace(/\s+/g, '_') + '-' + normalizeStr(title).replace(/\s+/g, '_'),
                        title: title,
                        artist: artist,
                        artistAliases: [normalizeStr(artist)],
                        album: album || '',
                        albumAliases: [normalizeStr(album || '')],
                        year: year || '',
                        label: candidate.label || '',
                        url: candidate.url,
                        coverUri: coverUri,
                        source: 'Xokeza MP3 ID3'
                    };
                    discovered.push(trackObj);
                    trackUrlCache[trackObj.id] = candidate.url;
                    log('Successfully parsed remote MP3 ID3 track:', trackObj.artist, '-', trackObj.title, { hasCover: Boolean(coverUri) });
                }
            } catch (err) {
                log('Direct track parse error for', candidate.url, err);
            }
        }

        if (discovered.length > 0) {
            mergeTracks(discovered);
            checkAndInjectMissingTracks();
        }
    }

    loadStoredTracks();
    syncRemoteTracks();
    initWebpack();
    setTimeout(() => {
        unlockExistingTracks();
        checkAndInjectMissingTracks();
    }, 1000);
})();
