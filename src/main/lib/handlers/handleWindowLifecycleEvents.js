'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.handleWindowLifecycleEvents = void 0;
const electron_1 = require('electron');
const state_js_1 = require('../state.js');
const toggleWindowVisibility_js_1 = require('../window/toggleWindowVisibility.js');
const loadURL_js_1 = require('../loadURL.js');
const deviceInfo_js_1 = require('../deviceInfo.js');
const platform_js_1 = require('../../types/platform.js');
const Logger_js_1 = require('../../packages/logger/Logger.js');
const events_js_1 = require('../../events.js');
const config_js_1 = require('../../config.js');
const store_js_1 = require('../store.js');
const tray_js_1 = require('../tray.js');
const modUpdater_js_1 = require('../modUpdater.js');
const lifecycleLogger = new Logger_js_1.Logger('WindowLifecycle');
const USER_ID_IFRAME_URL_REGEXP = /^https:\/\/yandex.\w{2,3}\/user-id/;
const NAVIGATION_ABORTED_ERROR_CODE = -3;
const CONNECTION_ERROR_CODES = [-15, -21];
const checkAndUpdateApplicationData = (window) => {
    const diff = Date.now() - state_js_1.state.lastWindowBlurredOrHiddenTime;
    if (diff >= config_js_1.config.common.REFRESH_EVENT_TRIGGER_TIME_MS) {
        (0, events_js_1.sendRefreshApplicationData)(window);
    }
};
const setBlurredTime = () => {
    state_js_1.state.lastWindowBlurredOrHiddenTime = Date.now();
};

let resizeCorrectionTimer = null;
let isApplyingEvenCorrection = false;

const updateWindowDimensions = (window) => {
    const applyCorrection = () => {
        const [w, h] = window.getSize();
        const evenW = w & ~1;
        const evenH = h & ~1;

        if (w !== evenW || h !== evenH) {
            isApplyingEvenCorrection = true;
            window.setSize(evenW, evenH);
            isApplyingEvenCorrection = false;
        }

        store_js_1.setWindowDimensions(evenW, evenH, window.isMaximized());
    };

    if (deviceInfo_js_1.devicePlatform === platform_js_1.Platform.LINUX) {
        if (resizeCorrectionTimer) {
            clearTimeout(resizeCorrectionTimer);
        }

        resizeCorrectionTimer = setTimeout(() => {
            applyCorrection();
            resizeCorrectionTimer = null;
        }, 50);

        return;
    }

    applyCorrection();
};

const handleWindowLifecycleEvents = (window) => {
    electron_1.app.on('activate', () => {
        (0, toggleWindowVisibility_js_1.toggleWindowVisibility)(window, true);
    });
    electron_1.app.on('before-quit', () => {
        state_js_1.state.willQuit = true;
    });
    electron_1.app.on('window-all-closed', () => {
        if ([platform_js_1.Platform.WINDOWS, platform_js_1.Platform.LINUX].includes(deviceInfo_js_1.devicePlatform)) {
            electron_1.app.quit();
        }
    });
    electron_1.app.on('browser-window-blur', () => {
        setBlurredTime();
    });
    electron_1.app.on('browser-window-focus', () => {
        checkAndUpdateApplicationData(window);
    });
    window.on('show', () => {
        state_js_1.state.isMinimized = false;
        (0, tray_js_1.updateTrayMenu)(window);
    });
    window.on('hide', () => {
        setBlurredTime();
        state_js_1.state.isMinimized = true;
        (0, tray_js_1.updateTrayMenu)(window);
    });
    window.on('minimize', () => {
        setBlurredTime();
        state_js_1.state.isMinimized = true;
        (0, tray_js_1.updateTrayMenu)(window);
    });
    window.on('maximize', () => {
        checkAndUpdateApplicationData(window);
        updateWindowDimensions(window);
        state_js_1.state.isMinimized = false;
        (0, tray_js_1.updateTrayMenu)(window);
    });
    window.on('unmaximize', () => {
        updateWindowDimensions(window);
        state_js_1.state.isMinimized = false;
        (0, tray_js_1.updateTrayMenu)(window);
    });
    window.on('restore', () => {
        checkAndUpdateApplicationData(window);
        state_js_1.state.isMinimized = false;
        (0, tray_js_1.updateTrayMenu)(window);
    });
    window.on('resized', () => {
        if (isApplyingEvenCorrection) {
            return;
        }
        updateWindowDimensions(window);
    });
    window.on('moved', () => {
        const position = window.getPosition();
        store_js_1.setWindowPosition(position[0], position[1]);
    });
    window.on('close', (event) => {
        if (deviceInfo_js_1.devicePlatform !== platform_js_1.Platform.MACOS) {
            return;
        }
        if (state_js_1.state.willQuit) {
            return;
        }
        event.preventDefault();
        if (window.isFullScreen()) {
            window.once('leave-full-screen', () => {
                (0, toggleWindowVisibility_js_1.toggleWindowVisibility)(window, false);
            });
            window.setFullScreen(false);
        } else {
            (0, toggleWindowVisibility_js_1.toggleWindowVisibility)(window, false);
        }
    });
    const webContents = window.webContents;
    webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedUrl) => {
        if (errorCode === NAVIGATION_ABORTED_ERROR_CODE) {
            return;
        }

        const message = `Failed to load ${validatedUrl}: ${errorDescription} (${errorCode})`;
        lifecycleLogger.error(message);
        if ((errorCode <= -100 || CONNECTION_ERROR_CODES.includes(errorCode)) && !USER_ID_IFRAME_URL_REGEXP.test(validatedUrl)) {
            (0, loadURL_js_1.loadUnavailableErrorPage)(window);
        }
    });
    
    webContents.on("console-message", (event, level, message, line, sourceId) => {
        if (level >= 2 || (message && (message.includes("Error") || message.includes("error") || message.includes("Uncaught")))) {
            lifecycleLogger.error(`[Renderer Console] [Level ${level}] ${message} (${sourceId}:${line})`);
        }
    });

    
    webContents.on("before-input-event", (event, input) => {
        if (input.type === "keyDown") {
            // F12 or Ctrl+Shift+I: Toggle DevTools
            if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
                if (webContents.isDevToolsOpened()) {
                    webContents.closeDevTools();
                } else {
                    webContents.openDevTools({ mode: "detach" });
                }
            }

            // Ctrl+R or F5: In-place reload without closing or quitting app
            if ((input.control && input.key.toLowerCase() === "r") || input.key === "F5") {
                lifecycleLogger.info("Ctrl+R / F5 pressed: in-place reload, checking mod updates without quitting...");
                event.preventDefault();
                try {
                    const modUpdater = (0, modUpdater_js_1.getModUpdater)();
                    if (modUpdater) {
                        modUpdater.check(true).catch((err) => {
                            lifecycleLogger.error("Failed to check updates on reload:", err);
                        });
                    }
                } catch (err) {
                    lifecycleLogger.error("ModUpdater error on reload:", err);
                }
                webContents.reloadIgnoringCache();
            }
        }
    });

    webContents.on('did-finish-load', () => {
        webContents.insertCSS(`
                body {
                    .passp-page {
                        -webkit-app-region: drag;
                    }
                }
            `);

        try {
            const modUpdater = (0, modUpdater_js_1.getModUpdater)();
            if (modUpdater && modUpdater.hasUpdateAvailable()) {
                setTimeout(() => {
                    (0, events_js_1.sendModUpdateAvailable)(window, modUpdater.currentVersion, modUpdater.latestVersion, modUpdater.latestData);
                }, 1500);
            }
        } catch (e) {
            lifecycleLogger.error("Failed to notify mod update after reload:", e);
        }
    });
};
exports.handleWindowLifecycleEvents = handleWindowLifecycleEvents;
