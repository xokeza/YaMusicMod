(function () {
    'use strict';

    const ADDON_NAME = 'Hide TitleBar Buttons';
    const STYLE_ID = 'hide-titlebar-buttons-style';

    function injectStyles() {
        try {
            let settings = {};
            if (window.pulsesyncApi && typeof window.pulsesyncApi.getSettings === 'function') {
                const store = window.pulsesyncApi.getSettings(ADDON_NAME);
                if (store && typeof store.getCurrent === 'function') {
                    settings = store.getCurrent() || {};
                }
            }

            const hideTitleBar = settings.hideTitleBar?.value ?? settings.enabled?.value ?? true;
            const titleBarOpacity = settings.titleBarOpacity?.value ?? settings.opacityLevel?.value ?? 0;
            const hideFullscreenClose = settings.hideFullscreenClose?.value ?? settings.closeButtonEnabled?.value ?? true;
            const fullscreenOpacity = settings.fullscreenOpacity?.value ?? settings.closeButtonOpacity?.value ?? 0;

            let styleElement = document.getElementById(STYLE_ID);
            if (!styleElement) {
                styleElement = document.createElement('style');
                styleElement.id = STYLE_ID;
                (document.head || document.documentElement).appendChild(styleElement);
            }

            let css = '';

            if (hideTitleBar) {
                css += `
                    [class*="TitleBar_button"]:not([class*="pulsesync"]):not([id*="pulsesync"]),
                    #sr-reload-button {
                        opacity: ${titleBarOpacity} !important;
                        transition: opacity 0.2s ease !important;
                    }
                    [class*="TitleBar_button"]:not([class*="pulsesync"]):not([id*="pulsesync"]):hover,
                    #sr-reload-button:hover {
                        opacity: 1 !important;
                    }
                `;
            }

            if (hideFullscreenClose) {
                css += `
                    [data-test-id="FULLSCREEN_PLAYER_CLOSE_BUTTON"] {
                        opacity: ${fullscreenOpacity} !important;
                        transition: opacity 0.2s ease !important;
                    }
                    [data-test-id="FULLSCREEN_PLAYER_CLOSE_BUTTON"]:hover {
                        opacity: 1 !important;
                    }
                `;
            }

            styleElement.textContent = css;
        } catch (e) {
            console.error('[Hide TitleBar Buttons] Error injecting styles:', e);
        }
    }

    function init() {
        injectStyles();

        try {
            if (window.pulsesyncApi && typeof window.pulsesyncApi.getSettings === 'function') {
                const store = window.pulsesyncApi.getSettings(ADDON_NAME);
                if (store && typeof store.onChange === 'function') {
                    store.onChange(() => injectStyles());
                }
            }
        } catch (e) {
            console.error('[Hide TitleBar Buttons] Error subscribing to settings:', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
