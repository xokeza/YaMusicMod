(function () {
    function getMeta(entity) {
        if (!entity) return null;
        return (
            entity?.entity?.data?.meta ||
            entity?.entity?.entityData?.meta ||
            entity?.data?.meta ||
            entity?.entityData?.meta ||
            entity?.meta ||
            (entity?.id && (entity?.coverUri || entity?.title) ? entity : null)
        );
    }

    function getId(entity) {
        if (!entity) return '';
        const meta = getMeta(entity);
        const id = meta?.id || entity?.id || entity?.entity?.id || entity?.entityId;
        return id ? String(id) : '';
    }

    function getCoverUrl(entity) {
        const meta = getMeta(entity);
        let cover = meta?.coverUri || meta?.ogImage || entity?.coverUri || entity?.entity?.coverUri;
        if (!cover) return '';
        if (typeof cover !== 'string') return '';
        if (!/^https?:\/\//i.test(cover)) {
            cover = 'https://' + cover.replace(/^\/\//, '');
        }
        return cover;
    }

    function hexToHSL(hex) {
        if (!hex || typeof hex !== 'string') return { h: 0, s: 0, l: 0 };
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((s) => s + s)
                .join('');
        }

        let r = parseInt(hex.substring(0, 2), 16) / 255;
        let g = parseInt(hex.substring(2, 4), 16) / 255;
        let b = parseInt(hex.substring(4, 6), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h,
            s,
            l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }
            h /= 6;
        }

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100),
        };
    }

    function createImage() {
        const img = document.createElement('img');
        img.className = 'qQ7GQU14EkggPBC6jdeS fosYvyLDok3Kjj9OWmxG FullscreenPlayerDesktopPoster_cover__CDmhM FullscreenPlayerDesktopPoster_cover_queue';
        img.loading = 'eager';
        return img;
    }

    function updateSrc(img, entity) {
        const cover = getCoverUrl(entity);
        if (!cover) return;
        img.src = cover.replace('%%', '400x400');
        img.srcset = `${cover.replace('%%', '400x400')} 1x, ${cover.replace('%%', '800x800')} 2x`;
    }

    function getQueueState() {
        return window.pulsesyncApi?.playerInstance?.state?.queueState || null;
    }

    function getCurrentEntity(qs) {
        if (!qs) return null;
        if (qs.currentEntity?.value) return qs.currentEntity.value;
        const idx = qs.index?.value;
        const order = qs.order?.value;
        const list = qs.entityList?.value;
        if (idx != null && order && list && order[idx] != null) {
            return list[order[idx]];
        }
        return null;
    }

    function getPrevEntity(qs) {
        if (!qs) return null;
        if (qs.prevEntity?.value) return qs.prevEntity.value;
        const pIdx = qs.prevIndex?.value;
        const order = qs.order?.value;
        const list = qs.entityList?.value;
        if (pIdx != null && order && list && order[pIdx] != null) {
            return list[order[pIdx]];
        }
        return null;
    }

    function getNextEntity(qs) {
        if (!qs) return null;
        if (qs.nextEntity?.value) return qs.nextEntity.value;
        const nIdx = qs.nextIndex?.value;
        const order = qs.order?.value;
        const list = qs.entityList?.value;
        if (nIdx != null && order && list && order[nIdx] != null) {
            return list[order[nIdx]];
        }
        return null;
    }

    let triggerSync = null;
    let statusChange = null;
    let publicUpdateColors = null;

    const settingsManager = window.pulsesyncApi?.getSettings ? window.pulsesyncApi.getSettings('BetterQueue') : { getCurrent: () => ({}), onChange: () => {} };
    settingsManager.onChange((settings) => {
        applySettings(settings);
    });

    function applySettings(settings = undefined, root = undefined) {
        if (root === undefined) {
            root = document.querySelector('.FullscreenPlayerDesktopContent_root__tKNGK');
        }
        if (settings === undefined) {
            settings = settingsManager.getCurrent?.() || {};
        }
        if (!root || !settings) return;

        const coverMultiplier = settings?.cover_width_multiplier?.value ?? 25;
        const screenMultiplier = settings?.screen_width_multiplier?.value ?? 100;
        const gradMultiplier = settings?.gradient_size?.value ?? 100;
        const gradAlpha = settings?.show_gradient?.value !== false ? (settings?.gradient_alpha?.value ?? 60) : 0;

        root.style.setProperty('--cover-width-multiplier', `${coverMultiplier}`);
        root.style.setProperty('--screen-width-multiplier', `${screenMultiplier}`);
        root.style.setProperty('--gradient-width-multiplier', `${gradMultiplier}`);
        root.style.setProperty('--gradient-alpha', `${gradAlpha}`);

        root.style.setProperty('--cover_width_multiplier', `${coverMultiplier}`);
        root.style.setProperty('--screen_width_multiplier', `${screenMultiplier}`);
        root.style.setProperty('--gradient_width_multiplier', `${gradMultiplier}`);

        if (publicUpdateColors) publicUpdateColors();
    }

    function onOpen(node) {
        const root = node.matches?.('.FullscreenPlayerDesktopContent_root__tKNGK') ? node : node.querySelector('.FullscreenPlayerDesktopContent_root__tKNGK');
        const posterRoot = root?.querySelector('.FullscreenPlayerDesktopPoster_root__d__YD');
        if (!posterRoot) return;

        applySettings(undefined, root);
        const queueState = getQueueState();
        if (!queueState) return;

        const defaultPoster = posterRoot.querySelector('[data-test-id="ENTITY_COVER_IMAGE"]');
        if (defaultPoster) defaultPoster.style.display = 'none';

        posterRoot.querySelectorAll('.FullscreenPlayerDesktopPoster_cover_queue').forEach((el) => el.remove());

        let covers = { prev: null, curr: null, next: null };

        function createCover(entity, targetClass, startClass) {
            if (!entity) return null;

            const trackId = getId(entity);
            const coverUrl = getCoverUrl(entity);
            let el;

            if (!coverUrl) {
                el = document.createElement('div');
                el.innerHTML = `<svg class="IXo8WeM40YvVigqgCP7J Seq0GowcqQmiA9LdLP_g" focusable="false" aria-hidden="true"><use xlink:href="/icons/sprite.svg#note_xl"></use></svg>`;
                el.className = 'iha4fse_uYSR5XdCNFvU FullscreenPlayerDesktopPoster_cover__CDmhM FullscreenPlayerDesktopPoster_cover_queue';
            } else {
                el = createImage();
                updateSrc(el, entity);
            }

            el.dataset.trackId = trackId;

            if (startClass) {
                el.classList.add(startClass);
                posterRoot.appendChild(el);

                void el.offsetWidth;

                el.classList.remove(startClass);
                el.classList.add(targetClass);
            } else {
                el.classList.add(targetClass);
                posterRoot.appendChild(el);
            }

            function onClick(ev) {
                if (covers.curr && (ev.target === covers.curr || covers.curr.contains(ev.target))) {
                    const status = window.pulsesyncApi?.playerInstance?.state?.playerState?.status?.value;
                    if (status === 'paused' || status === 'idle') {
                        window.pulsesyncApi?.play?.();
                    } else {
                        window.pulsesyncApi?.pause?.();
                    }
                } else if (covers.next && (ev.target === covers.next || covers.next.contains(ev.target))) {
                    window.pulsesyncApi?.next?.();
                } else if (covers.prev && (ev.target === covers.prev || covers.prev.contains(ev.target))) {
                    window.pulsesyncApi?.previous?.();
                }
            }
            el.addEventListener('click', onClick);

            return el;
        }

        function removeCover(el, outClass) {
            if (!el) return;
            el.classList.remove(
                'FullscreenPlayerDesktopPoster_cover_queuePrev',
                'FullscreenPlayerDesktopPoster_cover_queueNext',
                'FullscreenPlayerDesktopPoster_cover_queueActive',
                'FullscreenPlayerDesktopPoster_cover_queuePaused',
            );
            el.classList.add(outClass);
            setTimeout(() => el.remove(), 400);
        }

        function changeClass(el, newClass) {
            if (!el) return;
            el.classList.remove(
                'FullscreenPlayerDesktopPoster_cover_queuePrev',
                'FullscreenPlayerDesktopPoster_cover_queueNext',
                'FullscreenPlayerDesktopPoster_cover_queueActive',
                'FullscreenPlayerDesktopPoster_cover_queuePaused',
            );
            el.classList.add(newClass);
        }

        function updateColors() {
            const nextEntity = getNextEntity(queueState);
            const prevEntity = getPrevEntity(queueState);

            const settings = settingsManager.getCurrent?.() || {};
            const prevMeta = getMeta(prevEntity);
            const nextMeta = getMeta(nextEntity);

            let prevColor = prevMeta?.derivedColors?.average || prevMeta?.averageColor;
            let nextColor = nextMeta?.derivedColors?.average || nextMeta?.averageColor;

            if (settings?.alt_color?.value) {
                function altColor(hex) {
                    if (!hex) return hex;
                    const hsl = hexToHSL(hex);
                    return `hsl(${hsl.h}, ${hsl.s}%, 20%)`;
                }
                prevColor = altColor(prevColor);
                nextColor = altColor(nextColor);
            }

            if (!prevColor) prevColor = 'transparent';
            if (!nextColor) nextColor = 'transparent';

            root.style.setProperty('--previous-track-accent-color', prevColor);
            root.style.setProperty('--next-track-accent-color', nextColor);
        }
        publicUpdateColors = updateColors;

        const initialCurr = getCurrentEntity(queueState);
        const initialPrev = getPrevEntity(queueState);
        const initialNext = getNextEntity(queueState);

        covers.curr = createCover(initialCurr, 'FullscreenPlayerDesktopPoster_cover_queueActive');
        covers.prev = createCover(initialPrev, 'FullscreenPlayerDesktopPoster_cover_queuePrev');
        covers.next = createCover(initialNext, 'FullscreenPlayerDesktopPoster_cover_queueNext');

        posterRoot.querySelector('.FullscreenPlayerDesktopControls_root__tviu4')?.addEventListener('click', (ev) => {
            if (ev.target === ev.currentTarget) {
                const status = window.pulsesyncApi?.playerInstance?.state?.playerState?.status?.value;
                if (status === 'paused' || status === 'idle') {
                    window.pulsesyncApi?.play?.();
                } else {
                    window.pulsesyncApi?.pause?.();
                }
            }
        });
        updateColors();

        let syncTimeout = null;

        function syncQueue() {
            if (!document.body.contains(posterRoot)) {
                const modal = document.querySelector("[data-test-id='FULLSCREEN_PLAYER_MODAL']");
                if (modal) onOpen(modal);
                return;
            }

            const currentEntity = getCurrentEntity(queueState);
            const nextEntity = getNextEntity(queueState);
            const prevEntity = getPrevEntity(queueState);

            updateColors();

            const newCurrId = getId(currentEntity);
            const newNextId = getId(nextEntity);
            const newPrevId = getId(prevEntity);

            const oldCurrId = covers.curr ? covers.curr.dataset.trackId : '';
            const oldNextId = covers.next ? covers.next.dataset.trackId : '';
            const oldPrevId = covers.prev ? covers.prev.dataset.trackId : '';

            if (!newCurrId && !currentEntity) return;

            if (newCurrId !== oldCurrId || !covers.curr || !document.body.contains(covers.curr)) {
                if (oldNextId && oldNextId === newCurrId && covers.next) {
                    removeCover(covers.prev, 'FullscreenPlayerDesktopPoster_cover_queuePrev_out');
                    covers.prev = covers.curr;
                    changeClass(covers.prev, 'FullscreenPlayerDesktopPoster_cover_queuePrev');

                    covers.curr = covers.next;
                    changeClass(covers.curr, 'FullscreenPlayerDesktopPoster_cover_queueActive');

                    covers.next = createCover(nextEntity, 'FullscreenPlayerDesktopPoster_cover_queueNext', 'FullscreenPlayerDesktopPoster_cover_queueNext_out');
                } else if (oldPrevId && oldPrevId === newCurrId && covers.prev) {
                    removeCover(covers.next, 'FullscreenPlayerDesktopPoster_cover_queueNext_out');
                    covers.next = covers.curr;
                    changeClass(covers.next, 'FullscreenPlayerDesktopPoster_cover_queueNext');

                    covers.curr = covers.prev;
                    changeClass(covers.curr, 'FullscreenPlayerDesktopPoster_cover_queueActive');

                    covers.prev = createCover(prevEntity, 'FullscreenPlayerDesktopPoster_cover_queuePrev', 'FullscreenPlayerDesktopPoster_cover_queuePrev_out');
                } else {
                    removeCover(covers.prev, 'FullscreenPlayerDesktopPoster_cover_queuePrev_out');
                    removeCover(covers.curr, 'FullscreenPlayerDesktopPoster_cover_queuePrev_out');
                    removeCover(covers.next, 'FullscreenPlayerDesktopPoster_cover_queueNext_out');

                    covers.curr = createCover(currentEntity, 'FullscreenPlayerDesktopPoster_cover_queueActive', 'FullscreenPlayerDesktopPoster_cover_queueNext_out');
                    covers.prev = createCover(prevEntity, 'FullscreenPlayerDesktopPoster_cover_queuePrev', 'FullscreenPlayerDesktopPoster_cover_queuePrev_out');
                    covers.next = createCover(nextEntity, 'FullscreenPlayerDesktopPoster_cover_queueNext', 'FullscreenPlayerDesktopPoster_cover_queueNext_out');
                }
            } else {
                if (newNextId !== oldNextId || (nextEntity && !covers.next)) {
                    removeCover(covers.next, 'FullscreenPlayerDesktopPoster_cover_queueNext_out');
                    covers.next = createCover(nextEntity, 'FullscreenPlayerDesktopPoster_cover_queueNext', 'FullscreenPlayerDesktopPoster_cover_queueNext_out');
                }
                if (newPrevId !== oldPrevId || (prevEntity && !covers.prev)) {
                    removeCover(covers.prev, 'FullscreenPlayerDesktopPoster_cover_queuePrev_out');
                    covers.prev = createCover(prevEntity, 'FullscreenPlayerDesktopPoster_cover_queuePrev', 'FullscreenPlayerDesktopPoster_cover_queuePrev_out');
                }
            }

            if (statusChange) statusChange();
        }

        triggerSync = () => {
            if (syncTimeout) clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => {
                syncTimeout = null;
                syncQueue();
            }, 10);
        };

        statusChange = () => {
            const status = window.pulsesyncApi?.playerInstance?.state?.playerState?.status?.value;
            if (!covers.curr) return;

            if (status === 'paused' || status === 'idle') {
                changeClass(covers.curr, 'FullscreenPlayerDesktopPoster_cover_queuePaused');
            } else {
                changeClass(covers.curr, 'FullscreenPlayerDesktopPoster_cover_queueActive');
            }
        };

        statusChange();
    }

    const observer = new MutationObserver((mutationList) => {
        for (const mutation of mutationList) {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    const modal = node.matches?.("[data-test-id='FULLSCREEN_PLAYER_MODAL']") ? node : node.querySelector?.("[data-test-id='FULLSCREEN_PLAYER_MODAL']");
                    if (modal) {
                        onOpen(modal);
                    }
                }
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function initExistingModal() {
        const modal = document.querySelector("[data-test-id='FULLSCREEN_PLAYER_MODAL']");
        if (modal) {
            onOpen(modal);
        }
    }

    function setupPlayerSubscriptions(player) {
        if (!player?.state) return;
        const qs = player.state.queueState;
        const ps = player.state.playerState;

        function onEntityChange() {
            if (triggerSync) {
                triggerSync();
            } else {
                initExistingModal();
            }
        }

        qs?.currentEntity?.onChange?.(onEntityChange);
        qs?.nextEntity?.onChange?.(onEntityChange);
        qs?.prevEntity?.onChange?.(onEntityChange);
        qs?.index?.onChange?.(onEntityChange);
        qs?.entityList?.onChange?.(onEntityChange);
        qs?.order?.onChange?.(onEntityChange);

        ps?.status?.onChange?.(() => {
            if (statusChange) statusChange();
        });

        initExistingModal();
    }

    (window.pulsesyncApi?._waitForPlayer || pulsesyncApi?._waitForPlayer)?.(setupPlayerSubscriptions);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExistingModal);
    } else {
        initExistingModal();
    }
})();
