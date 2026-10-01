(() => {
    const ADAPTIVE_GLOBAL_KEY = 'adaptive_global_enabled';
    const ADAPTIVE_VIBE_KEY = 'adaptive_vibe_enabled';
    let lastCoverUrl = null;
    let addonSettings = {};
    let newWaveEnabled = false;
    let isFrozen = false;

    let globalFileCache = null;
    let vibeFileCache = null;
    const currentGlobal = { url: null, isVideo: false, isGif: false };
    const currentVibe = { url: null, isVideo: false, isGif: false };
    const resetTimers = { global: null, vibe: null };
    let globalBlobUrls = new Set();
    let vibeBlobUrls = new Set();

    let globalUpdatePending = false;
    let vibeUpdatePending = false;

    let previewPanel = null;
    let globalPreviewLayers = [];
    let vibePreviewLayers = [];

    const pixelState = {
        global: { canvas: null, animFrame: null, pixelSize: 0 },
        vibe:   { canvas: null, animFrame: null, pixelSize: 0 }
    };

    let resizeTimer = null;

    // ========== ПИКСЕЛИЗАЦИЯ ==========
    function getPixelCanvas(container, id) {
        let canvas = document.getElementById(id);
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = id;
            canvas.style.position = 'absolute';
            canvas.style.inset = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '1';
            canvas.style.pointerEvents = 'none';
            canvas.style.imageRendering = 'pixelated';
            canvas.style.display = 'none';
            container.appendChild(canvas);
        }
        return canvas;
    }

    function drawPixelatedFrame(canvas, sourceElement, pixelSize) {
        if (!canvas || !sourceElement || pixelSize <= 0) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0) return;

        const smallW = Math.max(1, Math.floor(w / pixelSize));
        const smallH = Math.max(1, Math.floor(h / pixelSize));

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = smallW;
        tempCanvas.height = smallH;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = false;
        tempCtx.drawImage(sourceElement, 0, 0, smallW, smallH);

        canvas.width = w;
        canvas.height = h;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, w, h);
    }

    function stopPixelAnimation(key) {
        const state = pixelState[key];
        if (state.animFrame) {
            cancelAnimationFrame(state.animFrame);
            state.animFrame = null;
        }
        if (state.canvas) {
            state.canvas.style.display = 'none';
        }
        state.pixelSize = 0;
    }

    function startCanvasAnimation(key, container, canvasId, pixelSize) {
        const state = pixelState[key];
        stopPixelAnimation(key);
        if (pixelSize <= 0 || !container) return;

        const canvas = getPixelCanvas(container, canvasId);
        state.canvas = canvas;
        state.pixelSize = pixelSize;

        function drawLoop() {
            const activeMedia = container.querySelector('.cbg-layer.active .cbg-media');
            if (activeMedia) {
                if (activeMedia.tagName === 'VIDEO' && activeMedia.paused) {
                    state.animFrame = requestAnimationFrame(drawLoop);
                    return;
                }
                drawPixelatedFrame(canvas, activeMedia, pixelSize);
                canvas.style.display = 'block';
            } else {
                canvas.style.display = 'none';
            }
            state.animFrame = requestAnimationFrame(drawLoop);
        }
        state.animFrame = requestAnimationFrame(drawLoop);
    }

    function applyAllPixelEffects() {
        const globalContainer = document.getElementById('global-background-container');
        const vibeContainer = document.getElementById('vibe-background-container');
        const globalPixel = getSetting('globalPixelate', 0);
        const vibePixel = getSetting('vibePixelate', 0);

        if (globalContainer) {
            stopPixelAnimation('global');
            if (!currentGlobal.isGif && globalPixel > 0) {
                startCanvasAnimation('global', globalContainer, 'global-pixel-canvas', globalPixel);
            }
        }

        if (vibeContainer) {
            stopPixelAnimation('vibe');
            if (!currentVibe.isGif && vibePixel > 0) {
                startCanvasAnimation('vibe', vibeContainer, 'vibe-pixel-canvas', vibePixel);
            }
        }
    }

    // ========== УНИВЕРСАЛЬНЫЙ УСТАНОВЩИК МЕДИА ==========
    function _setMedia(container, url, isVideo) {
        container.innerHTML = '';
        if (url) {
            if (isVideo) {
                const video = document.createElement('video');
                video.src = url;
                video.autoplay = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                video.style.borderRadius = '6px';
                container.appendChild(video);
                video.play().catch(() => {});
            } else {
                const img = document.createElement('img');
                img.src = url;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '6px';
                img.onerror = () => { container.innerHTML = ''; };
                container.appendChild(img);
            }
        } else {
            container.innerHTML = '<div style="font-size:11px;color:#888;display:flex;align-items:center;justify-content:center;height:100%;">не установлен</div>';
        }
    }

    // ========== ПАНЕЛЬ ПРЕДПРОСМОТРА ==========
    function createPreviewPanel() {
        if (previewPanel) return previewPanel;
        previewPanel = document.createElement('div');
        previewPanel.id = 'bg-preview-panel';
        document.body.appendChild(previewPanel);
        previewPanel.innerHTML = `
            <div class="preview-section" id="preview-global">
                <div class="preview-label">Глобальный фон</div>
                <div class="preview-layer-container">
                    <div class="preview-layer active"></div>
                    <div class="preview-layer"></div>
                </div>
            </div>
            <div class="preview-section" id="preview-vibe">
                <div class="preview-label">Фон Волны</div>
                <div class="preview-layer-container">
                    <div class="preview-layer active"></div>
                    <div class="preview-layer"></div>
                </div>
            </div>
        `;
        const globalContainer = previewPanel.querySelector('#preview-global .preview-layer-container');
        globalPreviewLayers = Array.from(globalContainer.querySelectorAll('.preview-layer'));
        const vibeContainer = previewPanel.querySelector('#preview-vibe .preview-layer-container');
        vibePreviewLayers = Array.from(vibeContainer.querySelectorAll('.preview-layer'));
        return previewPanel;
    }

    function crossfadePreview(layers, mediaInfo) {
        const active = layers.find(l => l.classList.contains('active'));
        const inactive = layers.find(l => !l.classList.contains('active'));
        if (!active || !inactive) return;

        _setMedia(inactive, mediaInfo?.url, mediaInfo?.isVideo);
        active.classList.remove('active');
        inactive.classList.add('active');

        setTimeout(() => {
            if (!active.classList.contains('active')) {
                active.innerHTML = '';
            }
        }, 400);
    }

    function updatePreviewPanel() {
        if (!previewPanel) return;
        crossfadePreview(globalPreviewLayers, { url: currentGlobal.url, isVideo: currentGlobal.isVideo });
        crossfadePreview(vibePreviewLayers, { url: currentVibe.url, isVideo: currentVibe.isVideo });
    }

    function positionPreviewPanel(anchorEl) {
        if (!previewPanel || !anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const panelWidth = previewPanel.offsetWidth || 160;
        const gap = 12;
        if (rect.right + gap + panelWidth <= window.innerWidth) {
            previewPanel.style.left = (rect.right + gap) + 'px';
            previewPanel.style.right = 'auto';
        } else {
            previewPanel.style.right = (window.innerWidth - rect.left + gap) + 'px';
            previewPanel.style.left = 'auto';
        }
        previewPanel.style.top = rect.top + 'px';
    }

    function showPreviewPanel(anchorEl) {
        if (!previewPanel) return;
        updatePreviewPanel();
        positionPreviewPanel(anchorEl);
        previewPanel.classList.add('active');
    }

    function hidePreviewPanel() {
        if (previewPanel) previewPanel.classList.remove('active');
    }

    // ========== IndexedDB ==========
    const openDB = (dbName) => {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    };

    const saveFile = async (dbName, file) => {
        if (!file) return;
        const db = await openDB(dbName);
        const tx = db.transaction('media', 'readwrite');
        const store = tx.objectStore('media');
        store.put(file, 'current_bg');
        await new Promise((resolve) => { tx.oncomplete = resolve; });
        if (dbName === 'GlobalBackgroundDB') {
            globalFileCache = null;
            await applyGlobalStyle(true);
        } else {
            vibeFileCache = null;
            await initVibeMedia(true);
        }
    };

    const loadFile = async (dbName) => {
        try {
            const db = await openDB(dbName);
            return new Promise((resolve) => {
                const tx = db.transaction('media', 'readonly');
                const store = tx.objectStore('media');
                const req = store.get('current_bg');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch (e) { return null; }
    };

    const deleteFile = async (dbName) => {
        return new Promise(async (resolve) => {
            try {
                const db = await openDB(dbName);
                const tx = db.transaction('media', 'readwrite');
                const store = tx.objectStore('media');
                store.delete('current_bg');
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e) { resolve(); }
        });
    };

    // ========== SETTINGS ==========
    function getSetting(id, defaultValue = false) {
        const s = addonSettings[id];
        if (!s) return defaultValue;
        const v = s.value;
        if (v === undefined || v === null) return defaultValue;
        if (typeof defaultValue === 'number') {
            const num = Number(v);
            return isNaN(num) ? defaultValue : num;
        }
        if (typeof v === 'boolean') return v;
        if (v === 'true' || v === 1 || v === '1') return true;
        if (v === 'false' || v === 0 || v === '0') return false;
        return v;
    }

    function applySettings() {
        const gBlur = getSetting('globalBlur', 0);
        const gBright = getSetting('globalBrightness', 0.4);
        const gOpacity = getSetting('globalOpacity', 100);
        const vBlur = getSetting('vibeBlur', 0);
        const vBright = getSetting('vibeBrightness', 0.4);
        const vOpacity = getSetting('vibeOpacity', 100);
        const vig = getSetting('vignetteIntensity', 0);
        const vVig = getSetting('vibeVignetteIntensity', 0);

        document.documentElement.style.setProperty('--global-blur', `${gBlur}px`);
        document.documentElement.style.setProperty('--global-brightness', gBright);
        document.documentElement.style.setProperty('--global-opacity', gOpacity / 100);
        document.documentElement.style.setProperty('--vibe-blur', `${vBlur}px`);
        document.documentElement.style.setProperty('--vibe-brightness', vBright);
        document.documentElement.style.setProperty('--vibe-opacity', vOpacity / 100);
        document.documentElement.style.setProperty('--vignette-opacity', (vig / 100).toFixed(2));
        document.documentElement.style.setProperty('--vibe-vignette-opacity', (vVig / 100).toFixed(2));

        const newVal = getSetting('newWave', false);
        if (newVal !== newWaveEnabled) {
            newWaveEnabled = newVal;
            cleanupCoverTracking();
            initCoverTracking();
        }

        getGlobalContainer();
        getVibeContainer();
        applyAllPixelEffects();
    }

    // ========== ADAPTIVE ==========
    function setAdaptiveGlobalEnabled(enabled) {
        localStorage.setItem(ADAPTIVE_GLOBAL_KEY, enabled ? '1' : '0');
        updateAdaptiveButtons();
    }
    function isAdaptiveGlobalEnabled() { return localStorage.getItem(ADAPTIVE_GLOBAL_KEY) === '1'; }
    function setAdaptiveVibeEnabled(enabled) {
        localStorage.setItem(ADAPTIVE_VIBE_KEY, enabled ? '1' : '0');
        updateAdaptiveButtons();
    }
    function isAdaptiveVibeEnabled() { return localStorage.getItem(ADAPTIVE_VIBE_KEY) === '1'; }
    function updateAdaptiveButtons() {
        const btnG = document.getElementById('btn-toggle-adaptive-global');
        const btnV = document.getElementById('btn-toggle-adaptive-vibe');
        if (btnG) btnG.classList.toggle('active', isAdaptiveGlobalEnabled());
        if (btnV) btnV.classList.toggle('active', isAdaptiveVibeEnabled());
    }

    // ========== COVER HELPERS ==========
    function getHighResCoverUrl(url) {
        if (!url) return null;
        return url.replace(/%%/g, '1000x1000').replace(/\/\d+x\d+(?=[/?&]|$)/, '/1000x1000');
    }

    function getBestSrcFromSrcSet(img) {
        const srcset = img.getAttribute('srcset');
        if (!srcset) return img.src;
        const sources = srcset.split(',').map(s => s.trim().split(/\s+/));
        for (const [url, desc] of sources) {
            if (desc === '2x' || desc === '800w') return url;
        }
        return sources[sources.length - 1][0];
    }

    function handleCoverUrlChange(newUrl) {
        if (!newUrl) return;
        const highRes = getHighResCoverUrl(newUrl);
        if (highRes === lastCoverUrl) return;
        lastCoverUrl = highRes;
        if (isAdaptiveGlobalEnabled()) applyGlobalStyle(true);
        if (isAdaptiveVibeEnabled()) initVibeMedia(true);
        updatePreviewPanel();
    }

    function isArtistImage(img) {
        const cls = img.className || '';
        return /ArtistCover|artist|avatar/i.test(cls);
    }

    // ========== ПОИСК ОБЛОЖКИ (поддержка альтернативного режима ChromaSync) ==========
    function getBestCoverFromDOM() {
        // 1. Глубокая мета через pulsesyncApi
        try {
            const state = window.pulsesyncApi?.getState?.();
            if (state) {
                const mp = state.currentMediaPlayer?.observableValue
                         || state.currentMediaPlayer?.value
                         || state.currentMediaPlayer;
                if (mp) {
                    const pair = mp.currentContextEntityPair;
                    const entity = pair?.entity;
                    const meta = entity?.entityData?.meta || entity?.meta;
                    if (meta) {
                        const coverUri = meta.coverUri || meta.ogImage
                            || (meta.albums?.[0]?.coverUri);
                        if (coverUri && typeof coverUri === 'string') {
                            const url = coverUri.startsWith('http') ? coverUri : 'https://' + coverUri;
                            return url.replace(/%%/g, '1000x1000');
                        }
                    }
                    const directCover = entity?.coverUri || entity?.ogImage;
                    if (directCover) {
                        const url = directCover.startsWith('http') ? directCover : 'https://' + directCover;
                        return url.replace(/%%/g, '1000x1000');
                    }
                }
            }
        } catch (e) {}

        // 2. Альтернативный режим ChromaSync: обложка в элементе артиста
        const swappedCover = document.querySelector('img[data-cs-alt-home-image-swapped="1"]');
        if (swappedCover) {
            const url = getBestSrcFromSrcSet(swappedCover);
            if (url) return url;
        }

        // 3. Плеер
        const playerBar = document.querySelector('[data-test-id="PLAYER_BAR"]') ||
                          document.querySelector('[class*="PlayerBarDesktop"]') ||
                          document.querySelector('[class*="player_bar"]');
        if (playerBar) {
            const playerImg = playerBar.querySelector('img[src*="avatars.yandex.net"]');
            if (playerImg) {
                const url = getBestSrcFromSrcSet(playerImg);
                if (url) return url;
            }
        }

        // 4. Новая волна (AlbumCover)
        const albumCoverImg = document.querySelector('[class*="AlbumCover_cover__bif8b"]');
        if (albumCoverImg) {
            const url = getBestSrcFromSrcSet(albumCoverImg);
            if (url) return url;
        }

        // 5. Полноэкранный плеер
        const fullscreenModal = document.querySelector('[data-test-id="FULLSCREEN_PLAYER_MODAL"]');
        if (fullscreenModal) {
            const fullImg = fullscreenModal.querySelector('img[data-test-id="ENTITY_COVER_IMAGE"]');
            if (fullImg && fullImg.src.includes('avatars.yandex.net')) return fullImg.src;
        }

        // 6. Общий поиск
        const allImgs = document.querySelectorAll('img[src*="avatars.yandex.net"]');
        let bestImg = null, bestArea = 0, isBestAlbumCover = false;

        for (const img of allImgs) {
            if (img === swappedCover) continue;
            if (isArtistImage(img)) continue;
            const w = img.naturalWidth || img.clientWidth || 0;
            const h = img.naturalHeight || img.clientHeight || 0;
            if (w < 100 || h < 100) continue;
            const area = w * h;
            const hasAlbumClass = /AlbumCover/i.test(img.className);
            if (isBestAlbumCover && !hasAlbumClass) continue;
            if (area > bestArea || (hasAlbumClass && !isBestAlbumCover)) {
                bestArea = area;
                bestImg = img;
                isBestAlbumCover = hasAlbumClass;
            }
        }

        if (bestImg) return getBestSrcFromSrcSet(bestImg);
        return null;
    }

    // ========== ОТСЛЕЖИВАНИЕ ОБЛОЖЕК ==========
    let coverObserver = null, coverInterval = null, retryTimer = null, retryAttempts = 0;
    const MAX_RETRIES = 5, RETRY_DELAYS = [200, 400, 800, 1500, 3000];

    function scheduleCoverCheck() {
        if (retryTimer) clearTimeout(retryTimer);
        retryAttempts = 0;
        runRetry();
    }

    function runRetry() {
        const url = getBestCoverFromDOM();
        if (url) {
            const highRes = getHighResCoverUrl(url);
            if (highRes !== lastCoverUrl) { handleCoverUrlChange(url); return; }
        }
        if (retryAttempts < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retryAttempts] || 3000;
            retryTimer = setTimeout(() => { retryAttempts++; runRetry(); }, delay);
        }
    }

    function startSmartCoverTracking() {
        stopSmartCoverTracking();
        if (isFrozen) return;
        setTimeout(() => scheduleCoverCheck(), 1500);
        coverObserver = new MutationObserver((mutations) => {
            if (isFrozen) return;
            if (mutations.some(m => m.type === 'childList' || (m.type === 'attributes' && ['style','class','src'].includes(m.attributeName)))) scheduleCoverCheck();
        });
        coverObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class','src'] });
        coverInterval = setInterval(() => { if (!isFrozen) scheduleCoverCheck(); }, 5000);
    }

    function stopSmartCoverTracking() {
        if (coverObserver) { coverObserver.disconnect(); coverObserver = null; }
        clearInterval(coverInterval); coverInterval = null;
        clearTimeout(retryTimer);
    }

    let playerTrackInterval = null;
    function initPlayerDomTracking() {
        if (isFrozen) return;
        if (playerTrackInterval) clearInterval(playerTrackInterval);
        let prevUrl = null;
        const check = () => {
            if (isFrozen || (!isAdaptiveGlobalEnabled() && !isAdaptiveVibeEnabled())) return;
            const playerBar = document.querySelector('[data-test-id="PLAYER_BAR"]') ||
                              document.querySelector('[class*="PlayerBarDesktop"]') ||
                              document.querySelector('[class*="player_bar"]');
            if (!playerBar) return;
            const img = playerBar.querySelector('img[src*="avatars.yandex.net"]');
            if (!img?.src) return;
            const highRes = img.src.replace(/&amp;/g, '&').replace(/\/\d+x\d+(?=[/?&]|$)/, '/1000x1000');
            if (highRes !== prevUrl) { prevUrl = highRes; handleCoverUrlChange(highRes); }
        };
        setTimeout(check, 2000);
        playerTrackInterval = setInterval(check, 1000);
    }

    function stopPlayerDomTracking() {
        if (playerTrackInterval) { clearInterval(playerTrackInterval); playerTrackInterval = null; }
    }

    function initPulseSyncTracking() {
        if (typeof Theme === 'undefined') return false;
        try {
            const theme = new Theme('custom-background');
            theme.player.on('trackChange', (data) => data?.state?.track?.coverUri && handleCoverUrlChange(data.state.track.coverUri));
            theme.player.on('pageChange', (data) => data?.state?.track?.coverUri && handleCoverUrlChange(data.state.track.coverUri));
            try { const cur = theme.player.getCurrentTrack?.(); if (cur?.coverUri) handleCoverUrlChange(cur.coverUri); } catch(e){}
            return true;
        } catch(e) { return false; }
    }

    function initCoverTracking() {
        const isNewWave = document.querySelector('[class*="VibePage_root"]') || document.querySelector('[data-test-id="MAIN_PAGE"]');
        if (isNewWave || newWaveEnabled) startSmartCoverTracking();
        else if (!initPulseSyncTracking()) initPlayerDomTracking();
    }

    function cleanupCoverTracking() {
        stopSmartCoverTracking();
        stopPlayerDomTracking();
    }

    // ========== ЗАМОРОЗКА ПРИ СВОРАЧИВАНИИ ==========
    function freeze() { if (!isFrozen) { isFrozen = true; console.log('[CustomBackground] Заморозка отслеживания'); cleanupCoverTracking(); } }
    function unfreeze() { if (isFrozen) { isFrozen = false; console.log('[CustomBackground] Разморозка, запуск отслеживания с задержкой'); setTimeout(() => { if (!isFrozen) initCoverTracking(); }, 300); } }

    // ========== СЛОИ ==========
    function ensureLayers(container) {
        let layers = container.querySelectorAll('.cbg-layer');
        if (layers.length < 2) {
            container.innerHTML = '';
            const l1 = document.createElement('div'); l1.className = 'cbg-layer active';
            const l2 = document.createElement('div'); l2.className = 'cbg-layer';
            container.appendChild(l1); container.appendChild(l2);
        }
        if (!container.querySelector('.cbg-layer.active')) {
            const [first, second] = container.querySelectorAll('.cbg-layer');
            first.classList.add('active'); second.classList.remove('active');
        }
        if (!container.querySelector('.cbg-vignette')) {
            const vignette = document.createElement('div'); vignette.className = 'cbg-vignette';
            container.appendChild(vignette);
        }
        return container;
    }

    function createContainer(id, prependTo) {
        let container = document.getElementById(id);
        if (!container && prependTo) { container = document.createElement('div'); container.id = id; prependTo.prepend(container); ensureLayers(container); }
        else if (container) ensureLayers(container);
        return container;
    }

    function getGlobalContainer() { return createContainer('global-background-container', document.body); }

    function getVibeContainer() {
        const oldContainer = document.getElementById('vibe-background-container');
        if (newWaveEnabled) {
            const vibe = document.querySelector('[class*="VibePage_root"]') || document.querySelector('[data-test-id="MAIN_PAGE"]');
            if (!vibe) { oldContainer?.remove(); return null; }
            vibe.style.position = 'relative';
            return createContainer('vibe-background-container', vibe);
        } else {
            const vibe = document.querySelector('[class*="MainPage_vibe"]') || document.querySelector('[data-test-id="VIBE_BLOCK"]');
            if (!vibe) { oldContainer?.remove(); return null; }
            vibe.style.setProperty('height', 'calc(100vh - 70px)', 'important');
            vibe.style.setProperty('min-height', 'calc(100vh - 70px)', 'important');
            vibe.style.setProperty('padding', '0', 'important');
            return createContainer('vibe-background-container', vibe);
        }
    }

    function cleanupOldBlobUrls(urlSet, newUrl) { for (const url of urlSet) if (url !== newUrl) URL.revokeObjectURL(url); urlSet.clear(); if (newUrl) urlSet.add(newUrl); }

    function crossfade(container, url, isVideo) {
        if (!container || !url) return false;
        ensureLayers(container);
        const active = container.querySelector('.cbg-layer.active'), inactive = container.querySelector('.cbg-layer:not(.active)');
        if (!active || !inactive) return false;
        _setMedia(inactive, url, isVideo);
        const media = inactive.querySelector('video') || inactive.querySelector('img');
        if (media) media.className = 'cbg-media';
        void inactive.offsetWidth;
        active.classList.remove('active'); inactive.classList.add('active');
        setTimeout(() => { if (!active.classList.contains('active')) active.innerHTML = ''; }, 700);
        return true;
    }

    function fadeOutClear(container, timerKey) {
        if (!container) return;
        ensureLayers(container);
        const active = container.querySelector('.cbg-layer.active');
        if (active) active.classList.remove('active');
        clearTimeout(resetTimers[timerKey]);
        resetTimers[timerKey] = setTimeout(() => { container.querySelectorAll('.cbg-layer').forEach(l => l.innerHTML = ''); resetTimers[timerKey] = null; }, 600);
    }

    // ========== BACKGROUND ==========
    async function applyGlobalStyle(force = false) {
        if (globalUpdatePending) return;
        globalUpdatePending = true;
        try {
            const container = getGlobalContainer();
            if (!container) return;
            let targetUrl = null, isVideo = false, isGif = false;
            if (isAdaptiveGlobalEnabled()) {
                targetUrl = lastCoverUrl;
                if (targetUrl) isGif = targetUrl.toLowerCase().endsWith('.gif');
            } else {
                const file = await loadFile('GlobalBackgroundDB');
                if (file) {
                    if (!globalFileCache) { const newUrl = URL.createObjectURL(file); globalFileCache = { url: newUrl, type: file.type }; cleanupOldBlobUrls(globalBlobUrls, newUrl); }
                    targetUrl = globalFileCache.url;
                    const type = globalFileCache.type;
                    isVideo = type.startsWith('video/'); isGif = type === 'image/gif' || targetUrl.toLowerCase().endsWith('.gif');
                } else { if (globalFileCache) { cleanupOldBlobUrls(globalBlobUrls, null); globalFileCache = null; } }
            }
            if (targetUrl) { clearTimeout(resetTimers.global); resetTimers.global = null; }
            const shouldUpdate = force || (currentGlobal.url !== targetUrl);
            if (!shouldUpdate) return;
            currentGlobal.url = targetUrl; currentGlobal.isVideo = isVideo; currentGlobal.isGif = isGif;
            if (!targetUrl) { fadeOutClear(container, 'global'); updatePreviewPanel(); applyAllPixelEffects(); return; }
            crossfade(container, targetUrl, isVideo);
            updatePreviewPanel(); applyAllPixelEffects();
        } finally { globalUpdatePending = false; }
    }

    async function initVibeMedia(force = false) {
        if (vibeUpdatePending) return;
        vibeUpdatePending = true;
        try {
            const container = getVibeContainer();
            if (!container) return;
            let targetUrl = null, isVideo = false, isGif = false;
            if (isAdaptiveVibeEnabled()) {
                targetUrl = lastCoverUrl;
                if (targetUrl) isGif = targetUrl.toLowerCase().endsWith('.gif');
            } else {
                const file = await loadFile('VibeVideoDB');
                if (file) {
                    if (!vibeFileCache) { const newUrl = URL.createObjectURL(file); vibeFileCache = { url: newUrl, type: file.type }; cleanupOldBlobUrls(vibeBlobUrls, newUrl); }
                    targetUrl = vibeFileCache.url; const type = vibeFileCache.type;
                    isVideo = type.startsWith('video/'); isGif = type === 'image/gif' || targetUrl.toLowerCase().endsWith('.gif');
                } else { if (vibeFileCache) { cleanupOldBlobUrls(vibeBlobUrls, null); vibeFileCache = null; } }
            }
            if (targetUrl) { clearTimeout(resetTimers.vibe); resetTimers.vibe = null; }
            const shouldUpdate = force || (currentVibe.url !== targetUrl);
            if (!shouldUpdate) return;
            currentVibe.url = targetUrl; currentVibe.isVideo = isVideo; currentVibe.isGif = isGif;
            if (!targetUrl) { fadeOutClear(container, 'vibe'); updatePreviewPanel(); applyAllPixelEffects(); return; }
            crossfade(container, targetUrl, isVideo);
            updatePreviewPanel(); applyAllPixelEffects();
        } finally { vibeUpdatePending = false; }
    }

    // ========== МЕНЮ ==========
    let currentMenuClickHandler = null, currentMousedownHandler = null;
    function injectMenu() {
        const anchorBtn = document.querySelector('.TitleBar_button__9MptL');
        if (!anchorBtn || document.getElementById('bg-menu-button')) return;
        const oldDropdown = document.getElementById('bg-menu-dropdown'); if (oldDropdown) oldDropdown.remove();
        if (currentMousedownHandler) { document.removeEventListener('mousedown', currentMousedownHandler, true); currentMousedownHandler = null; }
        if (currentMenuClickHandler) { anchorBtn.removeEventListener('click', currentMenuClickHandler); currentMenuClickHandler = null; }

        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'TitleBar_button__9MptL'; btn.id = 'bg-menu-button'; btn.setAttribute('aria-label', 'Смена фонов');
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="TitleBar_icon__8Wji9" style="pointer-events: none;"><path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 8.5L19 4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        anchorBtn.parentNode.insertBefore(btn, anchorBtn);

        const dropdown = document.createElement('div'); dropdown.id = 'bg-menu-dropdown';
        const resetSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M23,12A11,11,0,1,1,12,1a10.9,10.9,0,0,1,5.882,1.7l1.411-1.411A1,1,0,0,1,21,2V6a1,1,0,0,1-1,1H16a1,1,0,0,1-.707-1.707L16.42,4.166A8.9,8.9,0,0,0,12,3a9,9,0,1,0,9,9,1,1,0,0,1,2,0Z"/></svg>`;
        dropdown.innerHTML = `<div class="bg-menu-row"><div class="bg-menu-item" id="btn-set-global">Глобальный фон</div><div class="bg-menu-reset" id="btn-reset-global">${resetSvg}</div></div><div class="bg-menu-row"><div class="bg-menu-item" id="btn-set-vibe">Фон Волны</div><div class="bg-menu-reset" id="btn-reset-vibe">${resetSvg}</div></div><div class="bg-menu-item" id="btn-toggle-adaptive-global">Адаптивный фон</div><div class="bg-menu-item" id="btn-toggle-adaptive-vibe">Адаптивная волна</div>`;
        document.body.appendChild(dropdown);

        createPreviewPanel();
        let pendingRaf = null;

        currentMenuClickHandler = (e) => {
            e.stopPropagation();
            const dd = document.getElementById('bg-menu-dropdown'); if (!dd) return;
            const isActive = dd.classList.contains('active');
            if (pendingRaf) { cancelAnimationFrame(pendingRaf); pendingRaf = null; }
            if (isActive) { dd.classList.remove('active'); hidePreviewPanel(); }
            else { positionDropdown(); dd.classList.add('active'); pendingRaf = requestAnimationFrame(() => { pendingRaf = null; showPreviewPanel(dd); }); }
        };
        btn.addEventListener('click', currentMenuClickHandler);

        currentMousedownHandler = (e) => {
            const dd = document.getElementById('bg-menu-dropdown');
            if (dd && dd.classList.contains('active') && !dd.contains(e.target) && !btn.contains(e.target)) {
                dd.classList.remove('active'); hidePreviewPanel();
                if (pendingRaf) { cancelAnimationFrame(pendingRaf); pendingRaf = null; }
            }
        };
        document.addEventListener('mousedown', currentMousedownHandler, true);

        function positionDropdown() {
            const rect = btn.getBoundingClientRect(); const dd = document.getElementById('bg-menu-dropdown'); if (!dd) return;
            const ddWidth = 180; const left = rect.left + (rect.width / 2) - (ddWidth / 2);
            dd.style.top = `${rect.bottom + 8}px`; dd.style.left = `${Math.max(8, left)}px`;
        }

        window.addEventListener('resize', () => {
            const dd = document.getElementById('bg-menu-dropdown');
            if (dd && dd.classList.contains('active') && previewPanel?.classList.contains('active')) { positionDropdown(); positionPreviewPanel(dd); }
        });

        const openPicker = (db) => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'video/mp4,video/webm,image/*';
            input.onchange = e => {
                if (e.target.files[0]) {
                    if (db === 'GlobalBackgroundDB') setAdaptiveGlobalEnabled(false); else setAdaptiveVibeEnabled(false);
                    saveFile(db, e.target.files[0]);
                    setTimeout(() => updatePreviewPanel(), 500);
                }
            };
            input.click();
        };

        document.getElementById('btn-set-global').onclick = () => openPicker('GlobalBackgroundDB');
        document.getElementById('btn-set-vibe').onclick = () => openPicker('VibeVideoDB');
        document.getElementById('btn-reset-global').onclick = async () => { await deleteFile('GlobalBackgroundDB'); globalFileCache = null; currentGlobal.url = null; currentGlobal.isVideo = false; currentGlobal.isGif = false; await applyGlobalStyle(true); updatePreviewPanel(); applyAllPixelEffects(); };
        document.getElementById('btn-reset-vibe').onclick = async () => { await deleteFile('VibeVideoDB'); vibeFileCache = null; currentVibe.url = null; currentVibe.isVideo = false; currentVibe.isGif = false; await initVibeMedia(true); updatePreviewPanel(); applyAllPixelEffects(); };
        document.getElementById('btn-toggle-adaptive-global').onclick = async () => {
            const next = !isAdaptiveGlobalEnabled(); if (next) { await deleteFile('GlobalBackgroundDB'); globalFileCache = null; }
            setAdaptiveGlobalEnabled(next); await applyGlobalStyle(true);
            if (!next) { currentGlobal.url = null; currentGlobal.isVideo = false; currentGlobal.isGif = false; }
            updatePreviewPanel(); applyAllPixelEffects();
        };
        document.getElementById('btn-toggle-adaptive-vibe').onclick = async () => {
            const next = !isAdaptiveVibeEnabled(); if (next) { await deleteFile('VibeVideoDB'); vibeFileCache = null; }
            setAdaptiveVibeEnabled(next); await initVibeMedia(true);
            if (!next) { currentVibe.url = null; currentVibe.isVideo = false; currentVibe.isGif = false; }
            updatePreviewPanel(); applyAllPixelEffects();
        };
        updateAdaptiveButtons();
    }

    // ========== OBSERVERS ==========
    let menuObserver, vibeObserver;
    function initObservers() {
        if (menuObserver) { menuObserver.disconnect(); menuObserver = null; }
        menuObserver = new MutationObserver(() => { if (!document.getElementById('bg-menu-button') && document.querySelector('.TitleBar_button__9MptL')) injectMenu(); });
        menuObserver.observe(document.body, { childList: true, subtree: true });
        if (vibeObserver) { vibeObserver.disconnect(); vibeObserver = null; }
        vibeObserver = new MutationObserver(() => {
            const vibe = newWaveEnabled ? (document.querySelector('[class*="VibePage_root"]') || document.querySelector('[data-test-id="MAIN_PAGE"]')) : (document.querySelector('[class*="MainPage_vibe"]') || document.querySelector('[data-test-id="VIBE_BLOCK"]'));
            if (vibe && !document.getElementById('vibe-background-container')) initVibeMedia(true);
        });
        vibeObserver.observe(document.body, { childList: true, subtree: true });
    }
    function disconnectObservers() { if (menuObserver) menuObserver.disconnect(); if (vibeObserver) vibeObserver.disconnect(); }

    function initPulseSyncSettings() {
        if (!window.pulsesyncApi) { setTimeout(initPulseSyncSettings, 500); return; }
        const addonName = 'Custom Background'; let api = null;
        try { api = window.pulsesyncApi.getSettings?.(addonName); } catch (e) {}
        if (!api || !api.onChange) { setTimeout(initPulseSyncSettings, 1000); return; }
        const handle = (s) => { addonSettings = s || {}; applySettings(); };
        handle(api.getCurrent?.() || {}); api.onChange((s) => handle(s));
        console.log('[CustomBackground] PulseSync settings API подключен');
    }

    // ========== ФИКС ПЕРЕКРЫТИЯ (новая волна) ==========
    let layoutFixObserver = null;
    function fixVibeLayoutOverlay() { const overlay = document.querySelector('.DefaultLayout_rootNewWave'); if (overlay) overlay.style.setProperty('background', 'transparent', 'important'); }
    function startLayoutFixObserver() { fixVibeLayoutOverlay(); layoutFixObserver = new MutationObserver(() => { if (document.querySelector('.DefaultLayout_rootNewWave')) fixVibeLayoutOverlay(); }); layoutFixObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
    function stopLayoutFixObserver() { if (layoutFixObserver) { layoutFixObserver.disconnect(); layoutFixObserver = null; } }

    window.__bgDebug = { getLastCoverUrl: () => lastCoverUrl, getBestCover: () => getBestCoverFromDOM(), forceCheck: () => scheduleCoverCheck() };

    // ========== ИНТЕГРАЦИЯ С CHROMA SYNC (пульсация) ==========
    let chromaSyncPulseRAF = null;
    let lastConfigLog = 0;

    function isChromaSyncActive() {
        return !!(window.__cs_init === true && window.__csVerify && window.__csVerify(window.__csGetKey?.()));
    }

    function getCurrentPulseConfig() {
        if (!isChromaSyncActive()) {
            return { amplitude: 0.9, smoothing: 0.9, baseScale: 1.0, enabled: false };
        }
        try {
            let chromaSettings = null;
            let source = "none";

            // 1. Приоритет: window.settings (обновляется мгновенно)
            if (window.settings && typeof window.settings.beatAmplitude?.value === 'number') {
                chromaSettings = window.settings;
                source = "window.settings";
            }
            // 2. getSettings (если window.settings нет)
            if (!chromaSettings) {
                const api = window.pulsesyncApi?.getSettings?.("ChromaSync");
                if (api && typeof api.getCurrent === 'function') {
                    chromaSettings = api.getCurrent();
                    source = "getSettings";
                }
            }
            // 3. _addonSettings (только если ничего другого нет)
            if (!chromaSettings) {
                chromaSettings = window.pulsesyncApi?._addonSettings?.["ChromaSync"];
                source = "_addonSettings";
            }
            // 4. Fallback поиск
            if (!chromaSettings) {
                for (const key in window.pulsesyncApi?._addonSettings) {
                    if (/chromasync/i.test(key)) {
                        chromaSettings = window.pulsesyncApi._addonSettings[key];
                        source = "_addonSettings fallback";
                        break;
                    }
                }
            }

            if (chromaSettings && typeof chromaSettings.beatAmplitude?.value === 'number') {
                const amplitudePercent = chromaSettings.beatAmplitude.value;
                const smoothingPercent = chromaSettings.beatSmoothing?.value ?? 10;
                const baseScale = chromaSettings.beatBaseScale?.value ?? 1.0;
                const enabled = chromaSettings.enableBeatPulseEffect?.value !== false;
                const lowVolumeBoost = chromaSettings.lowVolumeBoost?.value ?? true;
                let vibeBand = chromaSettings.vibeBand?.value ?? "0";
                const vibeFloor = chromaSettings.vibeFloor?.value ?? 97.7;
                const beatSpeedMs = chromaSettings.beatSpeedMs?.value ?? 16;
                
                const vibeBandMap = { "0": "low", "1": "middle", "2": "high", "3": "all", "low": "low", "middle": "middle", "high": "high", "all": "all" };
                const vibeBandReadable = vibeBandMap[String(vibeBand)] ?? String(vibeBand);
                
                const now = Date.now();
                if (now - lastConfigLog > 3000) {
                    lastConfigLog = now;
                    console.debug('[CustomBackground] Pulse config (source: '+source+'):', {
                        amplitudePercent, smoothingPercent, baseScale, enabled,
                        lowVolumeBoost, vibeBand: vibeBandReadable, vibeFloor, beatSpeedMs
                    });
                }
                return {
                    amplitude: (amplitudePercent / 100) * 0.9,
                    smoothing: 1 - (smoothingPercent / 100),
                    baseScale: baseScale,
                    enabled: enabled,
                };
            }
        } catch(e) {
            console.warn('[CustomBackground] Error reading ChromaSync settings:', e);
        }
        console.debug('[CustomBackground] Using default pulse config (ChromaSync inactive or settings missing)');
        return { amplitude: 0.9, smoothing: 0.9, baseScale: 1.0, enabled: false };
    }

    function startChromaSyncPulse() {
        if (chromaSyncPulseRAF) return;
        let currentEnergy = 0, currentScale = 1.0;
        function step() {
            const cfg = getCurrentPulseConfig();
            if (!cfg.enabled || !isChromaSyncActive()) {
                stopChromaSyncPulse();
                return;
            }
            const rawEnergy = typeof window.__currentPulseEnergy === 'number' ? window.__currentPulseEnergy : 0;
            currentEnergy += (rawEnergy - currentEnergy) * 0.3;
            const targetScale = cfg.baseScale + currentEnergy * cfg.amplitude;
            currentScale += (targetScale - currentScale) * cfg.smoothing;
            const gc = document.getElementById('global-background-container');
            if (gc && (currentGlobal.url || isAdaptiveGlobalEnabled())) gc.style.transform = `scale(${currentScale})`;
            const vc = document.getElementById('vibe-background-container');
            if (vc && (currentVibe.url || isAdaptiveVibeEnabled())) vc.style.transform = `scale(${currentScale})`;
            chromaSyncPulseRAF = requestAnimationFrame(step);
        }
        chromaSyncPulseRAF = requestAnimationFrame(step);
    }

    function stopChromaSyncPulse() {
        if (chromaSyncPulseRAF) {
            cancelAnimationFrame(chromaSyncPulseRAF);
            chromaSyncPulseRAF = null;
        }
        const gc = document.getElementById('global-background-container');
        if (gc) gc.style.transform = '';
        const vc = document.getElementById('vibe-background-container');
        if (vc) vc.style.transform = '';
    }

    setInterval(() => {
        const cfg = getCurrentPulseConfig();
        if (cfg.enabled && isChromaSyncActive() && !chromaSyncPulseRAF) {
            startChromaSyncPulse();
        } else if ((!cfg.enabled || !isChromaSyncActive()) && chromaSyncPulseRAF) {
            stopChromaSyncPulse();
        }
    }, 2000);

    // ========== INIT ==========
    async function init() {
        lastCoverUrl = null;
        applySettings(); initObservers();
        if (newWaveEnabled) startLayoutFixObserver();
        await applyGlobalStyle(true); await initVibeMedia(true);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                document.querySelectorAll('#global-background-container video, #vibe-background-container video').forEach(v => v.pause());
                freeze();
            } else {
                document.querySelectorAll('#global-background-container video, #vibe-background-container video').forEach(v => { v.play().catch(() => {}); });
                unfreeze();
            }
        });

        if (!document.hidden) setTimeout(() => { if (!isFrozen) initCoverTracking(); }, 2000);
        initPulseSyncSettings();
    }

    init();

    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => applyAllPixelEffects(), 200); });
    window.addEventListener('beforeunload', () => {
        disconnectObservers(); stopLayoutFixObserver(); cleanupCoverTracking();
        stopPixelAnimation('global'); stopPixelAnimation('vibe');
        cleanupOldBlobUrls(globalBlobUrls, null); cleanupOldBlobUrls(vibeBlobUrls, null);
    });
})();