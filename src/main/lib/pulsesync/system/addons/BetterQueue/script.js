(function() {
    function getMeta(entity) {
        return entity?.entity?.entityData?.meta;
    }
    
    function getId(entity) {
        const id = getMeta(entity)?.id;
        return id ? String(id) : "";
    }

    function hexToHSL(hex) {
        hex = hex.replace(/^#/, "");
        if (hex.length === 3) {
            hex = hex.split("").map(s => s + s).join("");
        }

        let r = parseInt(hex.substring(0, 2), 16) / 255;
        let g = parseInt(hex.substring(2, 4), 16) / 255;
        let b = parseInt(hex.substring(4, 6), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; 
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    function createImage() {
        const img = document.createElement("img");
        img.className = "qQ7GQU14EkggPBC6jdeS fosYvyLDok3Kjj9OWmxG FullscreenPlayerDesktopPoster_cover__CDmhM FullscreenPlayerDesktopPoster_cover_queue";
        img.loading = "eager";
        return img;
    }

    function updateSrc(img, entity) {
        const meta = getMeta(entity);
        if (!meta || !meta.coverUri) return;
        const coverUri = "https://" + meta.coverUri;
        img.src = coverUri.replace("%%", "400x400");
        img.srcset = `${coverUri.replace("%%", "400x400")} 1x, ${coverUri.replace("%%", "800x800")} 2x`;
    }

    let triggerSync = null;
    let statusChange = null;

    const settingsManager = window.pulsesyncApi?.getSettings ? window.pulsesyncApi.getSettings("BetterQueue") : { getCurrent: () => ({}), onChange: () => {} };
    settingsManager.onChange(settings => {
        applySettings(settings);
    })

    function applySettings(settings = undefined, root = undefined) {
        if (root === undefined) {
            root = document.querySelector(".FullscreenPlayerDesktopContent_root__tKNGK");
        }
        if (settings === undefined) {
            settings = settingsManager.getCurrent();
        }
        if (!root || !settings) return;
        root.style.setProperty("--cover-width-multiplier", `${settings?.cover_width_multiplier?.value ?? 25}`);
        root.style.setProperty("--screen-width-multiplier", `${settings?.screen_width_multiplier?.value ?? 100}`);
        root.style.setProperty("--gradient-width-multiplier", `${settings?.gradient_size?.value ?? 100}`);
        root.style.setProperty("--gradient-alpha", `${settings?.show_gradient?.value ? (settings?.gradient_alpha?.value ?? 60) : 0}`);
        if (publicUpdateColors) publicUpdateColors();
    }
    let publicUpdateColors = null;

    function onOpen(node) {
        const root = node.querySelector('.FullscreenPlayerDesktopContent_root__tKNGK');
        const posterRoot = root?.querySelector('.FullscreenPlayerDesktopPoster_root__d__YD');
        if (!posterRoot) return;
        
        applySettings(undefined, root);
        const queueState = window.pulsesyncApi?.playerInstance?.state?.queueState;
        if (!queueState || !queueState.entityList?.value) return;

        const defaultPoster = posterRoot.querySelector('[data-test-id="ENTITY_COVER_IMAGE"]');
        if (defaultPoster) defaultPoster.style.display = 'none';

        posterRoot.querySelectorAll('.FullscreenPlayerDesktopPoster_cover_queue').forEach(el => el.remove());

        let covers = { prev: null, curr: null, next: null };

        function createCover(entity, targetClass, startClass) {
            if (!entity) return null;
            
            const meta = getMeta(entity);
            const trackId = getId(entity);
            let el;
            
            if (!meta || !meta.coverUri) {
                el = document.createElement("div");
                el.innerHTML = `<svg class="IXo8WeM40YvVigqgCP7J Seq0GowcqQmiA9LdLP_g" focusable="false" aria-hidden="true"><use xlink:href="/icons/sprite.svg#note_xl"></use></svg>`;
                el.className = "iha4fse_uYSR5XdCNFvU FullscreenPlayerDesktopPoster_cover__CDmhM FullscreenPlayerDesktopPoster_cover_queue";
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
                if (covers.curr && ev.target === covers.curr) {
                    const status = window.pulsesyncApi?.playerInstance?.state?.playerState?.status?.value;
                    if (status === "paused" || status === "idle") {
                        window.pulsesyncApi.play();
                    }
                    else {
                        window.pulsesyncApi.pause();
                    }
                }
                else if (covers.next && ev.target === covers.next) {
                    window.pulsesyncApi.next();
                }
                else if (covers.prev && ev.target === covers.prev) {
                    window.pulsesyncApi.previous();
                }
            }
            el.addEventListener("click", onClick);
            
            return el;
        }

        function removeCover(el, outClass) {
            if (!el) return;
            el.classList.remove("FullscreenPlayerDesktopPoster_cover_queuePrev", "FullscreenPlayerDesktopPoster_cover_queueNext", "FullscreenPlayerDesktopPoster_cover_queueActive", "FullscreenPlayerDesktopPoster_cover_queuePaused");
            el.classList.add(outClass);
            setTimeout(() => el.remove(), 400); 
        }

        function changeClass(el, newClass) {
            if (!el) return;
            el.classList.remove("FullscreenPlayerDesktopPoster_cover_queuePrev", "FullscreenPlayerDesktopPoster_cover_queueNext", "FullscreenPlayerDesktopPoster_cover_queueActive", "FullscreenPlayerDesktopPoster_cover_queuePaused");
            el.classList.add(newClass);
        }

        function updateColors() {
            const nextEntity = queueState.nextEntity?.value;
            const prevEntity = queueState.prevEntity?.value;

            const settings = settingsManager.getCurrent();
            let prevColor = getMeta(prevEntity)?.derivedColors?.average;
            let nextColor = getMeta(nextEntity)?.derivedColors?.average;
            if (settings?.alt_color?.value) {
                function altColor(hex) {
                    if (!hex) return hex;
                    const hsl = hexToHSL(hex);
                    return `hsl(${hsl.h}, ${hsl.s}%, 20%)`;
                }
                prevColor = altColor(prevColor);
                nextColor = altColor(nextColor);
            }
        
            if (!prevColor) {
                prevColor = "transparent"
            }
            if (!nextColor) {
                nextColor = "transparent"
            }
            root.style.setProperty("--previous-track-accent-color", prevColor);
            root.style.setProperty("--next-track-accent-color", nextColor);
        }
        publicUpdateColors = updateColors;

        covers.curr = createCover(queueState.currentEntity.value, "FullscreenPlayerDesktopPoster_cover_queueActive");
        covers.prev = createCover(queueState.prevEntity?.value, "FullscreenPlayerDesktopPoster_cover_queuePrev");
        covers.next = createCover(queueState.nextEntity?.value, "FullscreenPlayerDesktopPoster_cover_queueNext");
        posterRoot.querySelector(".FullscreenPlayerDesktopControls_root__tviu4")?.addEventListener("click", (ev) => {
            if (ev.target === ev.currentTarget) {
                const status = window.pulsesyncApi?.playerInstance?.state?.playerState?.status?.value;
                if (status === "paused" || status === "idle") {
                    window.pulsesyncApi.play();
                }
                else {
                    window.pulsesyncApi.pause();
                }
            }
        });
        updateColors();

        let syncTimeout = null;

        function syncQueue() {
            const currentEntity = queueState.currentEntity.value;
            const nextEntity = queueState.nextEntity?.value;
            const prevEntity = queueState.prevEntity?.value;

            updateColors();

            const newCurrId = getId(currentEntity);
            const newNextId = getId(nextEntity);
            const newPrevId = getId(prevEntity);

            const oldCurrId = covers.curr ? covers.curr.dataset.trackId : "";
            const oldNextId = covers.next ? covers.next.dataset.trackId : "";
            const oldPrevId = covers.prev ? covers.prev.dataset.trackId : "";

            if (!newCurrId) return;

            if (newCurrId !== oldCurrId) {
                if (oldNextId && oldNextId === newCurrId) {
                    removeCover(covers.prev, "FullscreenPlayerDesktopPoster_cover_queuePrev_out"); 
                    covers.prev = covers.curr;
                    changeClass(covers.prev, "FullscreenPlayerDesktopPoster_cover_queuePrev");
                    
                    covers.curr = covers.next;
                    changeClass(covers.curr, "FullscreenPlayerDesktopPoster_cover_queueActive");
                    
                    covers.next = createCover(nextEntity, "FullscreenPlayerDesktopPoster_cover_queueNext", "FullscreenPlayerDesktopPoster_cover_queueNext_out");
                } 
                else if (oldPrevId && oldPrevId === newCurrId) {
                    removeCover(covers.next, "FullscreenPlayerDesktopPoster_cover_queueNext_out");
                    covers.next = covers.curr;
                    changeClass(covers.next, "FullscreenPlayerDesktopPoster_cover_queueNext");
                    
                    covers.curr = covers.prev;
                    changeClass(covers.curr, "FullscreenPlayerDesktopPoster_cover_queueActive");
                    
                    covers.prev = createCover(prevEntity, "FullscreenPlayerDesktopPoster_cover_queuePrev", "FullscreenPlayerDesktopPoster_cover_queuePrev_out");
                } 
                else {
                    removeCover(covers.prev, "FullscreenPlayerDesktopPoster_cover_queuePrev_out");
                    removeCover(covers.curr, "FullscreenPlayerDesktopPoster_cover_queuePrev_out"); 
                    removeCover(covers.next, "FullscreenPlayerDesktopPoster_cover_queueNext_out");

                    covers.curr = createCover(currentEntity, "FullscreenPlayerDesktopPoster_cover_queueActive", "FullscreenPlayerDesktopPoster_cover_queueNext_out");
                    covers.prev = createCover(prevEntity, "FullscreenPlayerDesktopPoster_cover_queuePrev", "FullscreenPlayerDesktopPoster_cover_queuePrev_out");
                    covers.next = createCover(nextEntity, "FullscreenPlayerDesktopPoster_cover_queueNext", "FullscreenPlayerDesktopPoster_cover_queueNext_out");
                }
            } 
            else {
                if (newNextId !== oldNextId) {
                    removeCover(covers.next, "FullscreenPlayerDesktopPoster_cover_queueNext_out");
                    covers.next = createCover(nextEntity, "FullscreenPlayerDesktopPoster_cover_queueNext", "FullscreenPlayerDesktopPoster_cover_queueNext_out");
                }
                if (newPrevId !== oldPrevId) {
                    removeCover(covers.prev, "FullscreenPlayerDesktopPoster_cover_queuePrev_out");
                    covers.prev = createCover(prevEntity, "FullscreenPlayerDesktopPoster_cover_queuePrev", "FullscreenPlayerDesktopPoster_cover_queuePrev_out");
                }
            }

            if (statusChange) statusChange();
        }

        // 💀
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

            if (status === "paused" || status === "idle") {
                changeClass(covers.curr, "FullscreenPlayerDesktopPoster_cover_queuePaused");
            }
            else {
                changeClass(covers.curr, "FullscreenPlayerDesktopPoster_cover_queueActive");
            }
        }

        statusChange();
    }

    const observer = new MutationObserver((mutationList) => {
        for (const mutation of mutationList) {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    const modal = node.matches("[data-test-id='FULLSCREEN_PLAYER_MODAL']") ? node : node.querySelector("[data-test-id='FULLSCREEN_PLAYER_MODAL']");
                    if (modal) {
                        onOpen(modal);
                    }
                }
            })
        }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    (window.pulsesyncApi?._waitForPlayer || pulsesyncApi?._waitForPlayer)?.((player) => {
        function onEntityChange(..._) {
            if (triggerSync) triggerSync();
        }
        player.state.queueState.currentEntity.onChange(onEntityChange);
        player.state.queueState.nextEntity.onChange(onEntityChange);
        player.state.queueState.prevEntity.onChange(onEntityChange);
        player.state.playerState.status.onChange(() => {
            if (statusChange) statusChange();
        });
    });
})();